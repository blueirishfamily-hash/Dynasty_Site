/**
 * Commissioner-only contract editing: the editor shown inside the player card, and the Roster Management tools
 * (players with no contract, dead cap entries, and the league-visible change log). The server checks the commissioner
 * on every write and requires a reason, which goes into the change log.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { deadCapForEndedContract } from "@shared/contractRules";

const TOTAL_CAP = 250;
const REASONS = ["Fix wrong salary", "Missed pickup", "Trade adjustment", "League decision", "Other"];

export interface EditableContract {
  rosterId: number;
  playerId: string;
  parsedSalaries: Record<number, number>;
  isRookieContract: number;
  franchiseTagUsed: number;
  extensionApplied: number;
  isOnIr?: number;
  hasBeenExtended?: number;
  hasBeenFranchiseTagged?: number;
}

interface DeadCapRow {
  id: string;
  rosterId: number;
  playerId: string;
  playerName: string;
  playerPosition: string;
  deadCapSalaries: string;
}

interface ChangeLogRow {
  id: string;
  at: number;
  rosterId: number;
  playerName: string;
  summary: string;
  detail: string;
  reason: string;
  note: string;
}

const money = (v: number) => (v > 0 ? `$${v.toFixed(1)}` : "—");

function refresh(leagueId: string) {
  queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
  queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "dead-cap"] });
  queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "change-log"] });
}

async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json;
}

function ReasonPicker({ reason, setReason }: { reason: string; setReason: (r: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {REASONS.map(r => (
        <button
          key={r}
          type="button"
          aria-pressed={reason === r}
          onClick={() => setReason(r)}
          className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
            reason === r ? "border-amber-500 bg-amber-500/15 text-amber-600" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// ─── Player card editor ───────────────────────────────────────────────────────

export function CommissionerContractEditor({
  leagueId,
  userId,
  rosterId,
  playerId,
  playerName,
  contract,
  currentYear,
  teamSalaryByYear,
  onDone,
}: {
  leagueId: string;
  userId: string;
  rosterId: number;
  playerId: string;
  playerName: string;
  contract: EditableContract | null;
  currentYear: number;
  /** The team's committed cap by season in $M (contracts plus dead cap), for the before/after boxes. */
  teamSalaryByYear: Record<number, number>;
  /** Called after a save or removal; `removed` is true when the contract was deleted. */
  onDone: (removed: boolean) => void;
}) {
  const { toast } = useToast();
  const years = useMemo(() => [0, 1, 2, 3, 4].map(i => currentYear + i), [currentYear]);
  const original = useMemo(() => Object.fromEntries(years.map(y => [y, contract?.parsedSalaries[y] ?? 0])) as Record<number, number>, [contract, years]);
  const [open, setOpen] = useState(false);
  const [sal, setSal] = useState<Record<number, string>>({});
  const [flags, setFlags] = useState({ rookie: false, tagged: false, extended: false, everTagged: false, everExtended: false, ir: false });
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const start = () => {
    setSal(Object.fromEntries(years.map(y => [y, original[y] > 0 ? String(original[y]) : ""])));
    setFlags({
      rookie: contract?.isRookieContract === 1,
      tagged: contract?.franchiseTagUsed === 1,
      extended: contract?.extensionApplied === 1,
      everTagged: contract?.hasBeenFranchiseTagged === 1,
      everExtended: contract?.hasBeenExtended === 1,
      ir: contract?.isOnIr === 1,
    });
    setReason("");
    setNote("");
    setConfirmRemove(false);
    setOpen(true);
  };

  const value = (y: number) => {
    const n = parseFloat(sal[y] ?? "");
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const anySalary = years.some(y => value(y) > 0);
  const salaries = Object.fromEntries(years.filter(y => value(y) > 0).map(y => [y, value(y)]));
  const cap2026After = (teamSalaryByYear[currentYear] ?? 0) - original[currentYear] + value(currentYear);

  const save = async () => {
    setBusy(true);
    try {
      await send("POST", `/api/league/${leagueId}/commissioner/contract`, { userId, rosterId, playerId, salaries, flags, reason, note });
      refresh(leagueId);
      toast({ title: contract ? "Contract updated" : "Contract created", description: playerName });
      setOpen(false);
      onDone(false);
    } catch (e) {
      toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const q = new URLSearchParams({ userId, reason, note });
      await send("DELETE", `/api/league/${leagueId}/commissioner/contract/${rosterId}/${playerId}?${q}`);
      refresh(leagueId);
      toast({ title: "Contract removed", description: `${playerName} stays on the roster with no contract.` });
      setOpen(false);
      onDone(true);
    } catch (e) {
      toast({ title: "Could not remove", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="border-amber-500/60 text-amber-600" onClick={start} data-testid="button-edit-contract">
        ✎ {contract ? "Edit contract" : "Add contract"}
      </Button>
    );
  }

  const flagDefs: Array<[keyof typeof flags, string]> = [
    ["rookie", "Rookie contract"],
    ["tagged", "Franchise tagged"],
    ["extended", "Extended"],
    ["everTagged", "Has been tagged"],
    ["everExtended", "Has been extended"],
    ["ir", "On IR"],
  ];

  return (
    <div className="w-full rounded-xl border border-amber-500/50 bg-amber-500/5 p-3 space-y-3" data-testid="commissioner-contract-editor">
      <div className="text-xs font-bold uppercase tracking-wide text-amber-600">Commissioner · {contract ? "editing contract" : "new contract"}</div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-[56px_1fr_80px] gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Season</span>
          <span>Salary ($M)</span>
          <span className="text-right">Was</span>
        </div>
        {years.map(y => {
          const changed = Math.abs(value(y) - original[y]) > 0.001;
          return (
            <div key={y} className="grid grid-cols-[56px_1fr_80px] gap-2 items-center">
              <span className="text-sm font-semibold">{y}</span>
              <Input
                type="number"
                min={0}
                max={250}
                step={0.5}
                inputMode="decimal"
                placeholder="0"
                value={sal[y] ?? ""}
                onChange={e => setSal(s => ({ ...s, [y]: e.target.value }))}
                className={`h-8 ${changed ? "border-amber-500" : ""}`}
                data-testid={`input-salary-${y}`}
              />
              <span className="text-right text-xs text-muted-foreground">{money(original[y])}</span>
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">Leave a season blank (or 0) to end the contract there. Years left and “through” follow the salaries.</p>
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Flags</span>
        <div className="flex flex-wrap gap-1.5">
          {flagDefs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={flags[k]}
              onClick={() => setFlags(f => ({ ...f, [k]: !f[k] }))}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                flags[k] ? "border-blue-500 bg-blue-500/15 text-blue-500" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {flags[k] ? "✓ " : ""}{label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {years.slice(0, 3).map(y => {
          const after = (teamSalaryByYear[y] ?? 0) - original[y] + value(y);
          const delta = value(y) - original[y];
          return (
            <div key={y} className="rounded-lg border border-border/60 bg-card/40 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{y} team cap</div>
              <div className="text-sm font-bold tabular-nums">${after.toFixed(1)}</div>
              <div className={`text-[11px] font-semibold ${Math.abs(delta) < 0.001 ? "text-muted-foreground" : delta > 0 ? "text-orange-500" : "text-emerald-500"}`}>
                {Math.abs(delta) < 0.001 ? "no change" : `${delta > 0 ? "+" : "−"}$${Math.abs(delta).toFixed(1)}`}
              </div>
            </div>
          );
        })}
      </div>
      {cap2026After > TOTAL_CAP && (
        <p className="text-xs text-orange-500 border border-orange-500/40 rounded-lg px-2.5 py-2">
          This puts the team over the ${TOTAL_CAP} cap in {currentYear}. The commissioner can still save it; owners can't.
        </p>
      )}

      <div className="space-y-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Reason (required, saved to the change log)</span>
        <ReasonPicker reason={reason} setReason={setReason} />
        <Input value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="Add a note (optional)" className="h-8" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!reason || !anySalary || busy} onClick={save} data-testid="button-save-contract-edit">
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
        <span className="flex-1" />
        {contract && (
          <Button size="sm" variant="outline" className="border-red-500/50 text-red-500" disabled={busy} onClick={() => setConfirmRemove(true)}>
            Remove contract
          </Button>
        )}
      </div>
      {confirmRemove && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/5 p-2.5 space-y-2 text-xs">
          <p className="text-red-500">
            Remove {playerName}'s contract? No dead cap is created. He stays on the Sleeper roster with no contract.
            {!reason && " Pick a reason above first."}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={!reason || busy} onClick={remove}>Yes, remove</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Keep</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Roster Management tools ──────────────────────────────────────────────────

export function CommissionerRosterTools({
  leagueId,
  userId,
  rosterId,
  teamName,
  currentYear,
  rosterPlayerIds,
  contractedPlayerIds,
  playerMap,
  deadCapEntries,
  contractsByPlayer,
  rosterNames,
}: {
  leagueId: string;
  userId: string;
  rosterId: number;
  teamName: string;
  currentYear: number;
  /** Players on this team's Sleeper roster. */
  rosterPlayerIds: string[];
  /** Players that already have a contract with this team. */
  contractedPlayerIds: Set<string>;
  playerMap: Record<string, { name: string; position: string }>;
  deadCapEntries: DeadCapRow[];
  /** This team's contracts by player, for the dead cap rule. */
  contractsByPlayer: Record<string, Record<number, number>>;
  rosterNames: Record<number, string>;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [form, setForm] = useState({ salary: "1", years: "1", start: String(currentYear) });
  const [deadOpen, setDeadOpen] = useState<null | "new" | string>(null);
  const [deadForm, setDeadForm] = useState<{ playerId: string; years: Record<number, string> }>({ playerId: "", years: {} });
  const [playerSearch, setPlayerSearch] = useState("");

  const noContract = rosterPlayerIds
    .filter(id => !contractedPlayerIds.has(id))
    .map(id => ({ id, name: playerMap[id]?.name ?? id, pos: playerMap[id]?.position ?? (/^\d+$/.test(id) ? "?" : "DEF") }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const teamDead = deadCapEntries.filter(d => d.rosterId === rosterId);
  const deadYears = [0, 1, 2, 3].map(i => currentYear + i);

  const { data: log = [] } = useQuery<ChangeLogRow[]>({
    queryKey: ["/api/league", leagueId, "change-log"],
    queryFn: async () => (await fetch(`/api/league/${leagueId}/commissioner/change-log`)).json(),
    enabled: !!leagueId,
  });

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      refresh(leagueId);
      toast({ title: ok });
      return true;
    } catch (e) {
      toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createContract = async (playerId: string) => {
    const salary = parseFloat(form.salary);
    const n = Math.max(1, Math.min(5, parseInt(form.years, 10) || 1));
    const start = parseInt(form.start, 10) || currentYear;
    if (!(salary > 0)) return toast({ title: "Enter a salary above $0", variant: "destructive" });
    const salaries = Object.fromEntries(Array.from({ length: n }, (_, i) => [start + i, salary]));
    const done = await run(
      () => send("POST", `/api/league/${leagueId}/commissioner/contract`, { userId, rosterId, playerId, salaries, reason }),
      "Contract created",
    );
    if (done) setAddFor(null);
  };

  const openDead = (entry: DeadCapRow | null) => {
    if (entry) {
      let parsed: Record<string, number> = {};
      try { parsed = JSON.parse(entry.deadCapSalaries || "{}"); } catch { /* */ }
      setDeadForm({ playerId: entry.playerId, years: Object.fromEntries(deadYears.map(y => [y, parsed[y] ? String(parsed[y] / 10) : ""])) });
      setDeadOpen(entry.id);
    } else {
      setDeadForm({ playerId: "", years: Object.fromEntries(deadYears.map(y => [y, ""])) });
      setDeadOpen("new");
    }
    setPlayerSearch("");
  };

  const useRule = () => {
    const sal = contractsByPlayer[deadForm.playerId];
    if (!sal) return toast({ title: "No contract for that player on this team", description: "Enter the amounts by hand.", variant: "destructive" });
    const tenths = Object.fromEntries(Object.entries(sal).map(([y, v]) => [y, Math.round(v * 10)]));
    const dead = deadCapForEndedContract(tenths, currentYear);
    setDeadForm(f => ({ ...f, years: Object.fromEntries(deadYears.map(y => [y, dead[String(y)] ? String(dead[String(y)] / 10) : ""])) }));
  };

  const saveDead = async () => {
    const dead = Object.fromEntries(deadYears.filter(y => parseFloat(deadForm.years[y]) > 0).map(y => [y, parseFloat(deadForm.years[y])]));
    if (!deadForm.playerId) return toast({ title: "Pick a player", variant: "destructive" });
    const entry = deadOpen && deadOpen !== "new" ? teamDead.find(d => d.id === deadOpen) : null;
    const done = await run(
      () =>
        send("POST", `/api/league/${leagueId}/commissioner/dead-cap`, {
          userId, rosterId, playerId: deadForm.playerId, deadCapSalaries: dead, entryId: entry?.id, reason,
          playerName: playerMap[deadForm.playerId]?.name, playerPosition: playerMap[deadForm.playerId]?.position,
        }),
      entry ? "Dead cap updated" : "Dead cap added",
    );
    if (done) setDeadOpen(null);
  };

  const deleteDead = (entry: DeadCapRow) =>
    run(() => send("DELETE", `/api/league/${leagueId}/commissioner/dead-cap/${entry.id}?${new URLSearchParams({ userId, reason })}`), "Dead cap removed");

  const matches = playerSearch.trim().length >= 2
    ? Object.entries(playerMap)
        .filter(([, p]) => p.name.toLowerCase().includes(playerSearch.toLowerCase()))
        .slice(0, 6)
    : [];

  return (
    <div className="mt-6 rounded-xl border border-amber-500/40 bg-card/40 p-4 space-y-6" data-testid="commissioner-roster-tools">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <div className="text-sm font-heading uppercase tracking-wide">Commissioner tools · {teamName}</div>
          <div className="text-xs text-muted-foreground">Every change needs a reason and goes in the change log below.</div>
        </div>
        <Badge variant="outline" className="border-amber-500/50 text-amber-600">Commissioner only</Badge>
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Reason for the next change</span>
        <ReasonPicker reason={reason} setReason={setReason} />
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">On the roster with no contract</h3>
          <Badge variant="outline" className="text-[10px]">{noContract.length}</Badge>
        </div>
        {noContract.length === 0 && <p className="text-xs text-muted-foreground">Every rostered player has a contract.</p>}
        {noContract.map(p => (
          <div key={p.id} className="rounded-lg border border-border/60">
            <div className="flex items-center gap-2 px-3 py-2">
              <Badge variant="outline" className="text-[10px] px-1.5">{p.pos}</Badge>
              <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
              <Button size="sm" variant="outline" className="h-7 border-amber-500/60 text-amber-600" onClick={() => setAddFor(addFor === p.id ? null : p.id)}>
                {addFor === p.id ? "Close" : "Add contract"}
              </Button>
            </div>
            {addFor === p.id && (
              <div className="border-t border-border/60 px-3 py-3 flex flex-wrap items-end gap-3">
                <Field label="Salary ($M / yr)"><Input type="number" min={0.5} step={0.5} value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} className="h-8 w-24" /></Field>
                <Field label="Years"><Input type="number" min={1} max={5} value={form.years} onChange={e => setForm(f => ({ ...f, years: e.target.value }))} className="h-8 w-20" /></Field>
                <Field label="Starts"><Input type="number" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} className="h-8 w-24" /></Field>
                <Button size="sm" disabled={!reason || busy} onClick={() => createContract(p.id)}>Create contract</Button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dead cap</h3>
          <Button size="sm" variant="outline" className="h-7 border-amber-500/60 text-amber-600" onClick={() => (deadOpen ? setDeadOpen(null) : openDead(null))}>
            {deadOpen ? "Close" : "+ Add entry"}
          </Button>
        </div>
        {deadOpen && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 space-y-3">
            {deadOpen === "new" ? (
              <Field label="Player">
                <div className="space-y-1">
                  <Input value={deadForm.playerId ? (playerMap[deadForm.playerId]?.name ?? deadForm.playerId) : playerSearch} onChange={e => { setDeadForm(f => ({ ...f, playerId: "" })); setPlayerSearch(e.target.value); }} placeholder="Search players…" className="h-8 max-w-xs" />
                  {!deadForm.playerId && matches.map(([id, p]) => (
                    <button key={id} type="button" className="block text-left text-sm px-2 py-1 rounded hover:bg-muted w-full max-w-xs" onClick={() => setDeadForm(f => ({ ...f, playerId: id }))}>
                      {p.name} <span className="text-xs text-muted-foreground">{p.position}</span>
                    </button>
                  ))}
                </div>
              </Field>
            ) : (
              <div className="text-sm font-medium">{playerMap[deadForm.playerId]?.name ?? deadForm.playerId}</div>
            )}
            <div className="flex flex-wrap gap-3">
              {deadYears.map(y => (
                <Field key={y} label={String(y)}>
                  <Input type="number" min={0} step={0.1} value={deadForm.years[y] ?? ""} onChange={e => setDeadForm(f => ({ ...f, years: { ...f.years, [y]: e.target.value } }))} className="h-8 w-20" placeholder="0" />
                </Field>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">“Use the rule” fills these from the player's contract with this team: 100% this year, then 0 / 25 / 50 / 75% by years left.</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={!reason || busy} onClick={saveDead}>Save entry</Button>
              <Button size="sm" variant="outline" onClick={useRule}>Use the rule</Button>
            </div>
          </div>
        )}
        {teamDead.length === 0 ? (
          <p className="text-xs text-muted-foreground">No dead cap on this team.</p>
        ) : (
          <div className="rounded-lg border border-border/60 overflow-hidden text-sm">
            {teamDead.map(d => {
              let parsed: Record<string, number> = {};
              try { parsed = JSON.parse(d.deadCapSalaries || "{}"); } catch { /* */ }
              return (
                <div key={d.id} className="flex items-center gap-3 px-3 py-2 border-t first:border-t-0 border-border/60 bg-red-500/5">
                  <span className="flex-1 min-w-0 truncate font-medium text-red-600">{d.playerName}</span>
                  {deadYears.map(y => (
                    <span key={y} className="w-12 text-right text-xs tabular-nums text-red-600">{parsed[y] ? money(parsed[y] / 10) : "—"}</span>
                  ))}
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => openDead(d)}>Edit</button>
                  <button type="button" disabled={!reason || busy} className="text-xs text-red-500 disabled:opacity-40" onClick={() => deleteDead(d)}>Delete</button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Edit fixes the amounts (for example a forgiven drop). Delete removes the entry and frees the cap. Pick a reason first.</p>
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change log</h3>
        <p className="text-xs text-muted-foreground">Every commissioner edit, newest first, for the whole league.</p>
        {log.length === 0 && <p className="text-xs text-muted-foreground pt-1">No edits yet.</p>}
        {log.slice(0, 12).map(l => (
          <div key={l.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-2 border-t border-border/60">
            <span className="text-[11px] text-muted-foreground">{new Date(l.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{l.summary}</div>
              <div className="text-xs text-muted-foreground">{l.detail}</div>
              <div className="text-xs text-muted-foreground">{rosterNames[l.rosterId] ?? `Team ${l.rosterId}`} · {l.reason}{l.note ? ` · ${l.note}` : ""}</div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
