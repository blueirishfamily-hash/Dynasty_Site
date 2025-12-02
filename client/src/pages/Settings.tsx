import { useState } from "react";
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
import { RefreshCw, Check, Bell, User, Database } from "lucide-react";

export default function Settings() {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notifications, setNotifications] = useState({
    trades: true,
    waivers: true,
    lineupReminder: false,
    weeklyRecap: true,
  });

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsRefreshing(false);
    toast({
      title: "Data refreshed",
      description: "All league data has been synced from Sleeper.",
    });
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
                  defaultValue="dynasty_champion"
                  readOnly
                  className="bg-muted"
                  data-testid="input-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leagueId">League ID</Label>
                <Input
                  id="leagueId"
                  defaultValue="1054892347583921"
                  readOnly
                  className="bg-muted"
                  data-testid="input-league-id"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                <Check className="w-3 h-3 mr-1" />
                Connected
              </Badge>
              <span className="text-sm text-muted-foreground">Last synced: 5 minutes ago</span>
            </div>
          </CardContent>
        </Card>

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
                <p className="text-sm text-muted-foreground">Automatically sync data every 15 minutes</p>
              </div>
              <Switch defaultChecked data-testid="switch-auto-refresh" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Refresh frequency</p>
                <p className="text-sm text-muted-foreground">How often to sync data automatically</p>
              </div>
              <Select defaultValue="15">
                <SelectTrigger className="w-32" data-testid="select-refresh-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <Button
              onClick={handleRefreshData}
              disabled={isRefreshing}
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
              <Button variant="destructive" size="sm" data-testid="button-disconnect">
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
