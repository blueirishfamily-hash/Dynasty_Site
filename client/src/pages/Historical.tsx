import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { YearRecapDisplay, type YearRecapData } from "@/pages/YearRecap";
import { MetricsDisplay } from "@/pages/Metrics";

const positionColors: Record<string, string> = {
  QB: "bg-red-500 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-gray-500 text-white",
};

export default function Historical() {
  const { league } = useSleeper();
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>(league?.leagueId || "");
  const [manualLeagueId, setManualLeagueId] = useState<string>("");
  const [season, setSeason] = useState<string>(league?.season || "");
  const [week, setWeek] = useState<string>("");
  
  // Use manual league ID if provided, otherwise use selected from dropdown
  const effectiveLeagueId = manualLeagueId.trim() || selectedLeagueId;
  const safeParse = <T,>(value: string, fallback: T): T => {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };

  const { data: leagues } = useQuery({
    queryKey: ["/api/league/list"],
    queryFn: async () => {
      const res = await fetch("/api/league/list");
      if (!res.ok) throw new Error("Failed to fetch leagues");
      return res.json();
    },
  });

  // Determine if this is a historical season that should fetch from Sleeper directly
  const isHistoricalSeason = season === "2023" || season === "2024";
  const basePath = isHistoricalSeason 
    ? `/api/league/${effectiveLeagueId}/historical-sleeper`
    : `/api/league/${effectiveLeagueId}/historical`;

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (season) params.set("season", season);
    if (week) params.set("week", week);
    return params.toString();
  }, [season, week]);

  const { data: standings } = useQuery({
    queryKey: ["/api/league", effectiveLeagueId, isHistoricalSeason ? "historical-sleeper" : "historical", "standings", season, week],
    queryFn: async () => {
      const res = await fetch(`${basePath}/standings?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!effectiveLeagueId && !!season,
  });

  const { data: playerStats } = useQuery({
    queryKey: ["/api/league", effectiveLeagueId, isHistoricalSeason ? "historical-sleeper" : "historical", "player-stats", season, week],
    queryFn: async () => {
      const res = await fetch(`${basePath}/player-stats?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch player stats");
      return res.json();
    },
    enabled: !!effectiveLeagueId && !!season,
  });

  const { data: teamStats } = useQuery({
    queryKey: ["/api/league", effectiveLeagueId, isHistoricalSeason ? "historical-sleeper" : "historical", "team-stats", season, week],
    queryFn: async () => {
      const res = await fetch(`${basePath}/team-stats?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch team stats");
      return res.json();
    },
    enabled: !!effectiveLeagueId && !!season,
  });

  const { data: drafts } = useQuery({
    queryKey: ["/api/league", effectiveLeagueId, isHistoricalSeason ? "historical-sleeper" : "historical", "drafts", season],
    queryFn: async () => {
      const res = await fetch(`${basePath}/drafts?season=${season}`);
      if (!res.ok) throw new Error("Failed to fetch drafts");
      return res.json();
    },
    enabled: !!effectiveLeagueId && !!season,
  });

  const { data: matchups } = useQuery({
    queryKey: ["/api/league", effectiveLeagueId, isHistoricalSeason ? "historical-sleeper" : "historical", "matchups", season, week],
    queryFn: async () => {
      const res = await fetch(`${basePath}/matchups?season=${season}&week=${week}`);
      if (!res.ok) throw new Error("Failed to fetch matchups");
      return res.json();
    },
    enabled: !!effectiveLeagueId && !!season && !!week,
  });

  const { data: transactions } = useQuery({
    queryKey: ["/api/league", effectiveLeagueId, isHistoricalSeason ? "historical-sleeper" : "historical", "transactions", season, week],
    queryFn: async () => {
      const res = await fetch(`${basePath}/transactions?season=${season}&week=${week}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!effectiveLeagueId && !!season && !!week,
  });

  const { data: yearRecapData, isLoading: yearRecapLoading } = useQuery<YearRecapData>({
    queryKey: ["/api/league", effectiveLeagueId, "historical", "year-recap", season],
    queryFn: async () => {
      const res = await fetch(`/api/league/${effectiveLeagueId}/historical/year-recap?season=${season}`);
      if (!res.ok) throw new Error("Failed to fetch year recap");
      return res.json();
    },
    enabled: !!effectiveLeagueId && !!season,
    retry: false,
  });

  const { data: metricsData, isLoading: metricsLoading } = useQuery<{
    teamLuck: any;
    heatCheck: any;
    powerRankings: any;
  }>({
    queryKey: ["/api/league", effectiveLeagueId, "historical", "metrics", season],
    queryFn: async () => {
      const res = await fetch(`/api/league/${effectiveLeagueId}/historical/metrics?season=${season}`);
      if (!res.ok) throw new Error("Failed to fetch metrics");
      return res.json();
    },
    enabled: !!effectiveLeagueId && !!season,
    retry: false,
  });

  const [metricsExpandedTeam, setMetricsExpandedTeam] = useState<number | null>(null);
  const [flukeExpandedTeam, setFlukeExpandedTeam] = useState<number | null>(null);
  const [flukeExpandedWeek, setFlukeExpandedWeek] = useState<string | null>(null);

  const standingsRows = useMemo(() => {
    const rows: Array<{
      name?: string;
      wins?: number;
      losses?: number;
      ties?: number;
      pointsFor?: number;
      pointsAgainst?: number;
      snapshotWeek: number | null;
      snapshotType?: string;
    }> = [];
    (standings || []).forEach((snapshot: any) => {
      const parsed = safeParse<any[]>(snapshot.standingsData, []);
      parsed.forEach((row) => {
        rows.push({
          name: row?.name,
          wins: row?.wins,
          losses: row?.losses,
          ties: row?.ties,
          pointsFor: row?.pointsFor,
          pointsAgainst: row?.pointsAgainst,
          snapshotWeek: snapshot?.week ?? row?.week ?? null,
          snapshotType: snapshot?.snapshotType,
        });
      });
    });
    return rows;
  }, [standings]);

  const teamStatsRows = useMemo(() => {
    return (teamStats || []).map((row: any) => {
      const parsed = safeParse<Record<string, number>>(row.statsData, {});
      return {
        week: row.week ?? null,
        rosterId: row.rosterId,
        wins: parsed.wins ?? 0,
        losses: parsed.losses ?? 0,
        ties: parsed.ties ?? 0,
        pointsFor: parsed.pointsFor ?? 0,
        pointsAgainst: parsed.pointsAgainst ?? 0,
      };
    });
  }, [teamStats]);

  const formattedDrafts = useMemo(() => {
    if (!drafts || drafts.length === 0) return [];
    
    return drafts.map((item: any) => {
      // Handle both snapshot format (has draftData/picksData) and direct Sleeper format
      if (item.draftData) {
        // Snapshot format
        const draftData = safeParse<any>(item.draftData, {});
        const picksData = safeParse<any[]>(item.picksData || [], []);
        
        return {
          draftId: item.draftId,
          type: draftData.type || "rookie",
          season: draftData.season || item.season,
          status: draftData.status || "complete",
          rounds: draftData.settings?.rounds || 0,
          startTime: draftData.start_time,
          picks: picksData.map((pick: any) => ({
            round: pick.round,
            pickNo: pick.pick_no,
            draftSlot: pick.draft_slot,
            playerId: pick.player_id,
            playerName: pick.playerName || `${pick.metadata?.first_name || ""} ${pick.metadata?.last_name || ""}`.trim() || "Unknown",
            position: pick.position || pick.metadata?.position || "",
            team: pick.team || pick.metadata?.team || "",
            fantasyTeam: pick.fantasyTeam || `Team ${pick.roster_id}`,
            rosterId: pick.roster_id,
          })),
        };
      } else {
        // Direct Sleeper format (for 2023/2024)
        return {
          draftId: item.draftId,
          type: item.type || "rookie",
          season: item.season,
          status: item.status || "complete",
          rounds: item.rounds || 0,
          startTime: item.startTime,
          picks: [], // Picks will be fetched separately when draft is selected
        };
      }
    });
  }, [drafts]);

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">Historical Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">League</label>
              <Select value={selectedLeagueId} onValueChange={(value) => {
                setSelectedLeagueId(value);
                setManualLeagueId(""); // Clear manual entry when selecting from dropdown
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select league" />
                </SelectTrigger>
                <SelectContent>
                  {(leagues || []).map((l: any) => (
                    <SelectItem key={l.leagueId} value={l.leagueId}>
                      {l.leagueId} {l.season ? `(${l.season})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Season</label>
              <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Week (optional)</label>
              <Input value={week} onChange={(e) => setWeek(e.target.value)} placeholder="1" />
            </div>
          </div>
          <div className="space-y-2 border-t pt-4">
            <label className="text-sm font-medium">Other League ID (for historical leagues not in system)</label>
            <Input 
              value={manualLeagueId} 
              onChange={(e) => {
                setManualLeagueId(e.target.value);
                if (e.target.value.trim()) {
                  setSelectedLeagueId(""); // Clear dropdown selection when using manual entry
                }
              }} 
              placeholder="Enter league ID (e.g., 1048746932522405888)"
            />
            <p className="text-xs text-muted-foreground">
              Use this to view historical data from leagues not in the dropdown above.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="standings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="player-stats">Player Stats</TabsTrigger>
          <TabsTrigger value="team-stats">Team Stats</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
          <TabsTrigger value="matchups">Matchups</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="year-recap">Year Recap</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="standings">
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="h-[400px]">
                {standingsRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No standings snapshots found.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left py-1">Week</th>
                        <th className="text-left py-1">Team</th>
                        <th className="text-left py-1">Record</th>
                        <th className="text-left py-1">PF</th>
                        <th className="text-left py-1">PA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standingsRows.map((row, idx) => (
                        <tr key={`${row.name}-${idx}`} className="border-t border-border">
                          <td className="py-1">{row.snapshotWeek ?? "Season"}</td>
                          <td className="py-1">{row.name || "Unknown"}</td>
                          <td className="py-1">
                            {(row.wins ?? 0)}-{(row.losses ?? 0)}-{(row.ties ?? 0)}
                          </td>
                          <td className="py-1">{row.pointsFor ?? 0}</td>
                          <td className="py-1">{row.pointsAgainst ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="player-stats">
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="h-[400px]">
                <pre className="text-xs">{JSON.stringify(playerStats || [], null, 2)}</pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="team-stats">
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="h-[400px]">
                {teamStatsRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No team stats snapshots found.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left py-1">Week</th>
                        <th className="text-left py-1">Roster</th>
                        <th className="text-left py-1">Record</th>
                        <th className="text-left py-1">PF</th>
                        <th className="text-left py-1">PA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamStatsRows.map((row: { rosterId: number; week: number | null; wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number }, idx: number) => (
                        <tr key={`${row.rosterId}-${idx}`} className="border-t border-border">
                          <td className="py-1">{row.week ?? "Season"}</td>
                          <td className="py-1">{row.rosterId}</td>
                          <td className="py-1">{row.wins}-{row.losses}-{row.ties}</td>
                          <td className="py-1">{row.pointsFor}</td>
                          <td className="py-1">{row.pointsAgainst}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="drafts">
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="h-[600px]">
                {formattedDrafts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No draft snapshots found.</p>
                ) : (
                  <div className="space-y-6">
                    {formattedDrafts.map((draft: any) => (
                      <div key={draft.draftId} className="space-y-3">
                        <div className="flex items-center gap-3 pb-2 border-b">
                          <div>
                            <h3 className="font-semibold">
                              {draft.season} {draft.type === "startup" ? "Startup" : "Rookie"} Draft
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {draft.rounds} rounds{draft.picks && draft.picks.length > 0 ? ` • ${draft.picks.length} picks` : ""}
                              {draft.startTime && (
                                <> • {new Date(draft.startTime).toLocaleDateString()}</>
                              )}
                            </p>
                          </div>
                        </div>
                        {draft.picks && draft.picks.length > 0 ? (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-16">Round</TableHead>
                                  <TableHead className="w-16">Pick</TableHead>
                                  <TableHead>Player</TableHead>
                                  <TableHead className="w-20">Position</TableHead>
                                  <TableHead className="w-24">NFL Team</TableHead>
                                  <TableHead>Fantasy Team</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {draft.picks.map((pick: any, idx: number) => (
                                  <TableRow key={`${pick.round}-${pick.pickNo}-${idx}`}>
                                    <TableCell className="font-medium">{pick.round}</TableCell>
                                    <TableCell>{pick.pickNo}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        <Avatar className="w-6 h-6">
                                          <AvatarImage 
                                            src={pick.playerId ? `https://sleepercdn.com/content/nfl/players/${pick.playerId}.jpg` : undefined}
                                            alt={pick.playerName}
                                          />
                                          <AvatarFallback className="text-xs">
                                            {pick.playerName.split(" ").map((n: string) => n[0]).join("").substring(0, 2)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <span className="text-sm">{pick.playerName}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {pick.position && (
                                        <Badge className={`text-[10px] px-1.5 ${positionColors[pick.position] || "bg-muted"}`}>
                                          {pick.position}
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      {pick.team || "-"}
                                    </TableCell>
                                    <TableCell className="text-sm">{pick.fantasyTeam}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Draft picks will be loaded when viewing this draft in the Draft page.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="matchups">
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="h-[400px]">
                {!week ? (
                  <p className="text-sm text-muted-foreground">Enter a week to view matchup snapshots.</p>
                ) : matchups?.length ? (
                  <pre className="text-xs">{JSON.stringify(matchups || [], null, 2)}</pre>
                ) : (
                  <p className="text-sm text-muted-foreground">No matchup snapshots found.</p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="transactions">
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="h-[400px]">
                {!week ? (
                  <p className="text-sm text-muted-foreground">Enter a week to view transaction snapshots.</p>
                ) : transactions?.length ? (
                  <pre className="text-xs">{JSON.stringify(transactions || [], null, 2)}</pre>
                ) : (
                  <p className="text-sm text-muted-foreground">No transaction snapshots found.</p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="year-recap" className="mt-0">
          {yearRecapLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-12 w-64" />
              <div className="grid gap-4 md:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-[320px] w-full" />
                ))}
              </div>
            </div>
          ) : yearRecapData ? (
            <YearRecapDisplay
              data={yearRecapData}
              leagueId={effectiveLeagueId}
              seasonLabel={season}
              playerAwards={undefined}
            />
          ) : (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <p className="text-muted-foreground">No year recap snapshot available for this season.</p>
                <p className="text-sm text-muted-foreground mt-2">Year recap data is saved when advancing the league year.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="metrics" className="mt-0">
          {metricsLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-12 w-64" />
              <div className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : metricsData ? (
            <MetricsDisplay
              teamLuck={metricsData.teamLuck}
              heatCheck={metricsData.heatCheck}
              powerRankings={metricsData.powerRankings}
              flukeTracker={undefined}
              flukeLoading={false}
              userId={undefined}
              luckiestTeam={metricsData.teamLuck?.teams?.[0]}
              unluckiestTeam={metricsData.teamLuck?.teams?.[metricsData.teamLuck?.teams?.length - 1]}
              userLuckTeam={undefined}
              hottestTeam={metricsData.heatCheck?.teams?.filter((t: any) => t.isHot)?.[0]}
              coldestTeam={metricsData.heatCheck?.teams?.filter((t: any) => !t.isHot)?.slice(-1)?.[0]}
              userHeatTeam={undefined}
              hotTeams={metricsData.heatCheck?.teams?.filter((t: any) => t.isHot) || []}
              coldTeams={metricsData.heatCheck?.teams?.filter((t: any) => !t.isHot) || []}
              expandedTeam={metricsExpandedTeam}
              toggleExpanded={(rosterId) => setMetricsExpandedTeam((prev) => (prev === rosterId ? null : rosterId))}
              flukeExpandedTeam={flukeExpandedTeam}
              setFlukeExpandedTeam={setFlukeExpandedTeam}
              flukeExpandedWeek={flukeExpandedWeek}
              setFlukeExpandedWeek={setFlukeExpandedWeek}
            />
          ) : (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <p className="text-muted-foreground">No metrics snapshot available for this season.</p>
                <p className="text-sm text-muted-foreground mt-2">Metrics data is saved when advancing the league year.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
