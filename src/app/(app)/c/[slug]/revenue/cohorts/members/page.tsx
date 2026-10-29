import type { Metadata } from "next";
import Link from "next/link";
import { loadIntelligence } from "@/lib/data/intelligence";
import { loadRevenueBase } from "@/lib/analytics/revenue-service";
import { keepParams, viewQuery, type SearchParams } from "@/lib/analytics/query";
import { fmt } from "@/lib/analytics/format";
import { monthLabel } from "@/lib/analytics/period";
import { PageHeader } from "@/components/os/page";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Cohort members" };

export default async function CohortMembers({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadRevenueBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "month");
  const cohort = typeof sp.cohort === "string" ? sp.cohort.slice(0, 60) : "";
  const dim = typeof sp.dim === "string" ? sp.dim : null;
  const age = Math.max(0, Number(sp.age ?? 0) || 0);
  const step = [1, 3, 12].includes(Number(sp.step)) ? Number(sp.step) : 3;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const res = await b.src.cohortMembers({ cohort, grain: "quarter", dimension: dim, stepMonths: step, age, end: q.end, limit: 50, offset: page * 50 });
  const base = `/c/${slug}/revenue`;
  const kp = keepParams(sp);
  const ageLabel = step === 1 ? "M" : step === 3 ? "Q" : "Y";
  const label = dim === "product" ? b.products.find((x) => x.key === cohort)?.name ?? cohort : dim ? b.dims.find((d) => d.key === dim)?.values.find((v) => v.key === cohort)?.label ?? cohort : cohort;
  const totals = res.rows.reduce((s, r) => ({ i: s.i + r.initial, a: s.a + (r.atAge ?? 0) }), { i: 0, a: 0 });
  const nav = (p: number) => `${base}/cohorts/members?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(String(new URLSearchParams(sp as Record<string, string>)))), page: String(p) })}`;
  return (
    <div className="space-y-4">
      <PageHeader eyebrow={<Link href={`${base}/cohorts?${kp}`} className="hover:underline">← Cohorts</Link>} title={`Cohort ${label}: customers at ${ageLabel}${age}`} description={`${res.total} customers. Initial ARR is each customer's ARR in its first month; "at ${ageLabel}${age}" is ARR ${age * step} months later. Membership is fixed once assigned.`} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular">
            <thead className="border-b text-xs text-muted-foreground"><tr><th className="px-4 py-2 text-left font-medium">Customer</th><th className="px-2 text-left font-medium">First ARR</th><th className="px-2 text-right font-medium">Initial ARR</th><th className="px-2 text-right font-medium">At {ageLabel}{age}</th><th className="px-2 text-right font-medium">Retention</th><th className="px-4 text-right font-medium">ARR {monthLabel(q.end)}</th></tr></thead>
            <tbody className="divide-y">
              {res.rows.map((r) => (
                <tr key={r.id} className="hover:bg-accent/40">
                  <td className="px-4 py-1.5"><Link href={`${base}/customers/${r.id}?${kp}`} className="font-medium hover:underline">{r.name}</Link></td>
                  <td className="px-2">{monthLabel(r.cohort_month, true)}</td>
                  <td className="px-2 text-right">{fmt(r.initial, "currency", { precise: true })}</td>
                  <td className="px-2 text-right">{r.atAge === null ? "not yet reached" : fmt(r.atAge, "currency", { precise: true })}</td>
                  <td className="px-2 text-right">{r.atAge === null || !r.initial ? "—" : fmt(r.atAge / r.initial, "percent")}</td>
                  <td className="px-4 text-right">{fmt(r.current, "currency", { precise: true })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t text-xs text-muted-foreground"><tr><td className="px-4 py-2" colSpan={2}>This page</td><td className="px-2 text-right">{fmt(totals.i, "currency", { precise: true })}</td><td className="px-2 text-right">{fmt(totals.a, "currency", { precise: true })}</td><td className="px-2 text-right">{totals.i ? fmt(totals.a / totals.i, "percent") : "—"}</td><td /></tr></tfoot>
          </table>
        </div>
        {res.total > 50 && (
          <div className="flex justify-between border-t px-4 py-2 text-xs">
            {page > 0 ? <Link href={nav(page - 1)} className="text-brand-ink">← Previous</Link> : <span />}
            <span className="text-muted-foreground">{page * 50 + 1}–{Math.min((page + 1) * 50, res.total)} of {res.total}</span>
            {(page + 1) * 50 < res.total ? <Link href={nav(page + 1)} className="text-brand-ink">Next →</Link> : <span />}
          </div>
        )}
      </Card>
    </div>
  );
}
