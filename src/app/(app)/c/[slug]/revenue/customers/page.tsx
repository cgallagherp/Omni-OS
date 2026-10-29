import type { Metadata } from "next";
import Link from "next/link";
import { loadIntelligence, savedViews } from "@/lib/data/intelligence";
import { loadRevenueBase } from "@/lib/analytics/revenue-service";
import { keepParams, viewQuery, type SearchParams } from "@/lib/analytics/query";
import { fmt, delta } from "@/lib/analytics/format";
import { addMonths, monthLabel } from "@/lib/analytics/period";
import { PageHeader } from "@/components/os/page";
import { Card } from "@/components/ui/card";
import { ExportButton, FilterBar, ParamSelect, PeriodControls, SavedViews, SearchBox } from "@/components/intelligence/controls";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const i = await loadIntelligence(slug);
  const b = await loadRevenueBase(i.src!, i.fyStart);
  const q = viewQuery(sp, b.dims, b.coverage, i.fyStart, "month");
  const base = `${i.base}/revenue`;
  const sort = sp.sort === "change" || sp.sort === "name" ? sp.sort : "arr";
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const compare = addMonths(q.end, -12) >= b.coverage.start ? addMonths(q.end, -12) : b.coverage.start;
  const search = typeof sp.q === "string" ? sp.q.slice(0, 80) : null;
  const [res, views] = await Promise.all([b.src.customers({ month: q.end, compare, filters: q.filters, search, sort, limit: 50, offset: page * 50 }), savedViews(i, "revenue")]);
  const kp = keepParams(sp);
  const nav = (pg: number) => `${base}/customers?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(kp)), ...(search ? { q: search } : {}), sort, page: String(pg) })}`;
  const sector = (k: string | null) => b.dims.find((d) => d.key === "sector")?.values.find((v) => v.key === k)?.label ?? k ?? "—";
  const months = [...b.status.keys()].sort().reverse();
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Revenue Intelligence" title="Customers" description={`${res.total} customers with ARR at ${monthLabel(q.end, true)} or ${monthLabel(compare, true)}. An analytical view linked to the CRM — not a replacement for it.`} actions={<SavedViews companyId={i.ctx.company.companyId} module="revenue" path={`${base}/customers`} views={views} />} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControls grains={["month"]} grain="month" end={q.end} months={months} showCompare={false} />
          <SearchBox placeholder="Search customers" />
          <ParamSelect name="sort" label="Sort" value={sort} options={[{ value: "arr", label: "Largest ARR" }, { value: "change", label: "Largest decrease" }, { value: "name", label: "Name" }]} />
        </div>
        <div className="flex items-center gap-2">
          <FilterBar dims={b.dims} active={q.chips} />
          <ExportButton href={`${base}/export?dataset=customers&${kp}${search ? `&q=${encodeURIComponent(search)}` : ""}`} />
        </div>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] whitespace-nowrap tabular">
            <thead className="border-b text-xs text-muted-foreground">
              <tr><th className="px-4 py-2 text-left font-medium">Customer</th><th className="px-2 text-left font-medium">Sector</th><th className="px-2 text-left font-medium">Business unit</th><th className="px-2 text-left font-medium">Segment</th><th className="px-2 text-left font-medium">Account owner</th><th className="px-2 text-right font-medium">ARR {monthLabel(q.end)}</th><th className="px-2 text-right font-medium">ARR {monthLabel(compare)}</th><th className="px-4 text-right font-medium">Change</th></tr>
            </thead>
            <tbody className="divide-y">
              {res.rows.map((r) => {
                const d = delta(r.arr, r.arr_compare, "currency");
                return (
                  <tr key={r.id} className="hover:bg-accent/40">
                    <td className="px-4 py-1.5"><Link href={`${base}/customers/${r.id}?${kp}`} className="font-medium hover:underline">{r.name}</Link>{r.origin === "acquired" && <span className="ml-1.5 rounded bg-muted px-1 text-[10.5px] text-muted-foreground">acquired</span>}{!r.crm_id && <span className="ml-1.5 text-[10.5px] text-[var(--status-risk-ink)]" title="Not matched to a CRM account">no CRM link</span>}</td>
                    <td className="px-2">{sector(r.sector)}</td>
                    <td className="px-2">{r.business_unit}</td>
                    <td className="px-2">{r.segment}</td>
                    <td className="px-2">{r.account_owner ?? "—"}</td>
                    <td className="px-2 text-right">{fmt(r.arr, "currency", { precise: true })}</td>
                    <td className="px-2 text-right text-muted-foreground">{fmt(r.arr_compare, "currency", { precise: true })}</td>
                    <td className={cn("px-4 text-right", r.arr < r.arr_compare && "text-[var(--status-off-ink)]")}>{r.arr_compare ? d?.text : r.arr ? "new" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between border-t px-4 py-2 text-xs">
          {page > 0 ? <Link href={nav(page - 1)} className="text-brand-ink">← Previous</Link> : <span />}
          <span className="text-muted-foreground">{res.total ? `${page * 50 + 1}–${Math.min((page + 1) * 50, res.total)} of ${res.total}` : "No customers"}</span>
          {(page + 1) * 50 < res.total ? <Link href={nav(page + 1)} className="text-brand-ink">Next →</Link> : <span />}
        </div>
      </Card>
    </div>
  );
}
