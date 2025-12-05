import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Lock, Shield } from "lucide-react";

const COMMISSIONER_USER_IDS = [
  "456056564008312832",
  "457422007268728832",
];

export default function Contracts() {
  const { user, league } = useSleeper();

  const isCommissioner = user?.userId && (
    (league?.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  );

  if (!user || !league) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Please connect your league to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isCommissioner) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-heading font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">This page is only accessible to league commissioners.</p>
          </CardContent>
        </Card>
      </div>
    );
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
