import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { DqRow } from "@/lib/analytics/source";
import { fmt } from "@/lib/analytics/format";
import { monthLabel } from "@/lib/analytics/period";
import { cn } from "@/lib/utils";

/** Data-quality checks from the governed pipeline: what failed, where to fix it and who owns it. */
export function DqChecks({ rows }: { rows: DqRow[] }) {
  const order = { fail: 0, warn: 1, pass: 2 };
  const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data-quality checks</CardTitle>
        <span className="text-xs text-muted-foreground">{rows.filter((r) => r.status === "fail").length} failing · {rows.filter((r) => r.status === "warn").length} warnings · {rows.filter((r) => r.status === "pass").length} passing</span>
      </CardHeader>
      <ul className="divide-y">
        {sorted.map((r) => (
          <li key={r.id} className="grid gap-1 px-4 py-2.5 text-[13px] md:grid-cols-[1.4fr_1fr_1.6fr]">
            <div className="flex items-start gap-2">
              {r.status === "pass" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--status-on)]" /> : r.status === "fail" ? <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--status-off)]" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--status-risk-ink)]" />}
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {r.affected_count ? `${r.affected_count} affected` : "None affected"}
                  {r.amount ? ` · ${fmt(Number(r.amount), "currency", { precise: true })}` : ""}
                  {r.month ? ` · ${monthLabel(r.month, true)}` : ""}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-foreground">{r.source_system}</span>
              <br />
              Owner: {r.owner_function}
            </p>
            <div className="text-xs">
              <p className={cn(r.status === "pass" ? "text-muted-foreground" : "text-foreground")}>{r.remediation}</p>
              {Array.isArray(r.sample) && r.sample.length > 0 && (
                <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground" title={JSON.stringify(r.sample)}>
                  e.g. {(r.sample as Array<Record<string, unknown>>).slice(0, 3).map((s) => String(s.name ?? s.customer_id ?? s.cost_centre ?? JSON.stringify(s))).join("; ")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
