import { cn } from "@/lib/utils";

/** Lightweight SVG sparkline with optional target line. */
export function Sparkline({
  values,
  target,
  tone = "default",
  className,
  height = 28,
}: {
  values: Array<number | null>;
  target?: number | null;
  tone?: "default" | "on" | "risk" | "off";
  className?: string;
  height?: number;
}) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <div className={cn("h-7", className)} />;
  const all = pts.map((p) => p.v).concat(target ?? []);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const w = 100;
  const h = height;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - 3 - ((v - min) / span) * (h - 6);
  const d = pts.map((p, n) => `${n ? "L" : "M"}${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`).join(" ");
  const stroke = { default: "var(--chart-1)", on: "var(--status-on)", risk: "var(--status-risk)", off: "var(--status-off)" }[tone];
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("w-full overflow-visible", className)} style={{ height: h }} aria-hidden>
      {target !== null && target !== undefined && (
        <line x1={0} x2={w} y1={y(target)} y2={y(target)} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      )}
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.2} fill={stroke} />
    </svg>
  );
}
