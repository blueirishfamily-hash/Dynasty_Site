import { createContext, useContext, useMemo } from "react";
import { Circle, Document, Image, Line, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { formatPct } from "@shared/formatPct";
import type {
  GameCallout,
  HighPerformerPlayer,
  PreviewGame,
  TeamTrend,
  WeeklyReportData,
  WeeklyReportTeam,
} from "@shared/weeklyReport";

export interface ReportPrediction {
  rosterId: number;
  makePlayoffsPct: number;
  divisionWinnerPct?: number;
  oneSeedPct: number;
  projectedPointsPerWeek: number;
  projectedWins?: number;
}

export type ReportTheme = "dark" | "light";

export interface WeeklyReportInput {
  report: WeeklyReportData;
  predictions: ReportPrediction[];
  simulationCount?: number;
  powerRank: Record<number, number>;
  theme?: ReportTheme;
}

interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  gold: string;
  goldSoft: string;
  red: string;
  redSoft: string;
  hot: string;
  hotSoft: string;
  cold: string;
  coldSoft: string;
  hero: string;
}

const PALETTES: Record<ReportTheme, Palette> = {
  dark: {
    bg: "#0a0f1d",
    surface: "#111a2e",
    surface2: "#18233b",
    border: "#243049",
    ink: "#f1f5f9",
    muted: "#8fa0bf",
    accent: "#34d399",
    accentSoft: "#0e3a33",
    onAccent: "#04130f",
    gold: "#fbbf24",
    goldSoft: "#2f2610",
    red: "#f87171",
    redSoft: "#3a1b21",
    hot: "#fb923c",
    hotSoft: "#3a2212",
    cold: "#38bdf8",
    coldSoft: "#0e2f44",
    hero: "#0f1c38",
  },
  light: {
    bg: "#ffffff",
    surface: "#f8fafc",
    surface2: "#eef2f7",
    border: "#e2e8f0",
    ink: "#0f172a",
    muted: "#64748b",
    accent: "#059669",
    accentSoft: "#d1fae5",
    onAccent: "#ffffff",
    gold: "#b45309",
    goldSoft: "#fef3c7",
    red: "#dc2626",
    redSoft: "#fee2e2",
    hot: "#ea580c",
    hotSoft: "#ffedd5",
    cold: "#0284c7",
    coldSoft: "#e0f2fe",
    hero: "#0f172a",
  },
};

function makeStyles(C: Palette) {
  return StyleSheet.create({
    page: { padding: 30, paddingBottom: 50, fontSize: 9, fontFamily: "Helvetica", color: C.ink, backgroundColor: C.bg },
    row: { flexDirection: "row", alignItems: "center" },
    small: { fontSize: 7.5, color: C.muted },
    bold: { fontFamily: "Helvetica-Bold" },
    label: { fontSize: 6.5, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, marginBottom: 4 },
    card: {
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 8,
      padding: 9,
    },
    tag: {
      fontSize: 6,
      fontFamily: "Helvetica-Bold",
      paddingVertical: 1.5,
      paddingHorizontal: 3.5,
      borderRadius: 3,
    },
    tr: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 5,
      paddingHorizontal: 8,
    },
    track: { height: 5, backgroundColor: C.surface2, borderRadius: 3, flex: 1 },
    footer: {
      position: "absolute",
      bottom: 20,
      left: 30,
      right: 30,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7,
      color: C.muted,
    },
  });
}

type Styles = ReturnType<typeof makeStyles>;
interface Ctx {
  C: Palette;
  s: Styles;
  form: Map<number, "hot" | "cold">;
}
const StyleContext = createContext<Ctx | null>(null);
const useCtx = (): Ctx => {
  const ctx = useContext(StyleContext);
  if (!ctx) throw new Error("Report style context missing");
  return ctx;
};

const fmt = (n: number, digits = 1) => n.toFixed(digits);
const pct = (n: number | undefined) => formatPct(n);
const recordOf = (t: WeeklyReportTeam) => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function FlameIcon({ size = 10, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2 C12 2 5 8.5 5 14.5 C5 18.6 8.1 22 12 22 C15.9 22 19 18.6 19 14.5 C19 12 17.8 10 16.5 8.5 C16.3 10.4 15.4 11.6 14.2 12 C14.6 8.6 13.6 5 12 2 Z"
        fill={color}
      />
      <Path
        d="M12 22 C9.8 22 8.2 20.3 8.2 18.2 C8.2 16.2 10 14.8 11 13 C12 14.6 15.8 16 15.8 18.2 C15.8 20.3 14.2 22 12 22 Z"
        fill="#fde68a"
      />
    </Svg>
  );
}

const SNOW_SEGMENTS: Array<[number, number, number, number, number]> = (() => {
  const segs: Array<[number, number, number, number, number]> = [];
  const at = (a: number, along: number, across: number): [number, number] => [
    12 + Math.cos(a) * along - Math.sin(a) * across,
    12 + Math.sin(a) * along + Math.cos(a) * across,
  ];
  for (const deg of [0, 60, 120, 180, 240, 300]) {
    const a = (deg * Math.PI) / 180;
    const [sx, sy] = at(a, 0, 0);
    const [ex, ey] = at(a, 10.5, 0);
    segs.push([sx, sy, ex, ey, 1.7]);
    for (const [r, len] of [[6.5, 3.4], [9.2, 2.2]]) {
      const [bx, by] = at(a, r, 0);
      for (const side of [1, -1]) {
        const [tx, ty] = at(a, r + len * 0.8, len * side);
        segs.push([bx, by, tx, ty, 1.5]);
      }
    }
  }
  return segs;
})();

function SnowIcon({ size = 10, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {SNOW_SEGMENTS.map(([x1, y1, x2, y2, w], i) => (
        <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeLinecap="round" />
      ))}
      <Circle cx={12} cy={12} r={1.6} fill={color} />
    </Svg>
  );
}

function Chip({ team, size = 18 }: { team: WeeklyReportTeam | undefined; size?: number }) {
  const { C } = useCtx();
  const base = { width: size, height: size, borderRadius: size / 2, marginRight: 6 };
  if (team?.avatar) {
    return <Image src={team.avatar} style={{ ...base, borderWidth: 1, borderColor: C.border }} />;
  }
  return (
    <View style={{ ...base, backgroundColor: C.surface2, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 6, fontFamily: "Helvetica-Bold", color: C.muted }}>{team?.initials ?? "?"}</Text>
    </View>
  );
}

function TeamName({
  team,
  align = "left",
  bold = false,
  width,
  grow = true,
  size = 18,
  showForm = true,
}: {
  team: WeeklyReportTeam | undefined;
  align?: "left" | "right";
  bold?: boolean;
  width?: number;
  grow?: boolean;
  size?: number;
  showForm?: boolean;
}) {
  const { C, s, form } = useCtx();
  const trend = team && showForm ? form.get(team.rosterId) : undefined;
  const formIcon = trend ? (
    <View style={{ marginHorizontal: 3 }}>
      {trend === "hot" ? <FlameIcon size={9} color={C.hot} /> : <SnowIcon size={9} color={C.cold} />}
    </View>
  ) : null;
  const youTag = team?.isUser ? (
    <Text style={[s.tag, { backgroundColor: C.accent, color: C.onAccent, marginHorizontal: 3 }]}>YOU</Text>
  ) : null;
  return (
    <View
      style={[
        s.row,
        { flex: width || !grow ? undefined : 1, width, justifyContent: align === "right" ? "flex-end" : "flex-start" },
      ]}
    >
      {align === "left" && <Chip team={team} size={size} />}
      <Text style={[bold ? s.bold : {}, { flexShrink: 1, textAlign: align, maxLines: 1, textOverflow: "ellipsis" } as any]}>
        {team?.name ?? "Unknown"}
      </Text>
      {formIcon}
      {youTag}
      {align === "right" && (
        <View style={{ marginLeft: 6 }}>
          <Chip team={team} size={size} />
        </View>
      )}
    </View>
  );
}

function SectionHeader({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  const { C, s } = useCtx();
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={[s.row, { marginBottom: 3 }]}>
        <View style={{ width: 14, height: 2.5, borderRadius: 2, backgroundColor: C.accent, marginRight: 6 }} />
        <Text style={{ fontSize: 7, letterSpacing: 1.2, color: C.accent, fontFamily: "Helvetica-Bold" }}>{kicker.toUpperCase()}</Text>
      </View>
      <Text style={{ fontSize: 17, fontFamily: "Helvetica-Bold" }}>{title}</Text>
      {sub ? <Text style={[s.small, { marginTop: 2 }]}>{sub}</Text> : null}
    </View>
  );
}

function PageShell({ report, children }: { report: WeeklyReportData; children: React.ReactNode }) {
  const { s } = useCtx();
  return (
    <Page size="LETTER" style={s.page}>
      {children}
      <View style={s.footer} fixed>
        <Text>
          {report.league.name}  |  {report.league.season} Season  |  Week {report.week} Report
        </Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

function Hero({ report }: { report: WeeklyReportData }) {
  const { C, s } = useCtx();
  const generated = new Date(report.generatedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const regularWeeks = Math.max(1, report.playoffWeekStart - 1);
  const total = Math.min(regularWeeks, 18);
  return (
    <View
      style={{
        backgroundColor: C.hero,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        padding: 16,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, backgroundColor: C.accent }} />
      <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
        <View style={{ marginLeft: 6 }}>
          <Text style={{ fontSize: 7, letterSpacing: 1.6, color: C.accent, fontFamily: "Helvetica-Bold" }}>WEEKLY LEAGUE REPORT</Text>
          <Text style={{ fontSize: 26, fontFamily: "Helvetica-Bold", color: "#f8fafc", marginTop: 3 }}>{report.league.name}</Text>
          <Text style={{ fontSize: 9, color: "#a5b4d0", marginTop: 3 }}>
            {report.league.season} Season  -  {generated}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <View style={{ backgroundColor: C.accent, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: C.onAccent }}>WEEK {report.week}</Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 14, marginLeft: 6 }}>
        <View style={[s.row, { marginBottom: 4 }]}>
          {Array.from({ length: total }, (_, i) => {
            const w = i + 1;
            const done = w < report.week;
            const current = w === report.week;
            return (
              <View
                key={w}
                style={{
                  flex: 1,
                  height: current ? 7 : 5,
                  marginRight: 3,
                  borderRadius: 3,
                  backgroundColor: current ? C.gold : done ? C.accent : "#26334f",
                }}
              />
            );
          })}
        </View>
        <Text style={{ fontSize: 6.5, color: "#8fa0bf", letterSpacing: 0.6 }}>
          {report.week <= total
            ? `REGULAR SEASON PROGRESS  -  WEEK ${report.week} OF ${total}`
            : "REGULAR SEASON COMPLETE  -  PLAYOFFS"}
        </Text>
      </View>
    </View>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  const { C, s } = useCtx();
  return (
    <View style={[s.card, { flex: 1, marginRight: 6, padding: 8 }]}>
      <Text style={s.label}>{label}</Text>
      <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", color: color ?? C.ink }}>{value}</Text>
      {sub ? <Text style={[s.small, { marginTop: 1 }]}>{sub}</Text> : null}
    </View>
  );
}

function CalloutCard({
  label,
  callout,
  teams,
  detail,
  color,
}: {
  label: string;
  callout: GameCallout | null;
  teams: Record<number, WeeklyReportTeam>;
  detail: (c: GameCallout) => string;
  color: string;
}) {
  const { s } = useCtx();
  if (!callout) return null;
  const team = teams[callout.rosterId];
  const opp = teams[callout.opponentId];
  return (
    <View style={[s.card, { width: "31.8%", marginRight: 6, marginBottom: 6, paddingLeft: 11, overflow: "hidden" }]} wrap={false}>
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: color }} />
      <Text style={[s.label, { color }]}>{label.toUpperCase()}</Text>
      <View style={s.row}>
        <Chip team={team} size={16} />
        <Text style={[s.bold, { flexShrink: 1, maxLines: 1, textOverflow: "ellipsis" } as any]}>{team?.name}</Text>
      </View>
      <Text style={[s.bold, { marginTop: 3, fontSize: 8.5 }]}>{detail(callout)}</Text>
      <Text style={[s.small, { maxLines: 1, textOverflow: "ellipsis" } as any]}>vs {opp?.name}</Text>
    </View>
  );
}

function RecapSection({ report }: { report: WeeklyReportData }) {
  const { C, s } = useCtx();
  if (!report.recap || report.recapWeek == null) {
    return (
      <View style={{ marginBottom: 14 }}>
        <SectionHeader kicker="Last week" title="Recap" sub="No completed games yet. The recap will appear once Week 1 is final." />
      </View>
    );
  }
  const { games, callouts } = report.recap;
  const teams = report.teams;
  const scores = games.flatMap((g) => [g.score1, g.score2]);
  const total = scores.reduce((a, b) => a + b, 0);
  const avg = scores.length ? total / scores.length : 0;
  const margins = games.filter((g) => g.winner != null).map((g) => g.margin);
  const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
  const nailBiters = margins.filter((m) => m < 10).length;

  return (
    <View style={{ marginBottom: 14 }}>
      <SectionHeader kicker={`Week ${report.recapWeek}`} title="Last Week's Results" sub="Final scores from every game." />

      <View style={{ borderRadius: 8, borderWidth: 1, borderColor: C.border, overflow: "hidden", backgroundColor: C.surface }}>
        {games.map((g, i) => {
          const t1 = teams[g.team1];
          const t2 = teams[g.team2];
          const w1 = g.winner === g.team1;
          const w2 = g.winner === g.team2;
          const mine = t1?.isUser || t2?.isUser;
          return (
            <View
              key={g.matchupId}
              style={[
                s.tr,
                { paddingVertical: 7, backgroundColor: mine ? C.accentSoft : i % 2 === 0 ? C.surface : C.surface2 },
              ]}
              wrap={false}
            >
              <View style={[s.row, { flex: 1 }]}>
                <TeamName team={t1} bold={w1} showForm={false} />
                <Text
                  style={[
                    { width: 44, textAlign: "right", fontSize: 10.5 },
                    w1 ? [s.bold, { color: C.accent }] : { color: C.muted },
                  ]}
                >
                  {fmt(g.score1, 2)}
                </Text>
              </View>
              <View style={{ width: 58, alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 6.5,
                    fontFamily: "Helvetica-Bold",
                    color: C.muted,
                    backgroundColor: C.bg,
                    borderRadius: 6,
                    paddingVertical: 2,
                    paddingHorizontal: 5,
                  }}
                >
                  {g.winner == null ? "TIE" : `+${fmt(g.margin, 1)}`}
                </Text>
              </View>
              <View style={[s.row, { flex: 1 }]}>
                <Text
                  style={[
                    { width: 44, textAlign: "left", fontSize: 10.5 },
                    w2 ? [s.bold, { color: C.accent }] : { color: C.muted },
                  ]}
                >
                  {fmt(g.score2, 2)}
                </Text>
                <TeamName team={t2} align="right" bold={w2} showForm={false} />
              </View>
            </View>
          );
        })}
      </View>

      <View style={[s.row, { marginTop: 12 }]}>
        <Stat label="LEAGUE AVG SCORE" value={fmt(avg, 1)} sub="per team" />
        <Stat label="TOTAL POINTS" value={fmt(total, 0)} sub={`${games.length} games`} />
        <Stat label="AVG MARGIN" value={fmt(avgMargin, 1)} sub="points per game" />
        <View style={[s.card, { flex: 1, padding: 8 }]}>
          <Text style={s.label}>NAIL-BITERS</Text>
          <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", color: C.gold }}>{nailBiters}</Text>
          <Text style={[s.small, { marginTop: 1 }]}>decided by under 10</Text>
        </View>
      </View>

      <Text style={[s.label, { marginTop: 14 }]}>WEEK IN NUMBERS</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <CalloutCard label="Top score" callout={callouts.highestScore} teams={teams} color={C.accent} detail={(c) => `${fmt(c.points, 2)} pts`} />
        <CalloutCard label="Lowest score" callout={callouts.lowestScore} teams={teams} color={C.red} detail={(c) => `${fmt(c.points, 2)} pts`} />
        <CalloutCard label="Closest finish" callout={callouts.closestGame} teams={teams} color={C.gold} detail={(c) => `Won by ${fmt(c.points - c.opponentPoints, 2)}`} />
        <CalloutCard label="Biggest blowout" callout={callouts.biggestBlowout} teams={teams} color={C.hot} detail={(c) => `Won by ${fmt(c.points - c.opponentPoints, 1)}`} />
        <CalloutCard label="Unluckiest loss" callout={callouts.unluckiestLoss} teams={teams} color={C.cold} detail={(c) => `Lost with ${fmt(c.points, 2)} pts`} />
        <CalloutCard label="Luckiest win" callout={callouts.luckiestWin} teams={teams} color={C.accent} detail={(c) => `Won with only ${fmt(c.points, 2)}`} />
      </View>
    </View>
  );
}

function PlayerRow({
  rank,
  player,
  teams,
  zebra,
}: {
  rank: number;
  player: HighPerformerPlayer;
  teams: Record<number, WeeklyReportTeam>;
  zebra: boolean;
}) {
  const { C, s } = useCtx();
  return (
    <View style={[s.tr, { backgroundColor: zebra ? C.surface2 : C.surface }]} wrap={false}>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: rank <= 3 ? C.gold : C.surface2,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 7,
        }}
      >
        <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: rank <= 3 ? C.bg : C.muted }}>{rank}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.bold}>{player.name}</Text>
        <Text style={s.small}>
          {player.position}
          {player.nflTeam ? `  -  ${player.nflTeam}` : ""}
        </Text>
      </View>
      <Text style={[s.small, { width: 92, maxLines: 1, textOverflow: "ellipsis" } as any]}>{teams[player.rosterId]?.name}</Text>
      <Text style={[s.bold, { width: 34, textAlign: "right", color: C.accent, fontSize: 10.5 }]}>{fmt(player.points, 1)}</Text>
    </View>
  );
}

function EfficiencyRow({ team, value, detail }: { team?: WeeklyReportTeam; value: number; detail: string }) {
  const { C, s } = useCtx();
  const color = value >= 0.9 ? C.accent : value >= 0.8 ? "#a3e635" : value >= 0.7 ? C.gold : C.red;
  return (
    <View style={[s.row, { marginBottom: 5 }]} wrap={false}>
      <View style={{ width: 138 }}>
        <TeamName team={team} width={138} size={15} showForm={false} />
      </View>
      <View style={[s.track, { marginHorizontal: 8 }]}>
        <View style={{ height: 5, borderRadius: 3, width: `${Math.max(3, value * 100)}%`, backgroundColor: color }} />
      </View>
      <Text style={[s.bold, { width: 28, textAlign: "right", color }]}>{Math.round(value * 100)}%</Text>
      <Text style={[s.small, { width: 74, textAlign: "right" }]}>{detail}</Text>
    </View>
  );
}

function HighPerformersSection({ report }: { report: WeeklyReportData }) {
  const { C, s } = useCtx();
  const hp = report.highPerformers;
  const teams = report.teams;
  if (!hp) return null;
  return (
    <View>
      <SectionHeader kicker={`Week ${report.recapWeek}`} title="High Performers" sub="Standout starters and lineups." />

      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1.55, marginRight: 12 }}>
          <Text style={s.label}>TOP INDIVIDUAL PERFORMANCES</Text>
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
            {hp.topPlayers.map((p, i) => (
              <PlayerRow key={`${p.playerId}-${p.rosterId}`} rank={i + 1} player={p} teams={teams} zebra={i % 2 === 1} />
            ))}
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.label}>POSITION LEADERS</Text>
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: C.border, overflow: "hidden", marginBottom: 12 }}>
            {hp.positionLeaders.map((p, i) => (
              <View key={p.position} style={[s.tr, { backgroundColor: i % 2 === 1 ? C.surface2 : C.surface }]} wrap={false}>
                <Text
                  style={[
                    s.tag,
                    { backgroundColor: C.accentSoft, color: C.accent, width: 24, textAlign: "center", paddingVertical: 2.5 },
                  ]}
                >
                  {p.position}
                </Text>
                <View style={{ flex: 1, marginLeft: 7 }}>
                  <Text style={[s.bold, { maxLines: 1, textOverflow: "ellipsis" } as any]}>{p.name}</Text>
                  <Text style={[s.small, { maxLines: 1, textOverflow: "ellipsis" } as any]}>{teams[p.rosterId]?.name}</Text>
                </View>
                <Text style={[s.bold, { color: C.accent }]}>{fmt(p.points, 1)}</Text>
              </View>
            ))}
          </View>

          <Text style={s.label}>HIGHEST TEAM SCORES</Text>
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
            {hp.topTeamScores.map((t, i) => (
              <View key={t.rosterId} style={[s.tr, { backgroundColor: i % 2 === 1 ? C.surface2 : C.surface }]} wrap={false}>
                <Text style={[s.small, { width: 12 }]}>{i + 1}</Text>
                <TeamName team={teams[t.rosterId]} size={15} showForm={false} />
                <Text style={[s.bold, { color: C.accent }]}>{fmt(t.points, 2)}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={[s.card, { marginTop: 16 }]} wrap={false}>
        <Text style={s.label}>LINEUP EFFICIENCY  -  POINTS SCORED VS BEST POSSIBLE LINEUP</Text>
        {hp.efficiency.map((e) => (
          <EfficiencyRow key={e.rosterId} team={teams[e.rosterId]} value={e.efficiency} detail={`${fmt(e.points, 1)} / ${fmt(e.optimalPoints, 1)}`} />
        ))}
      </View>
    </View>
  );
}

function TrendRow({ trend, max, kind, team }: { trend: TeamTrend; max: number; kind: "hot" | "cold"; team?: WeeklyReportTeam }) {
  const { C, s } = useCtx();
  const color = kind === "hot" ? C.hot : C.cold;
  const width = Math.max(8, (Math.abs(trend.difference) / max) * 100);
  return (
    <View style={{ marginBottom: 8 }} wrap={false}>
      <View style={s.row}>
        <TeamName team={team} size={16} showForm={false} />
        <Text style={[s.bold, { color, fontSize: 11 }]}>
          {trend.difference > 0 ? "+" : ""}
          {fmt(trend.difference, 1)}
        </Text>
      </View>
      <View style={[s.row, { marginTop: 3 }]}>
        <View style={[s.track, { backgroundColor: C.bg }]}>
          <View style={{ height: 5, borderRadius: 3, width: `${width}%`, backgroundColor: color }} />
        </View>
      </View>
      <Text style={[s.small, { marginTop: 2 }]}>
        Last {trend.recentWeeks} wks avg {fmt(trend.recentAvg, 1)}  vs  {fmt(trend.earlierAvg, 1)} earlier
      </Text>
    </View>
  );
}

function TemperatureChart({ report }: { report: WeeklyReportData }) {
  const { C, s } = useCtx();
  const trends = report.highPerformers?.trends ?? [];
  const teams = report.teams;
  if (trends.length === 0) return null;
  const max = Math.max(1, ...trends.map((t) => Math.abs(t.difference)));
  return (
    <View style={[s.card, { marginTop: 14 }]}>
      <Text style={s.label}>TEMPERATURE CHECK  -  EVERY TEAM, RECENT SCORING VS EARLIER SEASON</Text>
      <View style={[s.row, { marginBottom: 4 }]}>
        <View style={{ width: 140 }} />
        <View style={[s.row, { flex: 1, justifyContent: "space-between" }]}>
          <View style={s.row}>
            <SnowIcon size={9} color={C.cold} />
            <Text style={[s.small, { marginLeft: 3, color: C.cold }]}>COOLER</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.small, { marginRight: 3, color: C.hot }]}>HOTTER</Text>
            <FlameIcon size={9} color={C.hot} />
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>
      {trends.map((t) => {
        const hot = t.difference >= 0;
        const color = hot ? C.hot : C.cold;
        const width = Math.max(2, (Math.abs(t.difference) / max) * 100);
        return (
          <View key={t.rosterId} style={[s.row, { marginBottom: 5 }]} wrap={false}>
            <View style={{ width: 140 }}>
              <TeamName team={teams[t.rosterId]} width={140} size={15} showForm={false} />
            </View>
            <View style={[s.row, { flex: 1, height: 9 }]}>
              <View style={{ flex: 1, height: 9, alignItems: "flex-end", justifyContent: "center", backgroundColor: C.surface2, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }}>
                {!hot && <View style={{ height: 7, width: `${width}%`, backgroundColor: color, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }} />}
              </View>
              <View style={{ width: 1.5, height: 13, backgroundColor: C.muted }} />
              <View style={{ flex: 1, height: 9, alignItems: "flex-start", justifyContent: "center", backgroundColor: C.surface2, borderTopRightRadius: 4, borderBottomRightRadius: 4 }}>
                {hot && <View style={{ height: 7, width: `${width}%`, backgroundColor: color, borderTopRightRadius: 3, borderBottomRightRadius: 3 }} />}
              </View>
            </View>
            <Text style={[s.bold, { width: 40, textAlign: "right", color, fontSize: 8.5 }]}>
              {hot ? "+" : ""}
              {fmt(t.difference, 1)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function FormGuide({ report }: { report: WeeklyReportData }) {
  const { C, s } = useCtx();
  const hp = report.highPerformers;
  const teams = report.teams;
  if (!hp) return null;
  const max = Math.max(1, ...[...hp.hot, ...hp.cold].map((t) => Math.abs(t.difference)));
  const panels: Array<{ kind: "hot" | "cold"; title: string; sub: string; list: TeamTrend[] }> = [
    { kind: "hot", title: "HEATING UP", sub: "Scoring well above their season pace", list: hp.hot },
    { kind: "cold", title: "COOLING OFF", sub: "Scoring well below their season pace", list: hp.cold },
  ];
  return (
    <View>
      <SectionHeader
        kicker="Momentum"
        title="Hot & Cold"
        sub="Compares each team's recent scoring average with the rest of their season."
      />
      <View style={s.row}>
        {panels.map(({ kind, title, sub, list }, idx) => {
          const color = kind === "hot" ? C.hot : C.cold;
          return (
            <View
              key={kind}
              style={[
                s.card,
                {
                  flex: 1,
                  alignSelf: "flex-start",
                  marginRight: idx === 0 ? 8 : 0,
                  backgroundColor: kind === "hot" ? C.hotSoft : C.coldSoft,
                  borderColor: color,
                },
              ]}
            >
              <View style={[s.row, { marginBottom: 8 }]}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: C.bg,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 8,
                  }}
                >
                  {kind === "hot" ? <FlameIcon size={15} color={color} /> : <SnowIcon size={15} color={color} />}
                </View>
                <View>
                  <Text style={[s.bold, { color, fontSize: 11, letterSpacing: 0.6 }]}>{title}</Text>
                  <Text style={s.small}>{sub}</Text>
                </View>
              </View>
              {list.length === 0 ? <Text style={s.small}>Nobody stands out this week.</Text> : null}
              {list.map((t) => (
                <TrendRow key={t.rosterId} trend={t} max={max} kind={kind} team={teams[t.rosterId]} />
              ))}
            </View>
          );
        })}
      </View>
      <TemperatureChart report={report} />
    </View>
  );
}

interface StakePill {
  key: string;
  label: string;
  detail: string;
  tone: "gold" | "accent" | "red";
}

function stakePillsFor(game: PreviewGame, teams: Record<number, WeeklyReportTeam>): StakePill[] {
  if (!game.stakes) return [];
  const pills: StakePill[] = [];
  const sides = [
    { id: game.team1, stake: game.stakes.team1 },
    { id: game.team2, stake: game.stakes.team2 },
  ];
  for (const { id, stake } of sides) {
    const name = teams[id]?.name ?? `Team ${id}`;
    if (stake.clinchOneSeed) {
      pills.push({ key: `${id}-seed`, label: "1 SEED CLINCH", detail: `${name} locks up the 1 seed with a win`, tone: "gold" });
    } else if (stake.clinchDivision) {
      pills.push({ key: `${id}-div`, label: "DIVISION CLINCH", detail: `${name} wins the division with a win`, tone: "gold" });
    } else if (stake.clinchPlayoff) {
      pills.push({ key: `${id}-po`, label: "PLAYOFF CLINCH", detail: `${name} clinches a playoff spot with a win`, tone: "accent" });
    }
  }
  const out = sides.filter((x) => x.stake.eliminated);
  if (out.length === 2) {
    pills.push({ key: "elim", label: "ELIMINATION GAME", detail: "The loser is eliminated from playoff contention", tone: "red" });
  } else if (out.length === 1) {
    const name = teams[out[0].id]?.name ?? `Team ${out[0].id}`;
    pills.push({ key: `${out[0].id}-elim`, label: "ELIMINATION GAME", detail: `${name} is eliminated with a loss`, tone: "red" });
  }
  return pills;
}

interface PreviewRow {
  game: PreviewGame;
  p1: number;
  p2: number;
  win1: number;
}

function PreviewSection({ input }: { input: WeeklyReportInput }) {
  const { C, s } = useCtx();
  const { report, predictions, powerRank } = input;
  const teams = report.teams;
  const projection = new Map(predictions.map((p) => [p.rosterId, p.projectedPointsPerWeek]));
  const average = (t: WeeklyReportTeam | undefined) => {
    const games = (t?.wins ?? 0) + (t?.losses ?? 0) + (t?.ties ?? 0);
    return t && games > 0 ? t.pointsFor / games : 0;
  };
  const sigma = Math.max(10, report.scoreStdDev) * Math.SQRT2;

  const rows: PreviewRow[] = report.preview.games.map((game) => {
    const p1 = projection.get(game.team1) || average(teams[game.team1]);
    const p2 = projection.get(game.team2) || average(teams[game.team2]);
    return { game, p1, p2, win1: normalCdf((p1 - p2) / sigma) };
  });

  const tossUp = [...rows].sort((a, b) => Math.abs(a.win1 - 0.5) - Math.abs(b.win1 - 0.5))[0];
  const mismatch = [...rows].sort((a, b) => Math.abs(b.win1 - 0.5) - Math.abs(a.win1 - 0.5))[0];
  const shootout = [...rows].sort((a, b) => b.p1 + b.p2 - (a.p1 + a.p2))[0];

  const callout = (row: PreviewRow | undefined, kind: "toss" | "mismatch" | "shootout") => {
    if (!row) return null;
    const t1 = teams[row.game.team1];
    const t2 = teams[row.game.team2];
    const detail =
      kind === "shootout"
        ? `Projected combined ${fmt(row.p1 + row.p2, 1)} pts`
        : `${t1?.initials} ${Math.round(row.win1 * 100)}%  /  ${t2?.initials} ${Math.round((1 - row.win1) * 100)}%`;
    const title = kind === "toss" ? "TOSS-UP" : kind === "mismatch" ? "BIGGEST MISMATCH" : "SHOOTOUT WATCH";
    const color = kind === "toss" ? C.gold : kind === "mismatch" ? C.red : C.accent;
    return (
      <View style={[s.card, { flex: 1, marginRight: 6, paddingLeft: 11, overflow: "hidden" }]} wrap={false}>
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: color }} />
        <Text style={[s.label, { color }]}>{title}</Text>
        <Text style={[s.bold, { maxLines: 1, textOverflow: "ellipsis" } as any]}>
          {t1?.name} vs {t2?.name}
        </Text>
        <Text style={[s.small, { marginTop: 2 }]}>{detail}</Text>
      </View>
    );
  };

  const title = report.previewHasScores ? `Week ${report.previewWeek} Matchups` : `Week ${report.previewWeek} Preview`;
  const sub = report.previewFinal
    ? "Final scores for this week's games."
    : report.previewHasScores
    ? "Scores shown are the current totals for this week's games."
    : "Projections use each team's optimal-lineup projection; win odds assume typical weekly scoring variance.";
  const hasStakes = rows.some((r) => stakePillsFor(r.game, teams).length > 0);

  return (
    <View>
      <SectionHeader
        kicker="Look ahead"
        title={title}
        sub={hasStakes ? `${sub} Clinch and elimination tags are certain: they need no help from other games, and points-for tiebreakers are assumed to go against the team.` : sub}
      />
      {!report.previewHasScores && rows.length > 1 && (
        <View style={[s.row, { marginBottom: 10, alignItems: "stretch" }]}>
          {callout(tossUp, "toss")}
          {callout(mismatch, "mismatch")}
          <View style={{ flex: 1 }}>{callout(shootout, "shootout")}</View>
        </View>
      )}
      {rows.map(({ game, p1, p2, win1 }) => {
        const t1 = teams[game.team1];
        const t2 = teams[game.team2];
        const mine = t1?.isUser || t2?.isUser;
        const live = game.score1 != null && game.score2 != null;
        const favored1 = win1 >= 0.5;
        const pills = stakePillsFor(game, teams);
        const toneColor = (tone: StakePill["tone"]) => (tone === "gold" ? C.gold : tone === "accent" ? C.accent : C.red);
        const toneSoft = (tone: StakePill["tone"]) => (tone === "gold" ? C.goldSoft : tone === "accent" ? C.accentSoft : C.redSoft);
        const stakeBorder = pills.length > 0 ? toneColor(pills[0].tone) : undefined;
        return (
          <View
            key={game.matchupId}
            style={[
              s.card,
              { marginBottom: 7, padding: 9 },
              mine ? { backgroundColor: C.accentSoft, borderColor: C.accent } : stakeBorder ? { borderColor: stakeBorder } : {},
            ]}
            wrap={false}
          >
            {pills.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
                {pills.map((pill) => (
                  <View key={pill.key} style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
                    <Text style={[s.tag, { backgroundColor: toneSoft(pill.tone), color: toneColor(pill.tone), marginRight: 4 }]}>{pill.label}</Text>
                    <Text style={[s.small, { fontSize: 7 }]}>{pill.detail}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row" }}>
                  <TeamName team={t1} bold={favored1 && !live} size={20} />
                </View>
                <Text style={[s.small, { marginLeft: 26 }]}>
                  {t1 ? recordOf(t1) : ""}
                  {powerRank[game.team1] ? `   Power #${powerRank[game.team1]}` : ""}
                </Text>
              </View>
              <View style={{ width: 118, alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>
                  {live ? `${fmt(game.score1!, 1)} - ${fmt(game.score2!, 1)}` : `${fmt(p1, 1)} - ${fmt(p2, 1)}`}
                </Text>
                <Text style={[s.small, { fontSize: 6.5, letterSpacing: 0.8 }]}>
                  {live ? (report.previewFinal ? "FINAL" : "CURRENT") : "PROJECTED"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row" }}>
                  <TeamName team={t2} align="right" bold={!favored1 && !live} size={20} />
                </View>
                <Text style={[s.small, { textAlign: "right", marginRight: 26 }]}>
                  {t2 ? recordOf(t2) : ""}
                  {powerRank[game.team2] ? `   Power #${powerRank[game.team2]}` : ""}
                </Text>
              </View>
            </View>
            {!live && (
              <View style={[s.row, { marginTop: 7 }]}>
                <Text style={[s.bold, { width: 28, fontSize: 8, color: favored1 ? C.accent : C.muted }]}>{Math.round(win1 * 100)}%</Text>
                <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: C.surface2, flexDirection: "row", overflow: "hidden" }}>
                  <View style={{ width: `${Math.round(win1 * 100)}%`, backgroundColor: favored1 ? C.accent : C.muted }} />
                  <View style={{ flex: 1, backgroundColor: favored1 ? C.border : C.accent }} />
                </View>
                <Text style={[s.bold, { width: 28, textAlign: "right", fontSize: 8, color: !favored1 ? C.accent : C.muted }]}>
                  {Math.round((1 - win1) * 100)}%
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function PlayoffSection({ input }: { input: WeeklyReportInput }) {
  const { C, s } = useCtx();
  const { report, predictions } = input;
  const teams = report.teams;
  const predictionOf = new Map(predictions.map((p) => [p.rosterId, p]));
  const { seeds, playoffTeams, hasDivisions, divisions } = report.seeding;
  const hasOdds = predictions.length > 0;
  const winnerSeeds = seeds.filter((x) => x.isDivisionWinner).length;
  const stale =
    report.week < report.currentWeek
      ? ` Standings and odds reflect the latest results (Week ${report.currentWeek}), not Week ${report.week}.`
      : "";
  const sims = hasOdds && input.simulationCount ? ` Odds from ${input.simulationCount.toLocaleString()} season simulations.` : "";

  const statusOf = (rosterId: number) => {
    const p = predictionOf.get(rosterId);
    if (!p) return null;
    if (p.makePlayoffsPct >= 100) return { text: "CLINCHED", bg: C.accentSoft, color: C.accent };
    if (p.makePlayoffsPct >= 99.9) return { text: "LOCK", bg: C.accentSoft, color: C.accent };
    if (p.makePlayoffsPct <= 0) return { text: "OUT", bg: C.redSoft, color: C.red };
    if (p.makePlayoffsPct <= 0.1) return { text: "LONG SHOT", bg: C.redSoft, color: C.red };
    return null;
  };

  const bubble = predictions
    .filter((p) => p.makePlayoffsPct > 5 && p.makePlayoffsPct < 95)
    .sort((a, b) => b.makePlayoffsPct - a.makePlayoffsPct);

  const oddsColor = (v: number) => (v >= 75 ? C.accent : v >= 25 ? C.gold : C.red);

  return (
    <View>
      <SectionHeader
        kicker="Race to the playoffs"
        title="Playoff Picture"
        sub={
          hasDivisions
            ? `Seeds 1-${winnerSeeds} go to division winners (gold). The remaining ${playoffTeams - winnerSeeds} spots go to the best records.${sims}${stale}`
            : `Top ${playoffTeams} teams by record make the playoffs.${sims}${stale}`
        }
      />

      <View style={{ borderRadius: 8, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
        <View style={[s.tr, { backgroundColor: C.surface2 }]}>
          {[
            { t: "SEED", w: 26 },
            { t: "TEAM", flex: 1 },
            { t: "REC", w: 38 },
            { t: "PF", w: 46, right: true },
          ].map((c) => (
            <Text key={c.t} style={[{ fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted, letterSpacing: 0.6 }, c.w ? { width: c.w } : { flex: 1 }, c.right ? { textAlign: "right" } : {}]}>
              {c.t}
            </Text>
          ))}
          {hasOdds && (
            <>
              <Text style={[{ fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted, width: 120, marginLeft: 10, letterSpacing: 0.6 }]}>MAKE PLAYOFFS</Text>
              {hasDivisions && <Text style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted, width: 36, textAlign: "right" }}>DIV</Text>}
              <Text style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted, width: 38, textAlign: "right" }}>#1 SEED</Text>
              <Text style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted, width: 52, textAlign: "right" }}>STATUS</Text>
            </>
          )}
        </View>

        {seeds.map((seed, i) => {
          const team = teams[seed.rosterId];
          const p = predictionOf.get(seed.rosterId);
          const status = statusOf(seed.rosterId);
          const inField = seed.seed <= playoffTeams;
          const makePct = p?.makePlayoffsPct ?? 0;
          return (
            <View key={seed.rosterId}>
              <View
                style={[
                  s.tr,
                  { paddingVertical: 6, backgroundColor: seed.isDivisionWinner ? C.goldSoft : i % 2 === 1 ? C.surface2 : C.surface },
                  !inField ? { opacity: 0.85 } : {},
                ]}
                wrap={false}
              >
                {seed.isDivisionWinner && <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.gold }} />}
                {team?.isUser && !seed.isDivisionWinner && (
                  <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.accent }} />
                )}
                <View style={{ width: 26 }}>
                  <View
                    style={{
                      width: 17,
                      height: 17,
                      borderRadius: 9,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: seed.isDivisionWinner ? C.gold : inField ? C.accent : C.surface2,
                    }}
                  >
                    <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: inField ? C.onAccent : C.muted }}>{seed.seed}</Text>
                  </View>
                </View>
                <View style={[s.row, { flex: 1 }]}>
                  <TeamName team={team} bold={inField} grow={false} />
                  {seed.isDivisionWinner && (
                    <Text style={[s.tag, { backgroundColor: C.gold, color: C.bg, marginLeft: 3 }]}>DIV</Text>
                  )}
                </View>
                <Text style={{ width: 38 }}>{team ? recordOf(team) : ""}</Text>
                <Text style={{ width: 46, textAlign: "right", color: C.muted }}>{team ? fmt(team.pointsFor, 1) : ""}</Text>
                {hasOdds && (
                  <>
                    <View style={[s.row, { width: 120, marginLeft: 10 }]}>
                      <View style={[s.track, { marginRight: 6, backgroundColor: C.bg }]}>
                        <View style={{ height: 5, borderRadius: 3, width: `${Math.max(makePct, makePct > 0 ? 3 : 0)}%`, backgroundColor: oddsColor(makePct) }} />
                      </View>
                      <Text style={[s.bold, { width: 36, textAlign: "right", color: oddsColor(makePct) }]}>{pct(p?.makePlayoffsPct)}</Text>
                    </View>
                    {hasDivisions && <Text style={{ width: 36, textAlign: "right", color: C.muted }}>{pct(p?.divisionWinnerPct)}</Text>}
                    <Text style={{ width: 38, textAlign: "right", color: C.muted }}>{pct(p?.oneSeedPct)}</Text>
                    <View style={{ width: 52, alignItems: "flex-end" }}>
                      {status && <Text style={[s.tag, { backgroundColor: status.bg, color: status.color }]}>{status.text}</Text>}
                    </View>
                  </>
                )}
              </View>
              {seed.seed === playoffTeams && (
                <View style={{ backgroundColor: C.accentSoft, paddingVertical: 2 }}>
                  <Text style={{ textAlign: "center", fontSize: 6, letterSpacing: 1.4, color: C.accent, fontFamily: "Helvetica-Bold" }}>
                    PLAYOFF LINE
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {hasDivisions && (
        <View style={{ marginTop: 14 }} wrap={false}>
          <Text style={s.label}>DIVISION RACES</Text>
          <View style={{ flexDirection: "row" }}>
            {divisions.map((division, idx) => (
              <View key={division.division} style={[s.card, { flex: 1, padding: 7, marginRight: idx < divisions.length - 1 ? 6 : 0 }]}>
                <Text style={[s.bold, { marginBottom: 5, color: C.gold, fontSize: 9 }]}>{division.name.toUpperCase()}</Text>
                {division.rosterIds.map((rosterId, rank) => {
                  const team = teams[rosterId];
                  const p = predictionOf.get(rosterId);
                  return (
                    <View
                      key={rosterId}
                      style={[
                        s.row,
                        { marginBottom: 3, paddingVertical: 3, paddingHorizontal: 3, borderRadius: 4, backgroundColor: rank === 0 ? C.goldSoft : "transparent" },
                      ]}
                    >
                      <TeamName team={team} size={14} showForm={false} />
                      <Text style={[s.small, { width: 28, textAlign: "right" }]}>{team ? recordOf(team) : ""}</Text>
                      {hasOdds && (
                        <Text style={[s.bold, { width: 34, textAlign: "right", fontSize: 7.5, color: rank === 0 ? C.gold : C.muted }]}>
                          {pct(p?.divisionWinnerPct)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      )}

      {hasOdds && bubble.length > 0 && (
        <View style={[s.card, { marginTop: 12 }]} wrap={false}>
          <Text style={s.label}>BUBBLE WATCH</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {bubble.slice(0, 6).map((p) => (
              <View key={p.rosterId} style={[s.row, { marginRight: 12, marginBottom: 3 }]}>
                <Text style={[s.bold, { fontSize: 8 }]}>{teams[p.rosterId]?.name}</Text>
                <Text style={[s.bold, { fontSize: 8, marginLeft: 4, color: oddsColor(p.makePlayoffsPct) }]}>{pct(p.makePlayoffsPct)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export default function WeeklyReportPdf({ input }: { input: WeeklyReportInput }) {
  const { report } = input;
  const theme = input.theme ?? "dark";
  const ctx = useMemo<Ctx>(() => {
    const C = PALETTES[theme];
    const form = new Map<number, "hot" | "cold">();
    report.highPerformers?.hot.forEach((t) => form.set(t.rosterId, "hot"));
    report.highPerformers?.cold.forEach((t) => form.set(t.rosterId, "cold"));
    return { C, s: makeStyles(C), form };
  }, [theme, report]);

  return (
    <StyleContext.Provider value={ctx}>
      <Document title={`${report.league.name} Week ${report.week} Report`} author="Dynasty Command">
        <PageShell report={report}>
          <Hero report={report} />
          <RecapSection report={report} />
        </PageShell>

        {report.highPerformers && (
          <PageShell report={report}>
            <HighPerformersSection report={report} />
          </PageShell>
        )}

        <PageShell report={report}>
          <PreviewSection input={input} />
        </PageShell>

        {report.highPerformers && report.highPerformers.trends.length > 0 && (
          <PageShell report={report}>
            <FormGuide report={report} />
          </PageShell>
        )}

        <PageShell report={report}>
          <PlayoffSection input={input} />
        </PageShell>
      </Document>
    </StyleContext.Provider>
  );
}
