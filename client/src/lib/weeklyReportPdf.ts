import { jsPDF } from "jspdf";
import type { ReportData, WeekGame } from "@shared/weeklyReport";

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
}

export interface PlayoffData {
  predictions: PlayoffPrediction[];
  playoffTeams: number;
  hasDivisions: boolean;
  simulationCount: number;
}

// ─── Layout and colors (matches the dark report design) ─────────────────────

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const COLORS = {
  bg: hex("#0B0F17"),
  card: hex("#141B26"),
  line: hex("#222B3A"),
  text: hex("#E6EAF2"),
  muted: hex("#8A94A6"),
  green: hex("#3DDC97"),
  amber: hex("#F5B642"),
  red: hex("#F26B6B"),
  blue: hex("#5AA9F0"),
  orange: hex("#FF9F43"),
  dark: hex("#0B0F17"),
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const REGULAR_SEASON_WEEKS = 14;

/** Helvetica (the built-in PDF font) cannot draw emoji or most non-Latin characters. */
function clean(s: string): string {
  const stripped = s.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
  return stripped || "?";
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

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
  report.preview.matchups.forEach(m => {
    add(m.a);
    add(m.b);
  });
  report.hotCold?.all.forEach(t => add(t));
  return urls;
}

// ─── Drawing helpers ────────────────────────────────────────────────────────

class Canvas {
  doc: jsPDF;
  avatars: Map<string, string>;

  constructor(avatars: Map<string, string>) {
    this.doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
    this.avatars = avatars;
  }

  page(first = false) {
    if (!first) this.doc.addPage();
    this.doc.setFillColor(...COLORS.bg);
    this.doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  }

  text(
    str: string,
    x: number,
    y: number,
    opts: { size?: number; color?: RGB; bold?: boolean; align?: "left" | "center" | "right" } = {},
  ) {
    const { size = 10, color = COLORS.text, bold = false, align = "left" } = opts;
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
    this.doc.text(clean(str), x, y, { align });
  }

  card(x: number, y: number, w: number, h: number, fill: RGB = COLORS.card) {
    this.doc.setFillColor(...fill);
    this.doc.setDrawColor(...COLORS.line);
    this.doc.setLineWidth(0.6);
    this.doc.roundedRect(x, y, w, h, 8, 8, "FD");
  }

  bar(x: number, y: number, w: number, h: number, pct: number, color: RGB) {
    this.doc.setFillColor(...COLORS.line);
    this.doc.rect(x, y, w, h, "F");
    const filled = Math.max(0, Math.min(100, pct)) / 100 * w;
    if (filled > 0) {
      this.doc.setFillColor(...color);
      this.doc.rect(x, y, filled, h, "F");
    }
  }

  pill(label: string, x: number, y: number, fill: RGB, textColor: RGB = COLORS.dark, size = 7) {
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(size);
    const w = this.doc.getTextWidth(clean(label)) + 12;
    this.doc.setFillColor(...fill);
    this.doc.roundedRect(x, y, w, size + 7, (size + 7) / 2, (size + 7) / 2, "F");
    this.text(label, x + w / 2, y + size + 2, { size, color: textColor, bold: true, align: "center" });
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

  header(eyebrow: string, title: string, subtitle?: string) {
    this.text(eyebrow.toUpperCase(), MARGIN, 44, { size: 8, color: COLORS.green, bold: true });
    this.text(title, MARGIN, 70, { size: 22, bold: true });
    if (subtitle) this.text(subtitle, MARGIN, 86, { size: 9, color: COLORS.muted });
  }

  footer(report: ReportData, pageNo: number) {
    this.text(
      `${report.leagueName}  |  ${report.season} Season  |  Week ${report.week} Report`,
      MARGIN,
      PAGE_H - 22,
      { size: 7, color: COLORS.muted },
    );
    this.text(`${pageNo} / 5`, PAGE_W - MARGIN, PAGE_H - 22, { size: 7, color: COLORS.muted, align: "right" });
  }
}

// ─── Pages ──────────────────────────────────────────────────────────────────

function pageOne(c: Canvas, report: ReportData) {
  const lw = report.lastWeek;
  c.page(true);

  // Cover card
  c.card(MARGIN, MARGIN, CONTENT_W, 118);
  c.doc.setFillColor(...COLORS.green);
  c.doc.rect(MARGIN, MARGIN, 4, 118, "F");
  c.text("WEEKLY LEAGUE REPORT", MARGIN + 20, MARGIN + 24, { size: 8, color: COLORS.green, bold: true });
  c.text(report.leagueName, MARGIN + 20, MARGIN + 56, { size: 26, bold: true });
  c.text(`${report.season} Season`, MARGIN + 20, MARGIN + 74, { size: 10, color: COLORS.muted });
  c.pill(`WEEK ${report.week}`, PAGE_W - MARGIN - 80, MARGIN + 18, COLORS.green, COLORS.dark, 9);

  // Season progress bar
  const segX = MARGIN + 20;
  const segW = (CONTENT_W - 40 - (REGULAR_SEASON_WEEKS - 1) * 3) / REGULAR_SEASON_WEEKS;
  for (let i = 1; i <= REGULAR_SEASON_WEEKS; i++) {
    const fill = i <= report.resultsWeek ? COLORS.green : i === report.week ? COLORS.amber : COLORS.line;
    c.doc.setFillColor(...fill);
    c.doc.rect(segX + (i - 1) * (segW + 3), MARGIN + 92, segW, 6, "F");
  }
  c.text(`REGULAR SEASON PROGRESS  |  WEEK ${report.week} OF ${REGULAR_SEASON_WEEKS}`, segX, MARGIN + 110, {
    size: 6,
    color: COLORS.muted,
  });

  // Last week's results
  let y = MARGIN + 140;
  c.text(`Week ${report.resultsWeek} Results`, MARGIN, y, { size: 14, bold: true });
  y += 10;
  const rowH = 30;
  c.card(MARGIN, y, CONTENT_W, lw.games.length * rowH + 8);
  lw.games.forEach((g: WeekGame, i: number) => {
    const ry = y + 4 + i * rowH;
    const ty = ry + 19;
    c.avatar(MARGIN + 8, ry + 5, 20, g.winner);
    c.text(g.winner.name, MARGIN + 34, ty, { size: 10, bold: true, color: COLORS.text });
    c.text(fmt(g.winner.points, 2), 330, ty, { size: 10, bold: true, color: COLORS.green, align: "right" });
    c.pill(`+${fmt(g.margin)}`, 340, ry + 6, COLORS.line, COLORS.text, 7);
    c.text(fmt(g.loser.points, 2), 396, ty, { size: 10, color: COLORS.muted });
    c.text(g.loser.name, PAGE_W - MARGIN - 34, ty, { size: 10, color: COLORS.muted, align: "right" });
    c.avatar(PAGE_W - MARGIN - 28, ry + 5, 20, g.loser);
  });
  y += lw.games.length * rowH + 20;

  // Stat cards
  const statW = (CONTENT_W - 36) / 4;
  const stats = [
    { label: "League avg score", value: fmt(lw.leagueAvgScore), sub: "per team" },
    { label: "Total points", value: fmt(lw.totalPoints, 0), sub: `${lw.gameCount} games` },
    { label: "Avg margin", value: fmt(lw.avgMargin), sub: "points per game" },
    { label: "Nail-biters", value: String(lw.nailBiters), sub: "decided by under 10" },
  ];
  stats.forEach((s, i) => {
    const sx = MARGIN + i * (statW + 12);
    c.card(sx, y, statW, 52);
    c.text(s.label.toUpperCase(), sx + 10, y + 16, { size: 6.5, color: COLORS.muted, bold: true });
    c.text(s.value, sx + 10, y + 36, { size: 16, bold: true });
    c.text(s.sub, sx + 10, y + 47, { size: 6.5, color: COLORS.muted });
  });
  y += 70;

  // Awards
  c.text("WEEK IN NUMBERS", MARGIN, y, { size: 7.5, color: COLORS.muted, bold: true });
  y += 8;
  const awardW = (CONTENT_W - 24) / 3;
  const awardH = 62;
  const accents: RGB[] = [COLORS.green, COLORS.red, COLORS.amber, COLORS.orange, COLORS.blue, COLORS.green];
  lw.awards.slice(0, 6).forEach((a, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const ax = MARGIN + col * (awardW + 12);
    const ay = y + row * (awardH + 10);
    c.card(ax, ay, awardW, awardH);
    c.doc.setFillColor(...accents[i]);
    c.doc.rect(ax, ay + 8, 3, awardH - 16, "F");
    c.text(a.title.toUpperCase(), ax + 12, ay + 14, { size: 6.5, color: accents[i], bold: true });
    c.avatar(ax + 12, ay + 22, 16, a.team);
    c.text(a.team.name, ax + 34, ay + 33, { size: 9, bold: true });
    c.text(a.value, ax + 12, ay + 49, { size: 8.5, bold: true });
    if (a.detail) c.text(a.detail, ax + awardW - 10, ay + 49, { size: 7, color: COLORS.muted, align: "right" });
  });

  c.footer(report, 1);
}

function pageTwo(c: Canvas, report: ReportData) {
  const lw = report.lastWeek;
  c.page();
  c.header("High performers", `Week ${report.resultsWeek} standouts`, "Starters and lineups");

  const colW = (CONTENT_W - 16) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 16;
  let y = 104;

  // Top individual performances
  c.text("TOP INDIVIDUAL PERFORMANCES", leftX, y, { size: 7, color: COLORS.muted, bold: true });
  y += 8;
  const topH = lw.topIndividual.length * 24 + 10;
  c.card(leftX, y, colW, topH);
  lw.topIndividual.forEach((r, i) => {
    const ry = y + 6 + i * 24;
    c.text(String(i + 1), leftX + 12, ry + 15, { size: 9, color: i < 3 ? COLORS.amber : COLORS.muted, bold: true });
    c.text(r.name, leftX + 30, ry + 11, { size: 9, bold: true });
    c.text(`${r.position}  |  ${r.team.name}`, leftX + 30, ry + 21, { size: 6.5, color: COLORS.muted });
    c.text(fmt(r.points), leftX + colW - 12, ry + 15, { size: 10, bold: true, color: COLORS.green, align: "right" });
  });

  // Position leaders
  let ry = y;
  c.text("POSITION LEADERS", rightX, ry, { size: 7, color: COLORS.muted, bold: true });
  ry += 8;
  const posH = lw.positionLeaders.length * 24 + 10;
  c.card(rightX, ry, colW, posH);
  lw.positionLeaders.forEach((p, i) => {
    const py = ry + 6 + i * 24;
    c.pill(p.position, rightX + 10, py + 4, COLORS.line, COLORS.text, 6.5);
    c.text(p.name, rightX + 52, py + 11, { size: 9, bold: true });
    c.text(p.team.name, rightX + 52, py + 21, { size: 6.5, color: COLORS.muted });
    c.text(fmt(p.points), rightX + colW - 12, py + 15, { size: 10, bold: true, color: COLORS.green, align: "right" });
  });
  ry += posH + 16;

  // Highest team scores
  c.text("HIGHEST TEAM SCORES", rightX, ry, { size: 7, color: COLORS.muted, bold: true });
  ry += 8;
  const hsH = lw.highestTeamScores.length * 24 + 10;
  c.card(rightX, ry, colW, hsH);
  lw.highestTeamScores.forEach((t, i) => {
    const ty = ry + 6 + i * 24;
    c.text(String(i + 1), rightX + 12, ty + 15, { size: 8, color: COLORS.muted, bold: true });
    c.avatar(rightX + 26, ty + 3, 16, t);
    c.text(t.name, rightX + 50, ty + 15, { size: 9, bold: true });
    c.text(fmt(t.points, 2), rightX + colW - 12, ty + 15, { size: 10, bold: true, color: COLORS.green, align: "right" });
  });

  // Lineup efficiency (full width, below both columns)
  y = Math.max(y + topH, ry + hsH) + 22;
  c.text("LINEUP EFFICIENCY  |  POINTS SCORED VS BEST POSSIBLE LINEUP", MARGIN, y, {
    size: 7,
    color: COLORS.muted,
    bold: true,
  });
  y += 8;
  const effH = lw.efficiency.length * 22 + 14;
  c.card(MARGIN, y, CONTENT_W, effH);
  lw.efficiency.forEach((t, i) => {
    const ey = y + 8 + i * 22;
    c.avatar(MARGIN + 10, ey + 1, 14, t);
    c.text(t.name, MARGIN + 30, ey + 11, { size: 8.5 });
    const barColor = t.pct >= 90 ? COLORS.green : t.pct >= 75 ? COLORS.amber : COLORS.red;
    c.bar(MARGIN + 190, ey + 4, 260, 7, t.pct, barColor);
    c.text(`${t.pct}%`, MARGIN + 462, ey + 11, { size: 8.5, bold: true, color: barColor });
    c.text(`${fmt(t.actual)} / ${fmt(t.optimal)}`, MARGIN + CONTENT_W - 10, ey + 11, {
      size: 7,
      color: COLORS.muted,
      align: "right",
    });
  });

  c.footer(report, 2);
}

function pageThree(c: Canvas, report: ReportData) {
  const pv = report.preview;
  c.page();
  c.header("Look ahead", `Week ${report.week} preview`, "Projections use each team's optimal lineup; win odds assume typical weekly scoring variance.");

  // Callouts
  const callouts = [
    { label: "Toss-up", m: pv.tossUp, color: COLORS.amber },
    { label: "Biggest mismatch", m: pv.biggestMismatch, color: COLORS.red },
    { label: "Shootout watch", m: pv.shootout, color: COLORS.green },
  ];
  const cw = (CONTENT_W - 24) / 3;
  callouts.forEach((co, i) => {
    const x = MARGIN + i * (cw + 12);
    c.card(x, 104, cw, 56);
    c.doc.setFillColor(...co.color);
    c.doc.rect(x, 112, 3, 40, "F");
    c.text(co.label.toUpperCase(), x + 12, 118, { size: 6.5, color: co.color, bold: true });
    if (!co.m) {
      c.text("No matchups this week", x + 12, 136, { size: 8, color: COLORS.muted });
      return;
    }
    c.text(`${co.m.a.name} vs ${co.m.b.name}`, x + 12, 132, { size: 8, bold: true });
    const detail =
      co.label === "Shootout watch"
        ? `Projected combined ${fmt(co.m.a.projected + co.m.b.projected)} pts`
        : `${fmt(co.m.probA * 100, 0)}% / ${fmt((1 - co.m.probA) * 100, 0)}%`;
    c.text(detail, x + 12, 146, { size: 7, color: COLORS.muted });
  });

  // Matchup cards
  let y = 176;
  const cardH = 68;
  pv.matchups.forEach(m => {
    c.card(MARGIN, y, CONTENT_W, cardH);
    // Team A (left)
    c.avatar(MARGIN + 12, y + 10, 22, m.a);
    c.text(m.a.name, MARGIN + 42, y + 23, { size: 10, bold: true });
    c.text(`${m.a.record}  |  Power #${m.a.power}`, MARGIN + 42, y + 35, { size: 7, color: COLORS.muted });
    // Team B (right)
    c.avatar(PAGE_W - MARGIN - 34, y + 10, 22, m.b);
    c.text(m.b.name, PAGE_W - MARGIN - 42, y + 23, { size: 10, bold: true, align: "right" });
    c.text(`${m.b.record}  |  Power #${m.b.power}`, PAGE_W - MARGIN - 42, y + 35, {
      size: 7,
      color: COLORS.muted,
      align: "right",
    });
    // Projection
    c.text(`${fmt(m.a.projected)} - ${fmt(m.b.projected)}`, PAGE_W / 2, y + 22, {
      size: 13,
      bold: true,
      align: "center",
    });
    c.text("PROJECTED", PAGE_W / 2, y + 33, { size: 6, color: COLORS.muted, align: "center" });
    // Win odds bar
    const aPct = m.probA * 100;
    c.bar(MARGIN + 12, y + 46, CONTENT_W - 24, 6, aPct, COLORS.green);
    c.doc.setFillColor(...COLORS.muted);
    c.doc.rect(MARGIN + 12 + ((CONTENT_W - 24) * aPct) / 100, y + 46, (CONTENT_W - 24) * (1 - aPct / 100), 6, "F");
    c.text(`${fmt(aPct, 0)}%`, MARGIN + 12, y + 62, { size: 8, bold: true, color: COLORS.green });
    c.text(`${fmt(100 - aPct, 0)}%`, PAGE_W - MARGIN - 12, y + 62, {
      size: 8,
      bold: true,
      color: COLORS.muted,
      align: "right",
    });
    y += cardH + 10;
  });

  c.footer(report, 3);
}

function pageFour(c: Canvas, report: ReportData) {
  c.page();
  c.header("Momentum", "Hot & cold", "Last 4 weeks' scoring average compared with the rest of the season.");
  let y = 104;
  const hc = report.hotCold;
  if (!hc) {
    c.card(MARGIN, y, CONTENT_W, 60);
    c.text("Not enough completed weeks yet (needs 5).", MARGIN + 16, y + 34, { size: 9, color: COLORS.muted });
    c.footer(report, 4);
    return;
  }

  const colW = (CONTENT_W - 16) / 2;
  const boxH = 30 + Math.max(hc.hot.length, hc.cold.length) * 36 + 10;
  const drawGroup = (x: number, title: string, color: RGB, rows: typeof hc.hot) => {
    c.card(x, y, colW, boxH);
    c.text(title, x + 14, y + 22, { size: 12, color, bold: true });
    rows.forEach((r, i) => {
      const ry = y + 40 + i * 36;
      c.avatar(x + 14, ry, 16, r);
      c.text(r.name, x + 38, ry + 10, { size: 9, bold: true });
      c.text(`Last 4 avg ${fmt(r.last4)}  vs  ${fmt(r.earlier)} earlier`, x + 38, ry + 21, {
        size: 6.5,
        color: COLORS.muted,
      });
      c.text(`${r.delta > 0 ? "+" : ""}${fmt(r.delta)}`, x + colW - 14, ry + 12, {
        size: 11,
        bold: true,
        color,
        align: "right",
      });
    });
  };
  drawGroup(MARGIN, "HEATING UP", COLORS.orange, hc.hot);
  drawGroup(MARGIN + colW + 16, "COOLING OFF", COLORS.blue, hc.cold);
  y += boxH + 20;

  // Temperature check: every team, diverging from a center line.
  c.text("TEMPERATURE CHECK  |  EVERY TEAM, RECENT SCORING VS EARLIER SEASON", MARGIN, y, {
    size: 7,
    color: COLORS.muted,
    bold: true,
  });
  y += 8;
  const rows = hc.all.length;
  const tempH = rows * 24 + 30;
  c.card(MARGIN, y, CONTENT_W, tempH);
  const labelW = 170;
  const trackX = MARGIN + labelW;
  const trackW = CONTENT_W - labelW - 60;
  const centerX = trackX + trackW / 2;
  const maxAbs = Math.max(1, ...hc.all.map(r => Math.abs(r.delta)));
  c.text("COOLER", trackX, y + 16, { size: 6.5, color: COLORS.blue, bold: true });
  c.text("HOTTER", trackX + trackW, y + 16, { size: 6.5, color: COLORS.orange, bold: true, align: "right" });
  hc.all.forEach((r, i) => {
    const ry = y + 26 + i * 24;
    c.avatar(MARGIN + 10, ry, 14, r);
    c.text(r.name, MARGIN + 30, ry + 10, { size: 8 });
    const half = trackW / 2;
    const len = (Math.abs(r.delta) / maxAbs) * half;
    if (r.delta > 0) {
      c.doc.setFillColor(...COLORS.orange);
      c.doc.rect(centerX, ry + 3, len, 8, "F");
    } else if (r.delta < 0) {
      c.doc.setFillColor(...COLORS.blue);
      c.doc.rect(centerX - len, ry + 3, len, 8, "F");
    }
    c.doc.setDrawColor(...COLORS.muted);
    c.doc.line(centerX, ry - 2, centerX, ry + 14);
    c.text(`${r.delta > 0 ? "+" : ""}${fmt(r.delta)}`, PAGE_W - MARGIN - 10, ry + 10, {
      size: 8,
      bold: true,
      color: r.delta >= 0 ? COLORS.orange : COLORS.blue,
      align: "right",
    });
  });

  c.footer(report, 4);
}

function pageFive(c: Canvas, report: ReportData, playoff: PlayoffData | null) {
  c.page();
  c.header("Race to the playoffs", "Playoff picture", playoff
    ? `Seeds 1-${playoff.playoffTeams} make the playoffs. Odds from ${playoff.simulationCount.toLocaleString()} season simulations.`
    : "Playoff odds unavailable for this report.");

  if (!playoff) {
    c.footer(report, 5);
    return;
  }

  // Seed order: wins, then points for.
  const seeds = [...playoff.predictions].sort(
    (a, b) => b.currentWins - a.currentWins || b.pointsFor - a.pointsFor,
  );
  const rowH = 22;
  let y = 104;
  const headerH = 20;
  const tableH = headerH + seeds.length * rowH + 12;
  c.card(MARGIN, y, CONTENT_W, tableH);

  const cols = { seed: MARGIN + 12, team: MARGIN + 44, rec: MARGIN + 200, pf: MARGIN + 262, make: MARGIN + 276, div: MARGIN + 432, one: MARGIN + 482, status: MARGIN + 494 };
  c.text("SEED", cols.seed, y + 14, { size: 6.5, color: COLORS.muted, bold: true });
  c.text("TEAM", cols.team, y + 14, { size: 6.5, color: COLORS.muted, bold: true });
  c.text("REC", cols.rec, y + 14, { size: 6.5, color: COLORS.muted, bold: true });
  c.text("PF", cols.pf, y + 14, { size: 6.5, color: COLORS.muted, bold: true, align: "right" });
  c.text("MAKE PLAYOFFS", cols.make, y + 14, { size: 6.5, color: COLORS.muted, bold: true });
  c.text("DIV", cols.div, y + 14, { size: 6.5, color: COLORS.muted, bold: true, align: "right" });
  c.text("#1 SEED", cols.one, y + 14, { size: 6.5, color: COLORS.muted, bold: true, align: "right" });

  let rowY = y + headerH;
  seeds.forEach((t, i) => {
    const seed = i + 1;
    const isDivWinner = (t.divisionWinnerPct ?? 0) >= 50;
    if (isDivWinner) {
      c.doc.setFillColor(56, 44, 18);
      c.doc.rect(MARGIN + 1, rowY, CONTENT_W - 2, rowH, "F");
    }
    if (seed === playoff.playoffTeams + 1) {
      c.doc.setFillColor(...COLORS.green);
      c.doc.rect(MARGIN + 1, rowY - 2, CONTENT_W - 2, 2, "F");
    }
    c.text(String(seed), cols.seed, rowY + 15, { size: 8, bold: true, color: seed <= playoff.playoffTeams ? COLORS.green : COLORS.muted });
    c.avatar(cols.team, rowY + 4, 14, t);
    c.text(t.name + (isDivWinner ? " (DIV)" : ""), cols.team + 20, rowY + 15, { size: 8, bold: seed <= playoff.playoffTeams });
    c.text(`${t.currentWins}-${t.currentLosses}`, cols.rec, rowY + 15, { size: 8 });
    c.text(fmt(t.pointsFor), cols.pf, rowY + 15, { size: 8, align: "right" });
    const mp = t.makePlayoffsPct;
    const mpColor = mp >= 90 ? COLORS.green : mp >= 40 ? COLORS.amber : COLORS.red;
    c.bar(cols.make, rowY + 7, 80, 6, mp, mpColor);
    c.text(`${fmt(mp, mp < 1 ? 2 : 1)}%`, cols.make + 86, rowY + 15, { size: 8, bold: true, color: mpColor });
    c.text(t.divisionWinnerPct === undefined ? "-" : `${fmt(t.divisionWinnerPct, t.divisionWinnerPct < 1 ? 2 : 1)}%`, cols.div, rowY + 15, { size: 8, align: "right", color: COLORS.muted });
    c.text(`${fmt(t.oneSeedPct, t.oneSeedPct < 1 ? 2 : 1)}%`, cols.one, rowY + 15, { size: 8, align: "right", color: COLORS.muted });
    if (mp >= 99.5) c.pill("LOCK", cols.status, rowY + 5, COLORS.green, COLORS.dark, 6);
    else if (mp < 0.5) c.pill("LONG SHOT", cols.status, rowY + 5, COLORS.red, COLORS.dark, 6);
    rowY += rowH;
  });
  y += tableH + 16;

  // Bubble watch: teams still in the hunt but not locked or hopeless.
  const bubble = seeds.filter(t => t.makePlayoffsPct >= 0.5 && t.makePlayoffsPct < 99.5);
  if (bubble.length) {
    c.text("BUBBLE WATCH", MARGIN, y, { size: 7, color: COLORS.muted, bold: true });
    y += 8;
    // Lay labels out in rows so long names wrap inside the card instead of running off the edge.
    c.doc.setFont("helvetica", "bold");
    c.doc.setFontSize(8);
    const maxX = MARGIN + CONTENT_W - 12;
    const placed: { label: string; x: number; row: number }[] = [];
    let row = 0;
    let bx = MARGIN + 12;
    bubble.forEach(t => {
      const label = `${t.name} ${fmt(t.makePlayoffsPct, 1)}%`;
      const w = c.doc.getTextWidth(clean(label));
      if (bx + w > maxX && bx > MARGIN + 12) {
        row += 1;
        bx = MARGIN + 12;
      }
      placed.push({ label, x: bx, row });
      bx += w + 22;
    });
    const bubbleH = 16 + (row + 1) * 16 + 8;
    c.card(MARGIN, y, CONTENT_W, bubbleH);
    placed.forEach(p => c.text(p.label, p.x, y + 20 + p.row * 16, { size: 8, bold: true }));
    y += bubbleH + 16;
  }

  // Division races
  if (playoff.hasDivisions) {
    const divisions = [...new Set(seeds.map(t => t.division).filter((d): d is number => d !== undefined))].sort((a, b) => a - b);
    const dw = (CONTENT_W - 24) / Math.max(1, divisions.length);
    c.text("DIVISION RACES", MARGIN, y, { size: 7, color: COLORS.muted, bold: true });
    y += 8;
    const maxRows = Math.max(1, ...divisions.map(d => seeds.filter(t => t.division === d).length));
    const divH = 34 + maxRows * 26;
    divisions.forEach((d, i) => {
      const dx = MARGIN + i * (dw + 12);
      c.card(dx, y, dw, divH);
      c.text(`DIVISION ${d}`, dx + 12, y + 16, { size: 8, color: COLORS.amber, bold: true });
      seeds
        .filter(t => t.division === d)
        .sort((a, b) => (b.divisionWinnerPct ?? 0) - (a.divisionWinnerPct ?? 0))
        .forEach((t, j) => {
          // Name on top, record and odds underneath, so long team names have the full card width.
          const ry = y + 30 + j * 26;
          c.text(t.name, dx + 12, ry, { size: 8, bold: true });
          c.text(`${t.currentWins}-${t.currentLosses}`, dx + 12, ry + 11, { size: 7, color: COLORS.muted });
          c.text(`${fmt(t.divisionWinnerPct ?? 0, 1)}%`, dx + dw - 12, ry + 11, { size: 8, bold: true, align: "right" });
        });
    });
  }

  c.footer(report, 5);
}

// ─── Entry point ────────────────────────────────────────────────────────────

export function buildWeeklyReportPdf(
  report: ReportData,
  playoff: PlayoffData | null,
  avatars: Map<string, string>,
): jsPDF {
  const c = new Canvas(avatars);
  pageOne(c, report);
  pageTwo(c, report);
  pageThree(c, report);
  pageFour(c, report);
  pageFive(c, report, playoff);
  return c.doc;
}

export function reportFileName(report: ReportData): string {
  const base = clean(report.leagueName).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "League";
  return `${base}-Week-${report.week}-Report.pdf`;
}

