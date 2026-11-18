import { jsPDF } from "jspdf";
import type { PreviewMatchup, ReportData, TeamRef, WeekGame } from "@shared/weeklyReport";

// ─── Playoff data (from the playoff-predictions endpoint) ────────────────────

export interface PlayoffPrediction {
  rosterId: number;
  name: string;
  initials: string;
  currentWins: number;
  currentLosses: number;
  pointsFor: number;
  division?: number;
  makePlayoffsPct: number;
  oneSeedPct: number;
  divisionWinnerPct?: number;
  /** Mathematically settled (wins only, tiebreakers ignored, so it never calls one wrongly). */
  clinchedPlayoffs?: boolean;
  eliminated?: boolean;
  /** Regular-season games still to play (present when the playoff outlook was computed). */
  gamesLeft?: number;
}

/** Playoff odds for both teams in one game of the report week (from the playoff outlook). */
export interface GameSwingData {
  week: number;
  teamA: number;
  teamB: number;
  a: { now: number; ifWin: number; ifLose: number };
  b: { now: number; ifWin: number; ifLose: number };
}

export interface PlayoffData {
  predictions: PlayoffPrediction[];
  playoffTeams: number;
  hasDivisions: boolean;
  simulationCount: number;
  byes?: number;
  outlook?: { gameSwings?: GameSwingData[] } | null;
}

// ─── Layout and colors (broadcast style: near-black, neon green, hot orange) ─

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const COLORS = {
  bg: hex("#05080F"),
  heroBg: hex("#0B1A18"),
  line: hex("#1F2A3A"),
  rowLine: hex("#141C2A"),
  text: hex("#F1F5F9"),
  mid: hex("#94A3B8"),
  muted: hex("#64748B"),
  green: hex("#22E5A0"),
  hot: hex("#FF5A3C"),
  amber: hex("#FFB020"),
  cold: hex("#38BDF8"),
  white: hex("#FFFFFF"),
  dark: hex("#05080F"),
  divRow: hex("#2A2110"),
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 33;
const CONTENT_W = PAGE_W - MARGIN * 2;
const REGULAR_SEASON_WEEKS = 14;
const TOTAL_PAGES = 4;

/** Helvetica (the built-in PDF font) cannot draw emoji or most non-Latin characters. */
function clean(s: string): string {
  const stripped = s.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
  return stripped || "?";
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

/** Percent text, 2 decimals. Never rounds a near-certain team up to 100 or a long shot down to 0. */
export function pctText(p: number): string {
  if (p > 99.9 && p < 100) return ">99.9%";
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${fmt(p, 2)}%`;
}

/**
 * Division odds, with the same rule as the playoff odds: exactly 100% or 0% only when the wins math settles it
 * (a team wins the division when no division rival can reach its win total, and is out when it cannot reach the
 * leader's current wins; ties are left open). Otherwise near-certain values read >99.9% or <0.1%.
 */
export function divisionOddsText(t: PlayoffPrediction, all: PlayoffPrediction[]): string {
  const pct = t.divisionWinnerPct;
  if (pct === undefined) return "-";
  const rivals = all.filter(o => o.division === t.division && o.rosterId !== t.rosterId);
  if (rivals.length && all.every(o => o.gamesLeft !== undefined)) {
    const myMax = t.currentWins + (t.gamesLeft ?? 0);
    if (rivals.every(o => o.currentWins + (o.gamesLeft ?? 0) < t.currentWins)) return "100.00%";
    if (rivals.some(o => o.currentWins > myMax)) return "0.00%";
  }
  return pctText(pct);
}

const signed = (n: number, digits = 1) => `${n > 0 ? "+" : ""}${fmt(n, digits)}`;

// ─── Avatars ────────────────────────────────────────────────────────────────

/** Fetch each avatar once and return it as a data URL. Missing ones fall back to initials. */
export async function loadAvatars(urls: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(urls.filter(Boolean))];
  const result = new Map<string, string>();
  await Promise.all(
    unique.map(async url => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        result.set(url, dataUrl);
      } catch {
        // Keep initials for this team.
      }
    }),
  );
  return result;
}

export function collectAvatarUrls(report: ReportData, playoff: PlayoffData | null): string[] {
  const urls: string[] = [];
  const add = (t: { avatar: string | null } | null | undefined) => {
    if (t?.avatar) urls.push(t.avatar);
  };
  report.lastWeek.games.forEach(g => {
    add(g.winner);
    add(g.loser);
  });
  report.lastWeek.awards.forEach(a => add(a.team));
  report.lastWeek.topIndividual.forEach(r => add(r.team));
  report.lastWeek.positionLeaders.forEach(r => add(r.team));
  report.lastWeek.highestTeamScores.forEach(t => add(t));
  report.lastWeek.efficiency.forEach(t => add(t));
  report.lastWeek.powerRankings.forEach(r => add(r.team));
  report.preview.matchups.forEach(m => {
    add(m.a);
    add(m.b);
  });
  report.hotCold?.all.forEach(t => add(t));
  void playoff;
  return urls;
}

/** The team more likely to win a previewed game. probA is the chance that team A (the left team) wins. */
export function favorite(m: PreviewMatchup): { team: TeamRef; pct: number; isA: boolean; even: boolean } {
  const isA = m.probA >= 0.5;
  return { team: isA ? m.a : m.b, pct: Math.max(m.probA, 1 - m.probA) * 100, isA, even: m.probA === 0.5 };
}

/** "Alpha lead 7-4", "Tied 5-5" or "First meeting" (a -1 is added for ties). */
export function h2hSeries(m: PreviewMatchup): string {
  const h = m.history;
  if (!h || h.meetings === 0) return "First meeting";
  const tie = h.ties ? `-${h.ties}` : "";
  if (h.aWins === h.bWins) return `Tied ${h.aWins}-${h.bWins}${tie}`;
  const lead = h.aWins > h.bWins ? m.a : m.b;
  return `${lead.name} lead ${Math.max(h.aWins, h.bWins)}-${Math.min(h.aWins, h.bWins)}${tie}`;
}

// ─── Fonts (Oswald for titles and big numbers; falls back to Helvetica bold) ───

export interface ReportFonts {
  regular: string;
  bold: string;
}

let fontCache: ReportFonts | null = null;

async function fetchBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font ${url} returned ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(binary);
}

/** Fetches the Oswald TTFs (base64) once per page load. Returns null if they cannot be loaded; the report then uses Helvetica. */
export async function loadReportFonts(): Promise<ReportFonts | null> {
  if (fontCache) return fontCache;
  try {
    const [regular, bold] = await Promise.all([fetchBase64("/fonts/Oswald-Regular.ttf"), fetchBase64("/fonts/Oswald-Bold.ttf")]);
    fontCache = { regular, bold };
    return fontCache;
  } catch (error) {
    console.warn("Could not load report fonts, using Helvetica:", error);
    return null;
  }
}

// ─── Drawing helpers ────────────────────────────────────────────────────────

type FontKind = "body" | "display";
type TextOpts = { size?: number; color?: RGB; bold?: boolean; align?: "left" | "center" | "right"; spacing?: number; font?: FontKind };

class Canvas {
  doc: jsPDF;
  avatars: Map<string, string>;
  /** True when Oswald is registered on this document. */
  hasDisplay = false;

  constructor(avatars: Map<string, string>, fonts?: ReportFonts | null) {
    this.doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
    this.avatars = avatars;
    if (fonts) {
      try {
        this.doc.addFileToVFS("Oswald-Bold.ttf", fonts.bold);
        this.doc.addFont("Oswald-Bold.ttf", "Oswald", "bold");
        this.doc.addFileToVFS("Oswald-Regular.ttf", fonts.regular);
        this.doc.addFont("Oswald-Regular.ttf", "Oswald", "normal");
        this.hasDisplay = true;
      } catch (error) {
        console.warn("Could not register report fonts, using Helvetica:", error);
      }
    }
  }

  private setFace(bold: boolean, font: FontKind) {
    if (font === "display" && this.hasDisplay) this.doc.setFont("Oswald", bold ? "bold" : "normal");
    else this.doc.setFont("helvetica", bold || font === "display" ? "bold" : "normal");
  }

  page(first = false) {
    if (!first) this.doc.addPage();
    this.doc.setFillColor(...COLORS.bg);
    this.doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  }

  text(str: string, x: number, y: number, opts: TextOpts = {}) {
    const { size = 10, color = COLORS.text, bold = false, align = "left", spacing = 0, font = "body" } = opts;
    const d = this.doc as unknown as { setCharSpace?: (n: number) => void };
    this.setFace(bold, font);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
    if (spacing && d.setCharSpace) d.setCharSpace(spacing);
    this.doc.text(clean(str), x, y, { align });
    if (spacing && d.setCharSpace) d.setCharSpace(0);
  }

  width(str: string, size: number, bold = false, font: FontKind = "body"): number {
    this.setFace(bold, font);
    this.doc.setFontSize(size);
    return this.doc.getTextWidth(clean(str));
  }

  /** Shorten a string with ".." so it fits in maxW. */
  fit(str: string, maxW: number, size: number, bold = false, font: FontKind = "body"): string {
    const s = clean(str);
    if (this.width(s, size, bold, font) <= maxW) return s;
    let out = s;
    while (out.length > 1 && this.width(out + "..", size, bold, font) > maxW) out = out.slice(0, -1);
    return out.trimEnd() + "..";
  }

  wrap(str: string, maxW: number, size: number, bold = false, font: FontKind = "body"): string[] {
    this.setFace(bold, font);
    this.doc.setFontSize(size);
    return this.doc.splitTextToSize(clean(str), maxW) as string[];
  }

  rule(x1: number, x2: number, y: number, color: RGB = COLORS.line, weight = 0.6) {
    this.doc.setDrawColor(...color);
    this.doc.setLineWidth(weight);
    this.doc.line(x1, y, x2, y);
  }

  box(x: number, y: number, w: number, h: number, border: RGB = COLORS.line, fill?: RGB) {
    this.doc.setDrawColor(...border);
    this.doc.setLineWidth(0.6);
    if (fill) {
      this.doc.setFillColor(...fill);
      this.doc.rect(x, y, w, h, "FD");
    } else {
      this.doc.rect(x, y, w, h, "S");
    }
  }

  fillRect(x: number, y: number, w: number, h: number, color: RGB) {
    this.doc.setFillColor(...color);
    this.doc.rect(x, y, w, h, "F");
  }

  bar(x: number, y: number, w: number, h: number, pct: number, color: RGB) {
    this.fillRect(x, y, w, h, COLORS.line);
    const filled = (Math.max(0, Math.min(100, pct)) / 100) * w;
    if (filled > 0) this.fillRect(x, y, filled, h, color);
  }

  pill(label: string, x: number, y: number, fill: RGB, textColor: RGB = COLORS.dark, size = 6) {
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(size);
    const w = this.doc.getTextWidth(clean(label)) + 10;
    this.doc.setFillColor(...fill);
    this.doc.roundedRect(x, y, w, size + 5, 2, 2, "F");
    this.text(label, x + w / 2, y + size + 1.5, { size, color: textColor, bold: true, align: "center" });
    return w;
  }

  /** Avatar image if we have one, otherwise a circle with initials. */
  avatar(x: number, y: number, size: number, team: { avatar: string | null; initials: string }) {
    const img = team.avatar ? this.avatars.get(team.avatar) : undefined;
    if (img) {
      try {
        this.doc.addImage(img, "JPEG", x, y, size, size);
        return;
      } catch {
        // Fall through to initials if the image can't be drawn.
      }
    }
    this.doc.setFillColor(...COLORS.line);
    this.doc.circle(x + size / 2, y + size / 2, size / 2, "F");
    this.text(team.initials || "?", x + size / 2, y + size / 2 + size * 0.15, {
      size: size * 0.42,
      bold: true,
      align: "center",
    });
  }

  /** Section label: neon, spaced capitals, then a hairline to the right edge of the column. */
  section(label: string, x: number, y: number, w: number) {
    const size = 8;
    const text = label.toUpperCase();
    this.text(text, x, y, { size: size + 1, color: COLORS.green, bold: true, spacing: 1.6, font: "display" });
    const tw = this.width(text, size + 1, true, "display") + text.length * 1.6 + 8;
    this.rule(x + tw, x + w, y - 3, COLORS.line, 0.6);
  }

  /** Page header: league name and season, a big title, a spaced subtitle. Returns the y where content can start. */
  header(report: ReportData, title: string, subtitle: string): number {
    const top = MARGIN + 9;
    const name = report.leagueName.toUpperCase();
    this.text(name, MARGIN, top, { size: 8, color: COLORS.green, bold: true, spacing: 2.5 });
    const nw = this.width(name, 8, true) + name.length * 2.5 + 10;
    const right = `SEASON ${report.season}`;
    const rw = this.width(right, 8, true) + 6;
    this.rule(MARGIN + nw, PAGE_W - MARGIN - rw - 8, top - 3, COLORS.line, 0.6);
    this.text(right, PAGE_W - MARGIN, top, { size: 8, color: COLORS.muted, bold: true, align: "right" });
    this.text(title.toUpperCase(), MARGIN, top + 40, { size: 38, bold: true, font: "display" });
    this.text(subtitle.toUpperCase(), MARGIN, top + 55, { size: 7.5, color: COLORS.mid, bold: true, spacing: 1.2 });
    return top + 78;
  }

  footer(report: ReportData, pageNo: number) {
    this.text(`${report.leagueName}  |  ${report.season} Season  |  Week ${report.week} Report`, MARGIN, PAGE_H - 18, {
      size: 6.5,
      color: COLORS.muted,
    });
    this.text(`${pageNo} / ${TOTAL_PAGES}`, PAGE_W - MARGIN, PAGE_H - 18, { size: 6.5, color: COLORS.muted, align: "right" });
  }
}

// ─── Pages ──────────────────────────────────────────────────────────────────

const ROW_LINE_W = 0.5;

function headline(report: ReportData): { title: string; body: string } | null {
  const lw = report.lastWeek;
  const topAward = lw.awards.find(a => a.title === "Top score");
  const top = topAward?.team ?? lw.games[0]?.winner;
  if (!top) return null;
  const pts = topAward ? parseFloat(topAward.value) : (lw.games[0]?.winner.points ?? 0);
  const rec = lw.powerRankings.find(r => r.team.rosterId === top.rosterId)?.record ?? "";
  const m = rec.match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  const perfect = !!m && Number(m[1]) > 0 && Number(m[2]) === 0 && Number(m[3] ?? 0) === 0;
  const game = lw.games.find(g => g.winner.rosterId === top.rosterId && !g.tie);
  const name = top.name.toUpperCase();
  const title = perfect
    ? `${name} SCORE ${fmt(pts, 0)} AND STAY PERFECT AT ${rec}`
    : game
      ? `${name} SCORE ${fmt(pts, 0)} AND BEAT ${game.loser.name.toUpperCase()} BY ${fmt(game.margin, 0)}`
      : `${name} POST THE TOP SCORE OF ${fmt(pts, 0)}`;

  const parts: string[] = [];
  const star = lw.topIndividual[0];
  if (star) parts.push(`${star.name} led all starters with ${fmt(star.points)} at ${star.position}.`);
  const decided = lw.games.filter(g => !g.tie);
  if (decided.length) {
    const big = [...decided].sort((a, b) => b.margin - a.margin)[0];
    const close = [...decided].sort((a, b) => a.margin - b.margin)[0];
    parts.push(`${big.winner.name} beat ${big.loser.name} by ${fmt(big.margin)}, the biggest margin of the week.`);
    if (close !== big) parts.push(`${close.winner.name} edged ${close.loser.name} by ${fmt(close.margin)} for the closest finish.`);
  }
  return { title, body: parts.join(" ") };
}

function pageOne(c: Canvas, report: ReportData) {
  const lw = report.lastWeek;
  c.page(true);
  let y = c.header(report, `Week ${report.resultsWeek} Results`, "Final scores, awards and power rankings");

  // Season progress
  const segW = (CONTENT_W - (REGULAR_SEASON_WEEKS - 1) * 3) / REGULAR_SEASON_WEEKS;
  for (let i = 1; i <= REGULAR_SEASON_WEEKS; i++) {
    const fill = i <= report.resultsWeek ? COLORS.green : i === report.week ? COLORS.hot : COLORS.line;
    c.fillRect(MARGIN + (i - 1) * (segW + 3), y, segW, 4.5, fill);
  }
  c.text(`REGULAR SEASON PROGRESS  |  WEEK ${report.week} OF ${REGULAR_SEASON_WEEKS}`, MARGIN, y + 13, {
    size: 5.5,
    color: COLORS.muted,
    bold: true,
    spacing: 0.8,
  });
  y += 24;

  // Game ball hero
  const hl = headline(report);
  if (hl) {
    const titleLines = c.wrap(hl.title, CONTENT_W - 34, 17, true, "display").slice(0, 2);
    const bodyLines = c.wrap(hl.body, CONTENT_W - 34, 8, false).slice(0, 3);
    const h = 20 + titleLines.length * 19 + bodyLines.length * 10.5 + 14;
    c.box(MARGIN, y, CONTENT_W, h, COLORS.line, COLORS.heroBg);
    c.fillRect(MARGIN, y, 4, h, COLORS.green);
    c.text("GAME BALL", MARGIN + 18, y + 14, { size: 6.5, color: COLORS.green, bold: true, spacing: 2 });
    titleLines.forEach((l, i) => c.text(l, MARGIN + 18, y + 33 + i * 19, { size: 17, bold: true, font: "display" }));
    bodyLines.forEach((l, i) => c.text(l, MARGIN + 18, y + 33 + titleLines.length * 19 - 4 + 8 + i * 10.5, { size: 8, color: COLORS.mid }));
    y += h + 12;
  }

  // Numbers
  const stats = [
    { label: "League average", value: fmt(lw.leagueAvgScore) },
    { label: "Total points", value: Math.round(lw.totalPoints).toLocaleString("en-US") },
    { label: "Average margin", value: fmt(lw.avgMargin) },
    { label: "Nail-biters (under 10)", value: String(lw.nailBiters) },
  ];
  const sw = (CONTENT_W - 36) / 4;
  stats.forEach((s, i) => {
    const sx = MARGIN + i * (sw + 12);
    c.rule(sx, sx + sw, y, COLORS.line, 1.5);
    c.text(s.value, sx, y + 22, { size: 20, bold: true, font: "display" });
    c.text(s.label.toUpperCase(), sx, y + 33, { size: 6, color: COLORS.muted, bold: true, spacing: 0.8 });
  });
  y += 50;

  // Two columns: scoreboard and top performances | awards
  const colW = (CONTENT_W - 20) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 20;
  let ly = y;
  c.section("Scoreboard", leftX, ly, colW);
  ly += 8;
  const rowH = 21;
  const games = lw.games.slice(0, 8);
  c.box(leftX, ly, colW, games.length * rowH + 2);
  games.forEach((g: WeekGame, i: number) => {
    const ry = ly + 1 + i * rowH;
    if (i > 0) c.rule(leftX, leftX + colW, ry, COLORS.rowLine, ROW_LINE_W);
    const base = ry + 14;
    c.text(c.fit(g.winner.name.toUpperCase(), 94, 7.5, true), leftX + 102, base, { size: 7.5, bold: true, align: "right" });
    c.text(fmt(g.winner.points, 1), leftX + 136, base, { size: 10, bold: true, color: COLORS.green, align: "right", font: "display" });
    c.text("F", leftX + 144, base, { size: 5.5, color: COLORS.muted, align: "center" });
    c.text(fmt(g.loser.points, 1), leftX + 152, base, { size: 10, bold: true, color: COLORS.muted, font: "display" });
    c.text(c.fit(g.loser.name.toUpperCase(), colW - 188, 7.5), leftX + 186, base, { size: 7.5, color: COLORS.muted });
  });
  ly += games.length * rowH + 2 + 16;

  c.section("Top performances", leftX, ly, colW);
  ly += 5;
  lw.topIndividual.slice(0, 6).forEach((r, i) => {
    const ry = ly + i * 17;
    c.rule(leftX, leftX + colW, ry + 17, COLORS.rowLine, ROW_LINE_W);
    c.text(r.name, leftX, ry + 12, { size: 8, bold: true });
    const nw = c.width(r.name, 8, true);
    c.text(c.fit(`${r.position}, ${r.team.name}`, colW - nw - 50, 6.5), leftX + nw + 5, ry + 12, { size: 6.5, color: COLORS.muted });
    c.text(fmt(r.points), leftX + colW, ry + 12, { size: 9, bold: true, color: COLORS.green, align: "right" });
  });
  const leftEnd = ly + Math.min(6, lw.topIndividual.length) * 17;

  let ry = y;
  c.section("Awards of the week", rightX, ry, colW);
  ry += 6;
  lw.awards.slice(0, 6).forEach((a, i) => {
    const ay = ry + i * 33;
    c.rule(rightX, rightX + colW, ay, COLORS.line, 1.2);
    c.text(a.title.toUpperCase(), rightX, ay + 11, { size: 6, color: COLORS.hot, bold: true, spacing: 1.2 });
    c.text(a.team.name, rightX, ay + 23, { size: 8.5, bold: true });
    const nw = c.width(a.team.name, 8.5, true);
    const detail = a.detail ? `${a.value}  ${a.detail}` : a.value;
    c.text(c.fit(detail, colW - nw - 10, 6.5), rightX + nw + 6, ay + 23, { size: 6.5, color: COLORS.mid });
  });
  const rightEnd = ry + Math.min(6, lw.awards.length) * 33;

  // Power rankings
  y = Math.max(leftEnd, rightEnd) + 20;
  c.section("Power rankings | movement from last week", MARGIN, y, CONTENT_W);
  y += 5;
  const rows = lw.powerRankings;
  const half = Math.ceil(rows.length / 2);
  const prW = (CONTENT_W - 28) / 2;
  rows.forEach((r, i) => {
    const colIdx = i < half ? 0 : 1;
    const rowIdx = i < half ? i : i - half;
    const px = MARGIN + colIdx * (prW + 28);
    const py = y + rowIdx * 19;
    c.rule(px, px + prW, py + 19, COLORS.rowLine, ROW_LINE_W);
    c.text(String(r.rank), px, py + 13, { size: 10, bold: true, color: COLORS.green, font: "display" });
    c.avatar(px + 16, py + 3, 12, r.team);
    c.text(c.fit(r.team.name, prW - 130, 8, true), px + 33, py + 13, { size: 8, bold: true });
    c.text(r.record, px + prW - 52, py + 13, { size: 7.5, color: COLORS.muted, align: "right" });
    const mv = r.move;
    c.text(mv > 0 ? `+${mv}` : mv < 0 ? `${mv}` : "-", px + prW, py + 13, {
      size: 7.5,
      bold: true,
      color: mv > 0 ? COLORS.green : mv < 0 ? COLORS.hot : COLORS.muted,
      align: "right",
    });
  });

  c.footer(report, 1);
}

function pageTwo(c: Canvas, report: ReportData) {
  const lw = report.lastWeek;
  c.page();
  let y = c.header(report, `Week ${report.resultsWeek} Standouts`, "Starters and lineups");
  const colW = (CONTENT_W - 20) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 20;

  // Top individual performances (left) and position leaders (right), same overall height
  const perf = lw.topIndividual.slice(0, 8);
  const rowH = 21;
  c.section("Top individual performances", leftX, y, colW);
  perf.forEach((r, i) => {
    const ry = y + 5 + i * rowH;
    c.rule(leftX, leftX + colW, ry + rowH, COLORS.rowLine, ROW_LINE_W);
    c.text(String(i + 1), leftX, ry + 14, { size: 8, bold: true, color: i < 3 ? COLORS.amber : COLORS.muted });
    c.text(r.name, leftX + 16, ry + 10, { size: 8.5, bold: true });
    c.text(`${r.position}  |  ${r.team.name}`, leftX + 16, ry + 19, { size: 6, color: COLORS.muted });
    c.text(fmt(r.points), leftX + colW, ry + 14, { size: 10, bold: true, color: COLORS.green, align: "right" });
  });
  const leftEnd = y + 5 + perf.length * rowH;

  const pos = lw.positionLeaders;
  const posRowH = pos.length ? Math.max(rowH, (perf.length * rowH) / pos.length) : rowH;
  c.section("Position leaders", rightX, y, colW);
  pos.forEach((p, i) => {
    const ry = y + 5 + i * posRowH;
    c.rule(rightX, rightX + colW, ry + posRowH, COLORS.rowLine, ROW_LINE_W);
    c.text(p.position, rightX, ry + posRowH / 2 + 3, { size: 8, bold: true, color: COLORS.green });
    c.text(p.name, rightX + 28, ry + posRowH / 2 - 1, { size: 8.5, bold: true });
    c.text(p.team.name, rightX + 28, ry + posRowH / 2 + 8, { size: 6, color: COLORS.muted });
    c.text(fmt(p.points), rightX + colW, ry + posRowH / 2 + 3, { size: 10, bold: true, color: COLORS.green, align: "right" });
  });
  y = Math.max(leftEnd, y + 5 + pos.length * posRowH) + 22;

  // Highest team scores
  c.section("Highest team scores", MARGIN, y, CONTENT_W);
  y += 5;
  const top = lw.highestTeamScores;
  const maxPts = Math.max(1, ...top.map(t => t.points));
  top.forEach((t, i) => {
    const ry = y + i * 21;
    c.rule(MARGIN, MARGIN + CONTENT_W, ry + 21, COLORS.rowLine, ROW_LINE_W);
    c.avatar(MARGIN, ry + 4, 13, t);
    c.text(t.name, MARGIN + 20, ry + 14, { size: 8.5, bold: true });
    c.bar(MARGIN + 190, ry + 8, 250, 5, (t.points / maxPts) * 100, COLORS.green);
    c.text(fmt(t.points, 2), MARGIN + CONTENT_W, ry + 14, { size: 9, bold: true, align: "right" });
  });
  y += top.length * 21 + 22;

  // Lineup efficiency
  c.section("Lineup efficiency | points scored vs best possible lineup", MARGIN, y, CONTENT_W);
  y += 5;
  const eff = lw.efficiency;
  const effH = Math.min(21, Math.max(15, (PAGE_H - 40 - y) / Math.max(1, eff.length)));
  eff.forEach((t, i) => {
    const ry = y + i * effH;
    c.rule(MARGIN, MARGIN + CONTENT_W, ry + effH, COLORS.rowLine, ROW_LINE_W);
    c.avatar(MARGIN, ry + (effH - 12) / 2, 12, t);
    c.text(t.name, MARGIN + 19, ry + effH / 2 + 3, { size: 8 });
    const color = t.pct >= 90 ? COLORS.green : t.pct >= 75 ? COLORS.amber : COLORS.hot;
    c.bar(MARGIN + 190, ry + effH / 2 - 2.5, 250, 5, t.pct, color);
    c.text(`${t.pct}%`, MARGIN + 462, ry + effH / 2 + 3, { size: 8, bold: true, color });
    c.text(`${fmt(t.actual)} / ${fmt(t.optimal)}`, MARGIN + CONTENT_W, ry + effH / 2 + 3, { size: 6.5, color: COLORS.muted, align: "right" });
  });

  c.footer(report, 2);
}

function pageThree(c: Canvas, report: ReportData, playoff: PlayoffData | null) {
  const pv = report.preview;
  c.page();
  let y = c.header(report, `Week ${report.week} Preview`, "Projected scores, win odds and what is at stake");

  // Matchup cards, two across
  const cw = (CONTENT_W - 12) / 2;
  const ch = 66;
  pv.matchups.forEach((m, i) => {
    const x = MARGIN + (i % 2) * (cw + 12);
    const cy = y + Math.floor(i / 2) * (ch + 8);
    c.box(x, cy, cw, ch);
    c.text(c.fit(m.a.name.toUpperCase(), cw / 2 - 14, 9, true, "display"), x + 8, cy + 14, { size: 9, bold: true, font: "display" });
    c.text(c.fit(m.b.name.toUpperCase(), cw / 2 - 14, 9, true, "display"), x + cw - 8, cy + 14, { size: 9, bold: true, color: COLORS.muted, align: "right", font: "display" });
    c.text(m.a.record, x + 8, cy + 23, { size: 6, color: COLORS.muted });
    c.text(m.b.record, x + cw - 8, cy + 23, { size: 6, color: COLORS.muted, align: "right" });
    const fav = favorite(m);
    const even = fav.even;
    const aCol = even || fav.isA ? COLORS.green : COLORS.muted;
    const bCol = even || !fav.isA ? COLORS.green : COLORS.muted;
    c.text(fmt(m.a.projected), x + 8, cy + 44, { size: 17, bold: true, color: aCol, font: "display" });
    c.text(fmt(m.b.projected), x + cw - 8, cy + 44, { size: 17, bold: true, color: bCol, align: "right", font: "display" });
    // Center label: the favorite and its chance, sized to the gap between the two scores.
    const pctText = ` ${fmt(fav.pct, 0)}%`;
    const gap = cw - 2 * 72;
    const label = even ? "EVEN" : c.fit(fav.team.name.toUpperCase(), gap - c.width(pctText, 8, true, "display"), 8, true, "display") + pctText;
    c.text(label, x + cw / 2, cy + 42, { size: 8, bold: true, color: COLORS.green, align: "center", font: "display" });
    // Bar: split at team A's chance. The favorite's segment is green, the underdog's slate.
    const bx = x + 8;
    const bw = cw - 16;
    const aw = Math.max(0, Math.min(1, m.probA)) * bw;
    c.fillRect(bx, cy + 50, aw, 2.5, aCol === COLORS.green ? COLORS.green : COLORS.line);
    c.fillRect(bx + aw, cy + 50, bw - aw, 2.5, bCol === COLORS.green ? COLORS.green : COLORS.line);
    c.text(`${fmt(m.probA * 100, 0)}%`, bx, cy + 61, { size: 7.5, bold: true, color: aCol, font: "display" });
    c.text(`${fmt((1 - m.probA) * 100, 0)}%`, bx + bw, cy + 61, { size: 7.5, bold: true, color: bCol, align: "right", font: "display" });
  });
  y += Math.ceil(pv.matchups.length / 2) * (ch + 8) + 14;

  // Storylines
  if (pv.storylines.length) {
    c.section("Storylines to watch", MARGIN, y, CONTENT_W);
    y += 5;
    pv.storylines.forEach(s => {
      const lead = `${s.lead} `;
      const lw = c.width(lead.trim(), 8, true) + 4;
      const lines = c.wrap(s.text, CONTENT_W - lw - 2, 8, false);
      const h = Math.max(1, lines.length) * 10 + 7;
      c.text(lead.trim(), MARGIN, y + 11, { size: 8, bold: true, color: COLORS.green });
      lines.forEach((l, i) => c.text(l, MARGIN + lw, y + 11 + i * 10, { size: 8, color: COLORS.mid }));
      c.rule(MARGIN, MARGIN + CONTENT_W, y + h, COLORS.rowLine, ROW_LINE_W);
      y += h;
    });
    y += 14;
  }

  // Head to head, all-time (falls back to this season when history could not be loaded)
  if (pv.matchups.length) {
    c.section("Head to head | all-time", MARGIN, y, CONTENT_W);
    y += 5;
    c.text("Regular season and playoffs, all seasons", MARGIN, y + 7, { size: 6.5, color: COLORS.muted });
    y += 11;
    const colSeries = MARGIN + 172;
    const colStreak = MARGIN + 306;
    pv.matchups.forEach(m => {
      c.rule(MARGIN, MARGIN + CONTENT_W, y + 15, COLORS.rowLine, ROW_LINE_W);
      c.text(c.fit(`${m.a.name} v ${m.b.name}`, 164, 7.5, true), MARGIN, y + 11, { size: 7.5, bold: true });
      const h = m.history;
      if (h) {
        c.text(h2hSeriesFit(c, m, 125), colSeries, y + 11, { size: 7.5 });
        const streakTeam = h.streak > 0 ? m.a : m.b;
        const streakText = h.streak === 0 ? "-" : `${streakTeam.initials || streakTeam.name} W${Math.abs(h.streak)}`;
        c.text(c.fit(streakText, 55, 7.5), colStreak, y + 11, { size: 7.5, color: COLORS.mid });
        if (h.last) {
          const aWon = h.last.aScore >= h.last.bScore;
          const winner = aWon ? m.a.name : m.b.name;
          const score = ` ${fmt(Math.max(h.last.aScore, h.last.bScore))} to ${fmt(Math.min(h.last.aScore, h.last.bScore))}`;
          const pre = `${h.last.season} Wk ${h.last.week}: `;
          const txt = pre + c.fit(winner, 175 - c.width(pre + score, 7.5), 7.5) + score;
          c.text(txt, MARGIN + CONTENT_W, y + 11, { size: 7.5, color: COLORS.muted, align: "right" });
        }
      } else {
        c.text(c.fit(m.meeting.series, 160, 7.5), colSeries, y + 11, { size: 7.5 });
        c.text(c.fit(m.meeting.last, 190, 7.5), MARGIN + CONTENT_W, y + 11, { size: 7.5, color: COLORS.muted, align: "right" });
      }
      y += 15;
    });
    y += 14;
  }

  // Games that matter most: both teams per game, biggest swings first
  const nameOf = new Map<number, TeamRef>();
  pv.matchups.forEach(m => {
    nameOf.set(m.a.rosterId, m.a);
    nameOf.set(m.b.rosterId, m.b);
  });
  const swings = (playoff?.outlook?.gameSwings ?? [])
    .filter(g => nameOf.has(g.teamA) && nameOf.has(g.teamB))
    .sort((p, q) => Math.max(q.a.ifWin - q.a.ifLose, q.b.ifWin - q.b.ifLose) - Math.max(p.a.ifWin - p.a.ifLose, p.b.ifWin - p.b.ifLose));
  const rowH = 15;
  const roomLeft = PAGE_H - 36 - y - 40;
  const maxGames = Math.max(0, Math.min(4, swings.length, Math.floor(roomLeft / (rowH * 2 + 5))));
  if (maxGames > 0) {
    c.section("Games that matter most | playoff odds swing", MARGIN, y, CONTENT_W);
    y += 6;
    const note = "Playoff odds for both teams in each game. The white tick is where a team is now, the left end is its odds if it loses, the right end if it wins. A wider bar means a bigger game.";
    c.wrap(note, CONTENT_W, 6.5).forEach((l, i) => c.text(l, MARGIN, y + 7 + i * 8, { size: 6.5, color: COLORS.muted }));
    y += 7 + c.wrap(note, CONTENT_W, 6.5).length * 8 + 4;
    const barX = MARGIN + 205;
    const barW = 140;
    swings.slice(0, maxGames).forEach(g => {
      [
        { id: g.teamA, s: g.a },
        { id: g.teamB, s: g.b },
      ].forEach((side, k) => {
        const team = nameOf.get(side.id)!;
        const ry = y + k * rowH;
        c.avatar(MARGIN, ry + 2, 10, team);
        c.text(c.fit(team.name, 175, 7.5, true), MARGIN + 15, ry + 9, { size: 7.5, bold: true });
        const { now, ifWin, ifLose } = side.s;
        const pred = playoff?.predictions.find(p => p.rosterId === side.id);
        const swingPct = (v: number) => (pred?.clinchedPlayoffs ? "100%" : pred?.eliminated ? "0%" : v >= 99.5 ? ">99%" : v < 0.5 ? "<1%" : `${fmt(v, 0)}%`);
        c.fillRect(barX, ry + 3.5, barW, 5, COLORS.line);
        c.fillRect(barX + (ifLose / 100) * barW, ry + 3.5, Math.max(0.5, ((now - ifLose) / 100) * barW), 5, COLORS.hot);
        c.fillRect(barX + (now / 100) * barW, ry + 3.5, Math.max(0.5, ((ifWin - now) / 100) * barW), 5, COLORS.green);
        c.fillRect(barX + (now / 100) * barW - 0.6, ry + 1.5, 1.2, 9, COLORS.white);
        c.text(swingPct(ifLose), MARGIN + 382, ry + 9, { size: 7.5, bold: true, color: COLORS.hot, align: "right" });
        c.text(swingPct(now), MARGIN + 413, ry + 9, { size: 7.5, color: COLORS.muted, align: "center" });
        c.text(swingPct(ifWin), MARGIN + 433, ry + 9, { size: 7.5, bold: true, color: COLORS.green });
        c.text(`${fmt(ifWin - ifLose, 0)} ${Math.round(ifWin - ifLose) === 1 ? "pt" : "pts"}`, MARGIN + CONTENT_W, ry + 9, { size: 7.5, bold: true, align: "right" });
      });
      c.rule(MARGIN, MARGIN + CONTENT_W, y + rowH * 2 + 2, COLORS.rowLine, ROW_LINE_W);
      y += rowH * 2 + 5;
    });
  }

  c.footer(report, 3);
}

function pageFour(c: Canvas, report: ReportData, playoff: PlayoffData | null) {
  c.page();
  let y = c.header(
    report,
    "Playoff Picture",
    playoff
      ? `Seeds 1-${playoff.playoffTeams} make the playoffs. Odds from ${playoff.simulationCount.toLocaleString()} season simulations`
      : "Playoff odds unavailable for this report",
  );

  if (playoff) {
    // Seed order: with divisions, the division leaders take the top seeds (best record first), then everyone else
    // by wins and points for. Without divisions it is simply wins, then points for.
    const byRecord = (a: PlayoffPrediction, b: PlayoffPrediction) => b.currentWins - a.currentWins || b.pointsFor - a.pointsFor;
    const divLeaders = new Set<number>();
    if (playoff.hasDivisions) {
      const best = new Map<number, PlayoffPrediction>();
      playoff.predictions.forEach(t => {
        if (t.division === undefined) return;
        const cur = best.get(t.division);
        if (!cur || byRecord(t, cur) < 0) best.set(t.division, t);
      });
      best.forEach(t => divLeaders.add(t.rosterId));
    }
    const seeds = [...playoff.predictions].sort((a, b) => {
      const la = divLeaders.has(a.rosterId) ? 0 : 1;
      const lb = divLeaders.has(b.rosterId) ? 0 : 1;
      return la - lb || byRecord(a, b);
    });
    const rowH = 19;
    const headerH = 16;
    const tableH = headerH + seeds.length * rowH + 4;
    c.box(MARGIN, y, CONTENT_W, tableH);
    const cols = { seed: MARGIN + 10, team: MARGIN + 34, rec: MARGIN + 190, pf: MARGIN + 262, make: MARGIN + 276, div: MARGIN + 432, one: MARGIN + 482, status: MARGIN + 492 };
    const hdr = { size: 6, color: COLORS.muted, bold: true, spacing: 0.8 };
    c.text("SEED", cols.seed, y + 11, hdr);
    c.text("TEAM", cols.team, y + 11, hdr);
    c.text("REC", cols.rec, y + 11, hdr);
    c.text("PF", cols.pf, y + 11, { ...hdr, align: "right" });
    c.text("MAKE PLAYOFFS", cols.make, y + 11, hdr);
    c.text("DIV", cols.div, y + 11, { ...hdr, align: "right" });
    c.text("#1 SEED", cols.one, y + 11, { ...hdr, align: "right" });
    c.rule(MARGIN, MARGIN + CONTENT_W, y + headerH - 1, COLORS.line, 0.6);

    let rowY = y + headerH;
    seeds.forEach((t, i) => {
      const seed = i + 1;
      const isDivWinner = divLeaders.has(t.rosterId);
      if (isDivWinner) c.fillRect(MARGIN + 0.5, rowY, CONTENT_W - 1, rowH, COLORS.divRow);
      if (i > 0) c.rule(MARGIN, MARGIN + CONTENT_W, rowY, COLORS.rowLine, ROW_LINE_W);
      if (seed === playoff.playoffTeams + 1) c.fillRect(MARGIN + 0.5, rowY - 1, CONTENT_W - 1, 1.6, COLORS.amber);
      const base = rowY + 13;
      c.text(String(seed), cols.seed, base, { size: 8, bold: true, color: seed <= playoff.playoffTeams ? COLORS.green : COLORS.muted });
      c.avatar(cols.team, rowY + 3, 13, { avatar: null, initials: t.initials });
      const label = c.fit(t.name, isDivWinner ? 105 : 132, 8, seed <= playoff.playoffTeams);
      c.text(label, cols.team + 18, base, { size: 8, bold: seed <= playoff.playoffTeams, color: seed <= playoff.playoffTeams ? COLORS.text : COLORS.mid });
      if (isDivWinner) c.text("(DIV)", cols.team + 18 + c.width(label, 8, seed <= playoff.playoffTeams) + 3, base, { size: 5.5, bold: true, color: COLORS.amber });
      c.text(`${t.currentWins}-${t.currentLosses}`, cols.rec, base, { size: 8 });
      c.text(fmt(t.pointsFor), cols.pf, base, { size: 8, align: "right" });
      const mp = t.makePlayoffsPct;
      const mpColor = mp >= 90 ? COLORS.green : mp >= 40 ? COLORS.amber : COLORS.hot;
      c.bar(cols.make, rowY + 7, 84, 4.5, mp, mpColor);
      c.text(pctText(mp), cols.make + 89, base, { size: 7.5, bold: true, color: mpColor });
      c.text(divisionOddsText(t, playoff.predictions), cols.div, base, { size: 7.5, align: "right", color: COLORS.muted });
      c.text(pctText(t.oneSeedPct), cols.one, base, { size: 7.5, align: "right", color: COLORS.muted });
      // CLINCHED and ELIMINATED are guaranteed. LOCK and LONG SHOT are only the simulation's near-certain calls.
      if (t.clinchedPlayoffs) c.pill("CLINCHED", cols.status, rowY + 4, COLORS.green, COLORS.dark, 5.5);
      else if (t.eliminated) c.pill("ELIMINATED", cols.status, rowY + 4, COLORS.muted, COLORS.dark, 5.5);
      else if (mp >= 99.5) c.pill("LOCK", cols.status, rowY + 4, COLORS.cold, COLORS.dark, 5.5);
      else if (mp < 0.5) c.pill("LONG SHOT", cols.status, rowY + 4, COLORS.hot, COLORS.dark, 5.5);
      rowY += rowH;
    });
    c.text("CLINCHED and ELIMINATED are guaranteed (wins math, tiebreakers ignored). LOCK (99.5%+) and LONG SHOT (under 0.5%) are simulation calls only.", MARGIN, y + tableH + 9, { size: 6.5, color: COLORS.muted });
    y += tableH + 22;

    // Division races
    if (playoff.hasDivisions) {
      const divisions = [...new Set(seeds.map(t => t.division).filter((d): d is number => d !== undefined))].sort((a, b) => a - b);
      if (divisions.length) {
        c.section("Division races | chance to win each division", MARGIN, y, CONTENT_W);
        y += 6;
        const dw = (CONTENT_W - 10 * (divisions.length - 1)) / divisions.length;
        const maxRows = Math.max(1, ...divisions.map(d => seeds.filter(t => t.division === d).length));
        const divH = 22 + maxRows * 11;
        divisions.forEach((d, i) => {
          const dx = MARGIN + i * (dw + 10);
          c.box(dx, y, dw, divH);
          c.text(`DIVISION ${d}`, dx + 8, y + 13, { size: 6.5, color: COLORS.amber, bold: true, spacing: 1.2 });
          seeds
            .filter(t => t.division === d)
            .sort((a, b) => (b.divisionWinnerPct ?? 0) - (a.divisionWinnerPct ?? 0))
            .forEach((t, j) => {
              const ry = y + 25 + j * 11;
              c.text(c.fit(t.name, dw - 90, 7, true), dx + 8, ry, { size: 7, bold: true });
              c.text(`${t.currentWins}-${t.currentLosses}`, dx + dw - 50, ry, { size: 6.5, color: COLORS.muted, align: "right" });
              c.text(divisionOddsText(t, playoff.predictions), dx + dw - 8, ry, { size: 7, bold: true, align: "right" });
            });
        });
        y += divH + 16;
      }
    }
  }

  // Hot and cold, compact
  const hc = report.hotCold;
  if (hc && hc.all.length) {
    c.section("Hot and cold | last 4 weeks vs the rest of the season", MARGIN, y, CONTENT_W);
    y += 6;
    const room = PAGE_H - 36 - y;
    const rowH = Math.max(9, Math.min(13, (room - 14) / hc.all.length));
    const leftW = 320;
    const labelW = 120;
    const trackX = MARGIN + labelW + 4;
    const trackW = leftW - labelW - 40;
    const centerX = trackX + trackW / 2;
    const maxAbs = Math.max(1, ...hc.all.map(r => Math.abs(r.delta)));
    c.text("COOLER", trackX, y + 7, { size: 5.5, color: COLORS.cold, bold: true });
    c.text("HOTTER", trackX + trackW, y + 7, { size: 5.5, color: COLORS.hot, bold: true, align: "right" });
    hc.all.forEach((r, i) => {
      const ry = y + 11 + i * rowH;
      c.avatar(MARGIN, ry + 0.5, rowH - 2, r);
      c.text(c.fit(r.name, labelW - rowH - 4, 6.5), MARGIN + rowH + 2, ry + rowH - 3, { size: 6.5 });
      const len = (Math.abs(r.delta) / maxAbs) * (trackW / 2);
      if (r.delta > 0) c.fillRect(centerX, ry + 2, len, rowH - 5, COLORS.hot);
      else if (r.delta < 0) c.fillRect(centerX - len, ry + 2, len, rowH - 5, COLORS.cold);
      c.fillRect(centerX - 0.3, ry, 0.6, rowH - 1, COLORS.muted);
      c.text(signed(r.delta), MARGIN + leftW, ry + rowH - 3, { size: 6.5, bold: true, color: r.delta >= 0 ? COLORS.hot : COLORS.cold, align: "right" });
    });

    // Right: who is heating up and cooling off
    const rx = MARGIN + leftW + 24;
    const rw = CONTENT_W - leftW - 24;
    let ry2 = y + 8;
    const group = (title: string, color: RGB, rows: typeof hc.hot) => {
      c.text(title, rx, ry2, { size: 6.5, color, bold: true, spacing: 1.2 });
      ry2 += 5;
      rows.forEach(r => {
        c.rule(rx, rx + rw, ry2 + 22, COLORS.rowLine, ROW_LINE_W);
        c.text(c.fit(r.name, rw - 44, 8, true), rx, ry2 + 10, { size: 8, bold: true });
        c.text(`Last 4 avg ${fmt(r.last4)} vs ${fmt(r.earlier)} earlier`, rx, ry2 + 18, { size: 5.5, color: COLORS.muted });
        c.text(signed(r.delta), rx + rw, ry2 + 14, { size: 11, bold: true, color, align: "right" });
        ry2 += 24;
      });
      ry2 += 8;
    };
    group("HEATING UP", COLORS.hot, hc.hot);
    group("COOLING OFF", COLORS.cold, hc.cold);
  }

  c.footer(report, 4);
}

/** Series text with the leader's name shortened so it never runs into the next column. */
function h2hSeriesFit(c: Canvas, m: PreviewMatchup, maxW: number): string {
  const h = m.history;
  if (!h || h.meetings === 0 || h.aWins === h.bWins) return c.fit(h2hSeries(m), maxW, 7.5);
  const lead = h.aWins > h.bWins ? m.a : m.b;
  const tail = ` lead ${Math.max(h.aWins, h.bWins)}-${Math.min(h.aWins, h.bWins)}${h.ties ? `-${h.ties}` : ""}`;
  return c.fit(lead.name, maxW - c.width(tail, 7.5), 7.5) + tail;
}

// ─── Entry point ────────────────────────────────────────────────────────────

export function buildWeeklyReportPdf(
  report: ReportData,
  playoff: PlayoffData | null,
  avatars: Map<string, string>,
  fonts?: ReportFonts | null,
): jsPDF {
  const c = new Canvas(avatars, fonts);
  pageOne(c, report);
  pageTwo(c, report);
  pageThree(c, report, playoff);
  pageFour(c, report, playoff);
  return c.doc;
}

export function reportFileName(report: ReportData): string {
  const base = clean(report.leagueName).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "League";
  return `${base}-Week-${report.week}-Report.pdf`;
}
