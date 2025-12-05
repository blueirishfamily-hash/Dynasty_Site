import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COMMISSIONER_USER_IDS = [
  "900186363130503168",
];

const CONTRACT_YEARS = [2025, 2026, 2027, 2028];

function isUserCommissioner(userId: string | undefined, league: any): boolean {
  if (!userId || !league) return false;
  if (league.commissionerId && userId === league.commissionerId) return true;
  if (COMMISSIONER_USER_IDS.includes(userId)) return true;
  return false;
}

const positionColors: Record<string, string> = {
  QB: "bg-red-500 text-white",
  RB: "bg-green-500 text-white",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-gray-700 text-white",
};

interface ContractApprovalRequest {
  id: string;
  leagueId: string;
  rosterId: number;
  teamName: string;
  ownerName: string;
  contractsJson: string;
  status: string;
  submittedAt: number;
  reviewedAt: number | null;
  reviewerNotes: string | null;
}

interface ContractData {
  playerId: string;
  playerName: string;
  playerPosition: string;
  salary2025: number;
  salary2026: number;
  salary2027: number;
  salary2028: number;
  franchiseTagApplied?: number;
}

export default function ContractApprovals() {
  const { toast } = useToast();
  const { user, league, isLoading } = useSleeper();
  const [, setLocation] = useLocation();
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [reviewDialog, setReviewDialog] = useState<{ request: ContractApprovalRequest; action: "approve" | "reject" } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const isCommissioner = isUserCommissioner(user?.userId, league);

  const { data: approvalRequests, isLoading: isLoadingRequests } = useQuery<ContractApprovalRequest[]>({
    queryKey: ["/api/league", league?.leagueId, "contract-approvals"],
    enabled: !!league?.leagueId && isCommissioner,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, status, notes }: { requestId: string; status: "approved" | "rejected"; notes?: string }) => {
      return apiRequest("PATCH", `/api/league/${league?.leagueId}/contract-approvals/${requestId}`, {
        status,
        reviewerNotes: notes,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "contract-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "contracts"] });
      toast({
        title: variables.status === "approved" ? "Contracts Approved" : "Contracts Rejected",
        description: variables.status === "approved" 
          ? "The contracts have been approved and are now official."
          : "The contract request has been rejected.",
      });
      setReviewDialog(null);
      setReviewNotes("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process the request. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || !league) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please log in and select a league first.</p>
      </div>
    );
  }

  if (!isCommissioner) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">
                Only the commissioner can access contract approvals.
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setLocation("/contracts")}
                data-testid="button-back-contracts"
              >
                Back to Contracts
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const toggleExpanded = (requestId: string) => {
    setExpandedRequests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requestId)) {
        newSet.delete(requestId);
      } else {
        newSet.add(requestId);
      }
      return newSet;
    });
  };

  const pendingRequests = approvalRequests?.filter(r => r.status === "pending") || [];
  const reviewedRequests = approvalRequests?.filter(r => r.status !== "pending") || [];

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const parseContracts = (json: string): ContractData[] => {
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  };

  const calculateTotalSalary = (contracts: ContractData[], year: number) => {
    const key = `salary${year}` as keyof ContractData;
    return contracts.reduce((sum, c) => sum + (Number(c[key]) || 0), 0) / 10;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-heading font-bold">Contract Approvals</h1>
            <p className="text-sm text-muted-foreground">Review and approve team contract submissions</p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1">
          <Clock className="w-3 h-3" />
          {pendingRequests.length} Pending
        </Badge>
      </div>

      {isLoadingRequests ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      ) : pendingRequests.length === 0 && reviewedRequests.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">No Approval Requests</h2>
              <p className="text-muted-foreground">
                Teams haven't submitted any contracts for approval yet.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {pendingRequests.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-500" />
                Pending Requests ({pendingRequests.length})
              </h2>
              
              {pendingRequests.map(request => {
                const contracts = parseContracts(request.contractsJson);
                const isExpanded = expandedRequests.has(request.id);
                
                return (
                  <Card key={request.id} data-testid={`card-approval-${request.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {request.teamName.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <CardTitle className="text-base">{request.teamName}</CardTitle>
                            <p className="text-sm text-muted-foreground">{request.ownerName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{contracts.length} players</Badge>
                          <span className="text-xs text-muted-foreground">
                            Submitted {formatDate(request.submittedAt)}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        {CONTRACT_YEARS.map(year => (
                          <Card key={year} className="p-2">
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">{year}</div>
                              <div className="font-bold text-sm text-primary">
                                ${calculateTotalSalary(contracts, year).toFixed(1)}M
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mb-3"
                        onClick={() => toggleExpanded(request.id)}
                        data-testid={`button-expand-${request.id}`}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-4 h-4 mr-2" />
                            Hide Contract Details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4 mr-2" />
                            Show Contract Details ({contracts.length} players)
                          </>
                        )}
                      </Button>

                      {isExpanded && (
                        <ScrollArea className="h-[300px] mb-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Player</TableHead>
                                <TableHead className="text-center">Pos</TableHead>
                                {CONTRACT_YEARS.map(year => (
                                  <TableHead key={year} className="text-center">{year}</TableHead>
                                ))}
                                <TableHead className="text-center">Tag</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {contracts.map(contract => (
                                <TableRow key={contract.playerId}>
                                  <TableCell className="font-medium">{contract.playerName}</TableCell>
                                  <TableCell className="text-center">
                                    <Badge className={`${positionColors[contract.playerPosition] || "bg-gray-500 text-white"} text-[10px]`}>
                                      {contract.playerPosition}
                                    </Badge>
                                  </TableCell>
                                  {CONTRACT_YEARS.map(year => {
                                    const key = `salary${year}` as keyof ContractData;
                                    const salary = (Number(contract[key]) || 0) / 10;
                                    return (
                                      <TableCell key={year} className="text-center">
                                        {salary > 0 ? `$${salary.toFixed(1)}M` : "-"}
                                      </TableCell>
                                    );
                                  })}
                                  <TableCell className="text-center">
                                    {contract.franchiseTagApplied ? (
                                      <Badge variant="default" className="text-[10px]">FT</Badge>
                                    ) : "-"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      )}

                      <Separator className="my-3" />

                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setReviewDialog({ request, action: "reject" })}
                          data-testid={`button-reject-${request.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject
                        </Button>
                        <Button
                          onClick={() => setReviewDialog({ request, action: "approve" })}
                          data-testid={`button-approve-${request.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {reviewedRequests.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-muted-foreground" />
                Previously Reviewed ({reviewedRequests.length})
              </h2>
              
              {reviewedRequests.map(request => {
                const contracts = parseContracts(request.contractsJson);
                
                return (
                  <Card key={request.id} className="opacity-75" data-testid={`card-reviewed-${request.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {request.teamName.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <CardTitle className="text-base">{request.teamName}</CardTitle>
                            <p className="text-sm text-muted-foreground">{request.ownerName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={request.status === "approved" ? "default" : "destructive"}
                          >
                            {request.status === "approved" ? (
                              <><CheckCircle className="w-3 h-3 mr-1" /> Approved</>
                            ) : (
                              <><XCircle className="w-3 h-3 mr-1" /> Rejected</>
                            )}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {request.reviewedAt && formatDate(request.reviewedAt)}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    {request.reviewerNotes && (
                      <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground italic">
                          "{request.reviewerNotes}"
                        </p>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.action === "approve" ? "Approve Contracts" : "Reject Contracts"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {reviewDialog?.action === "approve" 
                ? `Are you sure you want to approve the contracts for ${reviewDialog?.request.teamName}? This will make these contracts official.`
                : `Are you sure you want to reject the contracts for ${reviewDialog?.request.teamName}?`
              }
            </p>
            
            <div>
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                placeholder="Add any notes for the team owner..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="mt-1"
                data-testid="input-review-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={reviewDialog?.action === "approve" ? "default" : "destructive"}
              onClick={() => {
                if (reviewDialog) {
                  reviewMutation.mutate({
                    requestId: reviewDialog.request.id,
                    status: reviewDialog.action === "approve" ? "approved" : "rejected",
                    notes: reviewNotes || undefined,
                  });
                }
              }}
              disabled={reviewMutation.isPending}
              data-testid="button-confirm-review"
            >
              {reviewMutation.isPending ? "Processing..." : reviewDialog?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
