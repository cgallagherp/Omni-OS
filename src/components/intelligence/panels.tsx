import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bot, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Provenance } from "@/lib/analytics/contracts";
import type { FinancialException } from "@/lib/analytics/exceptions";
import { refFor } from "@/lib/analytics/exceptions";
import { delta, fmt, type ValueUnit } from "@/lib/analytics/format";
import { formatDate } from "@/lib/domain/format";
import { cn } from "@/lib/utils";
import { InvestigateButton, RaiseIssueButton } from "./actions";
import { MetricInfo } from "./provenance";
import { DataStatusBadge } from "./status";

/** A headline figure with its comparison, target, status and provenance. */
export function KpiTile({ label, value, unit, compare, target, direction, provenance, href, className }: { label: string; value: number | null; unit: ValueUnit; compare?: { label: string; value: number | null } | null; target?: { label: string; value: number | null } | null; direction: "higher_is_better" | "lower_is_better" | "neutral"; provenance: Provenance; href?: string; className?: string }) {
  const d = compare ? delta(value, compare.value, unit) : null;
  const good = d && direction !== "neutral" ? (direction === "higher_is_better" ? d.value > 0 : d.value < 0) : null;
  const vsTarget = target?.value !== null && target?.value !== undefined && value !== null ? (direction === "lower_is_better" ? value <= target.value : value >= target.value) : null;
  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <MetricInfo p={provenance} label={label} />
      </div>
      <p className="mt-1 text-[22px] leading-tight font-semibold tracking-tight tabular">{fmt(value, unit)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
        {d && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", good === null ? "text-muted-foreground" : good ? "text-[var(--status-on-ink)]" : "text-[var(--status-off-ink)]")}>
            {d.value >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {d.text}
            <span className="font-normal text-muted-foreground">{compare!.label.toLowerCase()}</span>
          </span>
        )}
        {target && target.value !== null && target.value !== undefined && (
          <span className={cn(vsTarget === false ? "text-[var(--status-off-ink)]" : "text-muted-foreground")}>
            {target.label} {fmt(target.value, unit)}
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataStatusBadge status={provenance.status} synthetic={provenance.synthetic} />
      </div>
    </>
  );
  return (
    <Card className={cn("relative p-3", className)}>
      {href ? (
        <Link href={href} className="block rounded focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

const SEV = { critical: "text-[var(--status-off-ink)]", high: "text-[var(--status-off-ink)]", medium: "text-[var(--status-risk-ink)]" };

/** Exceptions from governed data, each with a route to the evidence, to Mission Control and to an agent. */
export function ExceptionsPanel({ title = "Exceptions", exceptions, companyId, slug, crew, investigations, canWrite, empty }: { title?: string; exceptions: FinancialException[]; companyId: string; slug: string; crew: Array<{ id: string; label: string }>; investigations: Array<{ id: string; dedupe_key: string; status: string }>; canWrite: boolean; empty?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <AlertTriangle className="size-3.5 text-[var(--status-risk-ink)]" /> {title}
        </CardTitle>
        <span className="text-xs text-muted-foreground">Rules in docs/intelligence.md</span>
      </CardHeader>
      {exceptions.length === 0 ? (
        <CardContent className="text-sm text-muted-foreground">{empty ?? "No exceptions in the latest governed data."}</CardContent>
      ) : (
        <ul className="divide-y">
          {exceptions.map((e) => {
            const inv = investigations.find((i) => i.dedupe_key === `analytics:${e.key}:${e.period}` && !["resolved", "closed", "failed"].includes(i.status));
            return (
              <li key={e.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={e.href} className="text-[13px] font-medium hover:underline">
                    <span className={cn("mr-1.5 text-[10.5px] font-semibold uppercase", SEV[e.severity])}>{e.severity}</span>
                    {e.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">{e.detail}</p>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1.5">
                    <InvestigateButton companyId={companyId} slug={slug} exceptionKey={e.key} existing={inv?.id} size="xs" />
                    <RaiseIssueButton companyId={companyId} analyticsRef={refFor(e)} crew={crew} defaultTitle={e.title} defaultDescription={e.detail} size="xs" label="Raise issue" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Mission Control issues and actions that were raised from this module (the link back). */
export function LinkedRecords({ slug, issues, actions, investigations }: { slug: string; issues: Array<{ id: string; title: string; status: string; owner: string | null; ref: { label: string; period: string } }>; actions: Array<{ id: string; title: string; status: string; due_date: string | null; owner: string | null; issue_id: string | null }>; investigations?: Array<{ id: string; title: string; status: string; agent_key: string }> }) {
  if (!issues.length && !actions.length && !investigations?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <ListChecks className="size-3.5" /> In Mission Control
        </CardTitle>
        <Link href={`/c/${slug}/execution`} className="text-xs text-brand-ink hover:underline">
          Issues & Actions →
        </Link>
      </CardHeader>
      <ul className="divide-y text-[13px]">
        {issues.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-2">
            <Link href={`/c/${slug}/execution/issue/${i.id}`} className="min-w-0 truncate hover:underline">
              Issue: {i.title}
            </Link>
            <span className="shrink-0 text-xs text-muted-foreground">{i.owner} · {i.status.replace("_", " ")}</span>
          </li>
        ))}
        {actions.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2">
            <span className="min-w-0 truncate">Action: {a.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{a.owner} · due {formatDate(a.due_date, { year: false })} · {a.status}</span>
          </li>
        ))}
        {investigations?.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2 px-4 py-2">
            <Link href={`/c/${slug}/agents/investigations/${v.id}`} className="flex min-w-0 items-center gap-1.5 truncate hover:underline">
              <Bot className="size-3.5 shrink-0" /> {v.title}
            </Link>
            <span className="shrink-0 text-xs text-muted-foreground">{v.status.replace("_", " ")}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Revenue or logo retention by cohort and age. Cells are coloured by value relative to 100%; partial cells are marked. */
export function CohortHeatmap({ rows, ages, basis, ageLabel, drill }: { rows: Array<{ cohort: string; members: number; initial: number; cells: Array<{ age: number; value: number | null; members: number; partial: boolean }> }>; ages: number[]; basis: "revenue" | "logo"; ageLabel: string; drill: (cohort: string, age: number) => string }) {
  const color = (v: number | null) => {
    if (v === null) return undefined;
    // revenue retention can exceed 100%: brand tint above, neutral-to-warm below
    if (v >= 1) return `color-mix(in oklab, var(--brand) ${Math.min(80, 18 + (v - 1) * 160)}%, var(--card))`;
    return `color-mix(in oklab, var(--status-off) ${Math.min(70, (1 - v) * 140)}%, var(--card))`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-[11.5px] tabular">
        <thead>
          <tr className="text-muted-foreground">
            <th className="sticky left-0 bg-card px-2 py-1 text-left font-medium">Cohort</th>
            <th className="px-2 py-1 text-right font-medium">Customers</th>
            <th className="px-2 py-1 text-right font-medium">Initial ARR</th>
            {ages.map((a) => (
              <th key={a} className="px-1 py-1 text-center font-medium">{ageLabel}{a}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cohort}>
              <td className="sticky left-0 bg-card px-2 py-1 font-medium whitespace-nowrap">{r.cohort}</td>
              <td className="px-2 py-1 text-right">{r.members}</td>
              <td className="px-2 py-1 text-right">{fmt(r.initial, "currency")}</td>
              {ages.map((a) => {
                const c = r.cells.find((x) => x.age === a);
                if (!c || c.value === null) return <td key={a} />;
                return (
                  <td key={a} className="p-0">
                    <Link
                      href={drill(r.cohort, a)}
                      title={`${r.cohort}, ${ageLabel}${a}: ${fmt(c.value, "percent")} ${basis === "revenue" ? "of initial ARR" : "of customers active"}${c.partial ? ` (${c.members} of ${r.members} customers have reached this age)` : ""}`}
                      className={cn("block min-w-12 rounded px-1 py-1 text-center hover:ring-2 hover:ring-ring", c.partial && "bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,rgba(0,0,0,0.06)_3px,rgba(0,0,0,0.06)_5px)]")}
                      style={{ backgroundColor: color(c.value) }}
                    >
                      {(c.value * 100).toFixed(0)}%
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
