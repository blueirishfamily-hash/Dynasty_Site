import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";

export function NotOpenYet({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="py-12 flex flex-col items-center text-center text-muted-foreground">
        <Lock className="w-8 h-8 mb-3 opacity-50" />
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-sm mt-1">Not open yet for the current league phase.</p>
      </CardContent>
    </Card>
  );
}
