"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrajectoryPoint {
  year: string;
  revenuePlan: number | null;
  revenueActual: number | null;
  ebitdaPlan: number | null;
  ebitdaActual: number | null;
}

const fmt = (v: number) => `£${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}m`;

export function TrajectoryChart({ data }: { data: TrajectoryPoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={fmt} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <Tooltip formatter={(v) => (typeof v === "number" ? fmt(v) : String(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)" }} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
          <Line isAnimationActive={false} name="Revenue plan" dataKey="revenuePlan" stroke="var(--chart-1)" strokeDasharray="4 3" dot={false} strokeWidth={1.5} connectNulls />
          <Line isAnimationActive={false} name="Revenue actual" dataKey="revenueActual" stroke="var(--chart-1)" strokeWidth={2.2} dot={{ r: 3 }} connectNulls />
          <Line isAnimationActive={false} name="EBITDA plan" dataKey="ebitdaPlan" stroke="var(--brand)" strokeDasharray="4 3" dot={false} strokeWidth={1.5} connectNulls />
          <Line isAnimationActive={false} name="EBITDA actual" dataKey="ebitdaActual" stroke="var(--brand)" strokeWidth={2.2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
