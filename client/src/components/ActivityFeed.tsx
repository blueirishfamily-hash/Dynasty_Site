import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeftRight, UserPlus, UserMinus, DollarSign } from "lucide-react";

type TransactionType = "trade" | "add" | "drop" | "waiver";

interface Transaction {
  id: string;
  type: TransactionType;
  teamName: string;
  teamInitials: string;
  description: string;
  timestamp: string;
  players?: { name: string; action: "added" | "dropped" }[];
}

interface ActivityFeedProps {
  transactions: Transaction[];
}

const filterOptions: { label: string; value: TransactionType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Trades", value: "trade" },
  { label: "Waivers", value: "waiver" },
  { label: "Adds", value: "add" },
  { label: "Drops", value: "drop" },
];

const getTransactionIcon = (type: TransactionType) => {
  switch (type) {
    case "trade":
      return <ArrowLeftRight className="w-4 h-4" />;
    case "add":
      return <UserPlus className="w-4 h-4" />;
    case "drop":
      return <UserMinus className="w-4 h-4" />;
    case "waiver":
      return <DollarSign className="w-4 h-4" />;
  }
};

const getTransactionColor = (type: TransactionType) => {
  switch (type) {
    case "trade":
      return "bg-chart-3/20 text-chart-3";
    case "add":
      return "bg-primary/20 text-primary";
    case "drop":
      return "bg-destructive/20 text-destructive";
    case "waiver":
      return "bg-chart-4/20 text-chart-4";
  }
};

export default function ActivityFeed({ transactions }: ActivityFeedProps) {
  const [filter, setFilter] = useState<TransactionType | "all">("all");

  const filteredTransactions =
    filter === "all"
      ? transactions
      : transactions.filter((t) => t.type === filter);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="font-heading text-lg">Activity Feed</CardTitle>
          <div className="flex gap-1 flex-wrap">
            {filterOptions.map((option) => (
              <Button
                key={option.value}
                variant={filter === option.value ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilter(option.value)}
                data-testid={`filter-${option.value}`}
                className="text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
        {filteredTransactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No transactions found
          </p>
        ) : (
          filteredTransactions.map((transaction) => (
            <div
              key={transaction.id}
              className="flex items-start gap-3 p-3 rounded-md bg-muted/50 hover-elevate"
              data-testid={`transaction-${transaction.id}`}
            >
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-sidebar text-sidebar-foreground text-xs font-medium">
                  {transaction.teamInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{transaction.teamName}</span>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${getTransactionColor(transaction.type)}`}
                  >
                    {getTransactionIcon(transaction.type)}
                    <span className="ml-1 capitalize">{transaction.type}</span>
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {transaction.description}
                </p>
                {transaction.players && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {transaction.players.map((player, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={`text-xs ${
                          player.action === "added"
                            ? "border-primary/50 text-primary"
                            : "border-destructive/50 text-destructive"
                        }`}
                      >
                        {player.action === "added" ? "+" : "-"} {player.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {transaction.timestamp}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
