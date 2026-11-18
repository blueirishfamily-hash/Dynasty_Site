import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check } from "lucide-react";
import { Fragment, type ReactNode } from "react";

export interface ClinchStanding {
  rank: number;
  name: string;
  initials: string;
  avatar?: string | null;
  wins: number;
  losses: number;
  pointsFor: number;
  isUser?: boolean;
  rosterId?: number;
}

export interface ClinchPrediction {
  rosterId: number;
  makePlayoffsPct: number;
  byePct?: number;
  gamesLeft?: number;
  sosLeft?: number | null;
  clinchedPlayoffs?: boolean;
  clinchedBye?: boolean;
  eliminated?: boolean;
  magic?: number;
  elim?: number;
}

interface ClinchTrackerProps {
  standings: ClinchStanding[];
  predictions: ClinchPrediction[];
  playoffTeams: number;
  /** Extra cards shown under the clinch cards in the sidebar */
  sidebarExtra?: ReactNode;
}

type StatusKey = "bye" | "clinched" | "control" | "hunt" | "bubble" | "longshot" | "out";

const STATUS: Record<StatusKey, { label: string; className: string }> = {
  bye: { label: "Clinched bye", className: "bg-primary text-primary-foreground border-transparent" },
  clinched: { label: "Clinched", className: "border-primary/50 text-primary" },
  control: { label: "In control", className: "border-chart-2/50 text-chart-2" },
  hunt: { label: "In the hunt", className: "border-chart-4/50 text-chart-4" },
  bubble: { label: "On the bubble", className: "border-chart-3/50 text-chart-3" },
  longshot: { label: "Long shot", className: "border-destructive/50 text-destructive" },
  out: { label: "Eliminated", className: "border-border text-muted-foreground" },
};

function statusFor(p: ClinchPrediction | undefined): StatusKey {
  if (!p) return "hunt";
  if (p.clinchedBye) return "bye";
  if (p.clinchedPlayoffs || p.makePlayoffsPct >= 100) return "clinched";
  if (p.eliminated || p.makePlayoffsPct <= 0) return "out";
  if (p.makePlayoffsPct >= 80) return "control";
  if (p.makePlayoffsPct >= 50) return "hunt";
  if (p.makePlayoffsPct >= 20) return "bubble";
  return "longshot";
}

function isClinched(k: StatusKey) {
  return k === "bye" || k === "clinched";
}

function TeamAvatar({ team, size = "w-8 h-8" }: { team: ClinchStanding; size?: string }) {
  return (
    <Avatar className={size}>
      {team.avatar && <AvatarImage src={team.avatar} alt={team.name} />}
      <AvatarFallback className={`text-xs ${team.isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {team.initials}
      </AvatarFallback>
    </Avatar>
  );
}

export default function ClinchTracker({ standings, predictions, playoffTeams, sidebarExtra }: ClinchTrackerProps) {
  const predMap = new Map(predictions.map((p) => [p.rosterId, p]));
  const hasNumbers = predictions.some((p) => p.magic !== undefined);

  // Schedule strength: split teams with games left into thirds by opponent win rate.
  const sosValues = predictions
    .filter((p) => p.sosLeft !== null && p.sosLeft !== undefined && (p.gamesLeft ?? 0) > 0)
    .map((p) => p.sosLeft as number)
    .sort((a, b) => a - b);
  const easyCut = sosValues.length ? sosValues[Math.floor(sosValues.length / 3)] : 0;
  const hardCut = sosValues.length ? sosValues[Math.floor((sosValues.length * 2) / 3)] : 1;
  const sosLabel = (p?: ClinchPrediction): { text: string; className: string } => {
    if (!p || p.sosLeft === null || p.sosLeft === undefined || (p.gamesLeft ?? 0) === 0) {
      return { text: "—", className: "text-muted-foreground" };
    }
    if (p.sosLeft < easyCut) return { text: "Easy", className: "text-primary font-medium" };
    if (p.sosLeft >= hardCut) return { text: "Hard", className: "text-destructive font-medium" };
    return { text: "Mid", className: "text-muted-foreground" };
  };

  const magicText = (p: ClinchPrediction | undefined, k: StatusKey) => {
    if (isClinched(k)) return "";
    if (k === "out") return "—";
    if (!p || p.magic === undefined || (p.gamesLeft ?? 0) === 0) return "—";
    return String(p.magic);
  };
  const elimText = (p: ClinchPrediction | undefined, k: StatusKey) => {
    if (isClinched(k)) return "—";
    if (k === "out") return "Out";
    if (!p || p.elim === undefined || (p.gamesLeft ?? 0) === 0) return "—";
    return p.elim <= (p.gamesLeft ?? 0) * 2 ? String(p.elim) : "—";
  };

  const rows = standings.map((team) => {
    const p = team.rosterId !== undefined ? predMap.get(team.rosterId) : undefined;
    const key = statusFor(p);
    return { team, p, key };
  });

  const me = rows.find((r) => r.team.isUser);
  const contenders = rows.filter((r) => r.key !== "out" && !isClinched(r.key) && r.p?.magic !== undefined);
  const nextToClinch = [...contenders].sort((a, b) => (a.p!.magic! - b.p!.magic!)).slice(0, 2);
  const nextOut = [...contenders]
    .filter((r) => r.p!.elim !== undefined)
    .sort((a, b) => a.p!.elim! - b.p!.elim!)
    .slice(0, 2);

  const myPathText = () => {
    if (!me) return null;
    if (me.key === "bye") return "You have clinched a first-round bye.";
    if (me.key === "clinched") {
      return me.p?.byePct !== undefined
        ? `You are in the playoffs. Bye odds: ${me.p.byePct.toFixed(1)}%.`
        : "You are in the playoffs.";
    }
    if (me.key === "out") return "You have been eliminated from the playoffs.";
    if (me.p?.magic !== undefined && (me.p.gamesLeft ?? 0) > 0) {
      return `Any mix of your wins and losses by teams chasing you that adds up to ${me.p.magic} clinches a spot.`;
    }
    return null;
  };

  const sidebar = (
    <div className="space-y-6">
      {me && (
        <Card className="border-primary/40" data-testid="card-clinch-path">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg">Your clinch path</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasNumbers && !isClinched(me.key) && me.key !== "out" && me.p?.magic !== undefined && (me.p.gamesLeft ?? 0) > 0 ? (
              <p className="font-heading text-2xl font-bold text-primary">Magic number {me.p.magic}</p>
            ) : (
              <Badge variant="outline" className={STATUS[me.key].className}>{STATUS[me.key].label}</Badge>
            )}
            {myPathText() && <p className="text-sm text-muted-foreground">{myPathText()}</p>}
            {me.p && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Playoff odds</span>
                  <span className="tabular-nums">{me.p.makePlayoffsPct.toFixed(1)}%</span>
                </div>
                <Progress value={Math.min(100, me.p.makePlayoffsPct)} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {nextToClinch.length > 0 && (
        <Card data-testid="card-next-clinch">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg">Next to clinch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextToClinch.map((r) => (
              <div key={r.team.rank} className="flex items-center gap-3">
                <TeamAvatar team={r.team} size="w-7 h-7" />
                <span className={`flex-1 text-sm font-medium ${r.team.isUser ? "text-primary" : ""}`}>{r.team.name}</span>
                <span className="text-sm font-semibold tabular-nums">Magic {r.p!.magic}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {nextOut.length > 0 && (
        <Card data-testid="card-next-out">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg">Next to be eliminated</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextOut.map((r) => (
              <div key={r.team.rank} className="flex items-center gap-3">
                <TeamAvatar team={r.team} size="w-7 h-7" />
                <span className={`flex-1 text-sm font-medium ${r.team.isUser ? "text-primary" : ""}`}>{r.team.name}</span>
                <span className="text-sm font-semibold tabular-nums text-destructive">Elim {r.p!.elim}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );

  const playoffLine = (
    <div className="flex items-center gap-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-chart-3">
      <span className="flex-1 border-t-2 border-dashed border-chart-3/60" />
      Playoff line
      <span className="flex-1 border-t-2 border-dashed border-chart-3/60" />
    </div>
  );

  const table = (
      <Card data-testid="clinch-tracker">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg">Clinch Tracker</CardTitle>
          <CardDescription>
            Top {playoffTeams} make the playoffs. Magic number is the wins you need, plus losses by the teams chasing you,
            to clinch. It counts wins only, so tiebreakers can change the finish.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-center">W-L</TableHead>
                  <TableHead className="text-right">PF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Magic #</TableHead>
                  <TableHead className="text-center">Elim #</TableHead>
                  <TableHead className="text-center">Left</TableHead>
                  <TableHead className="text-center">Schedule left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ team, p, key }) => {
                  const sos = sosLabel(p);
                  return (
                    <Fragment key={team.rank}>
                      <TableRow
                        className={team.isUser ? "bg-primary/5" : ""}
                        data-testid={`row-team-${team.rank}`}
                      >
                        <TableCell className="text-center font-semibold text-muted-foreground">{team.rank}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TeamAvatar team={team} />
                            <span className={`font-medium ${team.isUser ? "text-primary" : ""}`}>{team.name}</span>
                            {team.isUser && <Badge variant="outline" className="text-xs">You</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-medium">{team.wins}-{team.losses}</TableCell>
                        <TableCell className="text-right tabular-nums">{team.pointsFor.toFixed(1)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs whitespace-nowrap ${STATUS[key].className}`} data-testid={`status-${team.rank}`}>
                            {STATUS[key].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-semibold">
                          {isClinched(key) ? <Check className="w-4 h-4 text-primary inline" aria-label="Clinched" /> : magicText(p, key)}
                        </TableCell>
                        <TableCell className={`text-center tabular-nums font-semibold ${key === "out" ? "text-muted-foreground" : "text-destructive"}`}>
                          {elimText(p, key)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-muted-foreground">{p?.gamesLeft ?? "—"}</TableCell>
                        <TableCell className={`text-center ${sos.className}`}>{sos.text}</TableCell>
                      </TableRow>
                      {team.rank === playoffTeams && (
                        <TableRow className="hover:bg-transparent border-0">
                          <TableCell colSpan={9} className="py-0">{playoffLine}</TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Phone list */}
          <div className="md:hidden space-y-1 p-3">
            {rows.map(({ team, p, key }) => (
              <div key={team.rank}>
                <div
                  className={`rounded-lg border p-3 space-y-2 ${team.isUser ? "border-primary/50 bg-primary/5" : "border-transparent bg-muted/20"}`}
                  data-testid={`card-team-${team.rank}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-sm font-semibold text-muted-foreground">{team.rank}</span>
                    <TeamAvatar team={team} size="w-7 h-7" />
                    <span className={`flex-1 truncate text-sm font-medium ${team.isUser ? "text-primary" : ""}`}>{team.name}</span>
                    <span className="text-sm font-semibold tabular-nums">{team.wins}-{team.losses}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-7">
                    <Badge variant="outline" className={`text-xs ${STATUS[key].className}`}>{STATUS[key].label}</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Magic {isClinched(key) ? "✓" : magicText(p, key)} · Elim {elimText(p, key)}
                    </span>
                  </div>
                </div>
                {team.rank === playoffTeams && playoffLine}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">{table}</div>
      <div className="space-y-6">
        {sidebar}
        {sidebarExtra}
      </div>
    </div>
  );
}
