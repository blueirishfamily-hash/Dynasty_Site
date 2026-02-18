import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { RefreshCw, Check, Bell, User, Database } from "lucide-react";

const COMMISSIONER_USER_IDS = ["900186363130503168"];

export default function Settings() {
  const { user, league, clearSession } = useSleeper();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const isCommissioner = !!(user?.userId && league && (
    (league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  ));

  useEffect(() => {
    if (user && league && !isCommissioner) setLocation("/");
  }, [user, league, isCommissioner, setLocation]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [advanceLeagueId, setAdvanceLeagueId] = useState("");
  const [manualLeagueId, setManualLeagueId] = useState("");
  const [unmatchedRosters, setUnmatchedRosters] = useState<Array<{ oldRosterId: number; ownerId: string | null }>>([]);
  const [manualMappings, setManualMappings] = useState<Record<number, number>>({});
  const [notifications, setNotifications] = useState({
    trades: true,
    waivers: true,
    lineupReminder: false,
    weeklyRecap: true,
  });

  const { data: availableLeagues } = useQuery({
    queryKey: ["/api/league/list"],
    queryFn: async () => {
      const res = await fetch("/api/league/list");
      if (!res.ok) throw new Error("Failed to fetch league list");
      return res.json();
    },
  });

  const { data: activeLeague } = useQuery({
    queryKey: ["/api/league/active"],
    queryFn: async () => {
      const res = await fetch("/api/league/active");
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch active league");
      }
      return res.json();
    },
  });

  const { data: sleeperLeagues } = useQuery({
    queryKey: ["/api/sleeper/user", user?.userId, "leagues", league?.season],
    queryFn: async () => {
      const season = league?.season || new Date().getFullYear().toString();
      const res = await fetch(`/api/sleeper/user/${user?.userId}/leagues?season=${season}`);
      if (!res.ok) throw new Error("Failed to fetch Sleeper leagues");
      return res.json();
    },
    enabled: !!user?.userId && (!availableLeagues || availableLeagues.length === 0),
  });

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsRefreshing(false);
    toast({
      title: "Data refreshed",
      description: "All league data has been synced from Sleeper.",
    });
  };

  const handleDisconnect = () => {
    clearSession();
    toast({
      title: "Disconnected",
      description: "Your Sleeper account has been disconnected.",
    });
  };

  const handleLeagueChange = async (leagueId: string) => {
    if (!leagueId) return;
    const res = await fetch("/api/league/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId }),
    });
    if (!res.ok) {
      toast({
        title: "Failed to switch league",
        description: "Could not set active league. Please try again.",
      });
      return;
    }
    await queryClient.invalidateQueries();
    toast({
      title: "League updated",
      description: "Active league has been updated. Reloading...",
    });
    window.location.reload();
  };

  const knownLeagueOptions = useMemo(() => ([
    { leagueId: "918240874625257472", season: "2023" },
    { leagueId: "1048746932522405888", season: "2024" },
    { leagueId: "1194798912048705536", season: "2025" },
  ]), []);

  const mostRecentKnownLeagueId = useMemo(() => {
    const sorted = [...knownLeagueOptions].sort((a, b) => {
      const seasonA = parseInt(a.season) || 0;
      const seasonB = parseInt(b.season) || 0;
      return seasonB - seasonA;
    });
    return sorted[0]?.leagueId || "";
  }, [knownLeagueOptions]);

  const normalizedSleeperLeagues = useMemo(() => {
    return (sleeperLeagues || [])
      .map((l: any) => ({
        leagueId: l.league_id || l.leagueId,
        season: l.season,
        name: l.name,
      }))
      .filter((l: any) => !!l.leagueId);
  }, [sleeperLeagues]);

  const leagueOptions = useMemo(() => {
    const baseOptions = (availableLeagues && availableLeagues.length > 0)
      ? availableLeagues
      : normalizedSleeperLeagues;

    const merged: Array<{ leagueId: string; season?: string; name?: string }> = [];
    const seen = new Set<string>();

    const pushUnique = (item: { leagueId: string; season?: string; name?: string }) => {
      if (!item.leagueId || seen.has(item.leagueId)) return;
      seen.add(item.leagueId);
      merged.push(item);
    };

    knownLeagueOptions.forEach(pushUnique);
    baseOptions.forEach(pushUnique);

    if (activeLeague?.leagueId) {
      pushUnique({ leagueId: activeLeague.leagueId, season: activeLeague.season });
    }

    const activeFromList = (availableLeagues || []).find((l: any) => l.isActive === 1 || l.isActive === "1");
    if (activeFromList?.leagueId) {
      pushUnique({ leagueId: activeFromList.leagueId, season: activeFromList.season });
    }

    if (league?.leagueId) {
      pushUnique({ leagueId: league.leagueId, season: league.season, name: league.name });
    }

    return merged;
  }, [
    availableLeagues,
    normalizedSleeperLeagues,
    knownLeagueOptions,
    activeLeague?.leagueId,
    activeLeague?.season,
    league?.leagueId,
    league?.season,
    league?.name,
  ]);

  const activeLeagueIdFromList = useMemo(() => {
    const active = (availableLeagues || []).find((l: any) => l.isActive === 1 || l.isActive === "1");
    return active?.leagueId || "";
  }, [availableLeagues]);

  const selectedLeagueId = activeLeagueIdFromList || activeLeague?.leagueId || league?.leagueId || mostRecentKnownLeagueId;

  useEffect(() => {
    if (selectedLeagueId) {
      setManualLeagueId(selectedLeagueId);
    }
  }, [selectedLeagueId]);

  if (user && league && !isCommissioner) return null;

  const handleAdvanceLeagueYear = async () => {
    if (!advanceLeagueId.trim() || !user?.userId) return;

    const manualMappingArray = Object.entries(manualMappings)
      .filter(([, newRosterId]) => !!newRosterId)
      .map(([oldRosterId, newRosterId]) => ({
        oldRosterId: parseInt(oldRosterId, 10),
        newRosterId,
      }));

    const res = await fetch("/api/league/advance-year", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newLeagueId: advanceLeagueId.trim(),
        userId: user.userId,
        manualMappings: manualMappingArray,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      if (error?.unmatched) {
        setUnmatchedRosters(error.unmatched);
        toast({
          title: "Roster mapping required",
          description: "Please map all unmatched rosters before continuing.",
        });
        return;
      }
      toast({
        title: "Advance failed",
        description: error?.error || "Failed to advance league year.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "League advanced",
      description: "League year advanced successfully. Reloading...",
    });
    window.location.reload();
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-heading text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-muted-foreground" />
              <CardTitle className="font-heading text-lg">Account</CardTitle>
            </div>
            <CardDescription>Your Sleeper account connection details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Sleeper Username</Label>
                <Input
                  id="username"
                  value={user?.username || "Not connected"}
                  readOnly
                  className="bg-muted"
                  data-testid="input-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leagueId">League</Label>
                <Input
                  id="leagueId"
                  value={league?.name || "No league selected"}
                  readOnly
                  className="bg-muted"
                  data-testid="input-league-id"
                />
              </div>
            </div>
            {user && league && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  <Check className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {league.totalRosters} teams | {league.season} season
                </span>
              </div>
            )}

            {leagueOptions && Array.isArray(leagueOptions) && leagueOptions.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="activeLeague">Active League</Label>
                <Select
                  value={selectedLeagueId}
                  onValueChange={handleLeagueChange}
                >
                  <SelectTrigger id="activeLeague" data-testid="select-active-league">
                    <SelectValue placeholder="Select league" />
                  </SelectTrigger>
                  <SelectContent>
                    {leagueOptions.map((l: any) => (
                      <SelectItem key={l.leagueId} value={l.leagueId}>
                        {l.leagueId} {l.season ? `(${l.season})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!availableLeagues?.length && (
                  <p className="text-xs text-muted-foreground">
                    No active leagues saved yet. Select a Sleeper league to set the initial active league.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="manualLeagueId">Set Active League ID</Label>
              <div className="flex gap-2">
                <Input
                  id="manualLeagueId"
                  value={manualLeagueId}
                  onChange={(e) => setManualLeagueId(e.target.value)}
                  placeholder="Enter Sleeper league ID"
                />
                <Button
                  onClick={() => {
                    if (!manualLeagueId.trim()) return;
                    handleLeagueChange(manualLeagueId.trim());
                  }}
                >
                  Set Active
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {isCommissioner && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-muted-foreground" />
                <CardTitle className="font-heading text-lg">League Year Advancement</CardTitle>
              </div>
              <CardDescription>Advance league year and migrate contracts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="advance-league-id">New Sleeper League ID</Label>
                <Input
                  id="advance-league-id"
                  value={advanceLeagueId}
                  onChange={(e) => setAdvanceLeagueId(e.target.value)}
                  placeholder="Enter new league ID"
                  data-testid="input-advance-league-id"
                />
              </div>
              {unmatchedRosters.length > 0 && (
                <div className="space-y-2">
                  <Label>Unmatched Rosters</Label>
                  {unmatchedRosters.map((roster) => (
                    <div key={roster.oldRosterId} className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Old roster {roster.oldRosterId} {roster.ownerId ? `(${roster.ownerId})` : ""}
                      </span>
                      <Input
                        className="w-32"
                        placeholder="New roster ID"
                        value={manualMappings[roster.oldRosterId] || ""}
                        onChange={(e) =>
                          setManualMappings((prev) => ({
                            ...prev,
                            [roster.oldRosterId]: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        data-testid={`input-roster-map-${roster.oldRosterId}`}
                      />
                    </div>
                  ))}
                </div>
              )}
              <Button onClick={handleAdvanceLeagueYear} data-testid="button-advance-league-year">
                Advance League Year
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-muted-foreground" />
              <CardTitle className="font-heading text-lg">Data Sync</CardTitle>
            </div>
            <CardDescription>Refresh your league data from Sleeper</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Auto-refresh</p>
                <p className="text-sm text-muted-foreground">Automatically sync data when you navigate</p>
              </div>
              <Switch defaultChecked data-testid="switch-auto-refresh" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Cache duration</p>
                <p className="text-sm text-muted-foreground">How long to cache API responses</p>
              </div>
              <Select defaultValue="5">
                <SelectTrigger className="w-32" data-testid="select-refresh-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 minute</SelectItem>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <Button
              onClick={handleRefreshData}
              disabled={isRefreshing || !league}
              data-testid="button-refresh-data"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing..." : "Refresh Now"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <CardTitle className="font-heading text-lg">Notifications</CardTitle>
            </div>
            <CardDescription>Manage when you receive alerts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Trade alerts</p>
                <p className="text-sm text-muted-foreground">Get notified when trades are made in your league</p>
              </div>
              <Switch
                checked={notifications.trades}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, trades: checked })
                }
                data-testid="switch-trade-alerts"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Waiver claims</p>
                <p className="text-sm text-muted-foreground">Get notified about waiver wire activity</p>
              </div>
              <Switch
                checked={notifications.waivers}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, waivers: checked })
                }
                data-testid="switch-waiver-alerts"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Lineup reminder</p>
                <p className="text-sm text-muted-foreground">Remind me to set my lineup before games</p>
              </div>
              <Switch
                checked={notifications.lineupReminder}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, lineupReminder: checked })
                }
                data-testid="switch-lineup-reminder"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Weekly recap</p>
                <p className="text-sm text-muted-foreground">Receive a summary of the week's activity</p>
              </div>
              <Switch
                checked={notifications.weeklyRecap}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, weeklyRecap: checked })
                }
                data-testid="switch-weekly-recap"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Disconnect Sleeper</p>
                <p className="text-sm text-muted-foreground">Remove your Sleeper account connection</p>
              </div>
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleDisconnect}
                disabled={!user}
                data-testid="button-disconnect"
              >
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
