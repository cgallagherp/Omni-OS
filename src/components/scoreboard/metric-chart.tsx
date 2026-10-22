"use client";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartPoint {
  label: string;
  value: number | null;
  target: number | null;
  status: string;
  formatted: string;
  formattedTarget: string;
}

const COLOR: Record<string, string> = {
  on_track: "var(--status-on)",
  at_risk: "var(--status-risk)",
  off_track: "var(--status-off)",
  no_data: "var(--status-none)",
};

export function MetricChart({ data, range, compact }: { data: ChartPoint[]; range?: { min: number; max: number } | null; compact?: boolean }) {
  return (
    <div className={compact ? "h-48" : "h-72"}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={12} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(+v.toFixed(2)))}
            domain={["auto", "auto"]}
          />
          {range && <ReferenceArea y1={range.min} y2={range.max} fill="var(--status-on)" fillOpacity={0.08} strokeOpacity={0} />}
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as ChartPoint;
              return (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                  <p className="font-medium">{p.label}</p>
                  <p>
                    Actual <b className="tabular">{p.formatted}</b>
                  </p>
                  <p className="text-muted-foreground">Target {p.formattedTarget}</p>
                </div>
              );
            }}
          />
          <Bar isAnimationActive={false} dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28}>
            {data.map((d, i) => (
              <Cell key={i} fill={COLOR[d.status] ?? COLOR.no_data} fillOpacity={0.85} />
            ))}
          </Bar>
          {!range && <Line isAnimationActive={false} type="monotone" dataKey="target" stroke="var(--chart-1)" strokeDasharray="4 3" strokeWidth={1.5} dot={false} connectNulls />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
