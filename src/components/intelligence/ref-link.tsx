import Link from "next/link";
import { LineChart } from "lucide-react";
import type { AnalyticsRef } from "@/lib/analytics/exceptions";
import { fmt } from "@/lib/analytics/format";

/** Shows the governed figure a Mission Control record was raised from, and links back to it. */
export function AnalyticsRefLink({ value, className }: { value: unknown; className?: string }) {
  const ref = value as AnalyticsRef | null;
  if (!ref?.href || !/^\/c\/[a-z0-9-]+\/(revenue|cost)/.test(ref.href)) return null;
  const unit = (ref.values?.unit === "currency_per_fte" ? "currency" : ref.values?.unit) as "currency" | "percent" | undefined;
  return (
    <Link href={ref.href} className={`inline-flex items-center gap-1.5 rounded-md border bg-brand-subtle px-2 py-1 text-xs text-brand-ink hover:underline ${className ?? ""}`}>
      <LineChart className="size-3.5" />
      From {ref.module === "revenue" ? "Revenue" : "Cost"} Intelligence: {ref.label}
      {ref.values && unit ? ` — ${fmt(ref.values.actual, unit)} vs ${fmt(ref.values.comparison, unit)}` : ""} ({ref.period.slice(0, 7)})
    </Link>
  );
}

/** Compact form for lists of actions. */
export function AnalyticsRefChip({ value }: { value: unknown }) {
  const ref = value as AnalyticsRef | null;
  if (!ref?.href || !/^\/c\/[a-z0-9-]+\/(revenue|cost)/.test(ref.href)) return null;
  return (
    <Link href={ref.href} title={ref.label} className="rounded bg-brand-subtle px-1.5 text-[11px] text-brand-ink no-underline hover:underline">
      {ref.module === "revenue" ? "Revenue" : "Cost"} evidence
    </Link>
  );
}
