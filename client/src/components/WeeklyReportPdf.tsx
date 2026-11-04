import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type {
  GameCallout,
  HighPerformerPlayer,
  PreviewGame,
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

export interface WeeklyReportInput {
  report: WeeklyReportData;
  predictions: ReportPrediction[];
  simulationCount?: number;
  powerRank: Record<number, number>;
}

const C = {
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  soft: "#f1f5f9",
  green: "#059669",
  greenSoft: "#d1fae5",
  gold: "#b45309",
  goldSoft: "#fef3c7",
  red: "#dc2626",
  white: "#ffffff",
};

const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 48, fontSize: 9, fontFamily: "Helvetica", color: C.ink },
  header: {
    backgroundColor: C.ink,
    color: C.white,
    borderRadius: 6,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  headerTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.white },
  headerSub: { fontSize: 9, color: "#cbd5e1", marginTop: 3 },
  headerWeek: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#6ee7b7" },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  sectionSub: { fontSize: 8, color: C.muted, marginBottom: 8 },
  section: { marginBottom: 14 },
  rule: { height: 2, backgroundColor: C.green, width: 28, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center" },
  chip: { width: 16, height: 16, borderRadius: 8, marginRight: 5 },
  chipFallback: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 5,
    backgroundColor: C.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { fontSize: 6, fontFamily: "Helvetica-Bold", color: C.muted },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 5, padding: 7 },
  cardLabel: { fontSize: 7, color: C.muted, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  small: { fontSize: 7.5, color: C.muted },
  bold: { fontFamily: "Helvetica-Bold" },
  tableHead: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: C.soft,
    borderRadius: 3,
  },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  barTrack: { height: 5, backgroundColor: C.soft, borderRadius: 3, flex: 1 },
  tag: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 1.5,
    paddingHorizontal: 3,
    borderRadius: 2,
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.muted,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 5,
  },
});

const fmt = (n: number, digits = 1) => n.toFixed(digits);
const pct = (n: number | undefined) => (n == null ? "-" : n >= 99.95 ? "100%" : n <= 0.05 ? "0%" : `${n.toFixed(n < 10 ? 1 : 0)}%`);
const recordOf = (t: WeeklyReportTeam) => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function Chip({ team }: { team: WeeklyReportTeam | undefined }) {
  if (team?.avatar) return <Image src={team.avatar} style={s.chip} />;
  return (
    <View style={s.chipFallback}>
      <Text style={s.chipText}>{team?.initials ?? "?"}</Text>
    </View>
  );
}

function TeamName({
  team,
  align = "left",
  bold = false,
  width,
  suffix,
  grow = true,
}: {
  team: WeeklyReportTeam | undefined;
  align?: "left" | "right";
  bold?: boolean;
  width?: number;
  suffix?: string;
  grow?: boolean;
}) {
  const label = team?.name ?? "Unknown";
  return (
    <View style={[s.row, { flex: width || !grow ? undefined : 1, width, justifyContent: align === "right" ? "flex-end" : "flex-start" }]}>
      {align === "left" && <Chip team={team} />}
      <Text
        style={[ [bold ? s.bold : {}, { flexShrink: 1, textAlign: align }], { maxLines: 1 } ] as any}
      >
        {label}
        {suffix ? <Text style={s.small}> {suffix}</Text> : null}
      </Text>
      {team?.isUser && (
        <Text style={[s.tag, { backgroundColor: C.greenSoft, color: C.green, marginLeft: 3 }]}>YOU</Text>
      )}
      {align === "right" && (
        <View style={{ marginLeft: 5 }}>
          <Chip team={team} />
        </View>
      )}
    </View>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View>
      <View style={s.rule} />
      <Text style={s.sectionTitle}>{title}</Text>
      {sub ? <Text style={s.sectionSub}>{sub}</Text> : <View style={{ height: 6 }} />}
    </View>
  );
}

function PageShell({ report, children }: { report: WeeklyReportData; children: React.ReactNode }) {
  return (
    <Page size="LETTER" style={s.page}>
      {children}
      <View style={s.footer} fixed>
        <Text>
          {report.league.name} - {report.league.season} Season - Week {report.week} Report
        </Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  );
}

function CalloutCard({
  label,
  callout,
  teams,
  detail,
}: {
  label: string;
  callout: GameCallout | null;
  teams: Record<number, WeeklyReportTeam>;
  detail: (c: GameCallout) => string;
}) {
  if (!callout) return null;
  const team = teams[callout.rosterId];
  const opp = teams[callout.opponentId];
  return (
    <View style={[s.card, { width: "32.2%", marginRight: 6, marginBottom: 6 }]} wrap={false}>
      <Text style={s.cardLabel}>{label.toUpperCase()}</Text>
      <View style={s.row}>
        <Chip team={team} />
        <Text style={[ [s.bold, { flexShrink: 1 }], { maxLines: 1 } ] as any}>
          {team?.name}
        </Text>
      </View>
      <Text style={[s.small, { marginTop: 2 }]}>{detail(callout)}</Text>
      <Text style={[ s.small, { maxLines: 1 } ] as any}>
        vs {opp?.name}
      </Text>
    </View>
  );
}

function RecapSection({ report }: { report: WeeklyReportData }) {
  if (!report.recap || report.recapWeek == null) {
    return (
      <View style={s.section}>
        <SectionHeader title="Last Week Recap" />
        <Text style={s.small}>No completed games yet. The recap will appear once Week 1 is final.</Text>
      </View>
    );
  }
  const { games, callouts } = report.recap;
  const teams = report.teams;
  return (
    <View style={s.section}>
      <SectionHeader title={`Week ${report.recapWeek} Recap`} sub="Final scores from last week's games." />
      {games.map((g) => {
        const t1 = teams[g.team1];
        const t2 = teams[g.team2];
        const w1 = g.winner === g.team1;
        const w2 = g.winner === g.team2;
        const mine = t1?.isUser || t2?.isUser;
        return (
          <View key={g.matchupId} style={[s.tr, mine ? { backgroundColor: C.greenSoft } : {}]} wrap={false}>
            <View style={[s.row, { flex: 1 }]}>
              <TeamName team={t1} bold={w1} />
              <Text style={[{ width: 40, textAlign: "right" }, w1 ? [s.bold, { color: C.green }] : { color: C.muted }]}>
                {fmt(g.score1, 2)}
              </Text>
            </View>
            <Text style={[s.small, { width: 62, textAlign: "center" }]}>
              {g.winner == null ? "Tie" : `by ${fmt(g.margin, 1)}`}
            </Text>
            <View style={[s.row, { flex: 1 }]}>
              <Text style={[{ width: 40, textAlign: "left" }, w2 ? [s.bold, { color: C.green }] : { color: C.muted }]}>
                {fmt(g.score2, 2)}
              </Text>
              <TeamName team={t2} align="right" bold={w2} />
            </View>
          </View>
        );
      })}

      <Text style={[s.cardLabel, { marginTop: 12 }]}>WEEK IN NUMBERS</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <CalloutCard
          label="Top score"
          callout={callouts.highestScore}
          teams={teams}
          detail={(c) => `${fmt(c.points, 2)} pts`}
        />
        <CalloutCard
          label="Lowest score"
          callout={callouts.lowestScore}
          teams={teams}
          detail={(c) => `${fmt(c.points, 2)} pts`}
        />
        <CalloutCard
          label="Closest finish"
          callout={callouts.closestGame}
          teams={teams}
          detail={(c) => `Won by ${fmt(c.points - c.opponentPoints, 2)}`}
        />
        <CalloutCard
          label="Biggest blowout"
          callout={callouts.biggestBlowout}
          teams={teams}
          detail={(c) => `Won by ${fmt(c.points - c.opponentPoints, 1)}`}
        />
        <CalloutCard
          label="Unluckiest loss"
          callout={callouts.unluckiestLoss}
          teams={teams}
          detail={(c) => `Lost with ${fmt(c.points, 2)} pts`}
        />
        <CalloutCard
          label="Luckiest win"
          callout={callouts.luckiestWin}
          teams={teams}
          detail={(c) => `Won with only ${fmt(c.points, 2)} pts`}
        />
      </View>
    </View>
  );
}

function PlayerRow({ rank, player, teams }: { rank: number; player: HighPerformerPlayer; teams: Record<number, WeeklyReportTeam> }) {
  return (
    <View style={s.tr} wrap={false}>
      <Text style={[s.small, { width: 16 }]}>{rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[ s.bold, { maxLines: 1 } ] as any}>
          {player.name}
        </Text>
        <Text style={s.small}>
          {player.position}
          {player.nflTeam ? ` - ${player.nflTeam}` : ""}
        </Text>
      </View>
      <Text style={[ [{ width: 120 }, s.small], { maxLines: 1 } ] as any}>
        {teams[player.rosterId]?.name}
      </Text>
      <Text style={[s.bold, { width: 36, textAlign: "right", color: C.green }]}>{fmt(player.points, 1)}</Text>
    </View>
  );
}

function EfficiencyBar({ label, team, value, detail }: { label?: string; team?: WeeklyReportTeam; value: number; detail: string }) {
  return (
    <View style={[s.row, { marginBottom: 4 }]} wrap={false}>
      <View style={{ width: 130 }}>
        <TeamName team={team} width={130} />
      </View>
      <View style={[s.barTrack, { marginHorizontal: 6 }]}>
        <View style={{ height: 5, borderRadius: 3, width: `${Math.max(2, value * 100)}%`, backgroundColor: value >= 0.9 ? C.green : value >= 0.8 ? "#34d399" : "#fbbf24" }} />
      </View>
      <Text style={[s.small, { width: 28, textAlign: "right" }]}>{label ?? `${Math.round(value * 100)}%`}</Text>
      <Text style={[s.small, { width: 78, textAlign: "right" }]}>{detail}</Text>
    </View>
  );
}

function HighPerformersSection({ report }: { report: WeeklyReportData }) {
  const hp = report.highPerformers;
  const teams = report.teams;
  if (!hp) return null;
  return (
    <View style={s.section}>
      <SectionHeader
        title="High Performers"
        sub={`Standout starters and lineups from Week ${report.recapWeek}.`}
      />

      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1.55, marginRight: 14 }}>
          <Text style={s.cardLabel}>TOP INDIVIDUAL PERFORMANCES</Text>
          {hp.topPlayers.map((p, i) => (
            <PlayerRow key={`${p.playerId}-${p.rosterId}`} rank={i + 1} player={p} teams={teams} />
          ))}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.cardLabel}>POSITION LEADERS</Text>
          {hp.positionLeaders.map((p) => (
            <View key={p.position} style={[s.tr, { paddingHorizontal: 0 }]} wrap={false}>
              <Text style={[s.tag, { backgroundColor: C.soft, color: C.muted, width: 22, textAlign: "center" }]}>{p.position}</Text>
              <View style={{ flex: 1, marginLeft: 5 }}>
                <Text style={[ s.bold, { maxLines: 1 } ] as any}>
                  {p.name}
                </Text>
                <Text style={[ s.small, { maxLines: 1 } ] as any}>
                  {teams[p.rosterId]?.name}
                </Text>
              </View>
              <Text style={[s.bold, { color: C.green }]}>{fmt(p.points, 1)}</Text>
            </View>
          ))}

          <Text style={[s.cardLabel, { marginTop: 12 }]}>HIGHEST TEAM SCORES</Text>
          {hp.topTeamScores.map((t, i) => (
            <View key={t.rosterId} style={[s.tr, { paddingHorizontal: 0 }]} wrap={false}>
              <Text style={[s.small, { width: 14 }]}>{i + 1}</Text>
              <TeamName team={teams[t.rosterId]} />
              <Text style={[s.bold, { color: C.green }]}>{fmt(t.points, 2)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 14 }} wrap={false}>
        <Text style={s.cardLabel}>LINEUP EFFICIENCY (POINTS SCORED VS BEST POSSIBLE LINEUP)</Text>
        {hp.efficiency.map((e) => (
          <EfficiencyBar
            key={e.rosterId}
            team={teams[e.rosterId]}
            value={e.efficiency}
            detail={`${fmt(e.points, 1)} / ${fmt(e.optimalPoints, 1)}`}
          />
        ))}
      </View>

    </View>
  );
}

function FormGuide({ report }: { report: WeeklyReportData }) {
  const hp = report.highPerformers;
  const teams = report.teams;
  if (!hp || (hp.hot.length === 0 && hp.cold.length === 0)) return null;
  return (
    <View style={{ marginTop: 6 }} wrap={false}>
      <Text style={s.cardLabel}>FORM GUIDE</Text>
      <View style={{ flexDirection: "row" }}>
        {[
          { title: "HEATING UP", list: hp.hot, color: C.green },
          { title: "COOLING OFF", list: hp.cold, color: C.red },
        ].map(({ title, list, color }) => (
          <View key={title} style={[s.card, { flex: 1, marginRight: title === "HEATING UP" ? 8 : 0 }]}>
            <Text style={s.cardLabel}>{title} (RECENT AVG VS EARLIER SEASON AVG)</Text>
            {list.length === 0 ? <Text style={s.small}>None</Text> : null}
            {list.map((t) => (
              <View key={t.rosterId} style={[s.row, { marginBottom: 3 }]}>
                <TeamName team={teams[t.rosterId]} />
                <Text style={[s.bold, { color }]}>
                  {t.difference > 0 ? "+" : ""}
                  {fmt(t.difference, 1)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

interface PreviewRow {
  game: PreviewGame;
  p1: number;
  p2: number;
  win1: number;
}

function PreviewSection({ input }: { input: WeeklyReportInput }) {
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

  const label = (row: PreviewRow | undefined, kind: "toss" | "mismatch" | "shootout") => {
    if (!row) return null;
    const t1 = teams[row.game.team1];
    const t2 = teams[row.game.team2];
    const detail =
      kind === "shootout"
        ? `Projected combined ${fmt(row.p1 + row.p2, 1)} pts`
        : `${t1?.name} ${Math.round(row.win1 * 100)}% / ${t2?.name} ${Math.round((1 - row.win1) * 100)}%`;
    const title = kind === "toss" ? "TOSS-UP" : kind === "mismatch" ? "BIGGEST MISMATCH" : "SHOOTOUT WATCH";
    return (
      <View style={[s.card, { flex: 1, marginRight: 6 }]} wrap={false}>
        <Text style={s.cardLabel}>{title}</Text>
        <Text style={[ s.bold, { maxLines: 1 } ] as any}>
          {t1?.name} vs {t2?.name}
        </Text>
        <Text style={[ [s.small, { marginTop: 2 }], { maxLines: 2 } ] as any}>
          {detail}
        </Text>
      </View>
    );
  };

  const title = report.previewHasScores ? `Week ${report.previewWeek} Matchups` : `Week ${report.previewWeek} Preview`;
  const sub = report.previewFinal
    ? "Final scores for this week's games."
    : report.previewHasScores
    ? "Scores shown are the current totals for this week's games."
    : "Projections use each team's optimal-lineup projection; win odds assume typical weekly scoring variance.";

  return (
    <View style={s.section}>
      <SectionHeader title={title} sub={sub} />
      {!report.previewHasScores && rows.length > 1 && (
        <View style={{ flexDirection: "row", marginBottom: 10 }}>
          {label(tossUp, "toss")}
          {label(mismatch, "mismatch")}
          <View style={{ flex: 1 }}>{label(shootout, "shootout")}</View>
        </View>
      )}
      {rows.map(({ game, p1, p2, win1 }) => {
        const t1 = teams[game.team1];
        const t2 = teams[game.team2];
        const mine = t1?.isUser || t2?.isUser;
        const live = game.score1 != null && game.score2 != null;
        return (
          <View
            key={game.matchupId}
            style={[s.card, { marginBottom: 6, padding: 8 }, mine ? { backgroundColor: C.greenSoft, borderColor: C.green } : {}]}
            wrap={false}
          >
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row" }}>
                  <TeamName team={t1} bold={win1 >= 0.5 && !live} />
                </View>
                <Text style={[s.small, { marginLeft: 21 }]}>
                  {t1 ? recordOf(t1) : ""}
                  {powerRank[game.team1] ? `  -  Power rank #${powerRank[game.team1]}` : ""}
                </Text>
              </View>
              <View style={{ width: 120, alignItems: "center" }}>
                <Text style={[s.bold, { fontSize: 11 }]}>
                  {live ? `${fmt(game.score1!, 1)} - ${fmt(game.score2!, 1)}` : `${fmt(p1, 1)} - ${fmt(p2, 1)}`}
                </Text>
                <Text style={s.small}>{live ? (report.previewFinal ? "Final" : "Current score") : "Projected"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row" }}>
                  <TeamName team={t2} align="right" bold={win1 < 0.5 && !live} />
                </View>
                <Text style={[s.small, { textAlign: "right", marginRight: 21 }]}>
                  {t2 ? recordOf(t2) : ""}
                  {powerRank[game.team2] ? `  -  Power rank #${powerRank[game.team2]}` : ""}
                </Text>
              </View>
            </View>
            {!live && (
              <View style={[s.row, { marginTop: 5 }]}>
                <Text style={[s.small, { width: 26 }]}>{Math.round(win1 * 100)}%</Text>
                <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: "#cbd5e1", flexDirection: "row" }}>
                  <View style={{ width: `${Math.round(win1 * 100)}%`, backgroundColor: C.green, borderRadius: 2 }} />
                </View>
                <Text style={[s.small, { width: 26, textAlign: "right" }]}>{Math.round((1 - win1) * 100)}%</Text>
              </View>
            )}
          </View>
        );
      })}
      <FormGuide report={report} />
    </View>
  );
}

function PlayoffSection({ input }: { input: WeeklyReportInput }) {
  const { report, predictions } = input;
  const teams = report.teams;
  const predictionOf = new Map(predictions.map((p) => [p.rosterId, p]));
  const { seeds, playoffTeams, hasDivisions, divisions } = report.seeding;
  const hasOdds = predictions.length > 0;
  const winnerSeeds = seeds.filter((x) => x.isDivisionWinner).length;
  const stale = report.week < report.currentWeek ? ` Standings and odds reflect the latest results (Week ${report.currentWeek}), not Week ${report.week}.` : "";

  const statusOf = (rosterId: number) => {
    const p = predictionOf.get(rosterId);
    if (!p) return null;
    if (p.makePlayoffsPct >= 99.95) return { text: "CLINCHED", bg: C.greenSoft, color: C.green };
    if (p.makePlayoffsPct <= 0.05) return { text: "OUT", bg: "#fee2e2", color: C.red };
    return null;
  };

  const bubble = predictions
    .filter((p) => p.makePlayoffsPct > 5 && p.makePlayoffsPct < 95)
    .sort((a, b) => b.makePlayoffsPct - a.makePlayoffsPct);

  return (
    <View style={s.section}>
      <SectionHeader
        title="Playoff Picture"
        sub={
          hasDivisions
            ? `Seeds 1-${winnerSeeds} go to division winners (current leaders shown in gold). The remaining ${playoffTeams - winnerSeeds} spots go to the best records.${
                hasOdds && input.simulationCount ? ` Odds from ${input.simulationCount.toLocaleString()} season simulations.` : ""
              }${stale}`
            : `Top ${playoffTeams} teams by record make the playoffs.${hasOdds && input.simulationCount ? ` Odds from ${input.simulationCount.toLocaleString()} season simulations.` : ""}${stale}`
        }
      />

      <View style={s.tableHead}>
        <Text style={[s.th, { width: 24 }]}>SEED</Text>
        <Text style={[s.th, { flex: 1 }]}>TEAM</Text>
        <Text style={[s.th, { width: 40 }]}>REC</Text>
        <Text style={[s.th, { width: 46, textAlign: "right" }]}>PF</Text>
        {hasOdds && (
          <>
            <Text style={[s.th, { width: 120, marginLeft: 10 }]}>MAKE PLAYOFFS</Text>
            {hasDivisions && <Text style={[s.th, { width: 38, textAlign: "right" }]}>DIV</Text>}
            <Text style={[s.th, { width: 38, textAlign: "right" }]}>#1 SEED</Text>
            <Text style={[s.th, { width: 50, textAlign: "right" }]}>STATUS</Text>
          </>
        )}
      </View>

      {seeds.map((seed) => {
        const team = teams[seed.rosterId];
        const p = predictionOf.get(seed.rosterId);
        const status = statusOf(seed.rosterId);
        const inField = seed.seed <= playoffTeams;
        return (
          <View key={seed.rosterId}>
            <View
              style={[
                s.tr,
                seed.isDivisionWinner ? { backgroundColor: C.goldSoft } : {},
                team?.isUser ? { borderLeftWidth: 3, borderLeftColor: C.green } : {},
                !inField ? { opacity: 0.8 } : {},
              ]}
              wrap={false}
            >
              <Text style={[s.bold, { width: 24, color: inField ? C.ink : C.muted }]}>{seed.seed}</Text>
              <View style={[s.row, { flex: 1 }]}>
                <TeamName team={team} bold={inField} grow={false} />
                {seed.isDivisionWinner && (
                  <Text style={[s.tag, { backgroundColor: C.gold, color: C.white, marginLeft: 3 }]}>DIV</Text>
                )}
              </View>
              <Text style={{ width: 40 }}>{team ? recordOf(team) : ""}</Text>
              <Text style={{ width: 46, textAlign: "right" }}>{team ? fmt(team.pointsFor, 1) : ""}</Text>
              {hasOdds && (
                <>
                  <View style={[s.row, { width: 120, marginLeft: 10 }]}>
                    <View style={[s.barTrack, { marginRight: 5 }]}>
                      <View
                        style={{
                          height: 5,
                          borderRadius: 3,
                          width: `${p?.makePlayoffsPct ?? 0}%`,
                          backgroundColor: (p?.makePlayoffsPct ?? 0) >= 75 ? C.green : (p?.makePlayoffsPct ?? 0) >= 25 ? "#fbbf24" : "#f87171",
                        }}
                      />
                    </View>
                    <Text style={{ width: 28, textAlign: "right" }}>{pct(p?.makePlayoffsPct)}</Text>
                  </View>
                  {hasDivisions && <Text style={{ width: 38, textAlign: "right" }}>{pct(p?.divisionWinnerPct)}</Text>}
                  <Text style={{ width: 38, textAlign: "right" }}>{pct(p?.oneSeedPct)}</Text>
                  <View style={{ width: 50, alignItems: "flex-end" }}>
                    {status && <Text style={[s.tag, { backgroundColor: status.bg, color: status.color }]}>{status.text}</Text>}
                  </View>
                </>
              )}
            </View>
            {seed.seed === playoffTeams && (
              <View style={{ borderTopWidth: 1.5, borderTopColor: C.green, borderStyle: "dashed", marginVertical: 1 }}>
                <Text style={[s.small, { color: C.green, textAlign: "center", fontSize: 6.5, marginTop: 1 }]}>PLAYOFF LINE</Text>
              </View>
            )}
          </View>
        );
      })}

      {hasDivisions && (
        <View style={{ marginTop: 14 }} wrap={false}>
          <Text style={s.cardLabel}>DIVISION RACES</Text>
          <View style={{ flexDirection: "row" }}>
            {divisions.map((division, idx) => (
              <View key={division.division} style={[s.card, { flex: 1, padding: 6, marginRight: idx < divisions.length - 1 ? 6 : 0 }]}>
                <Text style={[s.bold, { marginBottom: 4 }]}>{division.name}</Text>
                {division.rosterIds.map((rosterId, rank) => {
                  const team = teams[rosterId];
                  const p = predictionOf.get(rosterId);
                  return (
                    <View key={rosterId} style={[s.row, { marginBottom: 3, backgroundColor: rank === 0 ? C.goldSoft : undefined, padding: 2, borderRadius: 2 }]}>
                      <TeamName team={team} />
                      <Text style={[s.small, { width: 30, textAlign: "right" }]}>{team ? recordOf(team) : ""}</Text>
                      {hasOdds && <Text style={[s.small, { width: 30, textAlign: "right" }]}>{pct(p?.divisionWinnerPct)}</Text>}
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
          <Text style={s.cardLabel}>BUBBLE WATCH</Text>
          <Text style={s.small}>
            Teams with a real shot either way:{" "}
            {bubble
              .slice(0, 6)
              .map((p) => `${teams[p.rosterId]?.name} (${pct(p.makePlayoffsPct)})`)
              .join(", ")}
            .
          </Text>
        </View>
      )}
    </View>
  );
}

export default function WeeklyReportPdf({ input }: { input: WeeklyReportInput }) {
  const { report } = input;
  const generated = new Date(report.generatedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Document title={`${report.league.name} Week ${report.week} Report`} author="Dynasty Command">
      <PageShell report={report}>
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>{report.league.name}</Text>
            <Text style={s.headerSub}>Weekly League Report - {report.league.season} Season</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.headerWeek}>WEEK {report.week}</Text>
            <Text style={s.headerSub}>{generated}</Text>
          </View>
        </View>
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

      <PageShell report={report}>
        <PlayoffSection input={input} />
      </PageShell>
    </Document>
  );
}
