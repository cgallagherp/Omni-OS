import { Badge } from "@/components/ui/badge";
import { STATUS_META, PRIORITY_META, type AnyStatus, type Tone } from "@/lib/domain/status";
import { cn } from "@/lib/utils";

const DOT: Record<Tone, string> = { on: "bg-on", risk: "bg-risk", off: "bg-off", done: "bg-done", none: "bg-none" };

export function StatusDot({ status, className }: { status: AnyStatus; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[STATUS_META[status].tone], className)} />;
}

export function StatusBadge({ status, className }: { status: AnyStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant={meta.tone} className={className}>
      <span className={cn("size-1.5 rounded-full", DOT[meta.tone])} />
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: keyof typeof PRIORITY_META }) {
  const meta = PRIORITY_META[priority];
  return <Badge variant={meta.tone === "none" ? "outline" : meta.tone}>{meta.label}</Badge>;
}

/** Thin stacked bar showing the distribution of statuses. */
export function StatusBar({ counts, className }: { counts: Partial<Record<Tone, number>>; className?: string }) {
  const order: Tone[] = ["on", "done", "risk", "off", "none"];
  const total = order.reduce((s, k) => s + (counts[k] ?? 0), 0);
  if (total === 0) return <div className={cn("h-1.5 rounded-full bg-muted", className)} />;
  return (
    <div className={cn("flex h-1.5 gap-px overflow-hidden rounded-full", className)}>
      {order.map((k) =>
        counts[k] ? <div key={k} className={DOT[k]} style={{ width: `${((counts[k] ?? 0) / total) * 100}%` }} /> : null,
      )}
    </div>
  );
}
