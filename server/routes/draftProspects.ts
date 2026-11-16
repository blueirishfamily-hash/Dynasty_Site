// Draft prospects.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { storage } from "../storage";
import { getAllPlayers, type SleeperPlayer } from "../sleeper";
import { requireCommissioner } from "../security/guards";

export function registerDraftProspectsRoutes(app: Express): void {
  // Draft Prospects API (top 40 incoming rookies, 2026 class)
  const DEFAULT_COMBINE_URL = "https://www.cbssports.com/nfl/draft/news/2026-nfl-combine-results-full-list-measurements-40-times/";
  const DEFAULT_AWARDS_URL = "https://www.cbssports.com/college-football/news/college-football-awards-2025-where-to-watch-winners/";

  app.get("/api/league/:leagueId/draft-prospects", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const season = (req.query.season as string) || "2026";
      if (!leagueId) return res.status(400).json({ error: "League ID is required" });
      const prospects = await storage.getDraftProspects(leagueId, season);
      let playersMap: Record<string, SleeperPlayer> = {};
      try {
        playersMap = await getAllPlayers();
      } catch {
        // ignore
      }
      const enriched = prospects.map((p) => {
        const sleeper = p.sleeperPlayerId ? playersMap[p.sleeperPlayerId] : null;
        return {
          ...p,
          photoUrl: sleeper ? `https://sleepercdn.com/content/nfl/players/${p.sleeperPlayerId}.jpg` : null,
          sleeperTeam: sleeper?.team ?? null,
          sleeperCollege: sleeper?.college ?? null,
        };
      });
      res.json(enriched);
    } catch (error: any) {
      console.error("Error fetching draft prospects:", error);
      const msg = error?.message || "Failed to fetch draft prospects";
      const schemaHint = /column.*does not exist|relation.*does not exist/i.test(String(msg))
        ? " Run 'npm run db:push' to sync the database schema."
        : "";
      res.status(500).json({ error: msg + schemaHint });
    }
  });

  app.get("/api/league/:leagueId/draft-prospects/:id", async (req, res) => {
    try {
      const { leagueId, id } = req.params;
      if (!leagueId || !id) return res.status(400).json({ error: "League ID and prospect ID required" });
      const prospect = await storage.getDraftProspectById(id, leagueId);
      if (!prospect) return res.status(404).json({ error: "Prospect not found" });
      let sleeper: SleeperPlayer | null = null;
      if (prospect.sleeperPlayerId) {
        try {
          const players = await getAllPlayers();
          sleeper = players[prospect.sleeperPlayerId] ?? null;
        } catch {
          // ignore
        }
      }
      res.json({
        ...prospect,
        photoUrl: prospect.sleeperPlayerId ? `https://sleepercdn.com/content/nfl/players/${prospect.sleeperPlayerId}.jpg` : null,
        sleeperTeam: sleeper?.team ?? null,
        sleeperCollege: sleeper?.college ?? null,
      });
    } catch (error: any) {
      console.error("Error fetching draft prospect:", error);
      res.status(500).json({ error: error?.message || "Failed to fetch draft prospect" });
    }
  });

  app.post("/api/league/:leagueId/draft-prospects", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { userId, prospects: prospectsBody, season = "2026" } = req.body;
      if (!leagueId || !userId) return res.status(400).json({ error: "League ID and userId required" });
      if (!(await requireCommissioner(req, res))) return;
      const arr = Array.isArray(prospectsBody) ? prospectsBody : [];
      if (arr.length > 40) return res.status(400).json({ error: "Maximum 40 prospects allowed" });
      const prospects = arr.map((p: any) => ({
        displayName: String(p.displayName ?? p.name ?? "").trim(),
        position: p.position ? String(p.position).trim() : undefined,
        school: p.school ? String(p.school).trim() : undefined,
        age: p.age != null ? Number(p.age) : undefined,
        adp: p.adp != null ? Number(p.adp) : undefined,
      }));
      if (prospects.some((p: any) => !p.displayName)) return res.status(400).json({ error: "Each prospect must have a displayName" });
      const result = await storage.upsertDraftProspects(leagueId, season, prospects);
      try {
        await fillSchoolFromCfbd(leagueId, season);
      } catch (fillErr: any) {
        console.warn("Fill school from CFBD after add prospects:", fillErr?.message ?? fillErr);
      }
      const final = await storage.getDraftProspects(leagueId, season);
      res.json(final);
    } catch (error: any) {
      console.error("Error upserting draft prospects:", error);
      res.status(500).json({ error: error?.message || "Failed to upsert draft prospects" });
    }
  });

  app.put("/api/league/:leagueId/draft-prospects/:id", async (req, res) => {
    try {
      const { leagueId, id } = req.params;
      const { userId, ...data } = req.body;
      if (!leagueId || !id || !userId) return res.status(400).json({ error: "League ID, prospect ID, and userId required" });
      if (!(await requireCommissioner(req, res))) return;
      const updated = await storage.updateDraftProspect(id, leagueId, data);
      if (!updated) return res.status(404).json({ error: "Prospect not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating draft prospect:", error);
      res.status(500).json({ error: error?.message || "Failed to update draft prospect" });
    }
  });

  app.delete("/api/league/:leagueId/draft-prospects/:id", async (req, res) => {
    try {
      const { leagueId, id } = req.params;
      const userId = req.query.userId as string;
      if (!leagueId || !id || !userId) return res.status(400).json({ error: "League ID, prospect ID, and userId required" });
      if (!(await requireCommissioner(req, res))) return;
      await storage.deleteDraftProspect(id, leagueId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting draft prospect:", error);
      res.status(500).json({ error: error?.message || "Failed to delete draft prospect" });
    }
  });

  app.post("/api/league/:leagueId/draft-prospects/reorder", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { userId, orderedIds, season = "2026" } = req.body;
      if (!leagueId || !userId) return res.status(400).json({ error: "League ID and userId required" });
      if (!(await requireCommissioner(req, res))) return;
      const ids = Array.isArray(orderedIds) ? orderedIds : [];
      if (ids.length > 40) return res.status(400).json({ error: "Maximum 40 prospects" });
      const result = await storage.reorderDraftProspects(leagueId, season, ids);
      res.json(result);
    } catch (error: any) {
      console.error("Error reordering draft prospects:", error);
      res.status(500).json({ error: error?.message || "Failed to reorder draft prospects" });
    }
  });

  app.post("/api/league/:leagueId/draft-prospects/refresh", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { userId, season = "2026" } = req.body;
      if (!leagueId || !userId) return res.status(400).json({ error: "League ID and userId required" });
      if (!(await requireCommissioner(req, res))) return;
      const combineUrl = (await storage.getLeagueSetting(leagueId, "draft_combine_url")) || DEFAULT_COMBINE_URL;
      const awardsUrl = (await storage.getLeagueSetting(leagueId, "draft_awards_url")) || DEFAULT_AWARDS_URL;
      const prospects = await storage.getDraftProspects(leagueId, season);
      if (prospects.length === 0) return res.status(400).json({ error: "No prospects to update. Add prospects first." });

      const { load } = await import("cheerio");
      const normalizeName = (s: string) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\b(jr\.?|sr\.?|iii?|iv)\b/gi, "").trim();
      const nameAliases: Record<string, string> = { "k.c. concepcion": "kc concepcion", "mike washington jr.": "mike washington", "mike washington jr": "mike washington" };

      const updatesByProspectId = new Map<string, { combineData?: string; collegeAwards?: string }>();
      for (const p of prospects) updatesByProspectId.set(p.id, {});

      const prospectByNormalName = new Map<string, typeof prospects[0]>();
      for (const p of prospects) {
        const n = normalizeName(p.displayName);
        prospectByNormalName.set(n, p);
        const alt = nameAliases[n];
        if (alt) prospectByNormalName.set(alt, p);
      }

      let combineFetched = false;
      try {
        const combineRes = await fetch(combineUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DynastyApp/1.0)" } });
        if (combineRes.ok) {
          const html = await combineRes.text();
          const $ = load(html);
          const combineByPlayer = new Map<string, Record<string, string>>();
          $("table").each((_, table) => {
            const $table = $(table);
            const rows = $table.find("tr");
            if (rows.length < 2) return;
            const headerCells = $(rows[0]).find("td, th").map((__, c) => $(c).text().trim().toLowerCase()).get();
            const playerIdx = headerCells.findIndex((h: string) => h.includes("player") || h === "name");
            const heightIdx = headerCells.findIndex((h: string) => h.includes("height"));
            const weightIdx = headerCells.findIndex((h: string) => h.includes("weight"));
            const handIdx = headerCells.findIndex((h: string) => h === "hand" || h.includes("hand"));
            const armIdx = headerCells.findIndex((h: string) => h === "arm" || h.includes("arm"));
            const wingspanIdx = headerCells.findIndex((h: string) => h.includes("wingspan"));
            const fortyIdx = headerCells.findIndex((h: string) => h.includes("40") || h.includes("dash"));
            const tenIdx = headerCells.findIndex((h: string) => h.includes("10"));
            const vertIdx = headerCells.findIndex((h: string) => h.includes("vertical") || h === "vertical");
            const broadIdx = headerCells.findIndex((h: string) => h.includes("broad"));
            const benchIdx = headerCells.findIndex((h: string) => h.includes("bench"));
            const coneIdx = headerCells.findIndex((h: string) => h.includes("3-cone") || h.includes("cone"));
            const shuttleIdx = headerCells.findIndex((h: string) => h.includes("shuttle"));
            for (let i = 1; i < rows.length; i++) {
              const cells = $(rows[i]).find("td, th").map((__, c) => $(c).text().trim()).get();
              const playerName = playerIdx >= 0 ? cells[playerIdx] : "";
              const key = normalizeName(playerName);
              const existing = combineByPlayer.get(key) || {};
              if (heightIdx >= 0 && cells[heightIdx]) existing.height = cells[heightIdx];
              if (weightIdx >= 0 && cells[weightIdx]) existing.weight = cells[weightIdx];
              if (handIdx >= 0 && cells[handIdx]) existing.hand = cells[handIdx];
              if (armIdx >= 0 && cells[armIdx]) existing.arm = cells[armIdx];
              if (wingspanIdx >= 0 && cells[wingspanIdx]) existing.wingspan = cells[wingspanIdx];
              if (fortyIdx >= 0 && cells[fortyIdx] && cells[fortyIdx] !== "—" && cells[fortyIdx] !== "--") existing["40Yd"] = cells[fortyIdx];
              if (tenIdx >= 0 && cells[tenIdx] && cells[tenIdx] !== "—" && cells[tenIdx] !== "--") existing["10YdSplit"] = cells[tenIdx];
              if (vertIdx >= 0 && cells[vertIdx] && cells[vertIdx] !== "—" && cells[vertIdx] !== "--") existing.vertical = cells[vertIdx];
              if (broadIdx >= 0 && cells[broadIdx] && cells[broadIdx] !== "—" && cells[broadIdx] !== "--") existing.broad = cells[broadIdx];
              if (benchIdx >= 0 && cells[benchIdx] && cells[benchIdx] !== "—" && cells[benchIdx] !== "--") existing.bench = cells[benchIdx];
              if (coneIdx >= 0 && cells[coneIdx] && cells[coneIdx] !== "—" && cells[coneIdx] !== "--") existing["3cone"] = cells[coneIdx];
              if (shuttleIdx >= 0 && cells[shuttleIdx] && cells[shuttleIdx] !== "—" && cells[shuttleIdx] !== "--") existing.shuttle = cells[shuttleIdx];
              combineByPlayer.set(key, existing);
            }
          });
          combineFetched = true;
          for (const p of prospects) {
            const n = normalizeName(p.displayName);
            const combined = combineByPlayer.get(n) || combineByPlayer.get(nameAliases[n] || "");
            if (combined && Object.keys(combined).length > 0) {
              const u = updatesByProspectId.get(p.id)!;
              u.combineData = JSON.stringify(combined);
            }
          }
        }
      } catch (e) {
        console.error("Combine fetch/parse error:", e);
      }

      let awardsFetched = false;
      try {
        const awardsRes = await fetch(awardsUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DynastyApp/1.0)" } });
        if (awardsRes.ok) {
          const html = await awardsRes.text();
          const $ = load(html);
          const awardsByPlayer = new Map<string, string[]>();
          $("table").each((_, table) => {
            const $table = $(table);
            const rows = $table.find("tr");
            if (rows.length < 2) return;
            const headerCells = $(rows[0]).find("td, th").map((__, c) => $(c).text().trim().toLowerCase()).get();
            const awardIdx = headerCells.findIndex((h: string) => h.includes("award"));
            const winnerIdx = headerCells.findIndex((h: string) => h.includes("winner") || h.includes("2025"));
            if (winnerIdx < 0 || awardIdx < 0) return;
            for (let i = 1; i < rows.length; i++) {
              const cells = $(rows[i]).find("td, th").map((__, c) => $(c).text().trim()).get();
              const awardName = cells[awardIdx] || "";
              const winnerCell = cells[winnerIdx] || "";
              const [namePart] = winnerCell.split("|").map((s: string) => s.trim());
              const name = normalizeName(namePart || winnerCell);
              if (!name) continue;
              const list = awardsByPlayer.get(name) || [];
              list.push(awardName);
              awardsByPlayer.set(name, list);
            }
          });
          awardsFetched = true;
          for (const p of prospects) {
            const n = normalizeName(p.displayName);
            const list = awardsByPlayer.get(n) || awardsByPlayer.get(nameAliases[n] || n) || [];
            if (list.length > 0) {
              const u = updatesByProspectId.get(p.id)!;
              u.collegeAwards = JSON.stringify(list);
            }
          }
        }
      } catch (e) {
        console.error("Awards fetch/parse error:", e);
      }

      const updates = Array.from(updatesByProspectId.entries())
        .filter(([, v]) => v.combineData || v.collegeAwards)
        .map(([id, v]) => ({ id, ...v }));
      if (updates.length > 0) await storage.updateDraftProspectsCombineAndAwards(leagueId, season, updates);
      res.json({
        success: true,
        combineFetched,
        awardsFetched,
        updatedCount: updates.length,
      });
    } catch (error: any) {
      console.error("Error refreshing draft prospects:", error);
      res.status(500).json({ error: error?.message || "Failed to refresh combine & awards data" });
    }
  });

  app.post("/api/league/:leagueId/draft-prospects/match-sleeper", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { userId, season = "2026" } = req.body;
      if (!leagueId || !userId) return res.status(400).json({ error: "League ID and userId required" });
      if (!(await requireCommissioner(req, res))) return;
      const prospects = await storage.getDraftProspects(leagueId, season);
      if (prospects.length === 0) return res.status(400).json({ error: "No prospects to update. Add prospects first." });

      const normalizeName = (s: string) =>
        String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\b(jr\.?|sr\.?|iii?|iv)\b/gi, "").trim();
      const normalizePos = (pos: string | null | undefined) => {
        if (!pos || typeof pos !== "string") return null;
        const t = pos.trim().toUpperCase().replace(/[0-9]/g, "");
        return t || null;
      };
      const nameAliases: Record<string, string> = {
        "k.c. concepcion": "kc concepcion",
        "mike washington jr.": "mike washington",
        "mike washington jr": "mike washington",
      };

      const sleeperDisplayNorm = (sp: SleeperPlayer): string => {
        const full = (sp.full_name ?? "").trim();
        const composed = `${(sp.first_name ?? "").trim()} ${(sp.last_name ?? "").trim()}`.trim();
        return normalizeName(full || composed);
      };

      const lastNameFirstInitial = (normalizedFull: string): { last: string; initial: string } | null => {
        const parts = normalizedFull.split(/\s+/).filter(Boolean);
        if (parts.length < 2) return null;
        const last = parts[parts.length - 1]!;
        const initial = parts[0]!.charAt(0);
        if (!last || !initial) return null;
        return { last, initial };
      };

      let playersMap: Record<string, SleeperPlayer> = {};
      try {
        playersMap = await getAllPlayers();
      } catch (e: any) {
        console.error("getAllPlayers for match-sleeper:", e);
        return res.status(502).json({ error: e?.message || "Failed to load Sleeper players" });
      }

      const byPos = new Map<string, SleeperPlayer[]>();
      for (const sp of Object.values(playersMap)) {
        if (!sp?.player_id) continue;
        const pos = normalizePos(sp.position);
        if (!pos) continue;
        const disp = sleeperDisplayNorm(sp);
        if (!disp) continue;
        const list = byPos.get(pos) ?? [];
        list.push(sp);
        byPos.set(pos, list);
      }

      let matched = 0;
      let skipped = 0;
      for (const p of prospects) {
        const existingId = p.sleeperPlayerId != null ? String(p.sleeperPlayerId).trim() : "";
        if (existingId) {
          skipped++;
          continue;
        }
        const pos = normalizePos(p.position);
        if (!pos) {
          skipped++;
          continue;
        }
        const candidates = byPos.get(pos) ?? [];
        if (candidates.length === 0) {
          skipped++;
          continue;
        }

        let normProspect = normalizeName(p.displayName);
        const alias = nameAliases[normProspect];
        if (alias) normProspect = alias;

        const exactMatches = candidates.filter((sp) => sleeperDisplayNorm(sp) === normProspect);
        let chosen: SleeperPlayer | null = null;
        if (exactMatches.length === 1) {
          chosen = exactMatches[0]!;
        } else if (exactMatches.length > 1) {
          skipped++;
          continue;
        } else {
          const pi = lastNameFirstInitial(normProspect);
          if (!pi) {
            skipped++;
            continue;
          }
          const liMatches = candidates.filter((sp) => {
            const sn = sleeperDisplayNorm(sp);
            const si = lastNameFirstInitial(sn);
            return si && si.last === pi.last && si.initial === pi.initial;
          });
          if (liMatches.length === 1) {
            chosen = liMatches[0]!;
          } else {
            skipped++;
            continue;
          }
        }

        const updated = await storage.updateDraftProspect(p.id, leagueId, { sleeperPlayerId: chosen.player_id });
        if (updated) matched++;
        else skipped++;
      }

      res.json({
        success: true,
        matched,
        skipped,
        total: prospects.length,
      });
    } catch (error: any) {
      console.error("Error matching Sleeper IDs:", error);
      res.status(500).json({ error: error?.message || "Failed to match Sleeper player IDs" });
    }
  });

  app.post("/api/league/:leagueId/draft-prospects/combine-csv", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { userId, csv, season = "2026" } = req.body;
      if (!leagueId || !userId) return res.status(400).json({ error: "League ID and userId required" });
      if (typeof csv !== "string") return res.status(400).json({ error: "CSV content required" });
      if (!(await requireCommissioner(req, res))) return;

      const prospects = await storage.getDraftProspects(leagueId, season);
      if (prospects.length === 0) return res.status(400).json({ error: "No prospects to update. Add prospects first." });

      const normalizeName = (s: string) =>
        String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\b(jr\.?|sr\.?|iii?|iv)\b/gi, "").trim();
      const nameAliases: Record<string, string> = { "k.c. concepcion": "kc concepcion", "mike washington jr.": "mike washington", "mike washington jr": "mike washington" };
      const normalizeSchool = (s: string) => String(s || "").trim().toLowerCase();
      const posMap: Record<string, string> = { de: "edge", edge: "edge", dt: "dt", nt: "dt", s: "s", ss: "s", fs: "s", cb: "cb", lb: "lb", ilb: "lb", olb: "lb", te: "te", wr: "wr", rb: "rb", qb: "qb", ot: "ot", og: "og", c: "c", k: "k", p: "p" };
      const normalizePos = (pos: string) => posMap[pos.toLowerCase().replace(/\s+/g, "")] ?? pos.toLowerCase();

      const parseCsvLine = (line: string): string[] => {
        const out: string[] = [];
        let i = 0;
        while (i < line.length) {
          if (line[i] === '"') {
            i++;
            let field = "";
            while (i < line.length) {
              if (line[i] === '"') {
                if (line[i + 1] === '"') {
                  field += '"';
                  i += 2;
                } else {
                  break;
                }
              } else if (line[i] === "\\") {
                i++;
                field += line[i++] ?? "";
              } else {
                field += line[i++];
              }
            }
            if (line[i] === '"') i++;
            out.push(field);
            while (i < line.length && (line[i] === "," || line[i] === " ")) i++;
          } else {
            let field = "";
            while (i < line.length && line[i] !== ",") field += line[i++];
            out.push(field.trim());
            if (line[i] === ",") i++;
          }
        }
        return out;
      };

      const CSV_COL_KEYS: Array<{ header: string; key: string }> = [
        { header: "height", key: "height" },
        { header: "weight", key: "weight" },
        { header: "hands", key: "hand" },
        { header: "arms", key: "arm" },
        { header: "wingspan", key: "wingspan" },
        { header: "40 yd", key: "40Yd" },
        { header: "10 split", key: "10YdSplit" },
        { header: "vertical", key: "vertical" },
        { header: "broad", key: "broad" },
        { header: "bench", key: "bench" },
        { header: "3-cone", key: "3cone" },
        { header: "shuttle", key: "shuttle" },
      ];

      const lines = csv.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      if (lines.length < 2) return res.status(400).json({ error: "CSV must have a header row and at least one data row" });

      const headerCols = parseCsvLine(lines[0]).map((h: string) => h.trim().toLowerCase());
      const nameIdx = headerCols.findIndex((h: string) => h === "name");
      const posIdx = headerCols.findIndex((h: string) => h === "pos");
      const schoolIdx = headerCols.findIndex((h: string) => h === "school");
      if (nameIdx < 0) return res.status(400).json({ error: "CSV must have a 'Name' column" });

      const colIndices: Record<string, number> = {};
      for (const { header, key } of CSV_COL_KEYS) {
        const idx = headerCols.findIndex((h: string) => h === header || h.replace(/\s+/g, " ").trim() === header);
        if (idx >= 0) colIndices[key] = idx;
      }

      const combineRowsByNormalName = new Map<string, Array<Record<string, string>>>();
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const name = nameIdx >= 0 ? String(cols[nameIdx] ?? "").trim() : "";
        if (!name) continue;
        const row: Record<string, string> = {};
        for (const [key, idx] of Object.entries(colIndices)) {
          const val = cols[idx] != null ? String(cols[idx]).trim() : "";
          if (val !== "") row[key] = val;
        }
        if (Object.keys(row).length === 0) continue;
        const n = normalizeName(name);
        const rowWithMeta = {
          ...row,
          _pos: posIdx >= 0 ? String(cols[posIdx] ?? "").trim() : "",
          _school: schoolIdx >= 0 ? String(cols[schoolIdx] ?? "").trim() : "",
        };
        const list = combineRowsByNormalName.get(n) ?? [];
        list.push(rowWithMeta);
        combineRowsByNormalName.set(n, list);
        const alt = nameAliases[n];
        if (alt) {
          const altList = combineRowsByNormalName.get(alt) ?? [];
          altList.push(rowWithMeta);
          combineRowsByNormalName.set(alt, altList);
        }
      }

      const prospectByNormalName = new Map<string, typeof prospects>();
      for (const p of prospects) {
        const n = normalizeName(p.displayName);
        const list = prospectByNormalName.get(n) ?? [];
        list.push(p);
        prospectByNormalName.set(n, list);
        const alt = nameAliases[n];
        if (alt) {
          const altList = prospectByNormalName.get(alt) ?? [];
          altList.push(p);
          prospectByNormalName.set(alt, altList);
        }
      }

      const updates: Array<{ id: string; combineData: string }> = [];
      for (const p of prospects) {
        const n = normalizeName(p.displayName);
        const csvRows = combineRowsByNormalName.get(n) ?? combineRowsByNormalName.get(nameAliases[n] ?? "");
        if (!csvRows || csvRows.length === 0) continue;
        let csvRow = csvRows[0];
        if (csvRows.length > 1) {
          const match = csvRows.find((r: Record<string, string>) => {
            const rowPos = normalizePos((r as any)._pos ?? "");
            const rowSchool = normalizeSchool((r as any)._school ?? "");
            const pPos = normalizePos(p.position ?? "");
            const pSchool = normalizeSchool(p.school ?? "");
            return (rowPos && pPos && rowPos === pPos) || (rowSchool && pSchool && (pSchool.includes(rowSchool) || rowSchool.includes(pSchool)));
          });
          if (match) csvRow = match;
        }

        const merged: Record<string, string> = {};
        for (const k of Object.keys(csvRow)) {
          if (k.startsWith("_")) continue;
          const csvVal = csvRow[k] != null ? String(csvRow[k]).trim() : "";
          if (csvVal !== "") merged[k] = csvVal;
        }

        if (Object.keys(merged).length > 0) {
          updates.push({ id: p.id, combineData: JSON.stringify(merged) });
        }
      }

      if (updates.length > 0) await storage.updateDraftProspectsCombineAndAwards(leagueId, season, updates);
      res.json({ success: true, updatedCount: updates.length });
    } catch (error: any) {
      console.error("Error importing combine CSV:", error);
      res.status(500).json({ error: error?.message || "Failed to import combine CSV data" });
    }
  });

  app.post("/api/league/:leagueId/draft-prospects/ras", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { userId, csv, season = "2026" } = req.body;
      if (!leagueId || !userId) return res.status(400).json({ error: "League ID and userId required" });
      if (typeof csv !== "string") return res.status(400).json({ error: "CSV content required" });
      if (!(await requireCommissioner(req, res))) return;

      const prospects = await storage.getDraftProspects(leagueId, season);
      if (prospects.length === 0) return res.status(400).json({ error: "No prospects to update. Add prospects first." });

      const normalizeName = (s: string) =>
        String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\b(jr\.?|sr\.?|iii?|iv)\b/gi, "").trim();
      const nameAliases: Record<string, string> = { "k.c. concepcion": "kc concepcion", "mike washington jr.": "mike washington", "mike washington jr": "mike washington" };

      const parseCsvLine = (line: string): string[] => {
        const out: string[] = [];
        let i = 0;
        while (i < line.length) {
          if (line[i] === '"') {
            i++;
            let field = "";
            while (i < line.length && line[i] !== '"') {
              if (line[i] === "\\") { i++; field += line[i++] ?? ""; }
              else field += line[i++];
            }
            if (line[i] === '"') i++;
            out.push(field);
            while (i < line.length && (line[i] === "," || line[i] === " ")) i++;
          } else {
            let field = "";
            while (i < line.length && line[i] !== ",") field += line[i++];
            out.push(field.trim());
            if (line[i] === ",") i++;
          }
        }
        return out;
      };

      const hrefRe = /href="([^"]+)"/;
      const lines = csv.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      const rasRows: Array<{ name: string; pos: string; college: string; ras: number; rasLink: string | null }> = [];
      for (const line of lines) {
        const cols = parseCsvLine(line);
        if (cols.length < 6) continue;
        const [linkCol, name, pos, , college, rasCol] = cols;
        const ras = parseFloat(rasCol);
        if (Number.isNaN(ras)) continue;
        const hrefMatch = typeof linkCol === "string" ? linkCol.match(hrefRe) : null;
        const rasLink = hrefMatch ? hrefMatch[1] : null;
        rasRows.push({ name: String(name).trim(), pos: String(pos).trim(), college: String(college).trim(), ras, rasLink });
      }

      const prospectByNormalName = new Map<string, typeof prospects>();
      for (const p of prospects) {
        const n = normalizeName(p.displayName);
        const list = prospectByNormalName.get(n) ?? [];
        list.push(p);
        prospectByNormalName.set(n, list);
        const alt = nameAliases[n];
        if (alt) {
          const altList = prospectByNormalName.get(alt) ?? [];
          altList.push(p);
          prospectByNormalName.set(alt, altList);
        }
      }

      const posMap: Record<string, string> = { de: "edge", edge: "edge", dt: "dt", nt: "dt", s: "s", ss: "s", fs: "s", cb: "cb", lb: "lb", ilb: "lb", olb: "lb", te: "te", wr: "wr", rb: "rb", qb: "qb", ot: "ot", og: "og", c: "c", k: "k", p: "p" };
      const normalizePos = (pos: string) => posMap[pos.toLowerCase().replace(/\s+/g, "")] ?? pos.toLowerCase();
      const normalizeSchool = (s: string) => String(s || "").trim().toLowerCase();

      const updates: Array<{ id: string; ras: number; rasLink?: string }> = [];
      const usedProspectIds = new Set<string>();
      for (const row of rasRows) {
        const n = normalizeName(row.name);
        const candidates = prospectByNormalName.get(n) ?? prospectByNormalName.get(nameAliases[n] ?? "");
        if (!candidates || candidates.length === 0) continue;
        let match = candidates.length === 1 ? candidates[0] : null;
        if (!match && candidates.length > 1) {
          const rowPos = normalizePos(row.pos);
          const rowSchool = normalizeSchool(row.college);
          match = candidates.find((p) => {
            const pPos = normalizePos(p.position ?? "");
            const pSchool = normalizeSchool(p.school ?? "");
            return (rowPos && pPos && rowPos === pPos) || (rowSchool && pSchool && pSchool.includes(rowSchool) || rowSchool.includes(pSchool));
          }) ?? candidates[0];
        }
        if (match && !usedProspectIds.has(match.id)) {
          usedProspectIds.add(match.id);
          updates.push({ id: match.id, ras: row.ras, ...(row.rasLink ? { rasLink: row.rasLink } : {}) });
        }
      }

      if (updates.length > 0) await storage.updateDraftProspectsRas(leagueId, season, updates);
      res.json({ updated: updates.length });
    } catch (error: any) {
      console.error("Error importing RAS data:", error);
      res.status(500).json({ error: error?.message || "Failed to import RAS data" });
    }
  });

  // Draft prospects advanced stats (College Football Data API): Dominator, Breakout, YPRR, Speed Score
  const CFBD_BASE = "https://api.collegefootballdata.com";
  const SCHOOL_TO_CFBD_TEAM: Record<string, string> = {
    "ohio state": "Ohio State", "notre dame": "Notre Dame", "alabama": "Alabama", "georgia": "Georgia",
    "lsu": "LSU", "clemson": "Clemson", "texas": "Texas", "usc": "USC", "michigan": "Michigan",
    "penn state": "Penn State", "florida state": "Florida State", "oregon": "Oregon", "tennessee": "Tennessee",
    "washington": "Washington", "texas a&m": "Texas A&M", "arkansas": "Arkansas", "nebraska": "Nebraska",
    "indiana": "Indiana", "arizona state": "Arizona State", "louisville": "Louisville", "baylor": "Baylor",
    "mississippi state": "Mississippi State", "missouri": "Missouri", "kentucky": "Kentucky", "vanderbilt": "Vanderbilt",
    "stanford": "Stanford", "ucla": "UCLA", "miami": "Miami", "north carolina": "North Carolina", "virginia": "Virginia",
    "pittsburgh": "Pittsburgh", "wake forest": "Wake Forest", "south carolina": "South Carolina", "iowa": "Iowa",
    "wisconsin": "Wisconsin", "north dakota state": "North Dakota State", "utah": "Utah", "houston": "Houston",
    "cincinnati": "Cincinnati", "connecticut": "Connecticut", "georgia state": "Georgia State", "ole miss": "Ole Miss",
    "tcu": "TCU", "oklahoma": "Oklahoma", "illinois": "Illinois", "navy": "Navy", "wyoming": "Wyoming",
    "smu": "SMU", "incarnate word": "Incarnate Word", "byu": "BYU", "toledo": "Toledo", "duke": "Duke",
    "kansas": "Kansas", "kansas state": "Kansas State", "maryland": "Maryland", "florida": "Florida",
    "texas tech": "Texas Tech", "auburn": "Auburn", "minnesota": "Minnesota", "western michigan": "Western Michigan",
    "boston college": "Boston College", "northwestern": "Northwestern", "florida atlantic": "Florida Atlantic",
    "north texas": "North Texas", "stephen f austin": "Stephen F. Austin", "southeastern louisiana": "Southeastern Louisiana",
    "john carroll": "John Carroll", "ucf": "UCF",
    "oregon state": "Oregon State", "syracuse": "Syracuse", "colorado": "Colorado", "west virginia": "West Virginia",
    "iowa state": "Iowa State", "purdue": "Purdue", "rutgers": "Rutgers", "virginia tech": "Virginia Tech",
    "n.c. state": "NC State", "nc state": "NC State", "north carolina state": "NC State",
    "north carolina st": "NC State", "pitt": "Pittsburgh", "uconn": "Connecticut",
    "miami fl": "Miami", "miami florida": "Miami", "miami (fl)": "Miami",
    "southern california": "USC", "texas am": "Texas A&M", "texas a and m": "Texas A&M",
    "florida st": "Florida State",
  };

  function normalizeSchoolKey(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[.'’]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function schoolToCfbdTeam(school: string | null): string | null {
    if (!school || !school.trim()) return null;
    const key = normalizeSchoolKey(school);
    const candidates = [
      key,
      key.replace(/\s*&\s*/g, "&"),
      key.replace(/\s*&\s*/g, " and "),
      key.replace(/\s+and\s+/g, " & "),
      key.replace(/\buniversity\b/g, "").replace(/\s+/g, " ").trim(),
    ];
    for (const candidate of candidates) {
      if (candidate && SCHOOL_TO_CFBD_TEAM[candidate]) return SCHOOL_TO_CFBD_TEAM[candidate];
    }
    return null;
  }

  async function fillSchoolFromCfbd(leagueId: string, season: string): Promise<number> {
    const apiKey = process.env.COLLEGE_FOOTBALL_DATA_API_KEY;
    if (!apiKey) return 0;
    const prospects = await storage.getDraftProspects(leagueId, season);
    const needToFill = prospects.filter((p) => !p.school || !p.school.trim());
    if (needToFill.length === 0) return 0;
    const authHeader = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
    const updates: Array<{ id: string; school: string }> = [];
    for (const p of needToFill) {
      const searchTerm = p.displayName.split(/\s+/).slice(0, 2).join(" ");
      try {
        const params = new URLSearchParams({ searchTerm, year: "2025" });
        const r = await fetch(`${CFBD_BASE}/player/search?${params}`, { headers: authHeader });
        if (!r.ok) continue;
        const data = (await r.json()) as Array<{ name?: string; team?: string }>;
        if (!Array.isArray(data) || data.length === 0) continue;
        const team = data[0].team;
        if (typeof team !== "string" || !team.trim()) continue;
        updates.push({ id: p.id, school: team.trim() });
      } catch (e) {
        console.warn("CFBD fill school for prospect", p.displayName, e);
      }
    }
    if (updates.length > 0) await storage.updateDraftProspectsSchool(leagueId, season, updates);
    return updates.length;
  }

  function computeSpeedScore(combineData: string | null): number | null {
    if (!combineData) return null;
    try {
      const raw = JSON.parse(combineData) as Record<string, string>;
      const weightStr = raw.weight ?? raw.Weight ?? "";
      const fortyStr = raw["40Yd"] ?? raw["40"] ?? "";
      const weight = parseFloat(weightStr.replace(/[^\d.]/g, ""));
      const forty = parseFloat(fortyStr.replace(/[^\d.]/g, ""));
      if (!Number.isFinite(weight) || !Number.isFinite(forty) || forty <= 0) return null;
      const score = (weight * 200) / Math.pow(forty, 4);
      return Number.isFinite(score) ? Math.round(score * 100) / 100 : null;
    } catch {
      return null;
    }
  }

  type AdvancedStatsPayload = {
    speedScore: number | null;
    dominatorByYear: { year: number; dominator: number }[];
    bestDominator: number | null;
    breakoutSeason: number | null;
    yprrByYear: { year: number; yprr: number }[];
    bestYprr: number | null;
    dominatorUnavailableReason?: string | null;
  };

  app.post("/api/league/:leagueId/draft-prospects/advanced-stats", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { userId, season = "2026" } = req.body;
      if (!leagueId || !userId) return res.status(400).json({ error: "League ID and userId required" });
      if (!(await requireCommissioner(req, res))) return;
      const apiKey = process.env.COLLEGE_FOOTBALL_DATA_API_KEY;
      if (!apiKey)
        return res.status(400).json({ error: "COLLEGE_FOOTBALL_DATA_API_KEY is not set. Set it in your environment to use advanced stats." });

      const schoolsFilled = await fillSchoolFromCfbd(leagueId, season);
      let prospects = await storage.getDraftProspects(leagueId, season);
      if (prospects.length === 0) return res.status(400).json({ error: "No prospects to update. Add prospects first." });

      const authHeader = { Authorization: `Bearer ${apiKey}` };

      const cfbdGet = async (path: string, params: Record<string, string | number>): Promise<unknown> => {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
        const url = `${CFBD_BASE}${path}${q.toString() ? "?" + q.toString() : ""}`;
        const r = await fetch(url, { headers: { ...authHeader, Accept: "application/json" } });
        if (!r.ok) throw new Error(`CFBD ${path} ${r.status}`);
        return r.json();
      };

      const parseStatNumber = (value: unknown): number => {
        if (typeof value === "number") return Number.isFinite(value) ? value : 0;
        if (typeof value === "string") {
          const parsed = parseFloat(value.replace(/,/g, ""));
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      const normalizePlayerName = (name: string): string => {
        let s = name
          .toLowerCase()
          .replace(/[.'’]/g, "")
          .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const parts = s.split(",").map((p) => p.trim());
        if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
          s = [parts[1], parts[0]].join(" ").replace(/\s+/g, " ").trim();
        }
        return s;
      };

      const nameTokens = (normalized: string): Set<string> =>
        new Set(normalized.split(/\s+/).filter((t) => t.length > 0));

      const namesMatchByTokens = (a: string, b: string, minTokens = 2): boolean => {
        const ta = nameTokens(a);
        const tb = nameTokens(b);
        if (ta.size < minTokens && tb.size < minTokens) return false;
        const overlap = Array.from(ta).filter((t) => tb.has(t)).length;
        return overlap >= minTokens || (ta.size <= tb.size && overlap === ta.size) || (tb.size <= ta.size && overlap === tb.size);
      };

      const formatReason = (reason: string | null, pos: string, school: string | null): string | null => {
        if (!reason) return null;
        switch (reason) {
          case "unmapped_school":
            return `School "${school ?? "Unknown"}" is not mapped to a CollegeFootballData team name.`;
          case "unsupported_position":
            return `Dominator is only calculated for WR/TE/RB. Current position: ${pos || "Unknown"}.`;
          case "player_search_empty":
            return "No CollegeFootballData player match found for this prospect/team.";
          case "player_rows_no_match":
            return "Player season stats were found for team/year, but no rows matched the player name.";
          case "team_stats_missing":
            return "Missing team season stats from CollegeFootballData for one or more years.";
          case "no_dominator_values":
            return "Player/team stats were found, but no season produced a dominator value above 0.";
          case "player_year_fetch_failed":
            return "Error fetching one or more player season stat years from CollegeFootballData.";
          default:
            return "Dominator could not be calculated from available CollegeFootballData stats.";
        }
      };

      const reasonCounts = new Map<string, number>();
      const reasonSamples = new Map<string, string[]>();
      const trackReason = (reason: string, prospectName: string) => {
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
        const samples = reasonSamples.get(reason) ?? [];
        if (samples.length < 3 && !samples.includes(prospectName)) samples.push(prospectName);
        reasonSamples.set(reason, samples);
      };

      const teamStatsCache = new Map<string, { netPassingYds: number; passTDs: number; rushYds: number; rushTDs: number; passAttempts: number }>();
      const getTeamStats = async (year: number, team: string): Promise<{ netPassingYds: number; passTDs: number; rushYds: number; rushTDs: number; passAttempts: number } | null> => {
        const key = `${year}:${team}`;
        if (teamStatsCache.has(key)) return teamStatsCache.get(key)!;
        try {
          const data = (await cfbdGet("/stats/season", { year, team })) as Array<Record<string, unknown>>;
          if (!Array.isArray(data) || data.length === 0) return null;
          // CFBD API returns long format: { statName: "netPassingYards", statValue: 3755 }
          let netPassingYds = 0, passTDs = 0, rushYds = 0, rushTDs = 0, passAttempts = 0;
          for (const row of data) {
            const name = String(row.statName ?? "");
            const val = parseStatNumber(row.statValue);
            switch (name) {
              case "netPassingYards": netPassingYds = val; break;
              case "passingTDs": passTDs = val; break;
              case "rushingYards": rushYds = val; break;
              case "rushingTDs": rushTDs = val; break;
              case "passAttempts": passAttempts = val; break;
            }
          }
          const out = { netPassingYds, passTDs, rushYds, rushTDs, passAttempts };
          teamStatsCache.set(key, out);
          return out;
        } catch {
          return null;
        }
      };

      const updates: Array<{ id: string; advancedStats: string | null }> = [];
      const years = [2022, 2023, 2024, 2025];

      for (const p of prospects) {
        const out: AdvancedStatsPayload = {
          speedScore: computeSpeedScore(p.combineData),
          dominatorByYear: [],
          bestDominator: null,
          breakoutSeason: null,
          yprrByYear: [],
          bestYprr: null,
          dominatorUnavailableReason: null,
        };
        let firstDominatorReason: string | null = null;
        const markReason = (reason: string) => {
          if (!firstDominatorReason) firstDominatorReason = reason;
          trackReason(reason, p.displayName);
        };

        const cfbdTeam = schoolToCfbdTeam(p.school);
        const pos = (p.position ?? "").toUpperCase().replace(/[0-9]/g, "").trim();
        const isRB = pos === "RB";
        const isWR = pos === "WR";
        const isTE = pos === "TE";
        const breakoutThreshold = isTE ? 0.15 : 0.2;
        if (!cfbdTeam) markReason("unmapped_school");
        if (!(isWR || isTE || isRB)) markReason("unsupported_position");

        if (cfbdTeam && (isWR || isTE || isRB)) {
          const searchTerm = p.displayName.split(/\s+/).slice(0, 2).join(" ");
          const displayNameNorm = normalizePlayerName(p.displayName);
          const searchTermNorm = normalizePlayerName(searchTerm);
          try {
            const searchResults = (await cfbdGet("/player/search", {
              searchTerm,
              team: cfbdTeam,
              year: 2025,
            })) as Array<{ name?: string; team?: string }>;
            if (!Array.isArray(searchResults) || searchResults.length === 0) {
              markReason("player_search_empty");
              out.dominatorUnavailableReason = formatReason(firstDominatorReason, pos, p.school);
              updates.push({ id: p.id, advancedStats: JSON.stringify(out) });
              continue;
            }

            const selectedSearchResult =
              searchResults.find((r) => normalizePlayerName(String(r.name ?? "")) === displayNameNorm) ??
              searchResults.find((r) => {
                const n = normalizePlayerName(String(r.name ?? ""));
                return n.length >= 6 && (n.includes(displayNameNorm) || displayNameNorm.includes(n));
              }) ??
              searchResults[0];
            const playerName = (selectedSearchResult?.name ?? p.displayName).trim();
            const playerNameNorm = normalizePlayerName(playerName);
            const playerStatsByYear = new Map<number, { recYds: number; recTDs: number; rushYds: number; rushTDs: number }>();

            for (const year of years) {
              try {
                const playerData = (await cfbdGet("/stats/player/season", { year, team: cfbdTeam })) as Array<Record<string, unknown>>;
                if (!Array.isArray(playerData)) continue;

                // CFBD API uses "player" for name; one row per player with snake_case: receiving_yds, receiving_td, rushing_yds, rushing_td
                const rowsForPlayer = playerData.filter((r) => {
                  const name = String((r as Record<string, unknown>).player ?? (r as Record<string, unknown>).name ?? "").trim();
                  const normalized = normalizePlayerName(name);
                  if (!normalized) return false;
                  if (normalized === playerNameNorm || normalized === displayNameNorm) return true;
                  if (playerNameNorm.length >= 6 && normalized.includes(playerNameNorm)) return true;
                  if (displayNameNorm.length >= 6 && normalized.includes(displayNameNorm)) return true;
                  if (searchTermNorm.length >= 6 && normalized.includes(searchTermNorm)) return true;
                  return namesMatchByTokens(normalized, playerNameNorm) || namesMatchByTokens(normalized, displayNameNorm) || namesMatchByTokens(normalized, searchTermNorm);
                });
                if (rowsForPlayer.length === 0) {
                  if (process.env.DEBUG_CFBD_NAMES === "true") {
                    const sampleRows = playerData.slice(0, 10).map((r) => {
                      const row = r as Record<string, unknown>;
                      return { player: row.player ?? "(missing)", name: row.name ?? "(missing)" };
                    });
                    console.log("[CFBD name debug]", {
                      prospect: p.displayName,
                      playerNameFromSearch: playerName,
                      playerNameNorm,
                      displayNameNorm,
                      searchTermNorm,
                      team: cfbdTeam,
                      year,
                      apiNameSample: sampleRows,
                    });
                  }
                  markReason("player_rows_no_match");
                  continue;
                }

                // CFBD API returns long format: { category: "receiving", statType: "YDS", stat: 875 }
                let recYds = 0, recTDs = 0, rushYds = 0, rushTDs = 0;
                for (const row of rowsForPlayer) {
                  const r = row as Record<string, unknown>;
                  const cat = String(r.category ?? "").toLowerCase();
                  const st = String(r.statType ?? r.stat_type ?? "").toUpperCase();
                  const val = parseStatNumber(r.stat ?? r.value ?? 0);
                  if (cat === "receiving") {
                    if (st === "YDS") recYds += val;
                    else if (st === "TD") recTDs += val;
                  } else if (cat === "rushing") {
                    if (st === "YDS") rushYds += val;
                    else if (st === "TD") rushTDs += val;
                  }
                }
                playerStatsByYear.set(year, { recYds, recTDs, rushYds, rushTDs });
              } catch (error) {
                markReason("player_year_fetch_failed");
                console.warn("CFBD player stats year fetch failed", { player: p.displayName, year, team: cfbdTeam, error });
              }
            }

            const teamStatsByYear = new Map<number, Awaited<ReturnType<typeof getTeamStats>>>();
            for (const year of years) {
              const ts = await getTeamStats(year, cfbdTeam);
              if (ts) teamStatsByYear.set(year, ts);
              else markReason("team_stats_missing");
            }

            for (const year of years) {
              const ps = playerStatsByYear.get(year);
              const ts = teamStatsByYear.get(year);
              if (!ps || !ts) continue;

              let dominator = 0;
              if (isRB) {
                const playerTotalYds = ps.rushYds + ps.recYds;
                const playerTotalTDs = ps.rushTDs + ps.recTDs;
                const teamTotalYds = ts.netPassingYds + ts.rushYds;
                const teamTotalTDs = ts.passTDs + ts.rushTDs;
                if (teamTotalYds > 0 || teamTotalTDs > 0)
                  dominator = 0.5 * ((teamTotalYds ? playerTotalYds / teamTotalYds : 0) + (teamTotalTDs ? playerTotalTDs / teamTotalTDs : 0));
              } else {
                if (ts.netPassingYds > 0 || ts.passTDs > 0)
                  dominator = 0.5 * ((ts.netPassingYds ? ps.recYds / ts.netPassingYds : 0) + (ts.passTDs ? ps.recTDs / ts.passTDs : 0));
              }
              if (dominator > 0) {
                out.dominatorByYear.push({ year, dominator: Math.round(dominator * 1000) / 1000 });
                if (out.bestDominator == null || dominator > out.bestDominator) out.bestDominator = Math.round(dominator * 1000) / 1000;
                if (out.breakoutSeason == null && dominator >= breakoutThreshold) out.breakoutSeason = year;
              }

              if ((isWR || isTE) && ts.passAttempts > 0 && ps.recYds >= 0) {
                const yprr = ps.recYds / ts.passAttempts;
                out.yprrByYear.push({ year, yprr: Math.round(yprr * 1000) / 1000 });
                if (out.bestYprr == null || yprr > out.bestYprr) out.bestYprr = Math.round(yprr * 1000) / 1000;
              }
            }
          } catch (e) {
            markReason("player_year_fetch_failed");
            console.warn("CFBD advanced stats for prospect", p.displayName, e);
          }
        }

        if (out.bestDominator == null) {
          if (!firstDominatorReason) markReason("no_dominator_values");
          out.dominatorUnavailableReason = formatReason(firstDominatorReason, pos, p.school);
        }

        updates.push({ id: p.id, advancedStats: JSON.stringify(out) });
      }

      if (updates.length > 0) await storage.updateDraftProspectsAdvancedStats(leagueId, season, updates);
      if (reasonCounts.size > 0) {
        const diagnostics = Array.from(reasonCounts.entries())
          .map(([reason, count]) => ({
            reason,
            count,
            samples: reasonSamples.get(reason) ?? [],
          }))
          .sort((a, b) => b.count - a.count);
        console.log("[AdvancedStats] Dominator missing reason diagnostics", diagnostics);
      }
      res.json({ updated: updates.length, schoolsFilled: schoolsFilled > 0 ? schoolsFilled : undefined });
    } catch (error: any) {
      console.error("Error refreshing advanced stats:", error);
      res.status(500).json({ error: error?.message || "Failed to refresh advanced stats" });
    }
  });
}
