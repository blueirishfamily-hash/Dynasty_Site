import { useEffect } from "react";
import { useLocation } from "wouter";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Shield } from "lucide-react";

const COMMISSIONER_USER_IDS = [
  "900186363130503168",
];

export default function Contracts() {
  const { user, league, isLoading } = useSleeper();
  const [, setLocation] = useLocation();

  const isCommissioner = !!(user?.userId && league && (
    (league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  ));

  useEffect(() => {
    if (!isLoading && user && league && !isCommissioner) {
      setLocation("/");
    }
  }, [isLoading, user, league, isCommissioner, setLocation]);

  if (isLoading || !league) {
    return null;
  }

  if (!user || !isCommissioner) {
    return null;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Contracts
          </h1>
          <p className="text-muted-foreground">
            Manage player contracts and salary cap (Commissioner Only)
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <Shield className="w-3 h-3" />
          Commissioner Access
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Contract Management</CardTitle>
          <CardDescription>
            This page is reserved for future contract and salary cap features.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center border-2 border-dashed border-border rounded-lg">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Coming Soon</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Contract management features will be added here. This could include player salaries, 
              contract lengths, franchise tags, and salary cap tracking.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
