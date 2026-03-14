import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeftRight, Users } from "lucide-react";

interface TradeAsset {
  type: "player" | "pick";
  name: string;
  details?: string;
  playerId?: string;
}

interface Trade {
  id: string;
  date: string;
  teamA: { name: string; initials: string; avatar?: string | null; rosterId?: number; assets: TradeAsset[] };
  teamB: { name: string; initials: string; avatar?: string | null; rosterId?: number; assets: TradeAsset[] };
}

interface TradeHistoryProps {
  trades: Trade[];
}

export default function TradeHistory({ trades }: TradeHistoryProps) {
  const [teamFilter, setTeamFilter] = useState<string>("all");

  const teamOptions = useMemo(() => {
    const teams = new Set<string>();
    trades.forEach((t) => {
      if (t.teamA?.name) teams.add(t.teamA.name);
      if (t.teamB?.name) teams.add(t.teamB.name);
    });
    return Array.from(teams).sort();
  }, [trades]);

  const filteredTrades = useMemo(() => {
    if (teamFilter === "all") return trades;
    return trades.filter(
      (t) => t.teamA?.name === teamFilter || t.teamB?.name === teamFilter
    );
  }, [trades, teamFilter]);

  const analytics = useMemo(() => {
    const totalTrades = trades.length;
    const teamCount = new Map<string, number>();
    let totalPlayers = 0;
    let totalPicks = 0;
    trades.forEach((t) => {
      [t.teamA, t.teamB].forEach((team) => {
        if (team?.name) {
          teamCount.set(team.name, (teamCount.get(team.name) ?? 0) + 1);
        }
      });
      (t.teamA?.assets || []).concat(t.teamB?.assets || []).forEach((a) => {
        if (a.type === "player") totalPlayers++;
        if (a.type === "pick") totalPicks++;
      });
    });
    let mostActive = "";
    let mostCount = 0;
    teamCount.forEach((c, name) => {
      if (c > mostCount) {
        mostCount = c;
        mostActive = name;
      }
    });
    const mostActiveTrade = trades.find(
      (t) => t.teamA?.name === mostActive || t.teamB?.name === mostActive
    );
    const mostActiveAvatar =
      mostActiveTrade?.teamA?.name === mostActive
        ? mostActiveTrade?.teamA?.avatar
        : mostActiveTrade?.teamB?.avatar;
    return {
      totalTrades,
      mostActiveTrader: mostActive || "—",
      mostActiveAvatar,
      totalPlayers,
      totalPicks,
    };
  }, [trades]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Trades</p>
            <p className="text-2xl font-bold">{analytics.totalTrades}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Most Active</p>
            <div className="flex items-center gap-2 mt-1">
              <Avatar className="w-6 h-6">
                {analytics.mostActiveAvatar && (
                  <AvatarImage src={analytics.mostActiveAvatar} alt={analytics.mostActiveTrader} />
                )}
                <AvatarFallback className="text-xs">{analytics.mostActiveTrader.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <p className="text-sm font-semibold truncate" title={analytics.mostActiveTrader}>
                {analytics.mostActiveTrader}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Players Moved</p>
            <p className="text-2xl font-bold">{analytics.totalPlayers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Picks Moved</p>
            <p className="text-2xl font-bold">{analytics.totalPicks}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              Trade History
            </CardTitle>
            {teamOptions.length > 0 && (
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {teamOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredTrades.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {teamFilter === "all" ? "No trades have been made yet" : "No trades for this team"}
            </p>
          ) : (
            filteredTrades.map((trade) => {
              const hasPlayers = (trade.teamA?.assets || []).concat(trade.teamB?.assets || []).some((a) => a.type === "player");
              const hasPicks = (trade.teamA?.assets || []).concat(trade.teamB?.assets || []).some((a) => a.type === "pick");
              const tradeType =
                hasPlayers && hasPicks ? "Player & Pick Trade" : hasPicks ? "Draft Pick Trade" : "Player Trade";
              return (
                <div
                  key={trade.id}
                  className="p-4 rounded-lg bg-muted/30 border border-border hover:bg-muted/40 transition-colors"
                  data-testid={`trade-${trade.id}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground">{trade.date}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {tradeType}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        Completed
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-9 h-9">
                          {trade.teamA?.avatar && (
                            <AvatarImage src={trade.teamA.avatar} alt={trade.teamA.name} />
                          )}
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {trade.teamA?.initials ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{trade.teamA?.name}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 pl-11">
                        {(trade.teamA?.assets || []).slice(0, 6).map((asset, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            {asset.type === "player" && asset.playerId && i < 3 ? (
                              <Avatar className="w-6 h-6">
                                <AvatarImage
                                  src={`https://sleepercdn.com/content/nfl/players/${asset.playerId}.jpg`}
                                  alt={asset.name}
                                />
                                <AvatarFallback className="text-[10px]">
                                  {asset.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                            ) : null}
                            <Badge
                              variant="secondary"
                              className={`text-xs ${
                                asset.type === "player"
                                  ? "bg-chart-2/20 text-chart-2"
                                  : "bg-primary/20 text-primary"
                              }`}
                            >
                              {asset.name}
                              {asset.details && (
                                <span className="text-muted-foreground ml-1">({asset.details})</span>
                              )}
                            </Badge>
                          </div>
                        ))}
                        {(trade.teamA?.assets || []).length > 6 && (
                          <Badge variant="outline" className="text-xs">
                            +{(trade.teamA?.assets || []).length - 6} more
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-9 h-9">
                          {trade.teamB?.avatar && (
                            <AvatarImage src={trade.teamB.avatar} alt={trade.teamB.name} />
                          )}
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {trade.teamB?.initials ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{trade.teamB?.name}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 pl-11">
                        {(trade.teamB?.assets || []).slice(0, 6).map((asset, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            {asset.type === "player" && asset.playerId && i < 3 ? (
                              <Avatar className="w-6 h-6">
                                <AvatarImage
                                  src={`https://sleepercdn.com/content/nfl/players/${asset.playerId}.jpg`}
                                  alt={asset.name}
                                />
                                <AvatarFallback className="text-[10px]">
                                  {asset.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                            ) : null}
                            <Badge
                              variant="secondary"
                              className={`text-xs ${
                                asset.type === "player"
                                  ? "bg-chart-2/20 text-chart-2"
                                  : "bg-primary/20 text-primary"
                              }`}
                            >
                              {asset.name}
                              {asset.details && (
                                <span className="text-muted-foreground ml-1">({asset.details})</span>
                              )}
                            </Badge>
                          </div>
                        ))}
                        {(trade.teamB?.assets || []).length > 6 && (
                          <Badge variant="outline" className="text-xs">
                            +{(trade.teamB?.assets || []).length - 6} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
