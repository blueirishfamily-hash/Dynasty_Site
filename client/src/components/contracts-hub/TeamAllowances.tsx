import { Card, CardContent } from "@/components/ui/card";

// Team limits, matching the server's extension and bidding checks:
//  - Franchise tags: 1 per team per season.
//  - Rookie extensions: 3 per season, only 1 of them can be 4-year.
//  - Non-rookie extensions: 2 per season.
//  - Non-rookie contracts by length: 2-year max 5, 3-year max 4, 4+-year max 3. Rookie contracts are not counted.
export const CONTRACT_LENGTH_LIMITS: Record<number, number> = { 2: 5, 3: 4, 4: 3 };

const CONTRACT_LENGTH_ROWS = [
  { label: "1-year", bucket: 1 },
  { label: "2-year", bucket: 2 },
  { label: "3-year", bucket: 3 },
  { label: "4+ years", bucket: 4 },
];

export interface AllowanceExtension {
  rosterId: number;
  extensionType: number;
  isRookieExtension?: number;
  playerId?: string;
  status?: string;
  extensionYear?: number;
}

export interface AllowanceContract {
  rosterId: number;
  playerId?: string;
  contractThrough?: number | null;
  parsedSalaries: Record<number, number>;
  isRookieContract: number;
  franchiseTagUsed: number;
  franchiseTagYear?: number | null;
}

export function getTeamAllowances(
  rosterId: number,
  currentYear: number,
  extensions: AllowanceExtension[],
  contracts: AllowanceContract[],
  pendingTagCount = 0,
  pendingTagPlayerIds: string[] = [],
) {
  const teamExts = extensions.filter(e => e.rosterId === rosterId);
  const rookieExts = teamExts.filter(e => e.isRookieExtension === 1);
  const nonRookieExts = teamExts.filter(e => e.isRookieExtension !== 1);
  // A tag covers the season after the expiring one, so it is stored against currentYear + 1.
  const tagsUsed = contracts.filter(
    c => c.rosterId === rosterId && c.franchiseTagUsed === 1 && c.franchiseTagYear === currentYear + 1,
  ).length;

  // Contracts as they will look once every pending extension and tag is approved.
  const pendingExts = teamExts.filter(e => e.status === "pending");
  const withPending: AllowanceContract[] = contracts.map(c => {
    if (c.rosterId !== rosterId || !c.playerId) return c;
    const ext = pendingExts.find(e => e.playerId === c.playerId);
    if (ext) {
      const start = ext.extensionYear ?? currentYear + 1;
      const salaries: Record<number, number> = {};
      for (const [y, v] of Object.entries(c.parsedSalaries)) if (Number(y) < start) salaries[Number(y)] = v;
      for (let i = 0; i < ext.extensionType; i++) salaries[start + i] = 1;
      return { ...c, parsedSalaries: salaries, isRookieContract: 0 };
    }
    if (pendingTagPlayerIds.includes(c.playerId)) {
      const tagYear = (c.contractThrough ?? currentYear) + 1;
      return { ...c, parsedSalaries: { ...c.parsedSalaries, [tagYear]: 1 } };
    }
    return c;
  });

  // Non-rookie contracts by remaining salary years from a given season.
  const countByLength = (list: AllowanceContract[], fromYear: number) => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const c of list) {
      if (c.rosterId !== rosterId || c.isRookieContract === 1) continue;
      const years = Object.entries(c.parsedSalaries).filter(([y, v]) => Number(y) >= fromYear && Number(v) > 0).length;
      if (years > 0) counts[Math.min(years, 4)] += 1;
    }
    return counts;
  };

  return {
    tagsLeft: Math.max(0, 1 - tagsUsed - pendingTagCount),
    rookieLeft: Math.max(0, 3 - rookieExts.length),
    rookie4YearUsed: rookieExts.some(e => e.extensionType === 4),
    nonRookieLeft: Math.max(0, 2 - nonRookieExts.length),
    // Pending extensions and tags start next season, so they only change next season's counts.
    // `*Saved` is the same count with only approved contracts.
    thisYear: countByLength(contracts, currentYear),
    nextYear: countByLength(withPending, currentYear + 1),
    thisYearSaved: countByLength(contracts, currentYear),
    nextYearSaved: countByLength(contracts, currentYear + 1),
    pending: {
      tags: pendingTagCount,
      rookie: pendingExts.filter(e => e.isRookieExtension === 1).length,
      nonRookie: pendingExts.filter(e => e.isRookieExtension !== 1).length,
    },
  };
}

function LengthCount({ count, saved, bucket }: { count: number; saved: number; bucket: number }) {
  const limit = CONTRACT_LENGTH_LIMITS[bucket];
  const over = limit !== undefined && count > limit;
  const delta = count - saved;
  return (
    <div>
      <div className={`font-heading text-xl font-semibold leading-none ${over ? "text-red-500" : ""}`}>
        {count}
        {limit !== undefined ? (
          <span className="text-xs font-normal text-muted-foreground"> / {limit}</span>
        ) : (
          <span className="text-xs font-normal text-muted-foreground"> no cap</span>
        )}
      </div>
      {delta !== 0 && (
        <div className="text-[10px] text-blue-500 mt-1">
          {delta > 0 ? `+${delta}` : delta} pending
        </div>
      )}
    </div>
  );
}

export function TeamAllowancePanel({
  rosterId,
  currentYear,
  extensions,
  parsedContracts,
  pendingTagCount = 0,
  pendingTagPlayerIds = [],
  className = "",
}: {
  rosterId: number;
  currentYear: number;
  extensions: AllowanceExtension[];
  parsedContracts: AllowanceContract[];
  pendingTagCount?: number;
  pendingTagPlayerIds?: string[];
  className?: string;
}) {
  const a = getTeamAllowances(rosterId, currentYear, extensions, parsedContracts, pendingTagCount, pendingTagPlayerIds);

  const items = [
    { label: "Franchise tags", left: a.tagsLeft, total: 1, note: "1 per team per season", pending: a.pending.tags },
    { label: "Rookie extensions", left: a.rookieLeft, total: 3, note: a.rookie4YearUsed ? "4-year already used" : "Only 1 can be 4-year", pending: a.pending.rookie },
    { label: "Non-rookie extensions", left: a.nonRookieLeft, total: 2, note: "2 per team per season", pending: a.pending.nonRookie },
  ];

  return (
    <Card className={className}>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Left this season</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.label}>
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-2xl font-semibold font-heading">
                {item.left} <span className="text-sm text-muted-foreground font-normal">of {item.total}</span>
              </div>
              <div className="text-xs text-muted-foreground">{item.note}</div>
              {item.pending > 0 && (
                <div className="text-xs text-blue-500 mt-0.5">
                  {item.pending} pending approval (counted above)
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 border-t pt-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Non-rookie contracts by length</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CONTRACT_LENGTH_ROWS.map(row => (
              <div key={row.bucket} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="text-sm font-medium">{row.label}</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{currentYear}</div>
                    <LengthCount count={a.thisYear[row.bucket]} saved={a.thisYearSaved[row.bucket]} bucket={row.bucket} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{currentYear + 1}</div>
                    <LengthCount count={a.nextYear[row.bucket]} saved={a.nextYearSaved[row.bucket]} bucket={row.bucket} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
