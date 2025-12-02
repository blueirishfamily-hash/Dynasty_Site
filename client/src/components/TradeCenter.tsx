import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeftRight, Check, X } from "lucide-react";

type Position = "QB" | "RB" | "WR" | "TE";

interface Player {
  id: string;
  name: string;
  position: Position;
  team: string;
}

interface DraftPick {
  id: string;
  year: number;
  round: number;
  originalOwner?: string;
}

interface TeamAssets {
  teamId: string;
  teamName: string;
  teamInitials: string;
  players: Player[];
  draftPicks: DraftPick[];
}

interface TradeCenterProps {
  userTeam: TeamAssets;
  leagueTeams: TeamAssets[];
  onProposeTrade?: (
    userAssets: { players: string[]; picks: string[] },
    theirAssets: { players: string[]; picks: string[] },
    targetTeamId: string
  ) => void;
}

const positionColors: Record<Position, string> = {
  QB: "bg-chart-5 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-chart-2 text-white",
  TE: "bg-chart-4 text-white",
};

export default function TradeCenter({
  userTeam,
  leagueTeams,
  onProposeTrade,
}: TradeCenterProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(leagueTeams[0]?.teamId || "");
  const [selectedUserPlayers, setSelectedUserPlayers] = useState<Set<string>>(new Set());
  const [selectedUserPicks, setSelectedUserPicks] = useState<Set<string>>(new Set());
  const [selectedTheirPlayers, setSelectedTheirPlayers] = useState<Set<string>>(new Set());
  const [selectedTheirPicks, setSelectedTheirPicks] = useState<Set<string>>(new Set());

  const selectedTeam = leagueTeams.find((t) => t.teamId === selectedTeamId);

  const toggleSelection = (
    id: string,
    set: Set<string>,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>
  ) => {
    const newSet = new Set(set);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setter(newSet);
  };

  const hasSelection =
    selectedUserPlayers.size > 0 ||
    selectedUserPicks.size > 0 ||
    selectedTheirPlayers.size > 0 ||
    selectedTheirPicks.size > 0;

  const clearAll = () => {
    setSelectedUserPlayers(new Set());
    setSelectedUserPicks(new Set());
    setSelectedTheirPlayers(new Set());
    setSelectedTheirPicks(new Set());
  };

  const handlePropose = () => {
    onProposeTrade?.(
      {
        players: Array.from(selectedUserPlayers),
        picks: Array.from(selectedUserPicks),
      },
      {
        players: Array.from(selectedTheirPlayers),
        picks: Array.from(selectedTheirPicks),
      },
      selectedTeamId
    );
    console.log("Trade proposed:", {
      giving: {
        players: Array.from(selectedUserPlayers),
        picks: Array.from(selectedUserPicks),
      },
      receiving: {
        players: Array.from(selectedTheirPlayers),
        picks: Array.from(selectedTheirPicks),
      },
    });
  };

  const renderAssetList = (
    players: Player[],
    picks: DraftPick[],
    selectedPlayers: Set<string>,
    selectedPicks: Set<string>,
    onTogglePlayer: (id: string) => void,
    onTogglePick: (id: string) => void,
    side: "user" | "opponent"
  ) => (
    <ScrollArea className="h-[300px]">
      <div className="space-y-1 p-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Players
        </p>
        {players.map((player) => (
          <div
            key={player.id}
            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover-elevate ${
              selectedPlayers.has(player.id) ? "bg-primary/10" : "bg-muted/30"
            }`}
            onClick={() => onTogglePlayer(player.id)}
            data-testid={`${side}-player-${player.id}`}
          >
            <Checkbox checked={selectedPlayers.has(player.id)} />
            <Avatar className="w-7 h-7">
              <AvatarFallback className="text-xs">
                {player.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 text-sm font-medium truncate">{player.name}</span>
            <Badge className={`text-xs ${positionColors[player.position]}`}>
              {player.position}
            </Badge>
          </div>
        ))}

        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4 mb-2">
          Draft Picks
        </p>
        {picks.map((pick) => (
          <div
            key={pick.id}
            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover-elevate ${
              selectedPicks.has(pick.id) ? "bg-primary/10" : "bg-muted/30"
            }`}
            onClick={() => onTogglePick(pick.id)}
            data-testid={`${side}-pick-${pick.id}`}
          >
            <Checkbox checked={selectedPicks.has(pick.id)} />
            <span className="flex-1 text-sm">
              {pick.year} {pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : `${pick.round}rd`}
              {pick.originalOwner && (
                <span className="text-muted-foreground"> (via {pick.originalOwner})</span>
              )}
            </span>
            <Badge
              variant="outline"
              className={`text-xs ${
                pick.round === 1 ? "border-primary text-primary" : ""
              }`}
            >
              Rd {pick.round}
            </Badge>
          </div>
        ))}
      </div>
    </ScrollArea>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="font-heading text-lg">Trade Center</CardTitle>
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-48" data-testid="select-trade-partner">
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {leagueTeams.map((team) => (
                <SelectItem key={team.teamId} value={team.teamId}>
                  {team.teamName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-border rounded-md">
            <div className="p-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {userTeam.teamInitials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{userTeam.teamName}</p>
                  <p className="text-xs text-muted-foreground">Your Team</p>
                </div>
              </div>
            </div>
            {renderAssetList(
              userTeam.players,
              userTeam.draftPicks,
              selectedUserPlayers,
              selectedUserPicks,
              (id) => toggleSelection(id, selectedUserPlayers, setSelectedUserPlayers),
              (id) => toggleSelection(id, selectedUserPicks, setSelectedUserPicks),
              "user"
            )}
          </div>

          <div className="border border-border rounded-md">
            <div className="p-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                    {selectedTeam?.teamInitials || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{selectedTeam?.teamName || "Select Team"}</p>
                  <p className="text-xs text-muted-foreground">Trade Partner</p>
                </div>
              </div>
            </div>
            {selectedTeam &&
              renderAssetList(
                selectedTeam.players,
                selectedTeam.draftPicks,
                selectedTheirPlayers,
                selectedTheirPicks,
                (id) => toggleSelection(id, selectedTheirPlayers, setSelectedTheirPlayers),
                (id) => toggleSelection(id, selectedTheirPicks, setSelectedTheirPicks),
                "opponent"
              )}
          </div>
        </div>

        {hasSelection && (
          <div className="mt-4 p-4 bg-muted/30 rounded-md">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium mb-1">Trade Summary</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Giving: {selectedUserPlayers.size + selectedUserPicks.size} assets
                  </span>
                  <ArrowLeftRight className="w-3 h-3" />
                  <span>
                    Receiving: {selectedTheirPlayers.size + selectedTheirPicks.size} assets
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearAll} data-testid="button-clear-trade">
                  <X className="w-4 h-4 mr-1" />
                  Clear
                </Button>
                <Button size="sm" onClick={handlePropose} data-testid="button-propose-trade">
                  <Check className="w-4 h-4 mr-1" />
                  Propose Trade
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
