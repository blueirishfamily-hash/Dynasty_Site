import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface CapSide {
  name: string;
  /** Change to salary by year (positive = more salary on the cap). */
  changes: number[];
  /** Total salary after the trade, by year. */
  newSalaries: number[];
}

interface CapByYearTableProps {
  years: number[];
  user: CapSide;
  partner: CapSide;
  totalCap: number;
  deadCapEnabled: boolean;
}

const fmt = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(1)}M`;

export function CapByYearTable({ years, user, partner, totalCap, deadCapEnabled }: CapByYearTableProps) {
  const [view, setView] = useState<"user" | "partner">("user");
  const side = view === "user" ? user : partner;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Salary cap by year
        </h3>
        <div className="flex gap-1" role="group" aria-label="Which team's cap to show">
          {(["user", "partner"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`px-2 py-0.5 rounded-full text-xs ${
                view === v ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"
              }`}
            >
              {v === "user" ? "Your cap" : "Their cap"}
            </button>
          ))}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 px-2 text-xs"> </TableHead>
            {years.map((y) => (
              <TableHead key={y} className="h-8 px-2 text-center text-xs">
                {y}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">Change</TableCell>
            {side.changes.map((c, i) => (
              <TableCell
                key={years[i]}
                className={`px-2 py-1.5 text-center text-xs font-mono ${
                  c > 0.05 ? "text-amber-400" : c < -0.05 ? "text-emerald-400" : ""
                }`}
              >
                {Math.abs(c) < 0.05 ? "0.0M" : fmt(c)}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">Room</TableCell>
            {side.newSalaries.map((s, i) => {
              const room = totalCap - s;
              const over = room < 0;
              return (
                <TableCell
                  key={years[i]}
                  className={`px-2 py-1.5 text-center text-xs font-mono ${over ? "text-red-400 font-medium" : ""}`}
                >
                  {over ? `${Math.abs(room).toFixed(1)}M over` : `${room.toFixed(1)}M`}
                </TableCell>
              );
            })}
          </TableRow>
        </TableBody>
      </Table>
      <p className="text-[11px] text-muted-foreground">
        {side.name}: positive change means more salary on the cap.
        {deadCapEnabled && " Dead cap applies to outgoing players."}
      </p>
    </div>
  );
}
