import {
  getLeague,
  getLeagueMatchups,
  getLeagueRosters,
  getLeagueUsers,
  getWinnersBracket,
  type SleeperBracketMatchup,
  type SleeperLeagueUser,
} from "./sleeper";
import type {
  GameKind,
  HistoryFranchise,
  HistoryGame,
  HistoryTeamSeason,
  LeagueHistory,
  PlayoffResult,
  SeasonHistory,
} from "../shared/leagueHistory";

const AVATAR_URL = "https://sleepercdn.com/avatars/thumbs/";

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 1) return (words[0] ?? "?").substring(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

interface ResolvedMatch {
  round: number;
  placement: number | null;
  a: number | null;
  b: number | null;
  winner: number | null;
  loser: number | null;
}

/** Bracket slots can be a roster id or "winner/loser of match N"; settle them to roster ids. */
function resolveBracket(bracket: SleeperBracketMatchup[]): ResolvedMatch[] {
  const byId = new Map<number, SleeperBracketMatchup>();
  bracket.forEach((m) => byId.set(m.m, m));
  const slot = (direct: number | null, from?: { w?: number; l?: number }): number | null => {
    if (direct != null) return direct;
    if (from?.w != null) return byId.get(from.w)?.w ?? null;
    if (from?.l != null) return byId.get(from.l)?.l ?? null;
    return null;
  };
  return bracket.map((m) => ({
    round: m.r,
    placement: m.p ?? null,
    a: slot(m.t1, m.t1_from),
    b: slot(m.t2, m.t2_from),
    winner: m.w,
    loser: m.l,
  }));
}

export async function buildSeasonHistory(leagueId: string): Promise<SeasonHistory> {
  const [league, rosters, users, bracketRaw] = await Promise.all([
    getLeague(leagueId),
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
    getWinnersBracket(leagueId).catch(() => [] as SleeperBracketMatchup[]),
  ]);

  const settings = league.settings as Record<string, unknown>;
  const playoffWeekStart = Number(settings.playoff_week_start) || 15;
  const playoffTeams = Number(settings.playoff_teams) || 6;
  const complete = league.status === "complete";

  const userMap = new Map<string, SleeperLeagueUser>();
  users.forEach((u) => userMap.set(u.user_id, u));

  const franchiseOf = new Map<number, string>();
  const names = new Map<string, string>();
  const owners: Record<string, string> = {};
  const avatars: Record<string, string | null> = {};
  rosters.forEach((roster) => {
    const id = roster.owner_id || `roster-${roster.roster_id}`;
    const user = roster.owner_id ? userMap.get(roster.owner_id) : undefined;
    franchiseOf.set(roster.roster_id, id);
    names.set(id, user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`);
    owners[id] = user?.display_name ?? "";
    avatars[id] = user?.avatar ? `${AVATAR_URL}${user.avatar}` : null;
  });

  const bracket = resolveBracket(bracketRaw);
  const maxRound = bracket.reduce((max, m) => Math.max(max, m.round), 0);
  const lastWeek = playoffWeekStart - 1 + maxRound;

  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);
  const weekly = await Promise.all(
    weeks.map((week) =>
      getLeagueMatchups(leagueId, week)
        .then((matchups) => ({ week, matchups }))
        .catch(() => ({ week, matchups: [] as Awaited<ReturnType<typeof getLeagueMatchups>> })),
    ),
  );

  const games: HistoryGame[] = [];
  weekly.forEach(({ week, matchups }) => {
    const groups = new Map<number, typeof matchups>();
    matchups.forEach((m) => {
      if (m.matchup_id == null) return;
      groups.set(m.matchup_id, [...(groups.get(m.matchup_id) ?? []), m]);
    });
    groups.forEach((group) => {
      if (group.length !== 2) return;
      const [x, y] = group;
      const scoreA = x.points || 0;
      const scoreB = y.points || 0;
      if (scoreA === 0 && scoreB === 0) return;
      const a = franchiseOf.get(x.roster_id);
      const b = franchiseOf.get(y.roster_id);
      if (!a || !b) return;

      let kind: GameKind = "regular";
      let label: string | undefined;
      if (week >= playoffWeekStart) {
        const round = week - playoffWeekStart + 1;
        const match = bracket.find(
          (m) =>
            m.round === round &&
            ((m.a === x.roster_id && m.b === y.roster_id) || (m.a === y.roster_id && m.b === x.roster_id)),
        );
        if (!match) {
          kind = "consolation";
          label = "Consolation";
        } else if (match.placement === 1) {
          kind = "playoff";
          label = "Championship";
        } else if (match.placement === 3) {
          kind = "playoff";
          label = "3rd Place Game";
        } else if (match.placement != null) {
          kind = "consolation";
          label = `${ordinal(match.placement)} Place Game`;
        } else {
          kind = "playoff";
          label = round === maxRound - 1 ? "Semifinal" : round === maxRound - 2 ? "Quarterfinal" : `Round ${round}`;
        }
      }
      games.push({ season: league.season, week, kind, label, a, b, scoreA, scoreB });
    });
  });

  const totals = new Map<string, { wins: number; losses: number; ties: number; pf: number; pa: number }>();
  franchiseOf.forEach((id) => totals.set(id, { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }));
  games
    .filter((g) => g.kind === "regular")
    .forEach((g) => {
      const ta = totals.get(g.a);
      const tb = totals.get(g.b);
      if (!ta || !tb) return;
      ta.pf += g.scoreA;
      ta.pa += g.scoreB;
      tb.pf += g.scoreB;
      tb.pa += g.scoreA;
      if (g.scoreA > g.scoreB) {
        ta.wins++;
        tb.losses++;
      } else if (g.scoreB > g.scoreA) {
        tb.wins++;
        ta.losses++;
      } else {
        ta.ties++;
        tb.ties++;
      }
    });

  const ranked = rosters
    .map((r) => ({ roster: r, id: franchiseOf.get(r.roster_id) as string }))
    .sort((p, q) => {
      const a = totals.get(p.id)!;
      const b = totals.get(q.id)!;
      const pct = (t: typeof a) => (t.wins + t.ties / 2) / Math.max(1, t.wins + t.losses + t.ties);
      return pct(b) - pct(a) || b.pf - a.pf;
    });

  const hasBracket = bracket.length > 0;
  const playoffRosters = new Set<number>();
  bracket.forEach((m) => {
    const titlePath = m.placement == null || m.placement === 1 || m.placement === 3;
    if (m.round === 1 || titlePath) {
      if (m.a != null) playoffRosters.add(m.a);
      if (m.b != null) playoffRosters.add(m.b);
    }
  });
  const finalGame = bracket.find((m) => m.placement === 1);
  const thirdGame = bracket.find((m) => m.placement === 3);
  const placed = new Map<number, PlayoffResult>();
  if (finalGame?.winner != null) placed.set(finalGame.winner, "champion");
  if (finalGame?.loser != null) placed.set(finalGame.loser, "runner_up");
  if (thirdGame?.winner != null) placed.set(thirdGame.winner, "third");
  if (thirdGame?.loser != null) placed.set(thirdGame.loser, "fourth");

  const teams: HistoryTeamSeason[] = ranked.map(({ roster, id }, index) => {
    const t = totals.get(id)!;
    const made = complete ? (hasBracket ? playoffRosters.has(roster.roster_id) : index < playoffTeams) : null;
    const result: PlayoffResult | null = !complete ? null : placed.get(roster.roster_id) ?? (made ? "playoffs" : "missed");
    return {
      franchiseId: id,
      rosterId: roster.roster_id,
      name: names.get(id) as string,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      pointsFor: Math.round(t.pf * 100) / 100,
      pointsAgainst: Math.round(t.pa * 100) / 100,
      rank: index + 1,
      division: ((roster.settings as Record<string, unknown>).division as number | undefined) ?? null,
      madePlayoffs: made,
      result,
    };
  });

  const idOf = (rosterId: number | null | undefined) => (rosterId != null ? franchiseOf.get(rosterId) ?? null : null);

  return {
    season: {
      season: league.season,
      leagueId,
      complete,
      playoffWeekStart,
      playoffTeams,
      teams,
      championId: idOf(finalGame?.winner),
      runnerUpId: idOf(finalGame?.loser),
      thirdId: idOf(thirdGame?.winner),
    },
    games,
    owners,
    avatars,
  };
}

/** Stitches per-season histories (oldest first) into the league-wide view. */
export function assembleLeagueHistory(leagueName: string, seasons: SeasonHistory[]): LeagueHistory {
  const ordered = [...seasons].sort((a, b) => a.season.season.localeCompare(b.season.season));
  const latest = new Map<string, HistoryFranchise>();
  ordered.forEach((s) => {
    s.season.teams.forEach((team) => {
      latest.set(team.franchiseId, {
        id: team.franchiseId,
        name: team.name,
        initials: initialsOf(team.name),
        avatar: s.avatars[team.franchiseId] ?? latest.get(team.franchiseId)?.avatar ?? null,
        ownerName: s.owners[team.franchiseId] || latest.get(team.franchiseId)?.ownerName || null,
      });
    });
  });
  return {
    leagueName,
    generatedAt: new Date().toISOString(),
    franchises: Array.from(latest.values()).sort((a, b) => a.name.localeCompare(b.name)),
    seasons: ordered.map((s) => s.season),
    games: ordered.flatMap((s) => s.games),
  };
}