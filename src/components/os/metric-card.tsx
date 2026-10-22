import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { MetricView } from "@/lib/domain/metric-view";
import { formatMetric, targetLabel } from "@/lib/domain/format";
export { targetLabel };
import { periodLabel } from "@/lib/domain/metrics";
import type { Metric } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { StatusDot } from "./status";
import { Sparkline } from "./sparkline";

export function TrendIcon({ trend, className }: { trend: MetricView["trend"]; className?: string }) {
  if (trend === "improving") return <ArrowUpRight className={cn("size-3.5 text-on", className)} aria-label="Improving" />;
  if (trend === "declining") return <ArrowDownRight className={cn("size-3.5 text-off", className)} aria-label="Declining" />;
  return <ArrowRight className={cn("size-3.5 text-muted-foreground", className)} aria-label="Flat" />;
}

const toneOf = (s: MetricView["status"]) => (s === "on_track" ? "on" : s === "at_risk" ? "risk" : s === "off_track" ? "off" : "default") as "on" | "risk" | "off" | "default";

export function MetricCard({ view, href, currency, className }: { view: MetricView<Metric>; href: string; currency: string; className?: string }) {
  const m = view.metric;
  const latest = view.latest;
  const pts = view.points.slice(-12);
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg border bg-card p-3.5 transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-sm",
        view.status === "off_track" && "border-off/35",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-1 text-[12.5px] font-medium text-muted-foreground group-hover:text-foreground">{m.name}</p>
        <StatusDot status={view.status} className="mt-1" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[22px] leading-none font-semibold tracking-tight tabular">
          {formatMetric(latest?.value, m.unit, { decimals: m.decimals, currency })}
        </span>
        <TrendIcon trend={view.trend} />
      </div>
      <Sparkline values={pts.map((p) => p.value)} target={m.direction === "range" ? null : (latest?.target ?? m.target_value)} tone={toneOf(view.status)} />
      <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
        <span className="truncate">Target {targetLabel(m, latest?.target ?? m.target_value, currency)}</span>
        <span className="shrink-0">{latest ? periodLabel(latest.period, m.frequency, true) : "—"}</span>
      </div>
    </Link>
  );
}
