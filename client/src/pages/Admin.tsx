// Site admin page (/admin), mockup option C: tabs for Leagues, Commissioners and PINs, Audit log, Passcode.
// Everything here needs the admin passcode. The server checks it on every call; this page only asks for it.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Copy, KeyRound, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UnlockDialog from "@/components/UnlockDialog";
import SetupCodeDialog from "@/components/SetupCodeDialog";
import { queryClient } from "@/lib/queryClient";
import { requestUnlock } from "@/lib/unlock";
import { getLastLeagueSlug, setLeagueSlug, LEGACY_LEAGUE_SLUG } from "@/lib/league-address";
import { cn } from "@/lib/utils";

// ─── Types (match server/routes/adminLeagues.ts) ───────────────────────────────

interface AdminCommissioner {
  id: string;
  sleeperUserId: string;
  role: "owner" | "co";
  pinState: "none" | "set" | "setup_pending";
  pinSetAt: number | null;
  addedAt: number;
}
interface AdminLeague {
  id: string;
  name: string;
  slug: string;
  inviteCode: string | null;
  contractsEnabled: boolean;
  leaguePinSet: boolean;
  status: "active" | "archived";
  createdAt: number;
  seasons: Array<{ season: string; sleeperLeagueId: string; previousSleeperLeagueId: string | null; status: "current" | "past" }>;
  commissioners: AdminCommissioner[];
}
interface AuditEntry {
  id: string;
  leagueId: string | null;
  actorSleeperUserId: string | null;
  actorRole: "admin" | "commissioner" | "system";
  action: string;
  details: Record<string, unknown> | null;
  createdAt: number;
}
interface SleeperUser { user_id: string; display_name: string; metadata?: { team_name?: string } }
interface Preview {
  name: string;
  seasons: Array<{ season: string; sleeperLeagueId: string; previousSleeperLeagueId: string | null; status: string }>;
  stoppedEarly: boolean;
  alreadyRegistered: Array<{ season: string; sleeperLeagueId: string; leagueId: string }>;
  sleeperOwnerId: string | null;
  users: Array<{ sleeperUserId: string; displayName: string; teamName: string | null }>;
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data as T;
}

const refreshAdmin = () => queryClient.invalidateQueries({ queryKey: ["/api/admin"] });

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function formatDate(ms: number | null) {
  return ms ? new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null;
}

const PIN_LABEL: Record<AdminCommissioner["pinState"], { text: string; tone: string }> = {
  set: { text: "PIN set", tone: "bg-primary/15 text-primary" },
  setup_pending: { text: "Setup code issued", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  none: { text: "No PIN", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
};

function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs", className)}>{children}</span>;
}

// ─── Leagues tab ───────────────────────────────────────────────────────────────

function AddLeagueDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (code: string, who: string) => void }) {
  const [sleeperId, setSleeperId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [contractsEnabled, setContractsEnabled] = useState(false);
  const [commissionerId, setCommissionerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setSleeperId(""); setPreview(null); setName(""); setSlug(""); setInviteCode("");
    setContractsEnabled(false); setCommissionerId(""); setError(null); setBusy(false);
  };
  const close = () => { reset(); onClose(); };

  const check = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6,25}$/.test(sleeperId.trim())) return setError("Enter a Sleeper league ID (digits only).");
    setBusy(true);
    try {
      const p = await api<Preview>("POST", "/api/admin/leagues/preview", { sleeperLeagueId: sleeperId.trim() });
      setPreview(p);
      setName(p.name);
      setSlug(slugify(p.name));
      setCommissionerId(p.users.some((u) => u.sleeperUserId === p.sleeperOwnerId) ? p.sleeperOwnerId! : "");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter a league name.");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return setError("The address can use lower-case letters, digits and single hyphens.");
    if (inviteCode && !/^[A-Za-z0-9]{6,32}$/.test(inviteCode)) return setError("Invite codes are 6 to 32 letters and digits.");
    if (!commissionerId) return setError("Pick the commissioner.");
    setBusy(true);
    try {
      const result = await api<{ setupCode: string }>("POST", "/api/admin/leagues", {
        sleeperLeagueId: sleeperId.trim(),
        name: name.trim(),
        slug,
        inviteCode: inviteCode || null,
        contractsEnabled,
        commissionerSleeperUserId: commissionerId,
      });
      const who = preview?.users.find((u) => u.sleeperUserId === commissionerId)?.displayName ?? "the commissioner";
      refreshAdmin();
      close();
      onCreated(result.setupCode, who);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const blocked = !!preview && preview.alreadyRegistered.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a league</DialogTitle>
          <DialogDescription>Enter the league's current Sleeper league ID. Earlier seasons are found through Sleeper's previous-season links.</DialogDescription>
        </DialogHeader>
        {!preview ? (
          <form onSubmit={check} className="flex flex-col gap-3">
            <Label htmlFor="add-sleeper-id">Sleeper league ID</Label>
            <Input id="add-sleeper-id" value={sleeperId} onChange={(e) => setSleeperId(e.target.value)} inputMode="numeric" placeholder="1389347703116267520" autoFocus />
            <ErrorLine error={error} />
            <DialogFooter><Button type="submit" disabled={busy}>Check seasons</Button></DialogFooter>
          </form>
        ) : (
          <form onSubmit={create} className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-sm font-medium">Seasons found</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.seasons.map((s, i) => {
                  const taken = preview.alreadyRegistered.some((t) => t.sleeperLeagueId === s.sleeperLeagueId);
                  return (
                    <Pill key={s.sleeperLeagueId} className={taken ? "bg-destructive/10 text-destructive" : i === preview.seasons.length - 1 ? "bg-primary/15 text-primary" : "bg-muted"}>
                      {s.season}{i === preview.seasons.length - 1 ? " current" : ""}{taken ? " · already on the site" : ""}
                    </Pill>
                  );
                })}
              </div>
              {preview.stoppedEarly && <p className="mt-1 text-xs text-muted-foreground">Sleeper's season links stopped early, so older seasons may be missing.</p>}
            </div>
            {blocked ? (
              <ErrorLine error="Some of these seasons already belong to a league on the site, so this league can't be added." />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="add-name">Name</Label>
                    <Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="add-slug">Address</Label>
                    <Input id="add-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
                    <p className="text-xs text-muted-foreground">/l/{slug || "address"}</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="add-invite">Invite code (optional)</Label>
                    <Input id="add-invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="ATLDYNASTY" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Commissioner</Label>
                    <Select value={commissionerId} onValueChange={setCommissionerId}>
                      <SelectTrigger><SelectValue placeholder="Pick a member" /></SelectTrigger>
                      <SelectContent>
                        {preview.users.map((u) => (
                          <SelectItem key={u.sleeperUserId} value={u.sleeperUserId}>
                            {u.displayName}{u.teamName ? ` · ${u.teamName}` : ""}{u.sleeperUserId === preview.sleeperOwnerId ? " (Sleeper owner)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Contracts</p>
                    <p className="text-xs text-muted-foreground">Off hides contracts, cap and free agency bidding for this league.</p>
                  </div>
                  <Switch checked={contractsEnabled} onCheckedChange={setContractsEnabled} aria-label="Contracts" />
                </div>
              </>
            )}
            <ErrorLine error={error} />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { setPreview(null); setError(null); }}>Back</Button>
              {!blocked && <Button type="submit" disabled={busy}>Add league</Button>}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditLeagueDialog({ league, onClose }: { league: AdminLeague | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [contractsEnabled, setContractsEnabled] = useState(false);
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!league) return;
    setName(league.name); setSlug(league.slug); setInviteCode(league.inviteCode ?? "");
    setContractsEnabled(league.contractsEnabled); setArchived(league.status === "archived"); setError(null);
  }, [league]);

  if (!league) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const patch: Record<string, unknown> = {};
    if (name.trim() !== league.name) patch.name = name.trim();
    if (slug !== league.slug) patch.slug = slug;
    if ((inviteCode || null) !== league.inviteCode) patch.inviteCode = inviteCode || null;
    if (contractsEnabled !== league.contractsEnabled) patch.contractsEnabled = contractsEnabled;
    if ((archived ? "archived" : "active") !== league.status) patch.status = archived ? "archived" : "active";
    if (Object.keys(patch).length === 0) return onClose();
    setBusy(true);
    try {
      await api("PATCH", `/api/admin/leagues/${league.id}`, patch);
      refreshAdmin();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resetLeaguePin = async () => {
    if (!confirm(`Clear ${league.name}'s league PIN? Devices joining later won't be asked for one until the commissioner sets a new PIN.`)) return;
    try {
      await api("POST", `/api/admin/leagues/${league.id}/reset-league-pin`);
      refreshAdmin();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {league.name}</DialogTitle>
          <DialogDescription>Changing the address breaks links that use the old one.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-slug">Address</Label>
              <Input id="edit-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-invite">Invite code</Label>
              <Input id="edit-invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="Not set" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>League PIN</Label>
              <div className="flex h-9 items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{league.leaguePinSet ? "Set" : "Not set"}</span>
                {league.leaguePinSet && <Button type="button" variant="outline" size="sm" onClick={resetLeaguePin}>Clear</Button>}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm font-medium">Contracts</span>
            <Switch checked={contractsEnabled} onCheckedChange={setContractsEnabled} aria-label="Contracts" />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Archived</p>
              <p className="text-xs text-muted-foreground">An archived league can't be opened. Its data is kept.</p>
            </div>
            <Switch checked={archived} onCheckedChange={setArchived} aria-label="Archived" />
          </div>
          <ErrorLine error={error} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeaguesTab({ leagues, onSetupCode }: { leagues: AdminLeague[]; onSetupCode: (code: string, who: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AdminLeague | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{leagues.length} {leagues.length === 1 ? "league" : "leagues"} on the site</p>
        <Button onClick={() => setAdding(true)} data-testid="button-add-league"><Plus className="mr-1 h-4 w-4" />Add league</Button>
      </div>
      {leagues.map((l) => (
        <Card key={l.id} data-testid={`card-league-${l.slug}`}>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{l.name}</span>
                <span className="text-sm text-muted-foreground">/l/{l.slug}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(l)}>Edit</Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5 text-sm text-muted-foreground">
                {l.seasons.map((s, i) => (
                  <span key={s.sleeperLeagueId} className={s.status === "current" ? "text-primary" : undefined}>
                    {s.season}{s.status === "current" ? " current" : ""}{i < l.seasons.length - 1 ? " ·" : ""}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {l.status === "archived" && <Pill className="bg-muted">Archived</Pill>}
                <Pill className={l.contractsEnabled ? "bg-primary/15 text-primary" : "bg-muted"}>{l.contractsEnabled ? "Contracts on" : "Contracts off"}</Pill>
                <Pill className={l.inviteCode ? "bg-muted" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}>{l.inviteCode ? "Invite code set" : "No invite code"}</Pill>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <AddLeagueDialog open={adding} onClose={() => setAdding(false)} onCreated={onSetupCode} />
      <EditLeagueDialog league={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

// ─── Commissioners tab ─────────────────────────────────────────────────────────

function useLeagueUsers(league: AdminLeague) {
  const current = league.seasons.find((s) => s.status === "current")?.sleeperLeagueId;
  return useQuery<SleeperUser[]>({
    queryKey: ["/api/sleeper/league", current, "users"],
    queryFn: () => api<SleeperUser[]>("GET", `/api/sleeper/league/${current}/users`),
    enabled: !!current,
    staleTime: 10 * 60 * 1000,
  });
}

function LeagueCommissioners({ league, onSetupCode }: { league: AdminLeague; onSetupCode: (code: string, who: string) => void }) {
  const { data: users } = useLeagueUsers(league);
  const [newUser, setNewUser] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string) => {
    const u = users?.find((x) => x.user_id === id);
    return u ? `${u.display_name}${u.metadata?.team_name ? ` · ${u.metadata.team_name}` : ""}` : id;
  };
  const shortName = (id: string) => users?.find((x) => x.user_id === id)?.display_name ?? id;

  const run = useMutation({
    mutationFn: (fn: () => Promise<void>) => fn(),
    onError: (err: any) => setError(err.message),
    onSuccess: () => { setError(null); refreshAdmin(); },
  });

  const resetPin = (c: AdminCommissioner) => run.mutate(async () => {
    if (!confirm(`Reset ${shortName(c.sleeperUserId)}'s commissioner PIN? Their current PIN stops working right away, and you'll get a setup code to send them.`)) return;
    const r = await api<{ setupCode: string }>("POST", `/api/admin/leagues/${league.id}/commissioners/${c.id}/reset-pin`);
    onSetupCode(r.setupCode, shortName(c.sleeperUserId));
  });
  const remove = (c: AdminCommissioner) => run.mutate(async () => {
    if (!confirm(`Remove ${shortName(c.sleeperUserId)} as a commissioner of ${league.name}?`)) return;
    await api("DELETE", `/api/admin/leagues/${league.id}/commissioners/${c.id}`);
  });
  const add = () => run.mutate(async () => {
    if (!newUser) throw new Error("Pick a member to add.");
    const r = await api<{ setupCode: string }>("POST", `/api/admin/leagues/${league.id}/commissioners`, { sleeperUserId: newUser, role: "co" });
    setNewUser("");
    onSetupCode(r.setupCode, shortName(newUser));
  });

  const candidates = (users ?? []).filter((u) => !league.commissioners.some((c) => c.sleeperUserId === u.user_id));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{league.name}</CardTitle>
        <CardDescription>Each commissioner has their own PIN for this league only.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {league.commissioners.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{nameOf(c.sleeperUserId)}</span>
              <Badge variant="outline">{c.role === "owner" ? "Owner" : "Co-commissioner"}</Badge>
              <Pill className={PIN_LABEL[c.pinState].tone}>{PIN_LABEL[c.pinState].text}</Pill>
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => resetPin(c)} data-testid={`button-reset-pin-${c.sleeperUserId}`}>
                <KeyRound className="mr-1 h-3.5 w-3.5" />{c.pinState === "set" ? "Reset PIN" : "New setup code"}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Remove commissioner" onClick={() => remove(c)} disabled={league.commissioners.length <= 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Select value={newUser} onValueChange={setNewUser}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Add a co-commissioner" /></SelectTrigger>
            <SelectContent>
              {candidates.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>{u.display_name}{u.metadata?.team_name ? ` · ${u.metadata.team_name}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={add} disabled={!newUser || run.isPending}>Add</Button>
        </div>
        <ErrorLine error={error} />
      </CardContent>
    </Card>
  );
}

// ─── Audit log tab ─────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  league_added: "League added",
  league_updated: "League edited",
  league_pin_reset: "League PIN cleared",
  commissioner_added: "Commissioner added",
  commissioner_removed: "Commissioner removed",
  commissioner_pin_reset: "PIN reset",
  commissioner_pin_set: "PIN set",
  commissioner_pin_changed: "PIN changed",
  admin_passcode_set: "Admin passcode set",
  admin_passcode_changed: "Admin passcode changed",
  admin_passcode_recovered: "Admin passcode reset with recovery key",
  season_rolled_over: "Season rolled over",
};

function describeDetails(entry: AuditEntry): string {
  const d = entry.details ?? {};
  if (entry.action === "league_updated") return `Changed ${(d.changed as string[] | undefined)?.join(", ") ?? ""}`;
  if (entry.action === "season_rolled_over") return `${d.fromSeason} to ${d.toSeason}`;
  if (entry.action === "league_added") return `${d.slug} · seasons ${(d.seasons as string[] | undefined)?.join(", ") ?? ""}`;
  if (entry.action.startsWith("contract_")) return [d.summary, d.reason].filter(Boolean).join(" · ");
  return "";
}

function AuditTab({ leagues }: { leagues: AdminLeague[] }) {
  const [leagueId, setLeagueId] = useState("all");
  const { data, isLoading, error } = useQuery<AuditEntry[]>({
    queryKey: ["/api/admin", "audit", leagueId],
    queryFn: () => api<AuditEntry[]>("GET", `/api/admin/audit${leagueId === "all" ? "" : `?leagueId=${encodeURIComponent(leagueId)}`}`),
  });
  const leagueName = (id: string | null) => (id ? leagues.find((l) => l.id === id)?.name ?? "Unknown league" : "Site");
  return (
    <div className="flex flex-col gap-3">
      <Select value={leagueId} onValueChange={setLeagueId}>
        <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All leagues and site actions</SelectItem>
          {leagues.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <ErrorLine error={(error as Error).message} />
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">No entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-normal">When</th><th className="px-3 py-2 font-normal">League</th><th className="px-3 py-2 font-normal">Who</th><th className="px-3 py-2 font-normal">What</th></tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(e.createdAt)}</td>
                  <td className="px-3 py-2">{leagueName(e.leagueId)}</td>
                  <td className="px-3 py-2">{e.actorRole === "admin" ? "Site admin" : e.actorRole === "system" ? "System" : `Commissioner ${e.actorSleeperUserId ?? ""}`}</td>
                  <td className="px-3 py-2">
                    <div>{ACTION_LABELS[e.action] ?? e.action.replace(/_/g, " ")}</div>
                    {describeDetails(e) && <div className="text-xs text-muted-foreground">{describeDetails(e)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Passcode tab ──────────────────────────────────────────────────────────────

function PasscodeTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setSaved(false);
    if (next.length < 10) return setError("The new passcode needs at least 10 characters.");
    if (next !== confirmNext) return setError("The new passcodes don't match.");
    try {
      await api("POST", "/api/admin/passcode", { currentPasscode: current, newPasscode: next });
      setCurrent(""); setNext(""); setConfirmNext(""); setSaved(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <Card className="max-w-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Change admin passcode</CardTitle>
        <CardDescription>Other browsers unlocked with the old passcode are locked out.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-3">
          <Input type="password" placeholder="Current passcode" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" aria-label="Current passcode" />
          <Input type="password" placeholder="New passcode (10+ characters)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" aria-label="New passcode" />
          <Input type="password" placeholder="New passcode again" value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} autoComplete="new-password" aria-label="Confirm new passcode" />
          <ErrorLine error={error} />
          {saved && <p className="text-sm text-primary">Passcode changed</p>}
          <Button type="submit" className="self-start">Change passcode</Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── First-time passcode setup ─────────────────────────────────────────────────

function SetPasscodeCard({ recoveryKeyConfigured, recovering }: { recoveryKeyConfigured: boolean; recovering: boolean }) {
  const [key, setKey] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 10) return setError("The passcode needs at least 10 characters.");
    if (next !== confirmNext) return setError("The passcodes don't match.");
    try {
      await api("POST", "/api/admin/passcode/recover", { recoveryKey: key, newPasscode: next });
      refreshAdmin();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" />{recovering ? "Reset the admin passcode" : "Set the admin passcode"}</CardTitle>
        <CardDescription>
          {recoveryKeyConfigured
            ? "Enter the ADMIN_RECOVERY_KEY from the server's .env file, then choose a passcode."
            : "Add ADMIN_RECOVERY_KEY (24+ characters) to the server's .env file and restart the server first."}
        </CardDescription>
      </CardHeader>
      {recoveryKeyConfigured && (
        <CardContent>
          <form onSubmit={save} className="flex flex-col gap-3">
            <Input type="password" placeholder="Recovery key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" aria-label="Recovery key" />
            <Input type="password" placeholder="New passcode (10+ characters)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" aria-label="New passcode" />
            <Input type="password" placeholder="New passcode again" value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} autoComplete="new-password" aria-label="Confirm new passcode" />
            <ErrorLine error={error} />
            <Button type="submit">Save passcode</Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  // Admin calls aren't for any one league, so they don't send a league address.
  setLeagueSlug(null);
  const backTo = `/l/${getLastLeagueSlug() ?? LEGACY_LEAGUE_SLUG}`;

  const [recovering, setRecovering] = useState(false);
  const [setupCode, setSetupCode] = useState<{ code: string; who: string } | null>(null);

  const status = useQuery<{ passcodeSet: boolean; recoveryKeyConfigured: boolean; unlocked: boolean }>({
    queryKey: ["/api/admin", "status"],
    queryFn: () => api("GET", "/api/admin/status"),
  });
  const unlocked = !!status.data?.unlocked;
  const leagues = useQuery<AdminLeague[]>({
    queryKey: ["/api/admin", "leagues"],
    queryFn: () => api("GET", "/api/admin/leagues"),
    enabled: unlocked,
  });

  const unlock = async () => {
    if (await requestUnlock({ kind: "admin" })) status.refetch();
  };
  // Ask for the passcode as soon as the page opens, when one is set.
  useEffect(() => {
    if (status.data?.passcodeSet && !status.data.unlocked) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data?.passcodeSet, status.data?.unlocked]);

  const lock = async () => {
    await fetch("/api/admin/lock", { method: "POST" }).catch(() => {});
    queryClient.removeQueries({ queryKey: ["/api/admin"] });
    status.refetch();
  };

  let body: ReactNode;
  if (status.isLoading) {
    body = <p className="text-sm text-muted-foreground">Loading…</p>;
  } else if (status.error) {
    body = <ErrorLine error={(status.error as Error).message} />;
  } else if (!status.data!.passcodeSet || recovering) {
    body = <SetPasscodeCard recoveryKeyConfigured={status.data!.recoveryKeyConfigured} recovering={recovering && status.data!.passcodeSet} />;
  } else if (!unlocked) {
    body = (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Lock className="h-5 w-5 text-primary" />Admin tools are locked</CardTitle>
          <CardDescription>Enter the admin passcode to manage leagues, commissioners and PINs.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={unlock}>Unlock</Button>
          {status.data!.recoveryKeyConfigured && <Button variant="ghost" onClick={() => setRecovering(true)}>Forgot passcode</Button>}
        </CardContent>
      </Card>
    );
  } else {
    const list = leagues.data ?? [];
    body = (
      <Tabs defaultValue="leagues">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="leagues">Leagues</TabsTrigger>
          <TabsTrigger value="commissioners">Commissioners and PINs</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="passcode">Passcode</TabsTrigger>
        </TabsList>
        {leagues.error && <ErrorLine error={(leagues.error as Error).message} />}
        <TabsContent value="leagues">
          <LeaguesTab leagues={list} onSetupCode={(code, who) => setSetupCode({ code, who })} />
        </TabsContent>
        <TabsContent value="commissioners" className="flex flex-col gap-3">
          {list.map((l) => <LeagueCommissioners key={l.id} league={l} onSetupCode={(code, who) => setSetupCode({ code, who })} />)}
        </TabsContent>
        <TabsContent value="audit"><AuditTab leagues={list} /></TabsContent>
        <TabsContent value="passcode"><PasscodeTab /></TabsContent>
      </Tabs>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background">
      <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <Link href={backTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Back to league
          </Link>
          <span className="flex items-center gap-2 font-medium"><ShieldCheck className="h-5 w-5 text-primary" />Site admin</span>
        </div>
        {unlocked && <Button variant="outline" size="sm" onClick={lock} data-testid="button-admin-lock"><Lock className="mr-1 h-4 w-4" />Lock</Button>}
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{body}</main>
      <UnlockDialog commissioner={null} />
      <SetupCodeDialog code={setupCode?.code ?? null} who={setupCode?.who ?? ""} onClose={() => setSetupCode(null)} />
    </div>
  );
}
