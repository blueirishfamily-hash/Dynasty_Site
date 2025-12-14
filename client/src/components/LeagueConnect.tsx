import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Zap, Search, ArrowRight } from "lucide-react";

interface LeagueConnectProps {
  onConnect?: (leagueId: string, username: string) => void;
}

export default function LeagueConnect({ onConnect }: LeagueConnectProps) {
  const [username, setUsername] = useState("");
  const [leagueId, setLeagueId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    if (!username.trim()) return;
    setIsLoading(true);
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    console.log("Connecting to league:", { username, leagueId });
    onConnect?.(leagueId, username);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="font-heading text-2xl">Dynasty Command</CardTitle>
          <CardDescription>
            Connect your Sleeper account to manage your dynasty league
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Sleeper Username</Label>
            <Input
              id="username"
              placeholder="Enter your Sleeper username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              data-testid="input-username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="leagueId">League ID (optional)</Label>
            <Input
              id="leagueId"
              placeholder="Enter league ID or search after connecting"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              data-testid="input-league-id"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleConnect}
            disabled={!username.trim() || isLoading}
            data-testid="button-connect"
          >
            {isLoading ? (
              "Connecting..."
            ) :
              <>
                Connect to Sleeper
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            We use the Sleeper API to fetch your league data. Your credentials are never stored.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
