"use client";
import { useRouter } from "next/navigation";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, type ValueUnit } from "@/lib/analytics/format";

const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: "var(--muted-foreground)" } } as const;
const money = (v: number) => (Math.abs(v) >= 1e6 ? `£${(v / 1e6).toFixed(1)}m` : Math.abs(v) >= 1e3 ? `£${(v / 1e3).toFixed(0)}k` : `£${v.toFixed(0)}`);
const pctTick = (v: number) => `${(v * 100).toFixed(0)}%`;
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-muted)", "var(--brand-accent)"];
const UP = "var(--status-on)";
const DOWN = "var(--status-off)";

function TipBox({ title, rows }: { title: string; rows: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="mb-0.5 font-medium">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <b className="tabular">{r.value}</b>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------
export interface WaterfallStep { key: string; label: string; amount: number; kind: "total" | "up" | "down" | "adjust" | "unclassified"; href?: string; note?: string }

/** Opening → movements → closing. Each bar floats from the running total; totals start at zero. */
export function Waterfall({ steps, height = 300, unit = "currency" }: { steps: WaterfallStep[]; height?: number; unit?: ValueUnit }) {
  const router = useRouter();
  const data = steps.reduce<Array<WaterfallStep & { base: number; size: number; end: number }>>((acc, s) => {
    const prev = acc.length ? acc[acc.length - 1].end : 0;
    if (s.kind === "total") return [...acc, { ...s, base: 0, size: s.amount, end: s.amount }];
    const end = prev + s.amount;
    return [...acc, { ...s, base: Math.min(prev, end), size: Math.abs(s.amount), end }];
  }, []);
  // the axis is zoomed to the running totals so small movements stay visible; totals are drawn from the axis floor
  const values = data.flatMap((d) => (d.kind === "total" ? [d.amount] : [d.base, d.base + d.size]));
  const min = Math.min(...values), max = Math.max(...values);
  const pad = (max - min) * 0.25 || Math.abs(max) * 0.02 || 1;
  const floor = min > 0 ? Math.max(0, min - pad) : min - pad;
  const color = (k: WaterfallStep["kind"], amount: number) => (k === "total" ? "var(--brand)" : k === "unclassified" ? "var(--status-risk)" : k === "adjust" ? "var(--chart-muted)" : amount >= 0 ? UP : DOWN);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data.map((d) => (d.kind === "total" ? { ...d, base: floor, size: d.amount - floor } : d))} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" {...axis} interval={0} height={44} tick={(props) => <WrapTick x={Number(props.x)} y={Number(props.y)} payload={props.payload as { value: string }} />} />
          <YAxis {...axis} width={58} domain={[floor, max + pad * 0.4]} tickFormatter={(v: number) => (unit === "percent" ? pctTick(v) : money(v))} allowDataOverflow />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return <TipBox title={d.label} rows={[{ label: d.kind === "total" ? "Balance" : "Movement", value: fmt(d.amount, unit, { signed: d.kind !== "total", precise: true }) }, ...(d.kind === "total" ? [] : [{ label: "Running total", value: fmt(d.end, unit, { precise: true }) }]), ...(d.note ? [{ label: d.note, value: "" }] : []), ...(d.href ? [{ label: "Click to see the records", value: "" }] : [])]} />;
            }}
          />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="size" stackId="w" isAnimationActive={false} radius={[2, 2, 2, 2]} onClick={(d: { payload?: WaterfallStep }) => d.payload?.href && router.push(d.payload.href)} cursor="pointer">
            {data.map((d) => (
              <Cell key={d.key} fill={color(d.kind, d.amount)} fillOpacity={d.kind === "total" ? 0.9 : 0.85} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function WrapTick({ x, y, payload }: { x: number; y: number; payload: { value: string } }) {
  const words = payload.value.split(" ");
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + w).length <= 11) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  return (
    <text x={x} y={y + 10} textAnchor="middle" fontSize={10.5} fill="var(--muted-foreground)">
      {lines.slice(0, 3).map((l, i) => (
        <tspan key={i} x={x} dy={i ? 12 : 0}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------
export interface Series { key: string; label: string; color?: string; type?: "line" | "area" | "bar"; stack?: string; dashed?: boolean; negative?: boolean }

/** A general time series: lines, stacked areas or bars, with an optional reference line. */
export function TimeSeries({ data, series, unit = "currency", height = 260, reference, xKey = "label", onPointHref }: { data: Array<Record<string, unknown>>; series: Series[]; unit?: ValueUnit; height?: number; reference?: { value: number; label: string } | null; xKey?: string; onPointHref?: (row: Record<string, unknown>) => string | null }) {
  const router = useRouter();
  const tick = unit === "percent" ? pctTick : unit === "count" || unit === "fte" ? (v: number) => v.toLocaleString("en-GB") : money;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} stackOffset="sign">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axis} width={58} tickFormatter={tick} domain={["auto", "auto"]} />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return <TipBox title={String(label)} rows={series.map((s, i) => ({ label: s.label, color: s.color ?? SERIES[i % SERIES.length], value: fmt((payload[0].payload as Record<string, number | null>)[s.key], unit, { precise: unit === "currency" }) }))} />;
            }}
          />
          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
          {reference && <ReferenceLine y={reference.value} stroke="var(--chart-muted)" strokeDasharray="4 3" label={{ value: reference.label, position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }} />}
          {series.map((s, i) => {
            const c = s.color ?? SERIES[i % SERIES.length];
            if (s.type === "area") return <Area key={s.key} dataKey={s.key} name={s.label} stackId={s.stack} type="monotone" stroke={c} fill={c} fillOpacity={0.22} strokeWidth={1.5} isAnimationActive={false} connectNulls />;
            if (s.type === "bar") return <Bar key={s.key} dataKey={s.key} name={s.label} stackId={s.stack} fill={c} fillOpacity={0.85} maxBarSize={22} isAnimationActive={false} cursor={onPointHref ? "pointer" : undefined} onClick={(d: { payload?: Record<string, unknown> }) => { const href = d.payload && onPointHref?.(d.payload); if (href) router.push(href); }} />;
            return <Line key={s.key} dataKey={s.key} name={s.label} type="monotone" stroke={c} strokeWidth={s.dashed ? 1.5 : 2} strokeDasharray={s.dashed ? "4 3" : undefined} dot={false} isAnimationActive={false} connectNulls />;
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal comparison bars
// ---------------------------------------------------------------------------
export function CompareBars({ rows, unit, reference, height }: { rows: Array<{ key: string; label: string; value: number | null; href?: string; tone?: "up" | "down" | "neutral" }>; unit: ValueUnit; reference?: { value: number; label: string }; height?: number }) {
  const router = useRouter();
  const data = rows.filter((r) => r.value !== null);
  return (
    <div style={{ height: height ?? Math.max(120, data.length * 30 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart layout="vertical" data={data} margin={{ top: 4, right: 40, bottom: 4, left: 4 }}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" {...axis} tickFormatter={unit === "percent" ? pctTick : money} domain={unit === "percent" ? ["dataMin - 0.05", "dataMax + 0.02"] : ["auto", "auto"]} />
          <YAxis type="category" dataKey="label" {...axis} width={150} />
          <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.5 }} content={({ active, payload }) => (active && payload?.length ? <TipBox title={(payload[0].payload as { label: string }).label} rows={[{ label: "Value", value: fmt((payload[0].payload as { value: number }).value, unit) }]} /> : null)} />
          {reference && <ReferenceLine x={reference.value} stroke="var(--chart-muted)" strokeDasharray="4 3" label={{ value: reference.label, position: "top", fontSize: 10, fill: "var(--muted-foreground)" }} />}
          <Bar dataKey="value" maxBarSize={16} isAnimationActive={false} radius={[0, 2, 2, 0]} onClick={(d: { payload?: { href?: string } }) => d.payload?.href && router.push(d.payload.href)} cursor="pointer">
            {data.map((d) => (
              <Cell key={d.key} fill={d.tone === "down" ? DOWN : d.tone === "up" ? UP : "var(--chart-1)"} fillOpacity={0.8} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
