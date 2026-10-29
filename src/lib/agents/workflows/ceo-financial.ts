// CEO Agent — investigation of a governed revenue, cost or margin exception.
// read the exception from governed data → assess it against the North Star and Flight Plan →
// for revenue, commission the Commercial Agent; for costs, analyse drivers and persistence →
// propose an evidenced issue and corrective actions (approval) → apply exactly that, linked
// back to the exception → monitor the governed figure until the exception clears.
import type { FinancialException } from "@/lib/analytics/exceptions";
import { refFor } from "@/lib/analytics/exceptions";
import { fmt } from "@/lib/analytics/format";
import type { Finding, SourceRef } from "../registry";
import type { Runtime, StepOutcome, WorkflowDef } from "../runtime";
import { costDrivers, readExceptions } from "../tools/analytics";
import { applyApproval } from "../tools/mission-control";
import { delegate } from "../tools/orchestration";

type S = { exception?: FinancialException; childId?: string; delegatedAt?: string; approvalId?: string; applied?: boolean; monitorStarted?: string; ownerHint?: string | null; recommendations?: string[] };
const st = (rt: Runtime) => rt.state as S;
const rel = (href: string) => href.replace(/^\/c\/[^/]+/, "");
const src = (e: FinancialException): SourceRef => ({ type: "analytics", id: e.key, label: e.title, path: rel(e.href) });
const val = (e: FinancialException, v: number | null) => fmt(v, e.unit === "currency_per_fte" ? "currency" : e.unit);

async function current(rt: Runtime, key: string) {
  const r = await rt.tool(readExceptions, {});
  return { exception: r.exceptions.find((x) => x.key === key) ?? null, synthetic: r.synthetic };
}

async function strategic(rt: Runtime, metricKey: string) {
  const [{ data: ns }, { data: metric }] = await Promise.all([
    rt.db.from("north_stars").select("id, financial_ambition, target_end_state").eq("company_id", rt.companyId).maybeSingle(),
    rt.db.from("metrics").select("id, name, owner_id, in_weekly_scorecard").eq("company_id", rt.companyId).eq("analytics_metric_key", metricKey).maybeSingle(),
  ]);
  const { data: links } = metric ? await rt.db.from("metric_links").select("annual_goals(id, title), quarterly_priorities(id, title)").eq("company_id", rt.companyId).eq("metric_id", metric.id) : { data: [] };
  const items = (links ?? []).flatMap((l) => [l.annual_goals as unknown as { id: string; title: string } | null, l.quarterly_priorities as unknown as { id: string; title: string } | null].filter(Boolean) as Array<{ id: string; title: string }>);
  return { ns, metric, items };
}

async function childFindings(rt: Runtime) {
  const s = st(rt);
  if (!s.childId) return { done: true, confirmed: [] as Finding[], hypotheses: [] as Finding[], recommendations: [] as string[] };
  const { data } = await rt.db.from("agent_investigations").select("status, findings, outcome").eq("company_id", rt.companyId).eq("id", s.childId).maybeSingle();
  const f = ((data?.findings ?? []) as unknown as Finding[]);
  const rec = ((data?.outcome as { recommendations?: string[] } | null)?.recommendations ?? []);
  return { done: !data || !["open", "investigating"].includes(data.status) || rec.length > 0, confirmed: f.filter((x) => x.kind === "confirmed"), hypotheses: f.filter((x) => x.kind === "hypothesis"), recommendations: rec };
}

/** Interventions that follow from the exception type; management edits or rejects them. */
function interventions(e: FinancialException, drivers?: Awaited<ReturnType<typeof costDrivers.run>>): string[] {
  const k = e.key.split(":")[0];
  if (k === "nrr_decline" || k === "nrr_below_target" || k === "grr_below_target" || k === "segment_retention") return ["Agree a renewal plan, with an executive sponsor, for every at-risk account renewing in the next 120 days", "Review the contraction and churn cases with account owners and record the agreed root causes", "Re-forecast ARR and NRR for the year with the revised renewal outcomes"];
  if (k === "contraction_increase" || k === "weak_expansion") return ["Account plans for the ten largest contracting customers", "Review cross-sell coverage of the expansion products in the largest segments"];
  if (k === "hosting_vs_arr") return ["Inventory and decommission duplicate or idle environments", `Review the commitment and pricing with ${drivers?.topSuppliers[0]?.label ?? "the main hosting supplier"} before renewal (no contract change without approval)`, "Report hosting cost as a percentage of ARR monthly until back within plan"];
  if (k === "gross_margin_below_plan") return ["Gross-margin recovery plan covering hosting, delivery partners and direct staff", "Review delivery-partner use on the implementations behind the variance"];
  if (k === "department_over_budget") return ["Department budget review with the cost-centre owner: what is temporary and what is structural", "Agree a re-forecast or a spending plan back to budget"];
  if (k === "supplier_increase") return ["Review the supplier's invoices against usage and the contract", "Agree whether the increase is temporary; no supplier change without approval"];
  if (k === "sales_marketing_up") return ["Review campaign spend against new ARR and pipeline generated", "Agree which programmes continue"];
  if (k === "revenue_per_fte") return ["Review the hiring plan against revenue growth", "Confirm productivity assumptions for new teams (aggregated, not individual)"];
  return ["Review the variance and agree the corrective action"];
}

export const ceoFinancial: WorkflowDef = {
  key: "ceo.financial_variance",
  agent: "ceo",
  title: "Governed revenue and cost exception",
  description: "Investigates a revenue, cost or margin exception from governed data against the North Star and Flight Plan, commissions the Commercial Agent for revenue causes, proposes an evidenced intervention and monitors the figure.",
  steps: {
    async start(rt) {
      const s = st(rt);
      const key = (rt.inv.trigger as { exception_key?: string }).exception_key;
      if (!key) return { done: { status: "failed", summary: "No exception was attached to this investigation." } };
      const { exception: e, synthetic } = await current(rt, key);
      if (!e) return { done: { status: "resolved", summary: "The exception is no longer present in the latest governed data, or this agent is not authorised to read that data domain.", outcome: { present: false } } };
      s.exception = e;
      await rt.updateInvestigation({
        status: "investigating", severity: e.severity === "medium" ? "medium" : e.severity, summary: e.title,
        baseline: { period: e.period.slice(0, 7), actual: val(e, e.actual), [e.comparisonLabel.toLowerCase()]: val(e, e.comparison) },
        expected_outcome: `${e.title.split(":")[0]} back within plan, with an agreed, owned corrective action.`,
      });
      await rt.finding({ kind: "confirmed", text: `${e.title}. ${e.detail}`, sources: [src(e)], data: { actual: e.actual, comparison: e.comparison } });
      if (synthetic) await rt.finding({ kind: "missing", text: "The governed source is synthetic demonstration data; conclusions illustrate the method and are not actual company performance." });
      const ctx = await strategic(rt, e.metric_key);
      const sources: SourceRef[] = [];
      if (ctx.ns) sources.push({ type: "north_star", id: ctx.ns.id, label: "North Star", path: "/north-star" });
      if (ctx.metric) sources.push({ type: "metric", id: ctx.metric.id, label: ctx.metric.name, path: `/scoreboard/${ctx.metric.id}` });
      if (ctx.ns?.financial_ambition) await rt.finding({ kind: "confirmed", text: `Strategic context: the North Star ambition is "${ctx.ns.financial_ambition}"${ctx.items.length ? `; the governed metric is linked to ${ctx.items.map((x) => `"${x.title}"`).join(" and ")}` : ""}${ctx.metric?.in_weekly_scorecard ? `; ${ctx.metric.name} is on the Monday scorecard` : ""}.`, sources });
      s.ownerHint = ctx.metric?.owner_id ?? null;
      await rt.event("context", `Read the exception, the North Star${ctx.items.length ? ` and ${ctx.items.length} Flight Plan item(s)` : ""} from governed data`, {}, [src(e), ...sources]);

      if (e.domain === "revenue") {
        const r = await rt.tool(delegate, {
          to: "commercial", workflow: "commercial.retention_review", title: `Customer drivers: ${e.title}`.slice(0, 300),
          question: `${e.title}. Which segments and customers explain it, what does the CRM show, and which interventions should follow?`,
          subjectType: "analytics_exception", context: { exception_key: e.key, filters: e.filters ?? {} },
        });
        if (r.delegated) {
          s.childId = r.childId;
          s.delegatedAt = rt.now.toISOString();
          await rt.event("delegation", "Commissioned the Commercial Agent to examine segments, customers and the CRM", { child_id: r.childId });
          await rt.updateInvestigation({ status: "monitoring" });
          return { next: "await_child", wait: { reason: "child", label: "Waiting for the Commercial Agent's findings", until: rt.daysFromNow(1) } };
        }
        await rt.finding({ kind: "missing", text: `Customer-level drivers could not be examined: ${r.reason}.` });
        return { next: "propose" };
      }

      // costs and margin: the CEO Agent examines the drivers itself
      const filters = e.filters && !("line" in e.filters && Object.keys(e.filters).length > 1) ? e.filters : {};
      const d = await rt.tool(costDrivers, { filters });
      const over = (x: { label: string; actual: number; budget: number | null; variance: number | null; variancePct: number | null }) => `${x.label} ${fmt(x.actual, "currency")}${x.budget !== null ? ` vs ${fmt(x.budget, "currency")} budget (${fmt(x.variancePct, "percent", { signed: true })})` : ""}`;
      const worstAccounts = d.topAccounts.filter((x) => (x.variance ?? 0) > 0).sort((a, b) => (b.variance ?? 0) - (a.variance ?? 0)).slice(0, 3);
      if (worstAccounts.length) await rt.finding({ kind: "confirmed", text: `Accounts over budget in the last three months: ${worstAccounts.map(over).join("; ")}.`, sources: [src(e)] });
      const sup = d.topSuppliers.slice(0, 3);
      if (sup.length) await rt.finding({ kind: "confirmed", text: `Largest suppliers in scope: ${sup.map((x) => `${x.label} ${fmt(x.actual, "currency")} (${fmt(x.yoy, "percent", { signed: true })} year on year)`).join("; ")}.` });
      const p = d.persistence;
      const structural = p.of >= 3 && p.monthsOverBudget >= Math.min(4, p.of) && p.largestMonthShare < 0.5;
      await rt.finding({ kind: "confirmed", text: structural ? `Structural rather than temporary: above budget in ${p.monthsOverBudget} of the last ${p.of} months, with no single month accounting for half of the excess.` : `Possibly temporary: above budget in ${p.monthsOverBudget} of the last ${p.of} months; the largest month is ${Math.round(p.largestMonthShare * 100)}% of the excess.`, data: p });
      if (e.key.startsWith("hosting_vs_arr")) {
        await rt.finding({ kind: "hypothesis", text: "Part of the growth may come from environments kept running during product migrations and from storage growth in acquired products. The ledger cannot show this; it needs usage data by environment." });
        await rt.finding({ kind: "missing", text: "Infrastructure usage by product and environment is not in the governed data, so optimisation opportunities cannot be sized from evidence yet." });
      }
      if (!d.canTransactions) await rt.finding({ kind: "missing", text: "This agent is not authorised to read transaction-level detail; findings rest on account and supplier aggregates." });
      s.recommendations = interventions(e, d);
      const cc = d.topCostCentres[0];
      s.ownerHint = d.costCentres.find((c) => c.code === cc?.key)?.owner ?? s.ownerHint ?? null;
      return { next: "propose" };
    },

    async await_child(rt) {
      const s = st(rt);
      const c = await childFindings(rt);
      const waited = (rt.now.getTime() - new Date(s.delegatedAt!).getTime()) / 86400000;
      if (!c.done && waited < 3) return { next: "await_child", wait: { reason: "child", label: "Waiting for the Commercial Agent's findings", until: rt.daysFromNow(1) } };
      const ref: SourceRef = { type: "investigation", id: s.childId!, label: "Commercial investigation", path: `/agents/investigations/${s.childId}` };
      for (const f of c.confirmed.slice(0, 4)) await rt.finding({ kind: "confirmed", text: `Commercial Agent: ${f.text}`, sources: [ref] });
      for (const f of c.hypotheses.slice(0, 2)) await rt.finding({ kind: "hypothesis", text: `Commercial Agent: ${f.text}`, sources: [ref] });
      s.recommendations = c.recommendations.length ? c.recommendations : interventions(s.exception!);
      return { next: "propose" };
    },

    async propose(rt) {
      const s = st(rt);
      const e = s.exception!;
      if (rt.mode("propose_issue") === "off") {
        await rt.event("step", "Raising issues is switched off for the CEO Agent; findings recorded for management");
        return { next: "monitor" };
      }
      // an issue already linked to this exception: don't raise another
      const { data: existing } = await rt.db.from("issues").select("id, title").eq("company_id", rt.companyId).eq("analytics_ref->>exception_key", e.key).neq("status", "resolved").limit(1);
      if (existing?.length) {
        await rt.event("step", `An open issue already covers this exception ("${existing[0].title}"); monitoring instead of raising another`, {}, [{ type: "issue", id: existing[0].id, label: existing[0].title, path: `/execution/issue/${existing[0].id}` }]);
        return { next: "monitor" };
      }
      const { data: ceoCrew } = await rt.db.from("crew_members").select("id").eq("company_id", rt.companyId).eq("seat", "CEO").maybeSingle();
      const owner = s.ownerHint ?? ceoCrew?.id;
      if (!owner) return { done: { status: "resolved", summary: "No accountable owner could be identified; findings recorded for management." } };
      const { data: metric } = await rt.db.from("metrics").select("id").eq("company_id", rt.companyId).eq("analytics_metric_key", e.metric_key).maybeSingle();
      const due = (d: number) => new Date(rt.now.getTime() + d * 86400000).toISOString().slice(0, 10);
      const { data: inv } = await rt.db.from("agent_investigations").select("findings").eq("company_id", rt.companyId).eq("id", rt.inv.id).single();
      const findings = (inv?.findings as unknown as Finding[]) ?? [];
      const evidence = findings.filter((f) => f.kind === "confirmed").slice(0, 3).map((f) => f.text).join(" ");
      const recs = (s.recommendations ?? interventions(e)).slice(0, 3);
      s.approvalId = await rt.propose("approval:intervention", {
        category: "propose_issue",
        action_type: "create_corrective_action",
        title: `Raise "${e.title}" in Mission Control with ${recs.length} corrective action${recs.length === 1 ? "" : "s"}`,
        rationale: `${evidence} ${findings.some((f) => f.kind === "hypothesis") ? "Hypotheses are labelled as such and need confirming." : ""}`.trim().slice(0, 2000),
        payload: {
          issue: { title: e.title.slice(0, 300), description: `${e.detail} Raised by the CEO Agent from governed data (${e.period.slice(0, 7)}). Actual ${val(e, e.actual)}; ${e.comparisonLabel.toLowerCase()} ${val(e, e.comparison)}.`, priority: e.severity === "critical" ? "critical" : "high", owner_id: owner, metric_id: metric?.id ?? null },
          actions: recs.map((t, n) => ({ title: t.slice(0, 300), description: `Agreed in response to: ${e.title}`, owner_id: owner, due_date: due(14 + n * 7), metric_id: metric?.id ?? null })),
          analytics_ref: refFor(e),
        },
        evidence: [src(e), ...(s.childId ? [{ type: "investigation", id: s.childId, label: "Commercial investigation", path: `/agents/investigations/${s.childId}` }] : [])],
        affected: [{ type: "analytics", label: e.title }],
        implications: "Creates an issue for the weekly ELT meeting and the agreed corrective actions, each linked to the governed exception. Nothing outside Omni OS changes: no contract, supplier, price or headcount change is made.",
        reversible: true,
      });
      await rt.updateInvestigation({ status: "awaiting_approval" });
      return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval of the intervention", until: rt.daysFromNow(2) } };
    },

    async await_approval(rt) {
      const s = st(rt);
      const ap = await rt.approval(s.approvalId!);
      if (ap.status === "pending") return { next: "await_approval", wait: { reason: "approval", label: "Waiting for approval of the intervention", until: rt.daysFromNow(2) } };
      if (ap.status === "approved") {
        const r = await rt.tool(applyApproval, { approvalId: ap.id });
        s.applied = !r.stale;
        await rt.event("outcome", r.stale ? "The intervention was not applied: circumstances changed" : "Intervention approved and applied: issue and corrective actions are in Mission Control, linked to the exception", r);
      } else await rt.event("approval", `Intervention ${ap.status.replace("_", " ")}${ap.decision_note ? `: "${ap.decision_note}"` : ""}`);
      return { next: "monitor" };
    },

    async monitor(rt): Promise<StepOutcome> {
      const s = st(rt);
      const e = s.exception!;
      s.monitorStarted ??= rt.now.toISOString();
      const { exception: now } = await current(rt, e.key);
      if (!now) {
        const outcome = { cleared: true, intervention_applied: Boolean(s.applied) };
        await rt.event("outcome", `The exception "${e.title}" is no longer present in the governed data`, outcome);
        return { done: { status: "resolved", summary: `Exception cleared${s.applied ? " after the approved intervention" : ""}. Recovery is recorded, not attributed: other factors may have contributed.`, outcome } };
      }
      if (now.period !== e.period) await rt.event("monitoring", `${now.title} (${now.period.slice(0, 7)})`, { actual: now.actual, comparison: now.comparison }, [src(now)]);
      const days = (rt.now.getTime() - new Date(s.monitorStarted).getTime()) / 86400000;
      if (days > 120) return { done: { status: "resolved", summary: `Still an exception after four months (${val(now, now.actual)}); an item for the quarterly offsite.`, outcome: { cleared: false, intervention_applied: Boolean(s.applied) } } };
      await rt.updateInvestigation({ status: "monitoring", next_review_at: rt.daysFromNow(7).toISOString() });
      return { next: "monitor", wait: { reason: "review", label: "Weekly check of the governed figure", until: rt.daysFromNow(7) } };
    },
  },
};
