export type MetricUnit = "currency" | "percent" | "number" | "days" | "ratio" | "score";

const SYMBOL: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

export function currencySymbol(currency = "GBP") {
  return SYMBOL[currency] ?? `${currency} `;
}

/** Compact money: £25.1m, £640k, £950. */
export function formatMoney(value: number | null | undefined, currency = "GBP", opts: { precise?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const s = currencySymbol(currency);
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (opts.precise) return `${sign}${s}${abs.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
  if (abs >= 1e9) return `${sign}${s}${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}bn`;
  if (abs >= 1e6) return `${sign}${s}${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}m`;
  if (abs >= 1e3) return `${sign}${s}${(abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}k`;
  return `${sign}${s}${abs.toFixed(0)}`;
}

export function formatMetric(
  value: number | null | undefined,
  unit: MetricUnit,
  opts: { decimals?: number; currency?: string; precise?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const decimals = opts.decimals ?? 0;
  switch (unit) {
    case "currency":
      return formatMoney(value, opts.currency, { precise: opts.precise });
    case "percent":
      return `${value.toFixed(decimals)}%`;
    case "ratio":
      return `${value.toFixed(Math.max(decimals, 1))}x`;
    case "days":
      return `${value.toFixed(decimals)}d`;
    default:
      return value.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
}

export function formatPct(v: number | null | undefined, decimals = 0, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const pct = v * 100;
  const sign = signed && pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(decimals)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(d: string | Date | null | undefined, opts: { year?: boolean } = {}): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  const day = date.getUTCDate();
  const m = MONTHS[date.getUTCMonth()];
  return opts.year === false ? `${day} ${m}` : `${day} ${m} ${date.getUTCFullYear()}`;
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${formatDate(date)}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`;
}

/** "3 days ago", "in 5 days", "today" */
export function relativeDays(d: string | Date | null | undefined, now = new Date()): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  const a = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (Math.abs(diff) < 45) return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
  const months = Math.round(Math.abs(diff) / 30);
  return diff > 0 ? `in ${months} months` : `${months} months ago`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
