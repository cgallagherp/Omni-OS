import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetricDefinition } from "@/lib/analytics/contracts";
import { formatDate } from "@/lib/domain/format";
import { PolicyForm } from "./policy-form";

/** Governed metric contracts with their full version history. */
export function DefinitionsView({ defs, history, canAdmin, companyId }: { defs: MetricDefinition[]; history: Map<string, MetricDefinition[]>; canAdmin: boolean; companyId: string }) {
  const nrr = defs.find((d) => d.key === "nrr");
  return (
    <div className="space-y-4">
      {canAdmin && nrr && (
        <Card>
          <CardHeader><CardTitle>Retention policy</CardTitle><span className="text-xs text-muted-foreground">Changes create a new version of GRR, NRR and logo retention; history is kept</span></CardHeader>
          <CardContent><PolicyForm companyId={companyId} policy={nrr.policy as Record<string, unknown>} /></CardContent>
        </Card>
      )}
      <Card>
        <ul className="divide-y">
          {defs.map((d) => {
            const versions = history.get(d.key) ?? [];
            return (
              <li key={d.key} className="grid gap-2 px-4 py-3 text-[13px] lg:grid-cols-[1fr_1.4fr_1fr]">
                <div>
                  <p className="font-semibold">{d.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{d.key} · v{d.version} · {d.unit.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Grain: {d.grain}. Periods: {d.periods.join(", ")}.</p>
                </div>
                <div>
                  <p>{d.definition}</p>
                  <p className="mt-1 rounded bg-muted px-2 py-1 font-mono text-[11px]">{d.formula}</p>
                  {Object.keys(d.policy ?? {}).length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">{Object.entries(d.policy).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v).replace(/_/g, " ")}`).join(" · ")}</p>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>Source: <span className="font-mono">{d.source_dataset}</span></p>
                  <p>Comparability: {d.comparability_group ?? "company-specific (not compared across the portfolio)"}</p>
                  <p className="mt-1 font-medium text-foreground">History</p>
                  <ul>
                    {versions.map((v) => (
                      <li key={v.version}>v{v.version} from {formatDate(v.effective_from)} — {v.change_note}</li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
