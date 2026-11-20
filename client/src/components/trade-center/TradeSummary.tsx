import type { ReactNode } from "react";
import { ArrowLeftRight, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { positionColors } from "./AssetPanel";
import { ValueBalanceBar } from "./ValueBalanceBar";
import type { Position, ValueComparison } from "./tradeMath";

export interface TradeLine {
  key: string;
  name: string;
  /** Player position, or undefined for a pick */
  position?: Position;
  detail: string;
  value: number;
  isPick?: boolean;
  onOpen?: () => void;
  onRemove: () => void;
}

function TradeLineRow({ line }: { line: TradeLine }) {
  return (
    <li className="flex items-center gap-2 py-1.5 min-w-0">
      {line.position ? (
        <Badge className={`text-[10px] px-1.5 shrink-0 ${positionColors[line.position]}`}>
          {line.position}
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
          PK
        </Badge>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {line.onOpen ? (
            <button
              type="button"
              onClick={line.onOpen}
              className="hover:underline hover:text-primary text-left max-w-full truncate"
              aria-label={`View ${line.name} details`}
            >
              {line.name}
            </button>
          ) : (
            line.name
          )}
        </p>
        {line.detail && <p className="text-xs text-muted-foreground truncate">{line.detail}</p>}
      </div>
      <span className="text-sm font-mono shrink-0">
        {line.isPick ? "~" : ""}
        {Math.round(line.value)}
      </span>
      <button
        type="button"
        onClick={line.onRemove}
        aria-label={`Remove ${line.name} from trade`}
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <X className="w-4 h-4" />
      </button>
    </li>
  );
}

function TradeBlock({
  title,
  total,
  lines,
  placeholder,
  tone,
}: {
  title: string;
  total: number;
  lines: TradeLine[];
  placeholder: string;
  tone: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className={`text-sm font-semibold ${tone}`}>{title}</h3>
        <span className="text-xs font-mono text-muted-foreground">{lines.length > 0 ? Math.round(total) : ""}</span>
      </div>
      {lines.length > 0 ? (
        <ul className="divide-y divide-border/50">
          {lines.map((l) => (
            <TradeLineRow key={l.key} line={l} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground py-2">{placeholder}</p>
      )}
    </div>
  );
}

interface TradeSummaryProps {
  partnerPicker: ReactNode;
  giveLines: TradeLine[];
  getLines: TradeLine[];
  comparison: ValueComparison;
  hasSelection: boolean;
  cap: ReactNode;
  onReset: () => void;
  onPropose: () => void;
  canPropose: boolean;
  className?: string;
}

export function TradeSummary({
  partnerPicker,
  giveLines,
  getLines,
  comparison,
  hasSelection,
  cap,
  onReset,
  onPropose,
  canPropose,
  className = "",
}: TradeSummaryProps) {
  return (
    <section
      aria-label="The trade"
      className={`min-w-0 border border-border rounded-lg bg-card p-4 space-y-4 ${className}`}
    >
      <div className="hidden md:block space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Trading with</p>
        {partnerPicker}
      </div>

      <TradeBlock
        title="You give"
        total={comparison.giveTotal}
        lines={giveLines}
        placeholder="Pick players or picks on the left"
        tone="text-blue-400"
      />

      <div className="flex items-center gap-3 text-muted-foreground" aria-hidden="true">
        <div className="h-px flex-1 bg-border" />
        <ArrowLeftRight className="w-4 h-4" />
        <div className="h-px flex-1 bg-border" />
      </div>

      <TradeBlock
        title="You get"
        total={comparison.getTotal}
        lines={getLines}
        placeholder="Pick players or picks on the right"
        tone="text-green-400"
      />

      {hasSelection ? (
        <ValueBalanceBar
          giveTotal={comparison.giveTotal}
          getTotal={comparison.getTotal}
          bias={comparison.bias}
          label={comparison.label}
        />
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          Add assets to see how balanced the trade is
        </p>
      )}

      {cap}

      <div className="hidden md:flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onReset} disabled={!hasSelection} data-testid="button-reset-trade">
          <X className="w-4 h-4 mr-1" />
          Reset
        </Button>
        <Button size="sm" onClick={onPropose} disabled={!canPropose} data-testid="button-propose-trade">
          <Check className="w-4 h-4 mr-1" />
          Propose trade
        </Button>
      </div>
    </section>
  );
}
