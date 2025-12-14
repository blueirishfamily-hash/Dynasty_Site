import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronUp, ChevronDown, Search, Info } from "lucide-react";

type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
type RosterStatus = "starter" | "bench" | "taxi" | "ir";
type SortField = "name" | "position" | "age" | "points" | "weeklyAvg";

interface Player {
  id: string;
  name: string;
  position: Position;
  team: string | null;
  age?: number;
  status: RosterStatus;
  seasonPoints: number;
  weeklyAvg: number;
  positionRank: number;
}

interface PlayerTableProps {
  players: Player[];
  onPlayerClick?: (player: Player) => void;
}

const positionColors: Record<Position, string> = {
  QB: "bg-chart-5 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-chart-2 text-white",
  TE: "bg-chart-4 text-white",
  K: "bg-chart-3 text-white",
  DEF: "bg-muted text-muted-foreground",
};

const statusLabels: Record<RosterStatus, string> = {
  starter: "Starter",
  bench: "Bench",
  taxi: "Taxi",
  ir: "IR",
};

export default function PlayerTable({ players, onPlayerClick }: PlayerTableProps) {
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<Position | "all">("all");
  const [statusFilter, setStatusFilter] = useState<RosterStatus | "all">("all");
  const [sortField, setSortField] = useState<SortField>("points");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredPlayers = players
    .filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (positionFilter !== "all" && p.position !== positionFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "position":
          comparison = a.position.localeCompare(b.position);
          break;
        case "age":
          comparison = (a.age || 0) - (b.age || 0);
          break;
        case "points":
          comparison = a.seasonPoints - b.seasonPoints;
          break;
        case "weeklyAvg":
          comparison = a.weeklyAvg - b.weeklyAvg;
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDown className="w-4 h-4 inline ml-1" />
    );
  };

  const getAgeColor = (age?: number) => {
    if (!age) return "text-muted-foreground";
    if (age <= 24) return "text-primary";
    if (age <= 28) return "text-foreground";
    return "text-destructive";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="font-heading text-lg">Roster</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search players..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-48"
                data-testid="input-search-players"
              />
            </div>
            <Select
              value={positionFilter}
              onValueChange={(v) => setPositionFilter(v as Position | "all")}
            >
              <SelectTrigger className="w-28" data-testid="select-position">
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Pos</SelectItem>
                <SelectItem value="QB">QB</SelectItem>
                <SelectItem value="RB">RB</SelectItem>
                <SelectItem value="WR">WR</SelectItem>
                <SelectItem value="TE">TE</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as RosterStatus | "all")}
            >
              <SelectTrigger className="w-28" data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="starter">Starters</SelectItem>
                <SelectItem value="bench">Bench</SelectItem>
                <SelectItem value="taxi">Taxi</SelectItem>
                <SelectItem value="ir">IR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className="cursor-pointer"
                  onClick={() => handleSort("name")}
                >
                  Player <SortIcon field="name" />
                </TableHead>
                <TableHead
                  className="cursor-pointer text-center"
                  onClick={() => handleSort("position")}
                >
                  Pos <SortIcon field="position" />
                </TableHead>
                <TableHead
                  className="cursor-pointer text-center"
                  onClick={() => handleSort("age")}
                >
                  Age <SortIcon field="age" />
                </TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead
                  className="cursor-pointer text-right"
                  onClick={() => handleSort("points")}
                >
                  Pts <SortIcon field="points" />
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right"
                  onClick={() => handleSort("weeklyAvg")}
                >
                  Avg <SortIcon field="weeklyAvg" />
                </TableHead>
                <TableHead className="text-center">Rank</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlayers.map((player) => (
                <TableRow
                  key={player.id}
                  className="cursor-pointer"
                  onClick={() => onPlayerClick?.(player)}
                  data-testid={`row-player-${player.id}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarImage 
                          src={`https://sleepercdn.com/content/nfl/players/${player.id}.jpg`}
                          alt={player.name}
                        />
                        <AvatarFallback className="text-xs bg-muted">
                          {player.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <span className="font-medium">{player.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {player.team || "FA"}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={`${positionColors[player.position]} text-xs`}>
                      {player.position}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-center font-medium ${getAgeColor(player.age)}`}>
                    {player.age || "â€”"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">
                      {statusLabels[player.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {player.seasonPoints.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {player.weeklyAvg.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="secondary"
                      className={`text-xs ${
                        player.positionRank <= 12
                          ? "bg-primary/20 text-primary"
                          : player.positionRank <= 24
                          ? "bg-chart-4/20 text-chart-4"
                          : ""
                      }`}
                    >
                      {player.position}{player.positionRank}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlayerClick?.(player);
                      }}
                      data-testid={`button-player-info-${player.id}`}
                    >
                      <Info className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
