export interface ParsedContract {
  playerId: string;
  rosterId: number;
  parsedSalaries: Record<number, number>;
  contractThrough: number | null;
  isRookieContract?: number;
  franchiseTagUsed?: number;
  hasBeenFranchiseTagged?: number;
  hasBeenExtended?: number;
}
