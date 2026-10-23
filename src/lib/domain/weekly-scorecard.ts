// The Monday CEO update: an extremely concise KPI scorecard.
// Only the agreed KPIs; corrective actions only against KPIs that are off track.
// No commentary of any kind is generated here.
import { formatDate, formatMetric, targetLabel, type MetricUnit } from "./format";
import { periodLabel } from "./metrics";
import type { MetricView } from "./metric-view";

export type ScorecardStatus = "on_track" | "at_risk" | "off_track" | "not_reported";

export interface ScorecardAction {
  id: string;
  title: string;
  owner: string;
  due: string | null;
  dueLabel: string;
}

export interface ScorecardRow {
  metricId: string;
  kpi: string;
  actual: string;
  target: string;
  period: string;
  status: ScorecardStatus;
  actions: ScorecardAction[];
  /** Off track with no corrective action agreed. */
  actionRequired: boolean;
}

export interface ScorecardMetric {
  id: string;
  name: string;
  unit: MetricUnit;
  decimals: number;
  direction: "higher_is_better" | "lower_is_better" | "range";
  frequency: "weekly" | "monthly";
  target_value: number | null;
  target_min: number | null;
  target_max: number | null;
  tolerance_pct: number;
  in_weekly_scorecard: boolean;
  sort_order: number;
}

export interface ScorecardActionInput {
  id: string;
  title: string;
  owner_id: string;
  due_date: string | null;
  status: string;
  metric_id: string | null;
  issue_metric_id?: string | null; // action resolving an issue raised against the KPI
}

/** Monday of the week containing `d` (ISO date). */
export function weekStartOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

export function buildWeeklyScorecard(
  views: MetricView<ScorecardMetric>[],
  actions: ScorecardActionInput[],
  ownerName: (id: string) => string,
  currency: string,
): ScorecardRow[] {
  return views
    .filter((v) => v.metric.in_weekly_scorecard)
    .sort((a, b) => a.metric.sort_order - b.metric.sort_order)
    .map((v) => {
      const m = v.metric;
      // Stale or missing results are never shown as on track.
      const reported = !v.missingLatest && v.latest !== null;
      const status: ScorecardStatus = !reported ? "not_reported" : v.status === "no_data" ? "not_reported" : v.status;
      const corrective =
        status === "off_track"
          ? actions
              .filter((a) => a.status === "open" && (a.metric_id === m.id || a.issue_metric_id === m.id))
              .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
              .map((a) => ({ id: a.id, title: a.title, owner: ownerName(a.owner_id), due: a.due_date, dueLabel: formatDate(a.due_date, { year: false }) }))
          : [];
      return {
        metricId: m.id,
        kpi: m.name,
        actual: reported ? formatMetric(v.latest!.value, m.unit, { decimals: m.decimals, currency }) : "—",
        target: targetLabel(m, (reported ? v.latest!.target : null) ?? m.target_value, currency),
        period: reported ? periodLabel(v.latest!.period, m.frequency) : `${periodLabel(v.lastCompleted, m.frequency)} not reported`,
        status,
        actions: corrective,
        actionRequired: status === "off_track" && corrective.length === 0,
      };
    });
}

export const SCORECARD_STATUS_LABEL: Record<ScorecardStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  not_reported: "Not reported",
};

/** Email-safe HTML (inline styles, table layout). Scorecard only — no commentary. */
export function scorecardEmailHtml(opts: { company: string; weekStart: string; rows: ScorecardRow[]; approvedBy?: string | null; brandColor?: string }) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const colour: Record<ScorecardStatus, string> = { on_track: "#137A50", at_risk: "#8A5A00", off_track: "#C00000", not_reported: "#5B625F" };
  const bg: Record<ScorecardStatus, string> = { on_track: "#E8F6EF", at_risk: "#FFF4D6", off_track: "#FDE8E8", not_reported: "#F1F2F2" };
  const td = "padding:10px 12px;border-bottom:1px solid #E3E5E5;font-size:14px;vertical-align:top;";
  const rows = opts.rows
    .map((r) => {
      const actionCell =
        r.status !== "off_track"
          ? `<span style="color:#9AA09D">—</span>`
          : r.actionRequired
            ? `<strong style="color:#C00000">Action required — no corrective action agreed.</strong>`
            : r.actions.map((a) => `${esc(a.title)} — ${esc(a.owner)}, ${esc(a.dueLabel)}`).join("<br>");
      return `<tr>
<td style="${td}color:#2E3331;font-weight:500">${esc(r.kpi)}</td>
<td style="${td}color:#2E3331;font-weight:600;white-space:nowrap">${esc(r.actual)}</td>
<td style="${td}color:#5B625F;white-space:nowrap">${esc(r.target)}</td>
<td style="${td}white-space:nowrap"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;color:${colour[r.status]};background:${bg[r.status]}">${SCORECARD_STATUS_LABEL[r.status]}</span></td>
<td style="${td}color:#2E3331">${actionCell}</td>
</tr>`;
    })
    .join("\n");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F1F2F2;font-family:Rubik,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" style="max-width:760px;margin:0 auto;background:#FFFFFF;border-radius:8px;border-collapse:separate;overflow:hidden">
<tr><td style="padding:20px 24px;border-bottom:3px solid ${opts.brandColor ?? "#F54E00"}">
<div style="font-size:18px;font-weight:600;color:#2E3331">${esc(opts.company)} — KPI scorecard</div>
<div style="font-size:13px;color:#5B625F;margin-top:2px">Week of ${esc(formatDate(opts.weekStart))}${opts.approvedBy ? ` · approved by ${esc(opts.approvedBy)}` : ""}</div>
</td></tr>
<tr><td style="padding:8px 12px 16px">
<table role="presentation" width="100%" style="border-collapse:collapse">
<tr>${["KPI", "Actual", "Target", "Status", "Agreed corrective action"].map((h) => `<th align="left" style="padding:8px 12px;font-size:12px;color:#5B625F;font-weight:500;border-bottom:1px solid #E3E5E5">${h}</th>`).join("")}</tr>
${rows}
</table>
</td></tr>
</table>
</body></html>`;
}
