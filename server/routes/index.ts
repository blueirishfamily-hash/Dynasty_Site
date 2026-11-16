import type { Express } from "express";
import type { Server } from "http";
import { isCommissioner } from "../middleware/commissioner";
import { registerSleeperProxyRoutes } from "./sleeperProxy";
import { registerPlayersRoutes } from "./players";
import { registerContractsRoutes } from "./contracts";
import { registerStandingsRoutes } from "./standings";
import { registerMatchupsRoutes } from "./matchups";
import { registerRostersRoutes } from "./rosters";
import { registerRookieContractsRoutes } from "./rookieContracts";
import { registerDraftRoutes } from "./draft";
import { registerPlayoffsRoutes } from "./playoffs";
import { registerHistoryRoutes } from "./history";
import { registerAnalyticsRoutes } from "./analytics";
import { registerGovernanceRoutes } from "./governance";
import { registerSettingsRoutes } from "./settings";
import { registerFreeAgencyRoutes } from "./freeAgency";
import { registerLeagueAdminRoutes } from "./leagueAdmin";
import { registerHistoricalRoutes } from "./historical";
import { registerDraftProspectsRoutes } from "./draftProspects";

// Route files register in this order. Express matches routes in registration order, so when two
// paths can match the same request, the earlier one wins. The split kept every such pair in its
// original order.
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerSleeperProxyRoutes(app);
  registerPlayersRoutes(app);
  registerContractsRoutes(app);
  registerStandingsRoutes(app);
  registerMatchupsRoutes(app);
  registerRostersRoutes(app);
  registerRookieContractsRoutes(app);
  registerDraftRoutes(app);
  registerPlayoffsRoutes(app);
  registerHistoryRoutes(app);
  registerAnalyticsRoutes(app);
  registerGovernanceRoutes(app);
  registerSettingsRoutes(app);
  registerFreeAgencyRoutes(app);
  registerLeagueAdminRoutes(app);
  registerHistoricalRoutes(app);
  registerDraftProspectsRoutes(app);

  const { registerContractHubRoutes } = await import("../contractHubRoutes");
  registerContractHubRoutes(app);
  const { registerPositionRadarRoutes } = await import("../positionRadar");
  registerPositionRadarRoutes(app);
  const { registerCommissionerEditRoutes } = await import("../commissionerEdits");
  registerCommissionerEditRoutes(app, isCommissioner);

  return httpServer;
}
