import { z } from "zod";
import type { Candidate, Thesis } from "../analysis/ma";
import { activeConnections } from "../connectors/channels";
import { connectionSecret } from "../connectors/secrets";
import { defineTool, ToolError, type Runtime } from "../runtime";

export const readThesis = defineTool({
  name: "ma.read_thesis",
  description: "Read the company's approved acquisition thesis.",
  sideEffect: "read",
  input: z.object({ thesisId: z.string().uuid() }),
  run: async (rt, i: { thesisId: string }) => {
    const { data, error } = await rt.db.from("ma_theses").select("*").eq("company_id", rt.companyId).eq("id", i.thesisId).maybeSingle();
    if (error) throw new ToolError(error.message, true);
    if (!data) throw new ToolError("Thesis not found");
    if (data.status !== "approved") throw new ToolError("The acquisition thesis has not been approved by management");
    return { ...data, min_revenue: num(data.min_revenue), max_revenue: num(data.max_revenue), min_ebitda: num(data.min_ebitda) } as Thesis & { rationale: string; integration_requirements: string };
  },
  summarise: (_i, o) => `Thesis "${o.title}" (threshold ${o.fit_threshold})`,
});

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const readPipeline = defineTool({
  name: "ma.read_pipeline",
  description: "Read the acquisition pipeline, including rejected targets.",
  sideEffect: "read",
  input: z.object({}),
  run: async (rt) => {
    const { data, error } = await rt.db.from("ma_targets").select("id, name, normalized_name, registration_number, stage, rejection_reason, owner_crew_id, fit_score").eq("company_id", rt.companyId);
    if (error) throw new ToolError(error.message, true);
    return data ?? [];
  },
  summarise: (_i, o) => `${o.length} companies in the pipeline`,
});

/** Authorised sources only: the sandbox dataset and/or Companies House's official API. */
export const searchSources = defineTool({
  name: "ma.search_sources",
  description: "Search the company's authorised market-intelligence sources for companies matching the thesis.",
  sideEffect: "read",
  input: z.object({ keywords: z.array(z.string()).max(10), sectors: z.array(z.string()).max(10) }),
  run: async (rt, i: { keywords: string[]; sectors: string[] }) => {
    const conns = await activeConnections(rt, ["ma_sandbox", "companies_house"]);
    if (!conns.length) throw new ToolError("No market-intelligence source is connected and allowed for the M&A Agent");
    const out: Candidate[] = [];
    const sources: string[] = [];
    for (const c of conns) {
      sources.push(c.display_name);
      if (c.provider === "ma_sandbox") out.push(...(await sandboxSearch(rt)));
      else out.push(...(await companiesHouseSearch(rt, c.id, i.keywords)));
    }
    return { sources, candidates: out };
  },
  summarise: (_i, o) => `${o.candidates.length} companies from ${o.sources.join(", ")}`,
});

async function sandboxSearch(rt: Runtime): Promise<Candidate[]> {
  const { data, error } = await rt.db.from("ma_sandbox_companies").select("*").eq("company_id", rt.companyId);
  if (error) throw new ToolError(error.message, true);
  return (data ?? []).map((c) => ({
    sourceId: c.id, source: "Sandbox dataset", name: c.name, registrationNumber: c.registration_number, website: c.website, sector: c.sector, geography: c.geography,
    description: c.description, ownership: c.ownership, revenue: num(c.revenue), ebitda: num(c.ebitda), employees: c.employees,
    financialsSource: c.revenue !== null ? `${c.source_note}, FY${c.financials_year}` : null,
  }));
}

/** Companies House public data API (advanced search). It holds no revenue or EBITDA, so financials stay unknown. */
async function companiesHouseSearch(rt: Runtime, connectionId: string, keywords: string[]): Promise<Candidate[]> {
  const key = await connectionSecret(rt.companyId, connectionId);
  if (!key) throw new ToolError("Companies House is not authorised for this company");
  const out: Candidate[] = [];
  for (const kw of keywords.slice(0, 4)) {
    const res = await fetch(`https://api.company-information.service.gov.uk/advanced-search/companies?company_name_includes=${encodeURIComponent(kw)}&company_status=active&size=20`, {
      headers: { authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429) throw new ToolError("Companies House rate limit — will retry", true);
    if (!res.ok) throw new ToolError(`Companies House responded ${res.status}`, res.status >= 500);
    const body = (await res.json()) as { items?: Array<{ company_name: string; company_number: string; registered_office_address?: { locality?: string }; sic_codes?: string[] }> };
    for (const it of body.items ?? [])
      out.push({
        sourceId: it.company_number, source: "Companies House", name: it.company_name, registrationNumber: it.company_number, website: null, sector: null,
        geography: null, description: `Registered in ${it.registered_office_address?.locality ?? "unknown locality"}; SIC ${(it.sic_codes ?? []).join(", ") || "not stated"}`,
        ownership: null, revenue: null, ebitda: null, employees: null, financialsSource: null,
      });
  }
  return out;
}

export const addTarget = defineTool({
  name: "ma.add_target",
  description: "Add a researched target to the acquisition pipeline (authority-checked; idempotent by normalised name).",
  sideEffect: "internal",
  input: z.object({ target: z.record(z.string(), z.unknown()), approvalId: z.string().uuid().optional() }),
  run: async (rt, i: { target: Record<string, unknown>; approvalId?: string }) => {
    // The database upserts by normalised name, so re-running after an interruption is safe
    const add = async () => {
      const { data, error } = await rt.db.rpc("agent_add_ma_target", { p_company: rt.companyId, p_target: i.target as never, p_approval: i.approvalId });
      if (error) throw new ToolError(error.message, error.code !== "42501");
      return { id: data as string };
    };
    return rt.once(`ma:${rt.inv.id}:${i.target.normalized_name}`, "ma.add_target", add, add);
  },
  summarise: (i) => `Added ${i.target.name} to the pipeline`,
});

export const setTargetStage = defineTool({
  name: "ma.set_stage",
  description: "Move one of the agent's pipeline records to researching, shortlisted or approach prepared.",
  sideEffect: "internal",
  input: z.object({ targetId: z.string().uuid(), stage: z.enum(["researching", "shortlisted", "approach_prepared"]) }),
  run: async (rt, i: { targetId: string; stage: string }) => {
    const { error } = await rt.db.rpc("agent_set_ma_stage", { p_company: rt.companyId, p_target: i.targetId, p_stage: i.stage });
    if (error) throw new ToolError(error.message, error.code !== "42501");
    return { ok: true };
  },
  summarise: (i) => `Stage → ${i.stage.replace("_", " ")}`,
});
