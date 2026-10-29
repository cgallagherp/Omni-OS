import { FlaskConical } from "lucide-react";
import { statusLabel, type DataStatus } from "@/lib/analytics/contracts";
import { cn } from "@/lib/utils";

const TONE: Record<DataStatus, string> = {
  validated: "bg-[var(--status-on-bg)] text-[var(--status-on-ink)]",
  provisional: "bg-[var(--status-risk-bg)] text-[var(--status-risk-ink)]",
  incomplete: "bg-[var(--status-off-bg)] text-[var(--status-off-ink)]",
  missing: "bg-[var(--status-none-bg)] text-[var(--status-none-ink)]",
};

/** Whether a figure is validated, provisional, incomplete or missing — and synthetic data is always labelled as such. */
export function DataStatusBadge({ status, synthetic, className, title }: { status: DataStatus; synthetic: boolean; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium whitespace-nowrap", synthetic && status === "validated" ? "bg-[var(--status-none-bg)] text-[var(--status-none-ink)]" : TONE[status], className)}>
      {synthetic && <FlaskConical className="size-3" aria-hidden />}
      {statusLabel(status, synthetic)}
    </span>
  );
}

export function SyntheticBanner({ label }: { label: string }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-dashed bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <p>
        <span className="font-medium text-foreground">Synthetic demonstration data.</span> {label}. These figures are generated for demonstration and are not the company&apos;s actual performance; the governed Snowflake/dbt source replaces them without changes to this module.
      </p>
    </div>
  );
}
