import { describe, expect, it } from "vitest";
import {
  aggregateMatchupPoints,
  buildDraftPicks,
  buildPlayerLeaders,
  buildTransactionFeed,
  draftKind,
  type MatchupLike,
  type TeamRef,
  type TransactionLike,
} from "./leagueStats";

const matchup = (roster_id: number, points: number, pts: Record<string, number>, starters: string[]): MatchupLike => ({
  roster_id,
  points,
  starters,
  players: Object.keys(pts),
  players_points: pts,
});

describe("aggregateMatchupPoints", () => {
  it("adds up a player's points and separates the weeks he started", () => {
    const totals = aggregateMatchupPoints([
      [matchup(1, 100, { a: 20, b: 5 }, ["a"]), matchup(2, 90, { c: 12 }, ["c"])],
      [matchup(1, 80, { a: 10, b: 15 }, ["b"]), matchup(2, 70, { c: 8 }, [])],
    ]);
    expect(totals.get("a")).toEqual({ points: 30, started: 20, games: 2, byRoster: new Map([[1, { points: 30, games: 2 }]]) });
    expect(totals.get("b")).toEqual({ points: 20, started: 15, games: 2, byRoster: new Map([[1, { points: 20, games: 2 }]]) });
    expect(totals.get("c")).toEqual({ points: 20, started: 12, games: 2, byRoster: new Map([[2, { points: 20, games: 2 }]]) });
  });

  it("ignores a week that has not been played", () => {
    const totals = aggregateMatchupPoints([
      [matchup(1, 100, { a: 20 }, ["a"])],
      [matchup(1, 0, { a: 0 }, ["a"])], // next week: nothing scored yet
    ]);
    expect(totals.get("a")).toEqual({ points: 20, started: 20, games: 1, byRoster: new Map([[1, { points: 20, games: 1 }]]) });
  });

  it("copes with missing lineup data", () => {
    const totals = aggregateMatchupPoints([[{ roster_id: 1, points: 50, starters: null, players: null, players_points: null }]]);
    expect(totals.size).toBe(0);
  });
});

describe("buildPlayerLeaders teams", () => {
  it("lists every team a player scored for in a season, most points first", () => {
    const totals = aggregateMatchupPoints([
      [matchup(1, 50, { a: 10 }, ["a"]), matchup(2, 50, { z: 1 }, [])],
      [matchup(2, 50, { a: 25 }, ["a"]), matchup(1, 50, { z: 1 }, [])],
    ]);
    const teams = new Map([[1, { rosterId: 1, franchiseId: "u1", teamName: "One" }], [2, { rosterId: 2, franchiseId: "u2", teamName: "Two" }]]);
    const [a] = buildPlayerLeaders([{ season: "2025", totals, teams }], {}).filter((l) => l.playerId === "a");
    expect(a.seasons[0].teams.map((t) => t.teamName)).toEqual(["Two", "One"]);
  });
});

describe("buildPlayerLeaders", () => {
  const directory = { a: { name: "Alpha", position: "WR", team: "KC" }, b: { name: "Beta", position: "RB", team: "SF" } };
  const season = (s: string, entries: Record<string, [number, number, number]>) => ({
    season: s,
    totals: new Map(Object.entries(entries).map(([id, [points, started, games]]) => [id, { points, started, games, byRoster: new Map([[1, { points, games }]]) }])),
  });

  it("totals every season, finds the best one, and sorts by points", () => {
    const leaders = buildPlayerLeaders(
      [season("2024", { a: [100, 90, 14], b: [200, 150, 15] }), season("2025", { a: [250, 240, 16] })],
      directory,
    );
    expect(leaders.map((l) => l.playerId)).toEqual(["a", "b"]);
    expect(leaders[0]).toMatchObject({ name: "Alpha", position: "WR", points: 350, started: 330, games: 30, best: { season: "2025", points: 250 } });
    expect(leaders[0].seasons.map((s) => s.season)).toEqual(["2024", "2025"]);
    expect(leaders[0].seasons[1].teams).toEqual([{ franchiseId: "roster-1", teamName: "Team 1", points: 250, games: 16 }]);
  });

  it("leaves out players with no points and names unknown ids by id", () => {
    const leaders = buildPlayerLeaders([season("2025", { a: [0, 0, 3], CIN: [40, 40, 5] })], directory);
    expect(leaders.map((l) => l.playerId)).toEqual(["CIN"]);
    expect(leaders[0].name).toBe("CIN");
    expect(leaders[0].position).toBeNull();
  });
});

describe("drafts", () => {
  it("tells a startup draft from a rookie draft by rounds", () => {
    expect(draftKind(3)).toBe("rookie");
    expect(draftKind(5)).toBe("rookie");
    expect(draftKind(23)).toBe("startup");
  });

  const teams = new Map<number, TeamRef>([
    [1, { rosterId: 1, franchiseId: "u1", teamName: "One" }],
    [2, { rosterId: 2, franchiseId: "u2", teamName: "Two" }],
  ]);
  const pick = (pick_no: number, roster_id: number, draft_slot: number, player_id = "p1") => ({
    round: 1, roster_id, player_id, pick_no, draft_slot, metadata: { first_name: "Ann", last_name: "Lee", position: "wr", team: "DAL" },
  });

  it("orders picks and flags a traded pick with the team that held the slot", () => {
    const picks = buildDraftPicks([pick(2, 1, 2), pick(1, 1, 1)], { "1": 1, "2": 2 }, teams, {});
    expect(picks.map((p) => p.pickNo)).toEqual([1, 2]);
    expect(picks[0].via).toBeNull();
    expect(picks[1].via).toEqual({ rosterId: 2, franchiseId: "u2", teamName: "Two" }); // slot 2 was Two's, team One made the pick
    expect(picks[0]).toMatchObject({ playerName: "Ann Lee", position: "WR", nflTeam: "DAL", teamName: "One" });
  });

  it("works without a slot map and with unknown rosters", () => {
    const picks = buildDraftPicks([pick(1, 9, 1)], null, new Map(), { p1: { name: "Known Name", position: "QB", team: "NYJ" } });
    expect(picks[0]).toMatchObject({ via: null, teamName: "Team 9", franchiseId: "roster-9", playerName: "Known Name" });
  });
});

describe("buildTransactionFeed", () => {
  const teams = new Map<number, TeamRef>([
    [1, { rosterId: 1, franchiseId: "u1", teamName: "One" }],
    [2, { rosterId: 2, franchiseId: "u2", teamName: "Two" }],
  ]);
  const players = { a: { name: "Alpha", position: "WR", team: "KC" }, b: { name: "Beta", position: "RB", team: "SF" } };
  const tx = (o: Partial<TransactionLike> & Pick<TransactionLike, "transaction_id" | "type">): TransactionLike => ({
    status: "complete", status_updated: 1000, adds: null, drops: null, roster_ids: [], draft_picks: [], settings: null, ...o,
  });

  it("shows both sides of a trade, players and picks", () => {
    const feed = buildTransactionFeed(
      [{ week: 5, transactions: [tx({ transaction_id: "t", type: "trade", roster_ids: [1, 2], adds: { a: 2, b: 1 }, drops: { a: 1, b: 2 }, draft_picks: [{ season: "2027", round: 1, roster_id: 1, previous_owner_id: 1, owner_id: 2 }] })] }],
      "2026", teams, players,
    );
    expect(feed).toHaveLength(1);
    const [one, two] = feed[0].sides;
    expect(one.received.map((a) => a.name)).toEqual(["Beta"]);
    expect(one.gave.map((a) => a.name)).toEqual(["Alpha", "2027 round 1 pick"]);
    expect(two.received.map((a) => a.name)).toEqual(["Alpha", "2027 round 1 pick"]);
    expect(feed[0]).toMatchObject({ type: "trade", season: "2026", week: 5 });
  });

  it("records the winning bid on a waiver claim and a drop in the same move", () => {
    const feed = buildTransactionFeed(
      [{ week: 3, transactions: [tx({ transaction_id: "w", type: "waiver", adds: { a: 1 }, drops: { b: 1 }, settings: { waiver_bid: 12 } })] }],
      "2026", teams, players,
    );
    expect(feed[0].waiverBid).toBe(12);
    expect(feed[0].sides[0].received[0].name).toBe("Alpha");
    expect(feed[0].sides[0].gave[0].name).toBe("Beta");
  });

  it("sorts newest first and leaves out moves that did not complete", () => {
    const feed = buildTransactionFeed(
      [
        { week: 1, transactions: [tx({ transaction_id: "old", type: "free_agent", status_updated: 100, adds: { a: 1 } })] },
        { week: 2, transactions: [
          tx({ transaction_id: "new", type: "free_agent", status_updated: 900, adds: { b: 2 } }),
          tx({ transaction_id: "failed", type: "waiver", status: "failed", status_updated: 950, adds: { a: 2 } }),
        ] },
      ],
      "2026", teams, players,
    );
    expect(feed.map((f) => f.id)).toEqual(["new", "old"]);
  });
});
