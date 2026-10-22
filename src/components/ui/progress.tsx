import { cn } from "@/lib/utils";

export function Progress({ value, className, tone = "default" }: { value: number; className?: string; tone?: "default" | "on" | "risk" | "off" | "done" | "brand" }) {
  const color = { default: "bg-foreground/70", on: "bg-on", risk: "bg-risk", off: "bg-off", done: "bg-done", brand: "bg-brand" }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${v}%` }} />
    </div>
  );
}
