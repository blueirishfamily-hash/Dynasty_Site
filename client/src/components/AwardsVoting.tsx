import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { ChevronDown, ChevronRight, Crown, Plus, Star, Vote } from "lucide-react";
import type { AwardNomination, AwardBallot } from "@shared/schema";
import { useLeagueRules } from "@/lib/leagueRules";

type AwardType = "mvp" | "roy" | "gm";
type Phase = "nominate" | "open" | "closed";

const AWARDS: Array<{ type: AwardType; label: string; desc: string; noun: string }> = [
  { type: "mvp", label: "MVP", desc: "Most valuable player of the regular season", noun: "player" },
  { type: "roy", label: "Rookie of the Year", desc: "Best first-year player", noun: "rookie" },
  { type: "gm", label: "Best GM", desc: "Best roster builder and manager", noun: "team" },
];

const SLOT_LABELS = ["1st", "2nd", "3rd"];

const positionColors: Record<string, string> = {
  QB: "bg-red-500 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-gray-500 text-white",
};

interface SearchPlayer {
  id: string;
  name: string;
  position: string;
  team: string | null;
  yearsExp?: number;
}

interface TeamOption {
  rosterId: number;
  name: string;
}

interface AwardVotingState {
  masterEnabled: boolean;
  closesAt: number | null;
  phase: Phase;
}

interface Props {
  leagueId: string;
  season: string;
  userId?: string;
  userRosterId?: number;
  teamName: string;
  isCommissioner: boolean;
  teams: TeamOption[];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0d 0h 0m 0s";
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  return `${d}d ${h}h ${m}m ${s}s`;
}

function toLocalDatetimeLocalString(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function useAwardData(leagueId: string, season: string, type: AwardType, rosterId?: number) {
  const base = `/api/league/${leagueId}/awards/${season}/${type}`;
  const nominations = useQuery<AwardNomination[]>({
    queryKey: ["/api/league", leagueId, "awards", season, type, "nominee-list"],
    queryFn: async () => {
      const res = await fetch(base);
      if (!res.ok) throw new Error("Failed to load nominees");
      return res.json();
    },
    enabled: !!leagueId && !!season,
  });
  const ballot = useQuery<AwardBallot | null>({
    queryKey: ["/api/league", leagueId, "awards", season, type, "my-ballot", rosterId],
    queryFn: async () => {
      const res = await fetch(`${base}/ballot/${rosterId}`);
      if (!res.ok) throw new Error("Failed to load ballot");
      return res.json();
    },
    enabled: !!leagueId && !!season && !!rosterId,
  });
  const count = useQuery<{ count: number; remaining: number }>({
    queryKey: ["/api/league", leagueId, "awards", season, type, "my-nomination-count", rosterId],
    queryFn: async () => {
      const res = await fetch(`${base}/nominations/count/${rosterId}`);
      if (!res.ok) throw new Error("Failed to load nomination count");
      return res.json();
    },
    enabled: !!leagueId && !!season && !!rosterId,
  });
  return { nominations, ballot, count };
}

export default function AwardsVoting({ leagueId, season, userId, userRosterId, teamName, isCommissioner, teams }: Props) {
  const NOMINATION_LIMIT = useLeagueRules().awards.nominationLimit;
  const { toast } = useToast();
  const [openAward, setOpenAward] = useState<AwardType | null>("mvp");

  const mvp = useAwardData(leagueId, season, "mvp", userRosterId);
  const roy = useAwardData(leagueId, season, "roy", userRosterId);
  const gm = useAwardData(leagueId, season, "gm", userRosterId);
  const data: Record<AwardType, ReturnType<typeof useAwardData>> = { mvp, roy, gm };

  const { data: votingState } = useQuery<AwardVotingState>({
    queryKey: ["/api/league", leagueId, "award-voting"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/award-voting`);
      if (!res.ok) throw new Error("Failed to load awards voting state");
      return res.json();
    },
    enabled: !!leagueId,
  });
  const masterEnabled = votingState?.masterEnabled ?? false;
  const closesAt = votingState?.closesAt ?? null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (closesAt == null || closesAt <= Date.now()) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [closesAt]);

  const phase: Phase = !masterEnabled ? "nominate" : closesAt == null || now < closesAt ? "open" : "closed";

  const windowMutation = useMutation({
    mutationFn: (body: { enabled?: boolean; closesAt?: number | null }) =>
      postJson(`/api/league/${leagueId}/award-voting`, { userId, ...body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "award-voting"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const ballotsIn = AWARDS.filter((a) => !!data[a.type].ballot.data).length;
  const nominationsUsed = AWARDS.reduce((sum, a) => sum + (data[a.type].count.data?.count ?? 0), 0);

  const phaseChip =
    phase === "open" ? (
      <Badge className="bg-primary text-primary-foreground" data-testid="awards-phase">Voting open</Badge>
    ) : phase === "nominate" ? (
      <Badge className="bg-blue-600 text-white" data-testid="awards-phase">Nominations open</Badge>
    ) : (
      <Badge variant="secondary" data-testid="awards-phase">Voting closed</Badge>
    );

  const phaseText =
    phase === "open"
      ? closesAt != null
        ? `Voting closes in ${formatCountdown(closesAt - now)}`
        : "Voting is open"
      : phase === "nominate"
        ? "Nominate up to 3 for each award. Ballots open when the commissioner starts voting."
        : "Voting has closed. Results are on the awards page.";

  return (
    <section className="space-y-3" data-testid="section-awards-voting">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <h2 className="font-heading text-2xl font-bold">Awards voting</h2>
        <span className="text-xs text-muted-foreground">Separate from rule voting · {season} season</span>
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {phaseChip}
              <p className="text-sm font-medium" data-testid="awards-phase-text">{phaseText}</p>
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your ballots</p>
                <p className="font-heading text-xl font-bold text-primary">{ballotsIn} of {AWARDS.length}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nominations used</p>
                <p className="font-heading text-xl font-bold">{nominationsUsed} of {NOMINATION_LIMIT * AWARDS.length}</p>
              </div>
            </div>
          </div>

          {isCommissioner && (
            <div className="flex flex-wrap items-center gap-4 border-t pt-3" data-testid="awards-commissioner">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Crown className="w-3.5 h-3.5 text-primary" /> Commissioner
              </span>
              <div className="flex items-center gap-2">
                <Switch
                  checked={masterEnabled}
                  onCheckedChange={(checked) => windowMutation.mutate({ enabled: checked })}
                  disabled={windowMutation.isPending}
                  data-testid="switch-awards-voting"
                />
                <span className="text-sm text-muted-foreground">
                  {masterEnabled ? "Voting open" : "Nominations only"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="awards-closes-at" className="text-sm text-muted-foreground whitespace-nowrap">
                  Voting closes at
                </Label>
                <input
                  id="awards-closes-at"
                  type="datetime-local"
                  className="border rounded-md px-2 py-1.5 text-sm bg-background"
                  value={closesAt != null ? toLocalDatetimeLocalString(closesAt) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) windowMutation.mutate({ closesAt: new Date(v).getTime() });
                  }}
                  disabled={windowMutation.isPending}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => windowMutation.mutate({ closesAt: null })}
                  disabled={closesAt == null || windowMutation.isPending}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm" data-testid="awards-all-league-note">
        <Star className="w-4 h-4 text-amber-500 shrink-0" />
        <span>
          <b>All-League teams are automatic.</b>{" "}
          <span className="text-muted-foreground">
            1st, 2nd and 3rd teams come from regular-season points by position, so there is nothing to vote on.
          </span>
        </span>
      </div>

      {AWARDS.map((a) => (
        <AwardPanel
          key={a.type}
          award={a}
          expanded={openAward === a.type}
          onToggle={() => setOpenAward(openAward === a.type ? null : a.type)}
          leagueId={leagueId}
          season={season}
          userId={userId}
          userRosterId={userRosterId}
          teamName={teamName}
          phase={phase}
          teams={teams}
          nominations={data[a.type].nominations.data ?? []}
          loading={data[a.type].nominations.isLoading}
          ballot={data[a.type].ballot.data ?? null}
          nominationCount={data[a.type].count.data?.count ?? 0}
        />
      ))}
    </section>
  );
}

function AwardPanel({
  award,
  expanded,
  onToggle,
  leagueId,
  season,
  userId,
  userRosterId,
  teamName,
  phase,
  teams,
  nominations,
  loading,
  ballot,
  nominationCount,
}: {
  award: (typeof AWARDS)[number];
  expanded: boolean;
  onToggle: () => void;
  leagueId: string;
  season: string;
  userId?: string;
  userRosterId?: number;
  teamName: string;
  phase: Phase;
  teams: TeamOption[];
  nominations: AwardNomination[];
  loading: boolean;
  ballot: AwardBallot | null;
  nominationCount: number;
}) {
  const SLOT_POINTS = useLeagueRules().awards.ballotPoints;
  const NOMINATION_LIMIT = useLeagueRules().awards.nominationLimit;
  const { toast } = useToast();
  const base = `/api/league/${leagueId}/awards/${season}/${award.type}`;
  const [picks, setPicks] = useState<(string | null)[] | null>(null);
  const [nominateOpen, setNominateOpen] = useState(false);

  const saved: (string | null)[] = ballot
    ? [ballot.firstPlaceId, ballot.secondPlaceId, ballot.thirdPlaceId]
    : [null, null, null];
  const current = picks ?? saved;
  const complete = current.every((p) => p != null);
  const dirty = picks != null && picks.some((p, i) => p !== saved[i]);

  // Alphabetical so nominee order never hints at who is leading.
  const sorted = useMemo(
    () => [...nominations].sort((a, b) => a.playerName.localeCompare(b.playerName)),
    [nominations],
  );
  const byId = useMemo(() => new Map(nominations.map((n) => [n.id, n])), [nominations]);

  const votingOpen = phase === "open";
  const canNominate = phase === "nominate" && !!userRosterId && nominationCount < NOMINATION_LIMIT;

  const setRank = (nomId: string, slot: number) => {
    if (!votingOpen) return;
    const next = [...current];
    const existing = next.indexOf(nomId);
    if (existing === slot) {
      next[slot] = null;
    } else {
      if (existing >= 0) next[existing] = null;
      next[slot] = nomId;
    }
    setPicks(next);
  };

  const submitMutation = useMutation({
    mutationFn: () =>
      postJson(`${base}/ballot`, {
        rosterId: userRosterId,
        voterName: teamName,
        firstPlaceId: current[0],
        secondPlaceId: current[1],
        thirdPlaceId: current[2],
      }),
    onSuccess: () => {
      setPicks(null);
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "awards", season, award.type, "my-ballot", userRosterId] });
      toast({ title: "Ballot submitted", description: `${award.label} ballot saved.` });
    },
    onError: (e: Error) => toast({ title: "Could not submit ballot", description: e.message, variant: "destructive" }),
  });

  const nominateMutation = useMutation({
    mutationFn: (n: { playerId: string; playerName: string; playerPosition: string; playerTeam: string | null }) =>
      postJson(`${base}/nominate`, {
        ...n,
        nominatedBy: userId || "guest",
        nominatedByName: teamName,
        nominatedByRosterId: userRosterId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "awards", season, award.type, "nominee-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "awards", season, award.type, "my-nomination-count", userRosterId] });
      setNominateOpen(false);
      toast({ title: "Nomination submitted" });
    },
    onError: (e: Error) => toast({ title: "Could not nominate", description: e.message, variant: "destructive" }),
  });

  const statusBadge = ballot ? (
    <Badge className="bg-primary/15 text-primary border-primary/30">Submitted</Badge>
  ) : phase === "open" ? (
    <Badge variant="outline" className="text-amber-500 border-amber-500/40">Not submitted</Badge>
  ) : phase === "nominate" ? (
    <Badge variant="outline">{nominations.length} nominated</Badge>
  ) : (
    <Badge variant="secondary">Closed</Badge>
  );

  return (
    <Card className={expanded ? "border-primary/60" : ""} data-testid={`card-award-${award.type}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left"
        aria-expanded={expanded}
        data-testid={`button-award-toggle-${award.type}`}
      >
        <span className="font-heading text-lg font-semibold">{award.label}</span>
        {statusBadge}
        <span className="text-xs text-muted-foreground hidden sm:inline">{award.desc}</span>
        <span className="ml-auto text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>

      {expanded && (
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Your ballot · 3-2-1 points
            </p>
            {SLOT_LABELS.map((label, i) => {
              const nom = current[i] ? byId.get(current[i]!) : undefined;
              return (
                <div
                  key={label}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${nom ? "border border-primary bg-primary/10" : "border border-dashed text-muted-foreground"}`}
                  data-testid={`ballot-slot-${award.type}-${i + 1}`}
                >
                  <span className={`w-6 font-bold ${nom ? "text-primary" : ""}`}>{i + 1}</span>
                  {nom ? (
                    <>
                      <NomineeAvatar nom={nom} award={award.type} size="sm" />
                      <span className="text-sm font-semibold truncate">{nom.playerName}</span>
                    </>
                  ) : (
                    <span className="text-sm">Pick your {label} choice</span>
                  )}
                  <span className="ml-auto text-[11px]">{SLOT_POINTS[i]} pts</span>
                </div>
              );
            })}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Your nominations</span>
              <span className="flex gap-1">
                {Array.from({ length: NOMINATION_LIMIT }).map((_, i) => (
                  <span key={i} className={`h-1.5 w-5 rounded ${i < nominationCount ? "bg-primary" : "bg-muted"}`} />
                ))}
              </span>
              <span className="font-bold text-foreground">{nominationCount} of {NOMINATION_LIMIT}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={!votingOpen || !complete || (!dirty && !!ballot) || submitMutation.isPending || !userRosterId}
                data-testid={`button-submit-ballot-${award.type}`}
              >
                <Vote className="w-4 h-4 mr-2" />
                {submitMutation.isPending ? "Submitting..." : ballot ? "Update ballot" : "Submit ballot"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setNominateOpen(true)}
                disabled={!canNominate}
                data-testid={`button-nominate-${award.type}`}
              >
                <Plus className="w-4 h-4 mr-2" />
                Nominate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {phase === "nominate"
                ? "Nominations are open. Ballots open when voting starts."
                : phase === "open"
                  ? nominations.length < 3
                    ? "Voting needs at least 3 nominees."
                    : "Tap 1, 2 or 3 next to a nominee. You can change your ballot until voting closes."
                  : "Voting is closed."}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nominees</p>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No nominees yet. {phase === "nominate" ? `Nominate a ${award.noun} to get started.` : ""}
              </p>
            ) : (
              sorted.map((n) => {
                const slot = current.indexOf(n.id);
                return (
                  <div
                    key={n.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${slot >= 0 ? "border-primary bg-primary/10" : "border-transparent bg-muted/40"}`}
                    data-testid={`nominee-${award.type}-${n.id}`}
                  >
                    <NomineeAvatar nom={n} award={award.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">
                        {n.playerName}
                        {n.nominatedByRosterId === userRosterId && (
                          <span className="ml-2 text-[9px] font-bold text-primary">YOU NOMINATED</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {award.type === "gm" ? "Team" : `${n.playerPosition}${n.playerTeam ? ` · ${n.playerTeam}` : ""}`}
                        {" · "}Nominated by {n.nominatedByName}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {[0, 1, 2].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setRank(n.id, s)}
                          disabled={!votingOpen}
                          aria-label={`Rank ${n.playerName} ${SLOT_LABELS[s]}`}
                          aria-pressed={slot === s}
                          className={`h-8 w-8 rounded-md text-xs font-bold transition-colors disabled:opacity-40 ${
                            slot === s ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-muted"
                          }`}
                          data-testid={`button-rank-${award.type}-${n.id}-${s + 1}`}
                        >
                          {s + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      )}

      <NominateDialog
        open={nominateOpen}
        onOpenChange={setNominateOpen}
        award={award}
        teams={teams}
        existingIds={new Set(nominations.map((n) => n.playerId))}
        pending={nominateMutation.isPending}
        onPick={(n) => nominateMutation.mutate(n)}
      />
    </Card>
  );
}

function NomineeAvatar({ nom, award, size }: { nom: AwardNomination; award: AwardType; size?: "sm" }) {
  const cls = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  if (award === "gm") {
    return (
      <Avatar className={cls}>
        <AvatarFallback className="text-[10px] bg-muted">{initials(nom.playerName)}</AvatarFallback>
      </Avatar>
    );
  }
  return (
    <Avatar className={cls}>
      <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${nom.playerId}.jpg`} alt={nom.playerName} />
      <AvatarFallback className={`text-[10px] ${positionColors[nom.playerPosition] || "bg-muted"}`}>
        {nom.playerPosition || initials(nom.playerName)}
      </AvatarFallback>
    </Avatar>
  );
}

function NominateDialog({
  open,
  onOpenChange,
  award,
  teams,
  existingIds,
  pending,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  award: (typeof AWARDS)[number];
  teams: TeamOption[];
  existingIds: Set<string>;
  pending: boolean;
  onPick: (n: { playerId: string; playerName: string; playerPosition: string; playerTeam: string | null }) => void;
}) {
  const NOMINATION_LIMIT = useLeagueRules().awards.nominationLimit;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<{ playerId: string; playerName: string; playerPosition: string; playerTeam: string | null } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelected(null);
    }
  }, [open]);

  const isGm = award.type === "gm";
  const { data: players, isLoading } = useQuery<SearchPlayer[]>({
    queryKey: ["/api/sleeper/players/search", debounced, award.type],
    queryFn: async () => {
      const rookies = award.type === "roy" ? "&rookies=true" : "";
      const res = await fetch(`/api/sleeper/players/search?q=${encodeURIComponent(debounced)}${rookies}`);
      if (!res.ok) throw new Error("Failed to search players");
      return res.json();
    },
    enabled: open && !isGm && debounced.length >= 2,
  });

  const teamRows = teams.filter(
    (t) => !existingIds.has(String(t.rosterId)) && t.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nominate for {award.label}</DialogTitle>
          <DialogDescription>
            {isGm ? "Pick a team to nominate." : `Search for a ${award.noun} to nominate.`} You can nominate up to {NOMINATION_LIMIT} per award.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            placeholder={isGm ? "Filter teams..." : "Search players..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid={`input-nominate-search-${award.type}`}
          />
          <ScrollArea className="h-64">
            {isGm ? (
              <div className="space-y-2">
                {teamRows.map((t) => {
                  const pick = { playerId: String(t.rosterId), playerName: t.name, playerPosition: "GM", playerTeam: null };
                  return (
                    <button
                      key={t.rosterId}
                      type="button"
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${selected?.playerId === pick.playerId ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                      onClick={() => setSelected(pick)}
                    >
                      <span className="font-medium">{t.name}</span>
                    </button>
                  );
                })}
                {teamRows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No teams to show.</p>}
              </div>
            ) : isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (players ?? []).length > 0 ? (
              <div className="space-y-2">
                {(players ?? []).map((p) => {
                  const pick = { playerId: p.id, playerName: p.name, playerPosition: p.position, playerTeam: p.team };
                  const already = existingIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={already}
                      className={`w-full rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${selected?.playerId === p.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                      onClick={() => setSelected(pick)}
                    >
                      <div className="flex items-center gap-3">
                        <Badge className={positionColors[p.position] || "bg-gray-500"}>{p.position}</Badge>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {p.team || "FA"}
                            {p.yearsExp !== undefined && ` · ${p.yearsExp === 0 ? "Rookie" : `${p.yearsExp} yrs`}`}
                            {already && " · already nominated"}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {debounced.length >= 2 ? "No players found" : "Type at least 2 characters to search"}
              </p>
            )}
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button onClick={() => selected && onPick(selected)} disabled={!selected || pending}>
            {pending ? "Submitting..." : "Submit nomination"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
