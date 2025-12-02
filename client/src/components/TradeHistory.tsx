import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeftRight } from "lucide-react";

interface TradeAsset {
  type: "player" | "pick";
  name: string;
  details?: string;
}

interface Trade {
  id: string;
  date: string;
  teamA: { name: string; initials: string; assets: TradeAsset[] };
  teamB: { name: string; initials: string; assets: TradeAsset[] };
}

interface TradeHistoryProps {
  trades: Trade[];
}

export default function TradeHistory({ trades }: TradeHistoryProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg">Trade History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {trades.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No trades have been made yet
          </p>
        ) : (
          trades.map((trade) => (
            <div
              key={trade.id}
              className="p-4 rounded-md bg-muted/30 border border-border"
              data-testid={`trade-${trade.id}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">{trade.date}</span>
                <Badge variant="outline" className="text-xs">
                  Completed
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-xs bg-sidebar text-sidebar-foreground">
                        {trade.teamA.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{trade.teamA.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-10">
                    {trade.teamA.assets.map((asset, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className={`text-xs ${
                          asset.type === "player"
                            ? "bg-chart-2/20 text-chart-2"
                            : "bg-primary/20 text-primary"
                        }`}
                      >
                        {asset.name}
                        {asset.details && (
                          <span className="text-muted-foreground ml-1">
                            ({asset.details})
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-xs bg-sidebar text-sidebar-foreground">
                        {trade.teamB.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{trade.teamB.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-10">
                    {trade.teamB.assets.map((asset, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className={`text-xs ${
                          asset.type === "player"
                            ? "bg-chart-2/20 text-chart-2"
                            : "bg-primary/20 text-primary"
                        }`}
                      >
                        {asset.name}
                        {asset.details && (
                          <span className="text-muted-foreground ml-1">
                            ({asset.details})
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
