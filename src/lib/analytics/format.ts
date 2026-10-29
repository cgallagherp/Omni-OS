import { formatMoney } from "@/lib/domain/format";

export type ValueUnit = "currency" | "percent" | "ratio" | "count" | "fte" | "currency_per_fte" | "pp";

/** Values: currency in pounds; percent and ratio as fractions (0.981 → 98.1%). */
export function fmt(v: number | null | undefined, unit: ValueUnit, opts: { precise?: boolean; decimals?: number; signed?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = opts.signed && v > 0 ? "+" : "";
  switch (unit) {
    case "currency":
    case "currency_per_fte":
      return sign + formatMoney(v, "GBP", { precise: opts.precise });
    case "percent":
      return `${sign}${(v * 100).toFixed(opts.decimals ?? 1).replace("-", "−")}%`;
    case "pp":
      return `${sign}${(v * 100).toFixed(opts.decimals ?? 1).replace("-", "−")}pp`;
    case "ratio":
      return `${v.toFixed(opts.decimals ?? 2)}x`;
    case "fte":
      return v.toLocaleString("en-GB", { maximumFractionDigits: 1 });
    default:
      return sign + v.toLocaleString("en-GB", { maximumFractionDigits: opts.decimals ?? 0 });
  }
}

/** Change between two values, in the unit that makes sense: points for percentages, % for amounts. */
export function delta(cur: number | null | undefined, prev: number | null | undefined, unit: ValueUnit): { text: string; value: number } | null {
  if (cur === null || cur === undefined || prev === null || prev === undefined) return null;
  if (unit === "percent") return { text: fmt(cur - prev, "pp", { signed: true }), value: cur - prev };
  if (!prev) return null;
  const g = (cur - prev) / Math.abs(prev);
  return { text: fmt(g, "percent", { signed: true }), value: g };
}
