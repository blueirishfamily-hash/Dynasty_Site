interface ValueBalanceBarProps {
  giveTotal: number;
  getTotal: number;
  /** Share of the bar for "you get", 0..1 */
  bias: number;
  label: string;
  compact?: boolean;
}

export function ValueBalanceBar({ giveTotal, getTotal, bias, label, compact }: ValueBalanceBarProps) {
  const give = Math.round(giveTotal);
  const get = Math.round(getTotal);
  const summary = `You give ${give}, you get ${get}. ${label}.`;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-blue-400">You give {give}</span>
        <span className="text-green-400">You get {get}</span>
      </div>
      <div
        role="img"
        aria-label={summary}
        className="relative h-2.5 rounded-full overflow-hidden flex bg-muted"
      >
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${(1 - bias) * 100}%` }} />
        <div className="h-full bg-green-500 transition-all" style={{ width: `${bias * 100}%` }} />
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white" />
      </div>
      <p className={`text-center font-medium ${compact ? "text-sm" : "text-base"}`}>{label}</p>
    </div>
  );
}
