// Plans what the Sleeper transactions mean for contracts. Pure functions (no database, no network) so every rule can
// be unit tested; server/contractMoves.ts fetches the data, stores the plan and applies it.
//
// The rules (decided with the commissioner):
//  - Trade: the contract moves with the player to the team that received him, unchanged. No dead cap.
//  - Commissioner move (one Sleeper transaction that drops a player from one team and adds him to another): same as a trade.
//  - Drop: the contract is removed from the team that dropped him, whatever the dead cap setting says. When dead cap is
//    on (and the drop is after it was turned on) the team also takes dead cap by the league's rule, in the offseason too.
//  - Pickup (regular season only): the team gets a 1-year contract. A waiver claim pays the winning bid (a bid of 0 counts
//    as the $1 minimum); a free agent pickup pays $1. Offseason adds are not touched: they go through free agency bidding.
//    Team defenses get no pickup contract.
//  - A team that ends up over the salary cap because of a move is flagged for the team and the commissioner.
//
// Pending extensions move with a traded player (see the executor). That is the current decision and may be revised
// later: for example, a pending extension might better be dropped when the player changes teams.
import { deadCapForEndedContract, type DeadCapShares } from "../shared/contractRules";

export type MoveKind = "trade_move" | "commissioner_move" | "drop" | "pickup";

export interface PlanTransaction {
  transaction_id: string;
  type: "trade" | "waiver" | "free_agent" | "commissioner";
  status: string;
  status_updated?: number;
  created?: number;
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  settings?: Record<string, unknown> | null;
}

export interface PlanContract {
  rosterId: number;
  playerId: string;
  /** Stored salary JSON: tenths of $M by season */
  salaries: string;
  updatedAt: number;
}

export interface PlanDeadCapEntry {
  rosterId: number;
  playerId: string;
  createdAt: number;
  /** Stored JSON: tenths of $M by season */
  deadCapSalaries: string;
}

/** What applying a planned move does. Stored with the log row so an approved proposal can be applied later. */
export type MoveEffect =
  | { type: "move"; fromRosterId: number; toRosterId: number }
  | { type: "end"; rosterId: number; deadCapSalaries: Record<string, number> | null }
  | { type: "sign"; rosterId: number; salaries: Record<string, number>; years: number; amount: number; fromYear: number };

export interface MoveFlag {
  type: "over_cap";
  rosterId: number;
  teamName: string;
  year: number;
  /** Committed salary plus dead cap for that season, $M */
  total: number;
  /** The salary cap, $M */
  cap: number;
}

export interface PlannedMove {
  transactionId: string;
  kind: MoveKind;
  playerId: string;
  playerName: string;
  playerPosition: string | null;
  fromRosterId: number | null;
  toRosterId: number | null;
  /** When the Sleeper transaction happened (ms) */
  at: number;
  /** "planned" moves change something; "skipped" ones are returned only to explain why nothing happens */
  status: "planned" | "skipped";
  summary: string;
  effect: MoveEffect | null;
  detail: Record<string, unknown>;
  flags: MoveFlag[];
}

export interface PlanInput {
  transactions: PlanTransaction[];
  contracts: PlanContract[];
  deadCapEntries: PlanDeadCapEntry[];
  /** Who is on each Sleeper roster now */
  rosterPlayers: Map<number, Set<string>>;
  teamNames: Map<number, string>;
  players: Record<string, { position?: string | null; name?: string | null }>;
  /** The contract season, and whether the league is in an offseason phase */
  contractYear: number;
  offseason: boolean;
  deadCap: { enabled: boolean; enabledAt: number | null; shares: DeadCapShares };
  /** When this league year's regular season began, or 0 when it has not */
  seasonStart: number;
  /** Ignore transactions before this time (ms) */
  windowStart: number;
  pickup: { years: number; salary: number };
  /** Salary cap, $M */
  salaryCap: number;
  /**
   * What is already in the move log for this league, by "transactionId|playerId|kind".
   * applied: the database already reflects it, so it is not replayed. proposed: not applied yet, but later transactions
   * are planned as if it were (and it is not planned again). Anything else (rejected, skipped, failed): left alone.
   */
  logged: Map<string, string>;
}

const txAt = (t: PlanTransaction) => Number(t.status_updated || t.created) || 0;
export const moveKey = (transactionId: string, playerId: string, kind: MoveKind) => `${transactionId}|${playerId}|${kind}`;

function parseSalaries(raw: string | null | undefined): Record<string, number> {
  try {
    const parsed = JSON.parse(raw || "{}");
    const out: Record<string, number> = {};
    for (const [y, v] of Object.entries(parsed || {})) out[String(y)] = Number(v) || 0;
    return out;
  } catch {
    return {};
  }
}

const money = (tenths: number) => `$${(tenths / 10).toFixed(1)}M`;

interface SimContract {
  rosterId: number;
  playerId: string;
  salaries: Record<string, number>;
  updatedAt: number;
  /** Created or moved by this plan (so its timestamp is not "newer than a drop") */
  simulated: boolean;
}

export function planContractMoves(input: PlanInput): PlannedMove[] {
  const { contractYear, deadCap } = input;
  const rules = input.pickup;
  const sim = new Map<string, SimContract>();
  const keyOf = (rosterId: number, playerId: string) => `${rosterId}:${playerId}`;
  for (const c of input.contracts) {
    sim.set(keyOf(c.rosterId, c.playerId), {
      rosterId: c.rosterId,
      playerId: c.playerId,
      salaries: parseSalaries(c.salaries),
      updatedAt: Number(c.updatedAt) || 0,
      simulated: false,
    });
  }
  const deadAdded: Array<{ rosterId: number; salaries: Record<string, number> }> = [];
  const planned: PlannedMove[] = [];

  const teamName = (rosterId: number | null) => (rosterId == null ? "no team" : input.teamNames.get(rosterId) ?? `Team ${rosterId}`);
  const playerName = (playerId: string) => input.players[playerId]?.name || playerId;
  const playerPosition = (playerId: string) => input.players[playerId]?.position ?? null;
  const hasSalaryFrom = (salaries: Record<string, number>, year: number) =>
    Object.entries(salaries).some(([y, v]) => Number(y) >= year && v > 0);

  /** Records a move, unless it was already logged. Returns whether the move should change the simulated state. */
  const emit = (move: Omit<PlannedMove, "flags">): boolean => {
    const state = input.logged.get(moveKey(move.transactionId, move.playerId, move.kind));
    if (state === "applied" || (state !== undefined && state !== "proposed")) return false;
    if (state === "proposed") return true; // planned before: replay it for what follows, but do not emit it again
    planned.push({ ...move, flags: [] });
    return move.status === "planned";
  };
  /** A log row already in a state that means this transaction is finished (applied) or settled (rejected and so on). */
  const settled = (transactionId: string, playerId: string, kind: MoveKind) => {
    const state = input.logged.get(moveKey(transactionId, playerId, kind));
    return state !== undefined && state !== "proposed";
  };

  const txs = input.transactions
    .filter((t) => t.status === "complete")
    .sort((a, b) => txAt(a) - txAt(b));

  for (const tx of txs) {
    const at = txAt(tx);
    if (at < input.windowStart) continue;
    const base = { transactionId: tx.transaction_id, at };

    // ── Trades and commissioner moves: the contract follows the player ──
    if ((tx.type === "trade" || tx.type === "commissioner") && tx.adds && tx.drops) {
      const kind: MoveKind = tx.type === "trade" ? "trade_move" : "commissioner_move";
      for (const [playerId, to] of Object.entries(tx.adds)) {
        const from = tx.drops[playerId];
        if (from == null || Number(from) === Number(to)) continue;
        const fromId = Number(from);
        const toId = Number(to);
        if (settled(tx.transaction_id, playerId, kind)) continue;
        const contract = sim.get(keyOf(fromId, playerId));
        const name = playerName(playerId);
        if (!contract) {
          // Nothing to move: no contract on file, or someone already moved it by hand.
          const alreadyThere = sim.has(keyOf(toId, playerId));
          planned.push({
            ...base,
            kind,
            playerId,
            playerName: name,
            playerPosition: playerPosition(playerId),
            fromRosterId: fromId,
            toRosterId: toId,
            status: "skipped",
            summary: `${name}: ${alreadyThere ? `contract is already with ${teamName(toId)}` : "no contract on file to move"}`,
            effect: null,
            detail: {},
            flags: [],
          });
          continue;
        }
        const effect: MoveEffect = { type: "move", fromRosterId: fromId, toRosterId: toId };
        const replacing = sim.get(keyOf(toId, playerId));
        const go = emit({
          ...base,
          kind,
          playerId,
          playerName: name,
          playerPosition: playerPosition(playerId),
          fromRosterId: fromId,
          toRosterId: toId,
          status: "planned",
          summary: `${name}'s contract moves from ${teamName(fromId)} to ${teamName(toId)}${tx.type === "commissioner" ? " (commissioner move)" : ""}`,
          effect,
          detail: {
            effect,
            salaries: contract.salaries,
            ...(replacing ? { replacesOlderContract: replacing.salaries } : {}),
          },
        });
        if (go) {
          sim.delete(keyOf(fromId, playerId));
          sim.set(keyOf(toId, playerId), { ...contract, rosterId: toId, updatedAt: at, simulated: true });
        }
      }
    }

    // ── Drops: the contract ends, with dead cap when that setting is on ──
    if (tx.type !== "trade" && tx.drops) {
      for (const [playerId, roster] of Object.entries(tx.drops)) {
        const rosterId = Number(roster);
        // A commissioner move drops and adds the same player in one transaction: that is a move, handled above.
        if (tx.adds && tx.adds[playerId] != null && Number(tx.adds[playerId]) !== rosterId) continue;
        if (settled(tx.transaction_id, playerId, "drop")) continue;
        const contract = sim.get(keyOf(rosterId, playerId));
        if (!contract) continue;
        // A contract written after the drop is a new deal (for example a free agency signing), not the dropped one.
        if (!contract.simulated && contract.updatedAt > at) continue;
        // A contract with nothing left to pay has already run out; it stays on file for the free agent pool.
        if (!hasSalaryFrom(contract.salaries, contractYear)) continue;
        // Dead cap for this drop was already created by an earlier run.
        if (input.deadCapEntries.some((d) => d.rosterId === rosterId && d.playerId === playerId && Number(d.createdAt) >= at)) continue;

        const countsDeadCap = deadCap.enabled && deadCap.enabledAt != null && at >= deadCap.enabledAt;
        const dead = countsDeadCap ? deadCapForEndedContract(contract.salaries, contractYear, deadCap.shares) : null;
        const deadCapSalaries = dead && Object.keys(dead).length > 0 ? dead : null;
        const name = playerName(playerId);
        const deadText = deadCapSalaries
          ? `dead cap ${Object.entries(deadCapSalaries).map(([y, v]) => `${money(v)} in ${y}`).join(", ")}`
          : countsDeadCap
            ? "no dead cap under the league's rule"
            : "no dead cap (the setting was off)";
        const effect: MoveEffect = { type: "end", rosterId, deadCapSalaries };
        const go = emit({
          ...base,
          kind: "drop",
          playerId,
          playerName: name,
          playerPosition: playerPosition(playerId),
          fromRosterId: rosterId,
          toRosterId: null,
          status: "planned",
          summary: `${teamName(rosterId)} dropped ${name}: contract ended, ${deadText}`,
          effect,
          detail: { effect, salaries: contract.salaries },
        });
        if (go) {
          sim.delete(keyOf(rosterId, playerId));
          if (deadCapSalaries) deadAdded.push({ rosterId, salaries: deadCapSalaries });
        }
      }
    }

    // ── Pickups: a 1-year contract (regular season only; offseason adds go through free agency bidding) ──
    if ((tx.type === "free_agent" || tx.type === "waiver") && tx.adds && !input.offseason && input.seasonStart > 0 && at >= input.seasonStart) {
      for (const [playerId, roster] of Object.entries(tx.adds)) {
        const rosterId = Number(roster);
        // Team defenses have ids like "CIN" rather than a number and get no pickup contract.
        if (input.players[playerId]?.position === "DEF" || !/^\d+$/.test(playerId)) continue;
        if (settled(tx.transaction_id, playerId, "pickup")) continue;
        // A contract with this team that already pays him this season (or later) covers him.
        const existing = sim.get(keyOf(rosterId, playerId));
        if (existing && hasSalaryFrom(existing.salaries, contractYear)) continue;

        const bid = tx.type === "waiver" ? Number(tx.settings?.waiver_bid) : NaN;
        // The winning bid is the salary in $M; a bid of 0 counts as the minimum, which is the free agent amount.
        const amount = tx.type === "waiver" && Number.isFinite(bid) ? Math.max(rules.salary, bid) : rules.salary;
        const years = Math.max(1, rules.years);
        const salaries: Record<string, number> = { ...(existing?.salaries ?? {}) };
        for (let i = 0; i < years; i++) salaries[String(contractYear + i)] = Math.round(amount * 10);
        const name = playerName(playerId);
        const how = tx.type === "waiver" ? `waiver claim${Number.isFinite(bid) ? ` for $${bid}` : ""}` : "free agent pickup";
        const effect: MoveEffect = { type: "sign", rosterId, salaries, years, amount, fromYear: contractYear };
        const go = emit({
          ...base,
          kind: "pickup",
          playerId,
          playerName: name,
          playerPosition: playerPosition(playerId),
          fromRosterId: null,
          toRosterId: rosterId,
          status: "planned",
          summary: `${teamName(rosterId)} picked up ${name} (${how}): ${years}-year $${amount.toFixed(1)}M contract`,
          effect,
          detail: { effect, waiverBid: Number.isFinite(bid) ? bid : null, source: tx.type, amount },
        });
        if (go) sim.set(keyOf(rosterId, playerId), { rosterId, playerId, salaries, updatedAt: at, simulated: true });
      }
    }
  }

  // ── Over the cap? Flag it for the affected team and the commissioner. ──
  if (planned.some((m) => m.status === "planned")) {
    const years = [0, 1, 2, 3].map((i) => contractYear + i);
    const committed = (rosterId: number): Map<number, number> => {
      const byYear = new Map<number, number>(years.map((y) => [y, 0]));
      const mine = input.rosterPlayers.get(rosterId);
      for (const c of Array.from(sim.values())) {
        if (c.rosterId !== rosterId || !mine?.has(c.playerId)) continue;
        for (const y of years) byYear.set(y, (byYear.get(y) ?? 0) + (c.salaries[String(y)] || 0) / 10);
      }
      const addDead = (salaries: Record<string, number>) => {
        for (const y of years) byYear.set(y, (byYear.get(y) ?? 0) + (salaries[String(y)] || 0) / 10);
      };
      for (const d of input.deadCapEntries) if (d.rosterId === rosterId) addDead(parseSalaries(d.deadCapSalaries));
      for (const d of deadAdded) if (d.rosterId === rosterId) addDead(d.salaries);
      return byYear;
    };
    const overCache = new Map<number, MoveFlag[]>();
    const flagsFor = (rosterId: number): MoveFlag[] => {
      let flags = overCache.get(rosterId);
      if (!flags) {
        flags = [];
        for (const [year, total] of Array.from(committed(rosterId))) {
          if (total > input.salaryCap + 1e-9) {
            flags.push({ type: "over_cap", rosterId, teamName: teamName(rosterId), year, total: Math.round(total * 10) / 10, cap: input.salaryCap });
          }
        }
        overCache.set(rosterId, flags);
      }
      return flags;
    };
    for (const move of planned) {
      if (move.status !== "planned") continue;
      // The team that took the contract or the dead cap is the one that can go over.
      const affected = move.kind === "drop" ? move.fromRosterId : move.toRosterId;
      if (affected != null) move.flags = flagsFor(affected);
    }
  }
  return planned;
}
