import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// The loading, empty and error states every League Stats tab uses.

export function StatsLoading({ message }: { message?: string }) {
  return (
    <div className="space-y-4" data-testid="stats-loading" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">{message ?? "Loading..."}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function StatsEmpty({ children }: { children?: ReactNode }) {
  return (
    <Card data-testid="stats-empty">
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {children ?? "No data for this season yet"}
      </CardContent>
    </Card>
  );
}

export function StatsError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <Card className="border-destructive/50" data-testid="stats-error" role="alert">
      <CardContent className="flex flex-wrap items-center gap-3 py-6">
        <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
        <p className="flex-1 text-sm">{message ?? "Something went wrong loading this."}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
