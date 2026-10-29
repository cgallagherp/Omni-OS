import { cache } from "react";
import { getCompanyContext } from "@/lib/auth";
import { getSource, type AnalyticsSource } from "@/lib/analytics/source";
import type { Domain } from "@/lib/analytics/contracts";
import type { AnalyticsRef } from "@/lib/analytics/exceptions";

export interface IntelligenceContext {
  ctx: Awaited<ReturnType<typeof getCompanyContext>>;
  src: AnalyticsSource | null;
  domains: Domain[];
  fyStart: number;
  base: string;
}

/** Company, governed source and the viewer's data domains (each query is still checked by RLS). */
export const loadIntelligence = cache(async (slug: string): Promise<IntelligenceContext> => {
  const ctx = await getCompanyContext(slug);
  const [src, co] = await Promise.all([getSource(ctx.supabase, ctx.company.companyId), ctx.supabase.from("companies").select("fiscal_year_start_month").eq("id", ctx.company.companyId).single()]);
  const domains = src ? await src.domains().catch(() => [] as Domain[]) : [];
  return { ctx, src, domains, fyStart: co.data?.fiscal_year_start_month ?? 1, base: `/c/${slug}` };
});

export async function savedViews(i: IntelligenceContext, module: "revenue" | "cost") {
  const { data } = await i.ctx.supabase.from("an_saved_views").select("id, name, path, params, shared, user_id").eq("company_id", i.ctx.company.companyId).eq("module", module).order("name");
  return (data ?? []).map((v) => ({ id: v.id, name: v.name, path: v.path, params: v.params, shared: v.shared, mine: v.user_id === i.ctx.viewer.id }));
}

/** Mission Control issues and actions raised from analytical exceptions (the reverse link). */
export async function linkedRecords(i: IntelligenceContext, filter: { module?: "revenue" | "cost"; metricKeys?: string[]; customerId?: string }) {
  const cid = i.ctx.company.companyId;
  let iq = i.ctx.supabase.from("issues").select("id, title, status, priority, analytics_ref, created_at, owner:crew_members!issues_company_id_owner_id_fkey(full_name)").eq("company_id", cid).not("analytics_ref", "is", null);
  let aq = i.ctx.supabase.from("actions").select("id, title, status, due_date, analytics_ref, issue_id, owner:crew_members!actions_company_id_owner_id_fkey(full_name)").eq("company_id", cid).not("analytics_ref", "is", null);
  if (filter.module) { iq = iq.eq("analytics_ref->>module", filter.module); aq = aq.eq("analytics_ref->>module", filter.module); }
  if (filter.metricKeys?.length) { iq = iq.in("analytics_ref->>metric_key", filter.metricKeys); aq = aq.in("analytics_ref->>metric_key", filter.metricKeys); }
  if (filter.customerId) { iq = iq.eq("analytics_ref->>customer_id", filter.customerId); aq = aq.eq("analytics_ref->>customer_id", filter.customerId); }
  const [is, as] = await Promise.all([iq.order("created_at", { ascending: false }).limit(20), aq.order("due_date").limit(30)]);
  return {
    issues: (is.data ?? []).map((x) => ({ ...x, ref: x.analytics_ref as unknown as AnalyticsRef, owner: (x.owner as unknown as { full_name: string } | null)?.full_name ?? null })),
    actions: (as.data ?? []).map((x) => ({ ...x, ref: x.analytics_ref as unknown as AnalyticsRef, owner: (x.owner as unknown as { full_name: string } | null)?.full_name ?? null })),
  };
}

/** Open agent investigations on analytical exceptions (subject_type = analytics_exception). */
export async function linkedInvestigations(i: IntelligenceContext, keys?: string[]) {
  let q = i.ctx.supabase.from("agent_investigations").select("id, title, status, agent_key, dedupe_key, summary, opened_at").eq("company_id", i.ctx.company.companyId).eq("subject_type", "analytics_exception");
  if (keys?.length) q = q.in("trigger->>exception_key", keys);
  const { data } = await q.order("opened_at", { ascending: false }).limit(20);
  return data ?? [];
}

export async function crewOptions(i: IntelligenceContext) {
  const { data } = await i.ctx.supabase.from("crew_members").select("id, full_name, title, is_open_seat").eq("company_id", i.ctx.company.companyId).eq("is_open_seat", false).order("sort_order");
  return (data ?? []).map((c) => ({ id: c.id, label: `${c.full_name} — ${c.title}` }));
}

/** The North Star ambition and the Flight Plan items measured by KPIs bound to these governed metrics. */
export async function strategicContext(i: IntelligenceContext, metricKeys: string[]) {
  const cid = i.ctx.company.companyId;
  const [{ data: ns }, { data: metrics }] = await Promise.all([
    i.ctx.supabase.from("north_stars").select("financial_ambition, target_end_state").eq("company_id", cid).maybeSingle(),
    i.ctx.supabase.from("metrics").select("id, name, analytics_metric_key, in_weekly_scorecard").eq("company_id", cid).in("analytics_metric_key", metricKeys),
  ]);
  const ids = (metrics ?? []).map((m) => m.id);
  const { data: links } = ids.length
    ? await i.ctx.supabase.from("metric_links").select("metric_id, winning_moves(title), annual_goals(title), quarterly_priorities(id, title)").eq("company_id", cid).in("metric_id", ids)
    : { data: [] };
  const items = new Map<string, { kind: string; title: string; href: string }>();
  for (const l of links ?? []) {
    const wm = l.winning_moves as unknown as { title: string } | null, ag = l.annual_goals as unknown as { title: string } | null, qp = l.quarterly_priorities as unknown as { id: string; title: string } | null;
    if (wm) items.set(`w${wm.title}`, { kind: "Three-year outcome", title: wm.title, href: `${i.base}/flight-plan` });
    if (ag) items.set(`a${ag.title}`, { kind: "12-month objective", title: ag.title, href: `${i.base}/flight-plan` });
    if (qp) items.set(`q${qp.id}`, { kind: "90-day priority", title: qp.title, href: `${i.base}/flight-plan/quarterly_priority/${qp.id}` });
  }
  return { ambition: ns?.financial_ambition || ns?.target_end_state || null, items: [...items.values()], kpis: (metrics ?? []).map((m) => ({ id: m.id, name: m.name, key: m.analytics_metric_key!, scorecard: m.in_weekly_scorecard })) };
}
