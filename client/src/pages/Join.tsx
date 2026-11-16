// /join: the front door when this device has no league yet, and where "Join another league" goes.
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import JoinCard from "@/components/JoinCard";
import { setLeagueSlug, getLastLeagueSlug } from "@/lib/league-address";

export default function JoinPage() {
  // Not inside a league, so API calls here don't name one.
  setLeagueSlug(null);
  const last = getLastLeagueSlug();
  return (
    <div className="min-h-screen w-full bg-background">
      <header className="flex h-14 items-center px-4">
        {last && (
          <Link href={`/l/${last}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Back to your league
          </Link>
        )}
      </header>
      <JoinCard />
    </div>
  );
}
