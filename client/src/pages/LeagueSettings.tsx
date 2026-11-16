// League Settings (mockup option B): tabs by topic. Commissioners edit next season's rules; each field shows
// the value in effect now. The site admin can also change this season's rules, with a reason.
// The server checks every save (commissioner PIN, or admin passcode for this season).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import SetupCodeDialog from "@/components/SetupCodeDialog";
import { useSleeper } from "@/lib/sleeper-context";
import { useIsCommissioner } from "@/lib/commissioner";
import { leagueRulesKey, useLeagueRulesData } from "@/lib/leagueRules";
import { cn } from "@/lib/utils";
import { changedRuleKeys, type LeagueRules } from "@shared/leagueRules";

// ─── Rule fields ───────────────────────────────────────────────────────────────

type Kind = "money" | "int" | "percent" | "bool";
interface FieldDef {
  path: string[];
  label: string;
  kind: Kind;
  help?: string;
  suffix?: string;
}

const getAt = (obj: any, path: string[]) => path.reduce((o, k) => (o == null ? o : o[k]), obj);
function setAt<T>(obj: T, path: string[], value: unknown): T {
  const copy: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) };
  if (path.length === 1) copy[path[0]] = value;
  else copy[path[0]] = setAt(copy[path[0]] ?? {}, path.slice(1), value);
  return copy;
}

function display(kind: Kind, v: unknown): string {
  if (v == null) return "—";
  if (kind === "bool") return v ? "On" : "Off";
  if (kind === "money") return `$${Number(v)}M`;
  if (kind === "percent") return `${Math.round(Number(v) * 100)}%`;
  return String(v);
}

const CONTRACT_FIELDS: FieldDef[] = [
  { path: ["salaryCap"], label: "Salary cap", kind: "money", suffix: "$M" },
  { path: ["maxContractYears"], label: "Max contract length", kind: "int", suffix: "seasons", help: "Counting the current season" },
  { path: ["rookieContractYears"], label: "Rookie contract length", kind: "int", suffix: "seasons" },
  { path: ["contractDeadlineWeek"], label: "Tag, extension and trade deadline", kind: "int", suffix: "NFL week", help: "The window closes once this week is complete" },
  { path: ["rfaEnabled"], label: "Restricted free agency", kind: "bool", help: "Adds the RFA match windows to the offseason" },
  { path: ["inSeasonPickup", "years"], label: "In-season pickup contract length", kind: "int", suffix: "years" },
  { path: ["inSeasonPickup", "salary"], label: "In-season pickup salary", kind: "money", suffix: "$M" },
];
const ROOKIE_SCALE_FIELDS: FieldDef[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ path: ["rookieScale", "round1BySlot", String(i + 1)], label: `1.${String(i + 1).padStart(2, "0")}`, kind: "money" as Kind })),
  { path: ["rookieScale", "round1Default"], label: "Round 1, later picks", kind: "money" },
  { path: ["rookieScale", "round2"], label: "Round 2", kind: "money" },
  { path: ["rookieScale", "round3"], label: "Round 3", kind: "money" },
];
const TAG_EXTENSION_FIELDS: FieldDef[] = [
  { path: ["franchiseTag", "topSalaries"], label: "Tag price: average of the top", kind: "int", suffix: "salaries", help: "Non-rookie salaries at the position, rounded up to $0.1M" },
  { path: ["franchiseTag", "perTeamPerSeason"], label: "Tags per team per season", kind: "int" },
  { path: ["extensions", "multipliers", "1"], label: "1-year extension price", kind: "percent", suffix: "% of base" },
  { path: ["extensions", "multipliers", "2"], label: "2-year extension price", kind: "percent", suffix: "% of base" },
  { path: ["extensions", "multipliers", "3"], label: "3-year extension price", kind: "percent", suffix: "% of base" },
  { path: ["extensions", "multipliers", "4"], label: "4-year extension price", kind: "percent", suffix: "% of base" },
  { path: ["extensions", "minSalary"], label: "Minimum extension salary", kind: "money", suffix: "$M" },
  { path: ["extensions", "rookiePerSeason"], label: "Rookie extensions per team per season", kind: "int" },
  { path: ["extensions", "rookieFourYearPerSeason"], label: "Of those, 4-year rookie extensions", kind: "int" },
  { path: ["extensions", "nonRookiePerSeason"], label: "Non-rookie extensions per team per season", kind: "int" },
];
const LIMIT_FIELDS: FieldDef[] = [
  { path: ["contractLengthLimits", "twoYear"], label: "Contracts with 2 years left", kind: "int", suffix: "max per team" },
  { path: ["contractLengthLimits", "threeYear"], label: "Contracts with 3 years left", kind: "int", suffix: "max per team" },
  { path: ["contractLengthLimits", "fourPlusYear"], label: "Contracts with 4+ years left", kind: "int", suffix: "max per team", help: "Rookie contracts don't count. Bids can go over; teams must be within the limits to confirm their wins." },
];
const DEAD_CAP_FIELDS: FieldDef[] = [
  { path: ["deadCap", "shareByYearsLeft", "1"], label: "Later season with 1 year left", kind: "percent", suffix: "% dead" },
  { path: ["deadCap", "shareByYearsLeft", "2"], label: "2 years left", kind: "percent", suffix: "% dead" },
  { path: ["deadCap", "shareByYearsLeft", "3"], label: "3 years left", kind: "percent", suffix: "% dead" },
  { path: ["deadCap", "shareByYearsLeft", "4"], label: "4 years left", kind: "percent", suffix: "% dead" },
  { path: ["deadCap", "shareByYearsLeft", "5plus"], label: "5 or more years left", kind: "percent", suffix: "% dead" },
];
const AWARD_FIELDS: FieldDef[] = [
  { path: ["awards", "nominationLimit"], label: "Nominations per team per award", kind: "int" },
  { path: ["awards", "ballotPoints", "0"], label: "Ballot points for 1st", kind: "int" },
  { path: ["awards", "ballotPoints", "1"], label: "Ballot points for 2nd", kind: "int" },
  { path: ["awards", "ballotPoints", "2"], label: "Ballot points for 3rd", kind: "int" },
  { path: ["awards", "allLeagueTeams"], label: "All-League teams", kind: "int", help: "Up to 3" },
  { path: ["awards", "resultTeamCount"], label: "Teams shown in award results", kind: "int" },
  { path: ["awards", "allLeagueStartYear"], label: "All-League awards start in", kind: "int", suffix: "season" },
];

function RuleField({ def, draft, base, onChange, readOnly }: {
  def: FieldDef;
  draft: LeagueRules;
  base: LeagueRules;
  onChange: (path: string[], value: unknown) => void;
  readOnly: boolean;
}) {
  const value = getAt(draft, def.path);
  const now = getAt(base, def.path);
  const changed = JSON.stringify(value) !== JSON.stringify(now);
  const id = `rule-${def.path.join("-")}`;
  return (
    <div className={cn("rounded-md border p-3", changed && "border-primary/60 bg-primary/5")}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">{def.label}</Label>
      <div className="mt-1 flex items-center gap-2">
        {def.kind === "bool" ? (
          <Switch id={id} checked={!!value} onCheckedChange={(v) => onChange(def.path, v)} disabled={readOnly} />
        ) : (
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            step={def.kind === "money" ? 0.5 : 1}
            value={def.kind === "percent" ? Math.round(Number(value) * 100) : value ?? ""}
            onChange={(e) => {
              const n = e.target.value === "" ? NaN : Number(e.target.value);
              onChange(def.path, def.kind === "percent" ? n / 100 : n);
            }}
            disabled={readOnly}
            className="h-8 w-28"
          />
        )}
        {def.suffix && <span className="text-xs text-muted-foreground">{def.suffix}</span>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Now: <span className={changed ? "font-medium text-primary" : undefined}>{display(def.kind, now)}</span>
        {def.help ? ` · ${def.help}` : ""}
      </p>
    </div>
  );
}

function FieldGrid({ defs, ...rest }: { defs: FieldDef[] } & Omit<Parameters<typeof RuleField>[0], "def">) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {defs.map((d) => <RuleField key={d.path.join(".")} def={d} {...rest} />)}
    </div>
  );
}

// ─── League access tab ─────────────────────────────────────────────────────────

interface SettingsResponse {
  contractsEnabled: boolean;
  inviteCode: string | null;
  leaguePinSet: boolean;
  commissioners: Array<{ sleeperUserId: string; role: "owner" | "co"; pinState: string }>;
}

async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function LeagueAccessTab({ slug }: { slug: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { league, user } = useSleeper();
  const settingsKey = ["/api/registry/leagues", slug, "settings"];
  const { data, error, refetch } = useQuery<SettingsResponse>({ queryKey: settingsKey, queryFn: () => send("GET", `/api/registry/leagues/${slug}/settings`) });
  const { data: users } = useQuery<Array<{ user_id: string; display_name: string; metadata?: { team_name?: string } }>>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "users"],
    queryFn: () => send("GET", `/api/sleeper/league/${league?.leagueId}/users`),
    enabled: !!league?.leagueId,
  });
  const [inviteCode, setInviteCode] = useState("");
  const [leaguePin, setLeaguePin] = useState("");
  const [newCo, setNewCo] = useState("");
  const [setupCode, setSetupCode] = useState<{ code: string; who: string } | null>(null);
  const [pin, setPin] = useState({ current: "", next: "", again: "" });

  useEffect(() => { if (data) setInviteCode(data.inviteCode ?? ""); }, [data?.inviteCode]);

  const nameOf = (id: string) => users?.find((u) => u.user_id === id)?.display_name ?? id;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast({ title: done });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/registry/leagues"] });
    } catch (e: any) {
      toast({ title: "Not saved", description: e.message, variant: "destructive" });
    }
  };

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const candidates = (users ?? []).filter((u) => !data.commissioners.some((c) => c.sleeperUserId === u.user_id));

  return (
    <div className="flex flex-col gap-4">
      <Section title="Contracts" description="Off hides contracts, cap, extensions, tags, dead cap and free agency bidding for this league. Nothing is deleted.">
        <div className="flex items-center justify-between">
          <span className="text-sm">{data.contractsEnabled ? "Contracts are on" : "Contracts are off"}</span>
          <Switch
            checked={data.contractsEnabled}
            onCheckedChange={(v) => {
              if (!v && !confirm("Turn contracts off? Contract pages and widgets disappear for everyone in this league until you turn them back on. No data is deleted.")) return;
              run(() => send("PATCH", `/api/registry/leagues/${slug}/settings`, { contractsEnabled: v }), v ? "Contracts turned on" : "Contracts turned off");
            }}
            aria-label="Contracts"
            data-testid="switch-contracts"
          />
        </div>
      </Section>

      <Section title="Invite code" description="People join the league by entering this code. 6 to 32 letters and digits; capital letters don't matter.">
        <div className="flex flex-wrap gap-2">
          <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="Not set" className="w-56 font-mono" aria-label="Invite code" />
          <Button variant="outline" onClick={() => run(() => send("PATCH", `/api/registry/leagues/${slug}/settings`, { inviteCode: inviteCode || null }), "Invite code saved")}>Save</Button>
        </div>
      </Section>

      <Section title="League PIN" description="Optional. Asked once when a device first joins the league. 4 to 8 digits.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{data.leaguePinSet ? "Set" : "Not set"}</span>
          <Input type="password" inputMode="numeric" pattern="[0-9]*" value={leaguePin} onChange={(e) => setLeaguePin(e.target.value.replace(/\D/g, ""))} placeholder="New PIN" className="w-32" aria-label="New league PIN" autoComplete="off" />
          <Button variant="outline" onClick={() => run(() => send("PATCH", `/api/registry/leagues/${slug}/settings`, { leaguePin }), "League PIN saved").then(() => setLeaguePin(""))}>Save</Button>
          {data.leaguePinSet && <Button variant="ghost" onClick={() => run(() => send("PATCH", `/api/registry/leagues/${slug}/settings`, { leaguePin: null }), "League PIN cleared")}>Clear</Button>}
        </div>
      </Section>

      <Section title="Commissioners" description="Each commissioner has their own PIN for this league. New co-commissioners set theirs with a one-time setup code.">
        {data.commissioners.map((c) => (
          <div key={c.sleeperUserId} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>{nameOf(c.sleeperUserId)} <span className="text-muted-foreground">· {c.role === "owner" ? "Owner" : "Co-commissioner"}{c.pinState !== "set" ? " · PIN not set yet" : ""}</span></span>
            {c.role === "co" && (
              <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Remove ${nameOf(c.sleeperUserId)} as co-commissioner?`)) run(() => send("DELETE", `/api/registry/leagues/${slug}/commissioners/${c.sleeperUserId}`), "Co-commissioner removed"); }}>Remove</Button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Select value={newCo} onValueChange={setNewCo}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Add a co-commissioner" /></SelectTrigger>
            <SelectContent>
              {candidates.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.display_name}{u.metadata?.team_name ? ` · ${u.metadata.team_name}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={!newCo}
            onClick={() => run(async () => {
              const r = await send("POST", `/api/registry/leagues/${slug}/commissioners`, { sleeperUserId: newCo });
              setSetupCode({ code: r.setupCode, who: nameOf(newCo) });
              setNewCo("");
            }, "Co-commissioner added")}
          >
            Add
          </Button>
        </div>
      </Section>

      <Section title="Your commissioner PIN" description={`Change the PIN you use in ${league?.name ?? "this league"}. Other browsers unlocked with the old PIN are locked out.`}>
        <div className="flex flex-wrap gap-2">
          {(["current", "next", "again"] as const).map((k) => (
            <Input
              key={k}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder={k === "current" ? "Current PIN" : k === "next" ? "New PIN" : "New PIN again"}
              value={pin[k]}
              onChange={(e) => setPin((p) => ({ ...p, [k]: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
              className="w-36"
              aria-label={k === "current" ? "Current PIN" : k === "next" ? "New PIN" : "Confirm new PIN"}
            />
          ))}
          <Button
            variant="outline"
            disabled={!user?.userId}
            onClick={() => {
              if (pin.next !== pin.again) return toast({ title: "The new PINs don't match", variant: "destructive" });
              run(() => send("POST", `/api/registry/leagues/${slug}/commissioner/pin`, { currentPin: pin.current, newPin: pin.next }), "PIN changed").then(() => setPin({ current: "", next: "", again: "" }));
            }}
          >
            Change PIN
          </Button>
        </div>
      </Section>
      <SetupCodeDialog code={setupCode?.code ?? null} who={setupCode?.who ?? ""} onClose={() => setSetupCode(null)} />
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LeagueSettings() {
  const { leagueSlug } = useSleeper();
  const isCommissioner = useIsCommissioner();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error } = useLeagueRulesData();
  const [mode, setMode] = useState<"next" | "current">("next");
  const [draft, setDraft] = useState<LeagueRules | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // The rules being edited: next season's, or (site admin) this season's.
  const source = data ? (mode === "next" ? data.next.rules : data.current.rules) : null;
  useEffect(() => { if (source) setDraft(source); }, [source, mode]);

  const unsaved = useMemo(
    () => (draft && source ? changedRuleKeys(source, draft).filter((k) => k !== "phases") : []),
    [draft, source],
  );

  if (isLoading || !data || !draft) {
    return <div className="p-6 text-sm text-muted-foreground">{error ? (error as Error).message : "Loading…"}</div>;
  }
  const readOnly = !isCommissioner;
  const onChange = (path: string[], value: unknown) => setDraft((d) => (d ? setAt(d, path, value) : d));
  const shared = { draft, base: data.current.rules, onChange, readOnly };

  const save = async () => {
    setBusy(true);
    try {
      const url = `/api/registry/leagues/${leagueSlug}/rules/${mode}`;
      await send("PUT", url, mode === "current" ? { rules: draft, reason } : { rules: draft });
      await queryClient.invalidateQueries({ queryKey: leagueRulesKey(leagueSlug) });
      toast({ title: mode === "next" ? `Saved for ${data.nextSeason}` : `${data.currentSeason} rules changed` });
      setReason("");
    } catch (e: any) {
      toast({ title: "Not saved", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const discardSaved = async () => {
    if (!confirm(`Discard the rules saved for ${data.nextSeason}? Next season goes back to this season's rules.`)) return;
    try {
      await send("DELETE", `/api/registry/leagues/${leagueSlug}/rules/next`);
      await queryClient.invalidateQueries({ queryKey: leagueRulesKey(leagueSlug) });
      toast({ title: "Saved changes discarded" });
    } catch (e: any) {
      toast({ title: "Not discarded", description: e.message, variant: "destructive" });
    }
  };

  const ruleTabs = (
    <>
      <TabsContent value="contracts" className="flex flex-col gap-4">
        <FieldGrid defs={CONTRACT_FIELDS} {...shared} />
        <div>
          <p className="mb-2 text-sm font-medium">Rookie pay scale</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {ROOKIE_SCALE_FIELDS.map((d) => <RuleField key={d.path.join(".")} def={d} {...shared} />)}
          </div>
        </div>
      </TabsContent>
      <TabsContent value="extensions"><FieldGrid defs={TAG_EXTENSION_FIELDS} {...shared} /></TabsContent>
      <TabsContent value="limits" className="flex flex-col gap-4">
        <FieldGrid defs={LIMIT_FIELDS} {...shared} />
        <div>
          <p className="mb-1 text-sm font-medium">Dead cap</p>
          <p className="mb-2 text-xs text-muted-foreground">When a contract ends early, the current season is always 100% dead. Each later season costs this share of its salary, by contract years left from that season.</p>
          <FieldGrid defs={DEAD_CAP_FIELDS} {...shared} />
        </div>
      </TabsContent>
      <TabsContent value="awards"><FieldGrid defs={AWARD_FIELDS} {...shared} /></TabsContent>
    </>
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><SlidersHorizontal className="h-6 w-6 text-primary" />League Settings</h1>
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? "This league's rules. Only commissioners can change them."
              : mode === "next"
                ? `Editing ${data.nextSeason} rules · they take effect at rollover. ${data.currentSeason} keeps the rules it started with.`
                : `Changing ${data.currentSeason} rules now · site admin only, with a reason.`}
          </p>
        </div>
        {!readOnly && (
          <Select value={mode} onValueChange={(v) => setMode(v as "next" | "current")}>
            <SelectTrigger className="w-60" aria-label="Season to edit"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="next">{data.nextSeason} rules (next season)</SelectItem>
              <SelectItem value="current">{data.currentSeason} rules (this season, site admin)</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {data.emergencies.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-3 text-sm">
            <p className="font-medium">{data.currentSeason} rules were changed mid-season</p>
            {data.emergencies.map((e) => (
              <p key={e.at} className="text-muted-foreground">{new Date(e.at).toLocaleDateString()}: {e.reason} ({e.changed.join(", ")})</p>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="contracts">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="contracts">Contracts</TabsTrigger>
            <TabsTrigger value="extensions">Extensions and tags</TabsTrigger>
            <TabsTrigger value="limits">Dead cap and limits</TabsTrigger>
            <TabsTrigger value="awards">Awards</TabsTrigger>
            {!readOnly && <TabsTrigger value="access">League access</TabsTrigger>}
          </TabsList>
          {!readOnly && (
            <div className="flex items-center gap-2">
              {unsaved.length > 0 && (
                <span className="rounded-md bg-amber-500/15 px-2 py-1 text-xs text-amber-600 dark:text-amber-400" data-testid="text-unsaved-count">
                  {unsaved.length} unsaved {unsaved.length === 1 ? "change" : "changes"}
                </span>
              )}
              {mode === "next" && data.next.saved && unsaved.length === 0 && (
                <Button variant="ghost" size="sm" onClick={discardSaved}>Discard saved {data.nextSeason} rules</Button>
              )}
              {unsaved.length > 0 && <Button variant="outline" size="sm" onClick={() => setDraft(source)}>Reset</Button>}
              <Button size="sm" onClick={save} disabled={busy || unsaved.length === 0 || (mode === "current" && reason.trim().length < 5)} data-testid="button-save-rules">
                {mode === "next" ? `Save for ${data.nextSeason}` : `Change ${data.currentSeason} now`}
              </Button>
            </div>
          )}
        </div>
        {mode === "current" && !readOnly && (
          <div className="mt-3">
            <Label htmlFor="emergency-reason" className="text-xs text-muted-foreground">Reason (shown to the league on this page)</Label>
            <Textarea id="emergency-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this season's rules have to change now" className="mt-1" rows={2} />
          </div>
        )}
        <div className="mt-4">
          {ruleTabs}
          {!readOnly && <TabsContent value="access"><LeagueAccessTab slug={leagueSlug} /></TabsContent>}
        </div>
      </Tabs>
    </div>
  );
}
