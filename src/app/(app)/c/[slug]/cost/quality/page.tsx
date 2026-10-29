import type { Metadata } from "next";
import { loadIntelligence } from "@/lib/data/intelligence";
import { loadCostBase } from "@/lib/analytics/cost-service";
import { monthLabel } from "@/lib/analytics/period";
import { formatDateTime } from "@/lib/domain/format";
import { PageHeader } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DqChecks } from "@/components/intelligence/quality";
import { DataStatusBadge } from "@/components/intelligence/status";

export const metadata: Metadata = { title: "Cost data quality" };

export default async function CostQuality({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = await loadIntelligence(slug);
  const b = await loadCostBase(i.src!, i.fyStart);
  const [dqCost, dqPeople, peopleStatus] = await Promise.all([b.src.dataQuality("cost"), b.canPeople ? b.src.dataQuality("people") : Promise.resolve([]), b.canPeople ? b.src.periodStatus("people") : Promise.resolve(new Map())]);
  const synthetic = i.src!.info.is_synthetic;
  const months = [...b.status.keys()].sort().reverse().slice(0, 18);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Cost Intelligence" title="Data quality and period status" description="Which months are validated, which are provisional, and what the governed pipeline's checks found — with the system and owner that must fix each issue." />
      <div className="grid gap-3 md:grid-cols-4">
        {b.datasets.filter((d) => ["cost", "people", "transactions", "shared"].includes(d.domain)).map((d) => (
          <Card key={d.key} className="p-3 text-xs">
            <p className="text-[13px] font-medium">{d.label}</p>
            <p className="text-muted-foreground">{d.source_system} → <span className="font-mono">{d.model}</span></p>
            <p className="mt-1 text-muted-foreground">{d.row_count.toLocaleString("en-GB")} rows · refreshed {formatDateTime(d.refreshed_at)}</p>
            {synthetic && <p className="mt-1 font-medium text-muted-foreground">Synthetic</p>}
          </Card>
        ))}
      </div>
      <DqChecks rows={[...dqCost, ...dqPeople]} />
      <Card>
        <CardHeader><CardTitle>Period status</CardTitle><span className="text-xs text-muted-foreground">Month-end close</span></CardHeader>
        <table className="w-full text-[13px]">
          <thead className="border-b text-[11px] text-muted-foreground"><tr><th className="px-4 py-1.5 text-left font-medium">Month</th><th className="px-2 text-left font-medium">Finance (GL)</th><th className="px-2 text-left font-medium">People</th><th className="px-4 text-left font-medium">Note</th></tr></thead>
          <tbody className="divide-y">
            {months.map((m) => {
              const s = b.status.get(m)!, ps = peopleStatus.get(m);
              return (
                <tr key={m}>
                  <td className="px-4 py-1">{monthLabel(m, true)}</td>
                  <td className="px-2"><DataStatusBadge status={s.status} synthetic={synthetic} /></td>
                  <td className="px-2">{ps ? <DataStatusBadge status={ps.status} synthetic={synthetic} /> : "—"}</td>
                  <td className="px-4 text-xs text-muted-foreground">{[s.reason, ps?.reason].filter(Boolean).join("; ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
