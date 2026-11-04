export interface BracketSource {
  w?: number;
  l?: number;
}

export interface ProjectedBracketMatch {
  r: number;
  m: number;
  t1: number | null;
  t2: number | null;
  w: number | null;
  l: number | null;
  t1_from?: BracketSource;
  t2_from?: BracketSource;
  p?: number;
}

function standardSeedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2;
    order = order.flatMap((seed) => [seed, next + 1 - seed]);
  }
  return order;
}

/**
 * Builds the single-elimination bracket a league would play if the season ended now.
 * Top seeds get byes, and slots are ordered like a traditional bracket (1 v 8, 4 v 5, 2 v 7, 3 v 6).
 */
export function buildProjectedBracket(rosterIdsBySeed: number[]): ProjectedBracketMatch[] {
  const teamCount = rosterIdsBySeed.length;
  if (teamCount < 2) return [];

  let size = 2;
  while (size < teamCount) size *= 2;

  type Slot = { team: number } | { match: number } | null;
  let slots: Slot[] = standardSeedOrder(size).map((seed) =>
    seed <= teamCount ? { team: rosterIdsBySeed[seed - 1] } : null,
  );

  const matches: ProjectedBracketMatch[] = [];
  let matchId = 0;
  let round = 1;

  while (slots.length > 1) {
    const next: Slot[] = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i];
      const b = slots[i + 1];
      if (!a || !b) {
        next.push(a ?? b);
        continue;
      }
      matchId += 1;
      const match: ProjectedBracketMatch = {
        r: round,
        m: matchId,
        t1: "team" in a ? a.team : null,
        t2: "team" in b ? b.team : null,
        w: null,
        l: null,
      };
      if ("match" in a) match.t1_from = { w: a.match };
      if ("match" in b) match.t2_from = { w: b.match };
      matches.push(match);
      next.push({ match: matchId });
    }
    slots = next;
    round += 1;
  }

  if (matches.length > 0) matches[matches.length - 1].p = 1;
  return matches;
}

export interface LayoutMatchInput {
  matchupId: number;
  round: number;
  team1Id: number | null;
  team2Id: number | null;
  team1From?: BracketSource;
  team2From?: BracketSource;
  winner: number | null;
  placement?: number;
}

export interface MatchLayoutNode {
  kind: "match";
  key: string;
  matchupId: number;
  col: number;
  y: number;
  childKeys: string[];
}

export interface ByeLayoutNode {
  kind: "bye";
  key: string;
  teamId: number | null;
  col: number;
  y: number;
}

export type BracketLayoutNode = MatchLayoutNode | ByeLayoutNode;

export interface BracketLayout {
  nodes: BracketLayoutNode[];
  columns: number;
  /** Total height in slot units; node y values are slot centers (0.5, 1.5, ...). */
  height: number;
  firstRound: number;
}

/**
 * Lays matches out as a tree rooted at the championship game. Teams that skipped a round
 * (byes) become their own node so the bracket reads like a traditional printed bracket.
 */
export function layoutBracket(input: LayoutMatchInput[]): BracketLayout {
  const matches = input.filter((m) => m.placement == null || m.placement === 1);
  if (matches.length === 0) return { nodes: [], columns: 0, height: 0, firstRound: 1 };

  const byId = new Map(matches.map((m) => [m.matchupId, m]));
  const firstRound = Math.min(...matches.map((m) => m.round));
  const lastRound = Math.max(...matches.map((m) => m.round));
  const final =
    matches.find((m) => m.placement === 1) ??
    matches.filter((m) => m.round === lastRound).sort((a, b) => a.matchupId - b.matchupId)[0];

  const nodes: BracketLayoutNode[] = [];
  let leafCount = 0;
  const claimed = new Set<number>();

  const resolveChild = (
    parent: LayoutMatchInput,
    teamId: number | null,
    from: BracketSource | undefined,
  ): LayoutMatchInput | null => {
    const fromId = from?.w;
    if (fromId != null) {
      const feeder = byId.get(fromId);
      if (feeder && feeder.round < parent.round && !claimed.has(feeder.matchupId)) return feeder;
    }
    if (teamId != null) {
      const feeder = matches
        .filter((m) => m.round < parent.round && m.winner === teamId && !claimed.has(m.matchupId))
        .sort((a, b) => b.round - a.round)[0];
      if (feeder) return feeder;
    }
    return null;
  };

  const visit = (match: LayoutMatchInput): MatchLayoutNode => {
    claimed.add(match.matchupId);
    const key = `m${match.matchupId}`;
    const node: MatchLayoutNode = {
      kind: "match",
      key,
      matchupId: match.matchupId,
      col: match.round - firstRound,
      y: 0,
      childKeys: [],
    };

    if (match.round === firstRound) {
      leafCount += 1;
      node.y = leafCount - 0.5;
      nodes.push(node);
      return node;
    }

    const sides: Array<[number | null, BracketSource | undefined]> = [
      [match.team1Id, match.team1From],
      [match.team2Id, match.team2From],
    ];
    const childYs: number[] = [];
    sides.forEach(([teamId, from], idx) => {
      const feeder = resolveChild(match, teamId, from);
      if (feeder) {
        const child = visit(feeder);
        node.childKeys.push(child.key);
        childYs.push(child.y);
      } else {
        leafCount += 1;
        const bye: ByeLayoutNode = {
          kind: "bye",
          key: `${key}-bye${idx}`,
          teamId,
          col: match.round - firstRound - 1,
          y: leafCount - 0.5,
        };
        nodes.push(bye);
        node.childKeys.push(bye.key);
        childYs.push(bye.y);
      }
    });

    node.y = childYs.reduce((a, b) => a + b, 0) / childYs.length;
    nodes.push(node);
    return node;
  };

  visit(final);

  return {
    nodes,
    columns: lastRound - firstRound + 1,
    height: leafCount,
    firstRound,
  };
}
