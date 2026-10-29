import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { crewOptions, linkedRecords, loadIntelligence } from "@/lib/data/intelligence";
import { loadRevenueBase } from "@/lib/analytics/revenue-service";
import { keepParams, type SearchParams } from "@/lib/analytics/query";
import { MOVEMENT_LABEL } from "@/lib/analytics/contracts";
import { fmt } from "@/lib/analytics/format";
import { addMonths, monthLabel } from "@/lib/analytics/period";
import { formatDate } from "@/lib/domain/format";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeSeries } from "@/components/intelligence/charts";
import { RaiseIssueButton } from "@/components/intelligence/actions";
import { LinkedRecords } from "@/components/intelligence/panels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<SearchParams> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const i = await loadIntelligence(slug);
  const b = await loadRevenueBase(i.src!, i.fyStart);
  const d = await b.src.customer(id);
  if (!d) notFound();
  const cid = i.ctx.company.companyId;
  const c = d.customer;
  const [crmAcc, linked, crew] = await Promise.all([
    c.crm_id ? i.ctx.supabase.from("crm_sandbox_accounts").select("id, name, health, owner_name, renewal_date, segment").eq("company_id", cid).eq("external_id", c.crm_id).maybeSingle() : Promise.resolve({ data: null }),
    linkedRecords(i, { customerId: id }),
    crewOptions(i),
  ]);
  const acc = crmAcc.data;
  const [opps, tasks] = acc
    ? await Promise.all([
        i.ctx.supabase.from("crm_sandbox_opportunities").select("id, name, stage, status, amount, close_date, owner_name, last_activity_on").eq("company_id", cid).eq("account_id", acc.id).order("close_date"),
        i.ctx.supabase.from("crm_sandbox_tasks").select("id, subject, status, due_date, owner_name, created_by_agent, opportunity_id").eq("company_id", cid).order("due_date"),
      ])
    : [{ data: [] }, { data: [] }];
  const oppIds = new Set((opps.data ?? []).map((o) => o.id));
  const accTasks = (tasks.data ?? []).filter((t) => t.opportunity_id && oppIds.has(t.opportunity_id));
  const base = `/c/${slug}/revenue`;
  const kp = keepParams(sp);
  const products = [...new Set(d.history.map((h) => h.product_key))];
  const months = [...new Set(d.history.map((h) => h.month))].sort();
  const allMonths: string[] = [];
  if (months.length) for (let m = months[0]; m <= b.coverage.end; m = addMonths(m, 1)) allMonths.push(m);
  const at = (m: string) => d.history.filter((h) => h.month === m).reduce((s, h) => s + h.arr, 0);
  const current = at(b.coverage.end), yearAgo = at(addMonths(b.coverage.end, -12));
  const pname = (k: string) => b.products.find((x) => x.key === k)?.name ?? k;
  const dimLabel = (k: string, v: string | null) => b.dims.find((x) => x.key === k)?.values.find((y) => y.key === v)?.label ?? v ?? "—";
  const chart = allMonths.map((m) => Object.fromEntries([["label", monthLabel(m)], ...products.map((p) => [p, d.history.find((h) => h.month === m && h.product_key === p)?.arr ?? 0])]));
  const ref = { module: "revenue" as const, metric_key: "arr_total", period: b.coverage.end, label: `${c.name}: ARR ${fmt(current, "currency")}`, href: `${base}/customers/${id}`, values: { actual: current, comparison: yearAgo, unit: "currency" }, customer_id: id };
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={<Link href={`${base}/customers?${kp}`} className="hover:underline">← Customers</Link>}
        title={c.name}
        description={`${dimLabel("sector", c.sector)} · ${c.business_unit ?? "—"} · ${c.segment ?? "—"} · ${c.geography ?? "—"}${c.origin === "acquired" ? ` · ${c.origin_label ?? "acquired"}${c.acquired_on ? ` (${formatDate(c.acquired_on)})` : ""}` : ""}`}
        actions={i.ctx.can.write ? <RaiseIssueButton companyId={cid} crew={crew} analyticsRef={ref} defaultTitle={`${c.name}: commercial action`} label="Agree a commercial action" /> : null}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Current ARR", fmt(current, "currency", { precise: true })],
          ["12 months ago", fmt(yearAgo, "currency", { precise: true })],
          ["Change", yearAgo ? fmt((current - yearAgo) / yearAgo, "percent", { signed: true }) : "—"],
          ["Customer since", d.cohort ? monthLabel(d.cohort.cohort_month, true) : "—"],
          ["Account owner", c.account_owner ?? "—"],
        ].map(([l, v]) => (
          <Card key={l} className="p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-[17px] font-semibold tabular">{v}</p></Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>ARR history by product</CardTitle><span className="text-xs text-muted-foreground">Month end, from billing</span></CardHeader>
        <CardContent><TimeSeries data={chart} series={products.map((p) => ({ key: p, label: pname(p), type: "area" as const, stack: "p" }))} height={220} /></CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Contracts</CardTitle><span className="text-xs text-muted-foreground">Billing system</span></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] whitespace-nowrap tabular">
              <thead className="border-b text-[11px] text-muted-foreground"><tr><th className="px-4 py-1.5 text-left font-medium">Product</th><th className="px-2 text-left font-medium">Reference</th><th className="px-2 text-left font-medium">Start</th><th className="px-2 text-left font-medium">Renewal</th><th className="px-2 text-left font-medium">Term</th><th className="px-4 text-right font-medium">Annual value</th></tr></thead>
              <tbody className="divide-y">
                {d.contracts.map((k) => (
                  <tr key={k.id}>
                    <td className="px-4 py-1.5">{pname(k.product_key)}</td>
                    <td className="px-2 font-mono text-[11px]">{k.contract_ref}</td>
                    <td className="px-2">{k.start_date ? formatDate(k.start_date) : <span className="text-[var(--status-risk-ink)]">Not recorded</span>}</td>
                    <td className="px-2">{k.renewal_date ? formatDate(k.renewal_date) : <span className="text-[var(--status-risk-ink)]" title="Not recorded in the source system; Omni OS does not infer it">Not recorded</span>}</td>
                    <td className="px-2">{k.term_months ? `${k.term_months} months` : "—"}</td>
                    <td className="px-4 text-right">{fmt(Number(k.annual_value), "currency", { precise: true })}</td>
                  </tr>
                ))}
                {!d.contracts.length && <tr><td colSpan={6} className="px-4 py-3 text-muted-foreground">No active contracts.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader><CardTitle>CRM</CardTitle><span className="text-xs text-muted-foreground">{acc ? "Sandbox CRM (fictional data)" : ""}</span></CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            {!c.crm_id ? (
              <p className="text-[var(--status-risk-ink)]">This customer is not matched to a CRM account. It appears in Data quality for Revenue operations to fix.</p>
            ) : !acc ? (
              <p className="text-muted-foreground">CRM id {c.crm_id}; no CRM account is available to you.</p>
            ) : (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">Health</dt><dd className={cn("font-medium", acc.health === "red" ? "text-[var(--status-off-ink)]" : acc.health === "amber" ? "text-[var(--status-risk-ink)]" : "text-[var(--status-on-ink)]")}>{acc.health ?? "—"}</dd>
                  <dt className="text-muted-foreground">Owner</dt><dd>{acc.owner_name ?? "—"}</dd>
                  <dt className="text-muted-foreground">CRM renewal date</dt><dd>{acc.renewal_date ? formatDate(acc.renewal_date) : "Not recorded"}</dd>
                  <dt className="text-muted-foreground">CRM sector</dt><dd>{acc.segment !== c.sector ? <span className="text-[var(--status-risk-ink)]">{dimLabel("sector", acc.segment)} (differs from billing)</span> : dimLabel("sector", acc.segment)}</dd>
                </dl>
                {(opps.data ?? []).map((o) => (
                  <p key={o.id} className="rounded border px-2 py-1.5 text-xs"><span className="font-medium">{o.name}</span> · {o.stage} · {fmt(Number(o.amount), "currency")} · closes {formatDate(o.close_date)} · last activity {formatDate(o.last_activity_on)}</p>
                ))}
                {accTasks.map((t) => (
                  <p key={t.id} className="text-xs">Task: {t.subject} — {t.owner_name}, due {formatDate(t.due_date)} · {t.status}{t.created_by_agent ? " · created by the Commercial Agent" : ""}</p>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>ARR movements</CardTitle><span className="text-xs text-muted-foreground">Classified by the governed rules; the rule applied is shown</span></CardHeader>
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full text-[12.5px] whitespace-nowrap tabular">
            <thead className="sticky top-0 border-b bg-card text-[11px] text-muted-foreground"><tr><th className="px-4 py-1.5 text-left font-medium">Month</th><th className="px-2 text-left font-medium">Product</th><th className="px-2 text-left font-medium">Movement</th><th className="px-2 text-left font-medium">Rule</th><th className="px-4 text-right font-medium">Amount</th></tr></thead>
            <tbody className="divide-y">
              {[...d.movements].reverse().map((m) => (
                <tr key={`${m.month}${m.product_key}`}>
                  <td className="px-4 py-1">{monthLabel(m.month, true)}</td>
                  <td className="px-2">{pname(m.product_key)}</td>
                  <td className="px-2">{MOVEMENT_LABEL[m.type]}</td>
                  <td className="px-2 font-mono text-[11px] text-muted-foreground">{m.rule_key}</td>
                  <td className={cn("px-4 text-right", m.amount < 0 && "text-[var(--status-off-ink)]")}>{fmt(m.amount, "currency", { precise: true, signed: true })}</td>
                </tr>
              ))}
              {!d.movements.length && <tr><td colSpan={5} className="px-4 py-3 text-muted-foreground">No movements in the governed history.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <LinkedRecords slug={slug} issues={linked.issues} actions={linked.actions} />
      {d.cohort && <p className="text-xs text-muted-foreground">Cohort: {monthLabel(d.cohort.cohort_month, true)} ({d.cohort.origin}); frozen attributes at assignment — {dimLabel("sector", d.cohort.sector)}, {d.cohort.size_band}, first product {pname(d.cohort.primary_product ?? "")}.{d.cohort.restatement_id ? " Restated." : ""}{Object.keys((c.attributes as object) ?? {}).length ? ` Attributes: ${Object.entries(c.attributes as Record<string, string>).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}.` : ""}</p>}
    </div>
  );
}
