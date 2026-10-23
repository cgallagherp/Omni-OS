import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";
import { SCORECARD_STATUS_LABEL, type ScorecardRow, type ScorecardStatus } from "@/lib/domain/weekly-scorecard";
import { cn } from "@/lib/utils";

const META: Record<ScorecardStatus, { icon: typeof Circle; cls: string }> = {
  on_track: { icon: CheckCircle2, cls: "bg-on-bg text-on-ink" },
  at_risk: { icon: AlertTriangle, cls: "bg-risk-bg text-risk-ink" },
  off_track: { icon: XCircle, cls: "bg-off-bg text-off-ink" },
  not_reported: { icon: Circle, cls: "bg-none-bg text-none-ink" },
};

export function ScorecardStatusPill({ status }: { status: ScorecardStatus }) {
  const m = META[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-px text-[11.5px] font-medium whitespace-nowrap", m.cls)}>
      <m.icon className="size-3" /> {SCORECARD_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * The Monday CEO update: KPI | Actual | Target | Status | Agreed corrective action.
 * No commentary. Corrective actions appear only against off-track KPIs.
 */
export function ScorecardTable({ rows, base, compact = false }: { rows: ScorecardRow[]; base?: string; compact?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm" data-testid="scorecard-table">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-4 py-2 font-medium">KPI</th>
            <th className="px-2 py-2 text-right font-medium">Actual</th>
            <th className="px-2 py-2 text-right font-medium">Target</th>
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Agreed corrective action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.metricId} className={cn(r.status === "off_track" && "bg-off-bg/30")} data-status={r.status}>
              <td className={cn("px-4 font-medium", compact ? "py-1.5" : "py-2.5")}>
                {base ? (
                  <Link href={`${base}/scoreboard/${r.metricId}`} className="hover:underline">
                    {r.kpi}
                  </Link>
                ) : (
                  r.kpi
                )}
                {!compact && <span className="block text-[11px] font-normal text-muted-foreground">{r.period}</span>}
              </td>
              <td className="px-2 text-right font-semibold tabular">{r.actual}</td>
              <td className="px-2 text-right text-muted-foreground tabular">{r.target}</td>
              <td className="px-2">
                <ScorecardStatusPill status={r.status} />
              </td>
              <td className="px-4 py-2 text-[13px]">
                {r.status !== "off_track" ? (
                  <span className="text-muted-foreground/60">—</span>
                ) : r.actionRequired ? (
                  <span className="font-medium text-off-ink">Action required — no corrective action agreed.</span>
                ) : (
                  <ul className="space-y-0.5">
                    {r.actions.map((a) => (
                      <li key={a.id}>
                        {a.title} <span className="text-muted-foreground">— {a.owner}, {a.dueLabel}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
