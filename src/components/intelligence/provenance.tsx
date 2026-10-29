"use client";
import Link from "next/link";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Provenance } from "@/lib/analytics/contracts";
import { formatDateTime } from "@/lib/domain/format";
import { DataStatusBadge } from "./status";

/** Definition, period, source, freshness, validation status and calculation version for a figure. */
export function MetricInfo({ p, label }: { p: Provenance; label?: string }) {
  const d = p.metric;
  return (
    <Popover>
      <PopoverTrigger aria-label={`About ${label ?? d?.name ?? "this figure"}`} className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-xs" align="end">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-semibold">{d?.name ?? label}</p>
          <DataStatusBadge status={p.status} synthetic={p.synthetic} />
        </div>
        {d ? (
          <>
            <p className="text-muted-foreground">{d.definition}</p>
            <p className="rounded bg-muted px-2 py-1 font-mono text-[11px]">{d.formula}</p>
            {Object.keys(d.policy ?? {}).length > 0 && (
              <ul className="space-y-0.5 text-muted-foreground">
                {Object.entries(d.policy).map(([k, v]) => (
                  <li key={k}>
                    <span className="text-foreground">{k.replace(/_/g, " ")}</span>: {String(v).replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">No governed definition is recorded for this figure.</p>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t pt-2 text-[11.5px]">
          <dt className="text-muted-foreground">Period</dt>
          <dd>{p.period}</dd>
          <dt className="text-muted-foreground">Unit</dt>
          <dd>{d?.unit?.replace(/_/g, " ") ?? "—"}</dd>
          <dt className="text-muted-foreground">Source</dt>
          <dd>{p.dataset ? `${p.dataset.source_system} → ${p.dataset.model}` : "—"}</dd>
          <dt className="text-muted-foreground">Updated</dt>
          <dd>{formatDateTime(p.dataset?.refreshed_at)}</dd>
          <dt className="text-muted-foreground">Definition</dt>
          <dd>{d ? `v${d.version}, effective ${d.effective_from}` : "—"}</dd>
          <dt className="text-muted-foreground">Calculation</dt>
          <dd className="font-mono text-[11px]">{p.calcVersion || "—"}</dd>
        </dl>
        {p.drill && (
          <Link href={p.drill} className="inline-block text-brand-ink hover:underline">
            Underlying records →
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
