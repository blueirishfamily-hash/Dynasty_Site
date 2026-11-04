/**
 * Formats a probability percentage with up to two decimals, dropping trailing zeros
 * (73.50 -> "73.5", 73.00 -> "73"). Only an exact 0 or 100 is shown as "0%" or "100%";
 * anything merely close to them keeps its real value (e.g. 99.99%, 0.01%).
 */
export function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  if (value >= 100) return "100%";
  if (value <= 0) return "0%";
  let text = value.toFixed(2);
  if (text === "100.00") text = "99.99";
  if (text === "0.00") text = "0.01";
  return `${text.replace(/\.?0+$/, "")}%`;
}
