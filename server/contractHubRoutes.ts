import type { Express } from "express";
import { storage } from "./storage";
import { registerSandboxRoutes } from "./testSandbox";
import {
  RFA_ENABLED,
  canMatchRFA,
  createInSeasonSigning,
  designateRFA,
  getCurrentPhase,
  LEAGUE_PHASES,
  parseContractSalaries,
  parsePhaseConfig,
  resolveBids,
  validateRoundResolution,
  validateTrade,
  type BidInput,
  type LeaguePhaseId,
  type PhaseConfigEntry,
  type TeamCapInput,
  type TradePlayerSide,
} from "../shared/contractRules";

const PHASE_SETTINGS_KEY = "contract_phases_json";
const PHASE_OVERRIDE_KEY = "contract_current_phase";
const PPG_MIN_GAMES_KEY = "contracts_hub_ppg_min_games";
const ROUND_CONFIRM_PREFIX = "round_confirm_";

async function buildTeamCapInput(
  leagueId: string,
  rosterId: number,
  season: number,
  extraCapHoldSalaries?: Array<{ playerId: string; yearlySalary: number; years: number }>,
): Promise<TeamCapInput> {
  const contracts = await storage.getPlayerContracts(leagueId);
  const deadCap = await storage.getDeadCapEntriesByLeague(leagueId);
  const teamContracts = contracts
    .filter(c => c.rosterId === rosterId)
    .map(c => ({
      playerId: c.playerId,
      salaries: parseContractSalaries(c.salaries),
      isRookieContract: c.isRookieContract,
      franchiseTagUsed: c.franchiseTagUsed,
    }));
  const deadCapByYear: Record<number, number> = {};
  for (const dc of deadCap.filter(d => d.rosterId === rosterId)) {
    try {
      const raw = typeof dc.deadCapSalaries === "string" ? JSON.parse(dc.deadCapSalaries) : dc.deadCapSalaries;
      for (const [y, v] of Object.entries(raw)) {
        const year = Number(y);
        deadCapByYear[year] = (deadCapByYear[year] || 0) + (Number(v) || 0) / 10;
      }
    } catch { /* ignore */ }
  }
  const capHolds = (extraCapHoldSalaries || []).map(h => ({
    playerId: h.playerId,
    yearlySalary: h.yearlySalary,
    startYear: season,
    years: h.years,
  }));
  return { rosterId, contracts: teamContracts, deadCapByYear, capHolds };
}

async function getPhaseState(leagueId: string) {
  const json = await storage.getLeagueSetting(leagueId, PHASE_SETTINGS_KEY);
  const override = await storage.getLeagueSetting(leagueId, PHASE_OVERRIDE_KEY);
  const phases = parsePhaseConfig(json);
  const current = getCurrentPhase(
    phases,
    Date.now(),
    (override as LeaguePhaseId) || null,
  );
  return { phases, current };
}

async function logTx(leagueId: string, type: string, rosterId: number | null, payload: Record<string, unknown>) {
  await storage.logContractTransaction({
    leagueId,
    rosterId: rosterId ?? undefined,
    type,
    payloadJson: JSON.stringify(payload),
  });
}

/**
 * Picks the winning bid on every player for a round: highest total value, ties to the higher yearly salary.
 * Winning bids get result "won", the rest "lost". Safe to run again; it decides the same bids the same way.
 */
async function resolveRoundBids(leagueId: string, round: number, season: number) {
  const bids = await storage.getBidsByLeagueRound(leagueId, round, season);
  const byPlayer = new Map<string, BidInput[]>();
  for (const b of bids.filter(x => x.status === "active" && !x.result)) {
    const list = byPlayer.get(b.playerId) || [];
    list.push({
      id: b.id,
      rosterId: b.rosterId,
      playerId: b.playerId,
      bidAmount: b.bidAmount,
      contractYears: b.contractYears,
      createdAt: b.createdAt,
      isRfa: b.isRfa === 1,
      originalRosterId: b.originalRosterId,
    });
    byPlayer.set(b.playerId, list);
  }
  const winners: Array<{ playerId: string; bidId: string; rosterId: number; isRfa: boolean; originalRosterId: number | null }> = [];
  for (const [playerId, playerBids] of byPlayer) {
    const { winner } = resolveBids(playerId, playerBids);
    if (!winner) continue;
    for (const b of playerBids) {
      const result = b.id === winner.id ? "won" : "lost";
      await storage.updatePlayerBid(b.id, b.rosterId, { result } as any);
    }
    const winBid = bids.find(x => x.id === winner.id)!;
    winners.push({
      playerId,
      bidId: winner.id,
      rosterId: winner.rosterId,
      isRfa: winBid.isRfa === 1,
      originalRosterId: winBid.originalRosterId,
    });
  }
  await logTx(leagueId, "fa_round_resolve", null, { round, season, winnerCount: winners.length });
  return winners;
}

/** True once the league has reached the results phase for this round (or moved past it). */
async function roundResultsAreOpen(leagueId: string, round: number) {
  const { current } = await getPhaseState(leagueId);
  const resultsPhase = round === 2 ? "round_2_results" : "round_1_results";
  return LEAGUE_PHASES.indexOf(current) >= LEAGUE_PHASES.indexOf(resultsPhase);
}

export function registerContractHubRoutes(app: Express) {
  registerSandboxRoutes(app);
  app.get("/api/league/:leagueId/contract-phase", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const state = await getPhaseState(leagueId);
      const ppgMin = await storage.getLeagueSetting(leagueId, PPG_MIN_GAMES_KEY);
      res.json({
        ...state,
        ppgMinGames: ppgMin ? parseInt(ppgMin, 10) : 3,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load phase" });
    }
  });

  app.put("/api/league/:leagueId/contract-phase", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { phases, currentPhase, ppgMinGames } = req.body as {
        phases?: PhaseConfigEntry[];
        currentPhase?: LeaguePhaseId;
        ppgMinGames?: number;
      };
      if (phases) {
        await storage.setLeagueSetting(leagueId, PHASE_SETTINGS_KEY, JSON.stringify(phases));
      }
      if (currentPhase) {
        await storage.setLeagueSetting(leagueId, PHASE_OVERRIDE_KEY, currentPhase);
      }
      if (ppgMinGames != null) {
        await storage.setLeagueSetting(leagueId, PPG_MIN_GAMES_KEY, String(ppgMinGames));
      }
      const state = await getPhaseState(leagueId);
      res.json(state);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to update phase" });
    }
  });

  /** Players already signed (bid won and kept) in an earlier round of this season's free agency. */
  async function signedEarlierPlayerIds(leagueId: string, round: number, season: number): Promise<Set<string>> {
    const ids = new Set<string>();
    for (let r = 1; r < round; r++) {
      const bids = await storage.getBidsByLeagueRound(leagueId, r, season);
      for (const b of bids) if (b.result === "kept") ids.add(b.playerId);
    }
    return ids;
  }

  app.get("/api/league/:leagueId/fa-signed", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const season = parseInt(String(req.query.season), 10) || new Date().getFullYear();
      const round = parseInt(String(req.query.round), 10) || 1;
      res.json({ playerIds: Array.from(await signedEarlierPlayerIds(leagueId, round, season)) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load signed players" });
    }
  });

  /** Every bid that was won and kept this season, across both rounds, for the free agency recap. */
  app.get("/api/league/:leagueId/fa-recap", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const season = parseInt(String(req.query.season), 10) || new Date().getFullYear();
      const signings: Array<Record<string, unknown>> = [];
      for (const round of [1, 2]) {
        const bids = await storage.getBidsByLeagueRound(leagueId, round, season);
        for (const b of bids) {
          if (b.result !== "kept") continue;
          signings.push({
            id: b.id,
            rosterId: b.rosterId,
            playerId: b.playerId,
            playerName: b.playerName,
            playerPosition: b.playerPosition,
            playerTeam: b.playerTeam,
            bidAmount: b.bidAmount,
            contractYears: b.contractYears,
            round,
          });
        }
      }
      res.json({ signings });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load recap" });
    }
  });

  app.post("/api/league/:leagueId/fa-bids", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, playerId, playerName, playerPosition, playerTeam, bidAmount, contractYears, round, season, isRfa, originalRosterId } = req.body;
      const phase = (await getPhaseState(leagueId)).current;
      if (phase !== "fa_round_1" && phase !== "fa_round_2") {
        return res.status(400).json({ error: "Bidding not open in current phase", reason: `Phase is ${phase}` });
      }
      // RFA is paused: every bid is a plain free agent bid.
      const bidIsRfa = RFA_ENABLED && !!isRfa;
      if (bidIsRfa && originalRosterId === rosterId) {
        return res.status(400).json({ error: "Cannot bid on your own designated RFA" });
      }
      const bidRound = round ?? (phase === "fa_round_2" ? 2 : 1);
      const bidSeason = season ?? new Date().getFullYear();
      if ((await signedEarlierPlayerIds(leagueId, bidRound, bidSeason)).has(playerId)) {
        return res.status(400).json({ error: "Player already signed", reason: "This player was signed in an earlier round and is no longer a free agent." });
      }
      // One open bid per team per player per round: bidding again changes the existing bid.
      const existingBids = await storage.getBidsByLeagueRound(leagueId, bidRound, bidSeason);
      const existing = existingBids.find(b => b.rosterId === rosterId && b.playerId === playerId && b.status === "active");
      if (existing) {
        const updated = await storage.updatePlayerBid(existing.id, rosterId, {
          bidAmount,
          contractYears: contractYears || 1,
          isRfa: bidIsRfa ? 1 : 0,
          originalRosterId: bidIsRfa ? originalRosterId ?? null : null,
        } as any);
        await logTx(leagueId, "fa_bid_update", rosterId, { bidId: existing.id, playerId, bidAmount, contractYears });
        return res.json(updated ?? existing);
      }
      const bid = await storage.createPlayerBid({
        leagueId,
        rosterId,
        playerId,
        playerName,
        playerPosition: playerPosition || "NA",
        playerTeam: playerTeam || null,
        bidAmount,
        contractYears: contractYears || 1,
        round: round ?? (phase === "fa_round_2" ? 2 : 1),
        season: season ?? new Date().getFullYear(),
        isRfa: bidIsRfa ? 1 : 0,
        originalRosterId: bidIsRfa ? originalRosterId ?? null : null,
      } as any);
      await logTx(leagueId, "fa_bid", rosterId, { bidId: bid.id, playerId, bidAmount, contractYears });
      res.json(bid);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to place bid" });
    }
  });

  app.post("/api/league/:leagueId/fa-round/resolve", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { round, season } = req.body;
      const winners = await resolveRoundBids(leagueId, round, season);
      res.json({ winners });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to resolve round" });
    }
  });

  app.get("/api/league/:leagueId/roster/:rosterId/round-wins", async (req, res) => {
    try {
      const { leagueId, rosterId } = req.params;
      const round = String(req.query.round || "1");
      const season = String(req.query.season || "");
      // Winners are picked automatically the first time anyone looks once the round's results phase is open.
      const roundNum = parseInt(round, 10);
      const seasonNum = parseInt(season, 10);
      if (!Number.isNaN(seasonNum) && (await roundResultsAreOpen(leagueId, roundNum))) {
        const roundBids = await storage.getBidsByLeagueRound(leagueId, roundNum, seasonNum);
        if (roundBids.some(b => b.status === "active") && roundBids.every(b => !b.result)) {
          await resolveRoundBids(leagueId, roundNum, seasonNum);
        }
      }
      // Undecided wins plus the ones already confirmed, so a team can still see what it kept after confirming.
      const rid = parseInt(rosterId, 10);
      const decided = await Promise.all(["won", "kept", "rejected"].map(r => storage.getBidsWithResult(leagueId, rid, r)));
      const wins = decided.flat().filter(b => b.round === roundNum && b.season === seasonNum);
      const confirmKey = `${ROUND_CONFIRM_PREFIX}${round}_${season}_${rosterId}`;
      const confirmed = await storage.getLeagueSetting(leagueId, confirmKey);
      res.json({ wins, confirmed: confirmed === "true" });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch wins" });
    }
  });

  app.post("/api/league/:leagueId/roster/:rosterId/round-confirm", async (req, res) => {
    try {
      const { leagueId, rosterId: rid } = req.params;
      const rosterId = parseInt(rid, 10);
      const { round, season, rejectedBidIds } = req.body as { round: number; season: number; rejectedBidIds: string[] };
      const wins = await storage.getBidsWithResult(leagueId, rosterId, "won");
      const rejectSet = new Set(rejectedBidIds || []);
      const kept = wins.filter(w => !rejectSet.has(w.id));
      const team = await buildTeamCapInput(leagueId, rosterId, season);
      const flat = kept.map(w => ({
        yearlySalary: w.bidAmount,
        startYear: season,
        years: w.contractYears,
        playerId: w.playerId,
      }));
      const validation = validateRoundResolution(team, flat, season);
      if (!validation.canConfirm) {
        return res.status(400).json({ error: "Cannot confirm", reason: validation.reason, bySeason: validation.bySeason });
      }
      for (const w of wins) {
        const result = rejectSet.has(w.id) ? "rejected" : "kept";
        await storage.updatePlayerBid(w.id, rosterId, { result } as any);
        if (RFA_ENABLED && result === "kept" && w.isRfa === 1 && w.originalRosterId != null) {
          const window = round === 1 ? 1 : 2;
          await storage.createRfaOffer({
            leagueId,
            season,
            window,
            playerId: w.playerId,
            originalRosterId: w.originalRosterId,
            biddingRosterId: rosterId,
            contractYears: w.contractYears,
            yearlySalary: w.bidAmount,
            bidId: w.id,
          } as any);
        }
      }
      const confirmKey = `${ROUND_CONFIRM_PREFIX}${round}_${season}_${rosterId}`;
      await storage.setLeagueSetting(leagueId, confirmKey, "true");
      await logTx(leagueId, "round_confirm", rosterId, { round, season, kept: kept.length, rejected: rejectSet.size });
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to confirm" });
    }
  });

  app.post("/api/league/:leagueId/rfa/designate", async (req, res) => {
    try {
      if (!RFA_ENABLED) return res.status(400).json({ error: "RFA is turned off for now" });
      const { leagueId } = req.params;
      const { rosterId, playerId, playerName, season, isExpiringRookie } = req.body;
      const { current } = await getPhaseState(leagueId);
      const existing = await storage.getRfaDesignations(leagueId, season);
      const check = designateRFA(existing, {
        leagueId,
        season,
        rosterId,
        playerId,
        currentPhase: current,
        isExpiringRookie: !!isExpiringRookie,
      });
      if (!check.ok) return res.status(400).json({ error: check.reason });
      const row = await storage.createRfaDesignation({ leagueId, season, rosterId, playerId, playerName });
      await logTx(leagueId, "rfa_designate", rosterId, { playerId });
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: "Failed to designate RFA" });
    }
  });

  app.get("/api/league/:leagueId/rfa", async (req, res) => {
    try {
      if (!RFA_ENABLED) return res.json({ designations: [], offers: [], enabled: false });
      const { leagueId } = req.params;
      const season = parseInt(String(req.query.season), 10);
      const designations = await storage.getRfaDesignations(leagueId, season);
      const offers = await storage.getRfaOffers(leagueId, season);
      res.json({ designations, offers });
    } catch (e) {
      res.status(500).json({ error: "Failed to load RFA data" });
    }
  });

  app.post("/api/league/:leagueId/rfa/:offerId/match", async (req, res) => {
    try {
      if (!RFA_ENABLED) return res.status(400).json({ error: "RFA is turned off for now" });
      const { leagueId, offerId } = req.params;
      const offers = await storage.getRfaOffers(leagueId, parseInt(String(req.body.season), 10));
      const offer = offers.find(o => o.id === offerId);
      if (!offer) return res.status(404).json({ error: "Offer not found" });
      const team = await buildTeamCapInput(leagueId, offer.originalRosterId, offer.season);
      const matchCheck = canMatchRFA(team, {
        yearlySalary: offer.yearlySalary,
        startYear: offer.season,
        years: offer.contractYears,
      });
      if (!matchCheck.eligible) return res.status(400).json({ error: matchCheck.reason });
      await storage.updateRfaOfferStatus(offerId, "matched");
      await logTx(leagueId, "rfa_match", offer.originalRosterId, { offerId });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to match" });
    }
  });

  app.post("/api/league/:leagueId/rfa/:offerId/walk", async (req, res) => {
    try {
      if (!RFA_ENABLED) return res.status(400).json({ error: "RFA is turned off for now" });
      const { leagueId, offerId } = req.params;
      // Window closed with no decision — treat as walk (configurable later).
      await storage.updateRfaOfferStatus(offerId, "walked");
      await logTx(leagueId, "rfa_walk", null, { offerId });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to walk" });
    }
  });

  app.post("/api/league/:leagueId/trade-offers", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season, teamARosterId, teamBRosterId, teamASends, teamBSends } = req.body as {
        season: number;
        teamARosterId: number;
        teamBRosterId: number;
        teamASends: TradePlayerSide[];
        teamBSends: TradePlayerSide[];
      };
      const teamA = await buildTeamCapInput(leagueId, teamARosterId, season);
      const teamB = await buildTeamCapInput(leagueId, teamBRosterId, season);
      const salaryABefore = teamA.contracts.reduce((s, c) => s + (c.salaries[season] || 0), 0) + (teamA.deadCapByYear[season] || 0);
      const salaryBBefore = teamB.contracts.reduce((s, c) => s + (c.salaries[season] || 0), 0) + (teamB.deadCapByYear[season] || 0);
      const validation = validateTrade(
        { salaryBefore: salaryABefore },
        { salaryBefore: salaryBBefore },
        teamASends,
        teamBSends,
      );
      const offer = await storage.createTradeOffer({
        leagueId,
        season,
        teamARosterId,
        teamBRosterId,
        teamASendsJson: JSON.stringify(teamASends),
        teamBSendsJson: JSON.stringify(teamBSends),
        validationJson: JSON.stringify(validation),
      } as any);
      await logTx(leagueId, "trade_offer", teamARosterId, { offerId: offer.id, bothPass: validation.bothPass });
      res.json({ offer, validation });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create trade offer" });
    }
  });

  app.post("/api/league/:leagueId/in-season-signing", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, playerId, faabBid } = req.body;
      const signing = createInSeasonSigning(faabBid ?? null);
      await logTx(leagueId, "in_season_signing", rosterId, { playerId, ...signing });
      res.json(signing);
    } catch (e) {
      res.status(500).json({ error: "Failed to create signing" });
    }
  });

  app.get("/api/league/:leagueId/roster/:rosterId/cap-check", async (req, res) => {
    try {
      const { leagueId, rosterId } = req.params;
      const season = parseInt(String(req.query.season), 10);
      const team = await buildTeamCapInput(leagueId, parseInt(rosterId, 10), season);
      const pendingOffers = await storage.getRfaOffersForBiddingRoster(leagueId, season, parseInt(rosterId, 10));
      const holds = pendingOffers
        .filter(o => o.status === "pending")
        .map(o => ({ playerId: o.playerId, yearlySalary: o.yearlySalary, years: o.contractYears }));
      const withHolds = await buildTeamCapInput(leagueId, parseInt(rosterId, 10), season, holds);
      res.json({ team: withHolds });
    } catch (e) {
      res.status(500).json({ error: "Failed cap check" });
    }
  });
}
