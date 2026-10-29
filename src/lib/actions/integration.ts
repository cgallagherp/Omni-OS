"use server";
// M&A Integration: knowledge, playbooks, acquisitions, plans, execution records, synergies
// and learning. Everything runs as the signed-in user (RLS); approvals go through the
// security-definer functions in the database, which re-check the approver's role.
import { z } from "zod";
import { requireCompanyPermission, type CompanyContext } from "@/lib/auth";
import { decryptSecret } from "@/lib/agents/connectors/secrets";
import { MAX_UPLOAD_BYTES } from "@/lib/integration/extract";
import { downloadFromStore, listStore, StoreError, type StoreItem, type StoreProvider } from "@/lib/integration/document-stores";
import { DOC_TYPES, ingestDocument, type DocType } from "@/lib/integration/ingest";
import { applyChange, changeOp } from "@/lib/integration/learning";
import { planContent, playbookContent, type PlaybookContent } from "@/lib/integration/schema";
import { recommendPlaybook } from "@/lib/domain/integration";
import { revalidateCompany } from "./common";
import { ActionError, dbError, formObject, run, zDate, zNumber, zOptional, zOptionalUuid, zRequired, type ActionResult } from "./result";

const docType = z.enum(Object.keys(DOC_TYPES) as [DocType, ...DocType[]]);
const today = () => new Date().toISOString().slice(0, 10);

/** Database refusals carry their own explanation; show it. */
function rpcError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "42501" || error.code === "23514" || error.code === "P0002") throw new ActionError(error.message);
  dbError(error);
}

async function integrationAgentOn(ctx: CompanyContext) {
  const { data } = await ctx.supabase.from("agent_configs").select("enabled").eq("company_id", ctx.company.companyId).eq("agent_key", "integration").maybeSingle();
  if (!data?.enabled) throw new ActionError("The M&A Integration Agent is switched off. An administrator can enable it in Agents → Configuration.");
}

/** Queue a durable agent job tied to the record it will produce. */
async function queue(ctx: CompanyContext, workflow: string, title: string, subjectType: string, subjectId: string, trigger: Record<string, unknown>) {
  const cid = ctx.company.companyId;
  const { data: inv, error } = await ctx.supabase
    .from("agent_investigations")
    .insert({ company_id: cid, agent_key: "integration", workflow, title: title.slice(0, 300), dedupe_key: `${workflow}:${subjectId}`, subject_type: subjectType, subject_id: subjectId, requested_by: ctx.viewer.id, trigger: { type: "manual", summary: `Requested by ${ctx.viewer.fullName}`, by: ctx.viewer.id, ...trigger } as never })
    .select("id")
    .single();
  dbError(error);
  await ctx.supabase.from("agent_events").insert({ company_id: cid, investigation_id: inv!.id, agent_key: "integration", kind: "trigger", actor_id: ctx.viewer.id, summary: `${title} — requested by ${ctx.viewer.fullName}`.slice(0, 500) });
  const { error: re } = await ctx.supabase.from("agent_runs").insert({ company_id: cid, investigation_id: inv!.id, agent_key: "integration", workflow });
  dbError(re);
  return inv!.id;
}

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------
export async function uploadKnowledge(companyId: string, fd: FormData): Promise<ActionResult<{ id: string; status: string; duplicate?: boolean }>> {
  return run<{ id: string; status: string; duplicate?: boolean }>(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const o = formObject(fd);
    const d = z.object({ doc_type: docType, acquisition_id: zOptionalUuid, restricted: z.string().optional(), title: zOptional(300) }).parse(o);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose a file to upload.");
    if (file.size > MAX_UPLOAD_BYTES) throw new ActionError(`${file.name} is larger than 15 MB.`);
    const restricted = d.restricted === "on" || d.restricted === "true";
    if (restricted && !ctx.can.admin) throw new ActionError("Only the CEO or a company administrator can add confidential transaction documents.");
    const r = await ingestDocument(ctx.supabase, {
      companyId, acquisitionId: d.acquisition_id, title: d.title || file.name.replace(/\.[a-z0-9]+$/i, ""), filename: file.name, mime: file.type || null,
      bytes: new Uint8Array(await file.arrayBuffer()), docType: d.doc_type, origin: "upload", restricted,
    }).catch((e: Error) => {
      if (/row-level security/i.test(e.message)) throw new ActionError("You cannot add documents here.");
      throw e;
    });
    revalidateCompany(ctx);
    if (r.duplicate) return { ok: true, message: `${file.name} is already in the library`, data: { id: r.id, status: r.status, duplicate: true } };
    if (r.status !== "ready") return { ok: true, message: `${file.name}: ${r.error}`, data: { id: r.id, status: r.status } };
    return { ok: true, message: `${file.name} added (${r.passages} passages indexed)`, data: { id: r.id, status: r.status } };
  });
}

export async function updateKnowledge(companyId: string, sourceId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const d = z.object({ doc_type: docType, title: zRequired("Title", 300) }).parse(formObject(fd));
    const { error } = await ctx.supabase.from("knowledge_sources").update({ doc_type: d.doc_type, title: d.title }).eq("company_id", companyId).eq("id", sourceId);
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Saved" };
  });
}

export async function deleteKnowledge(companyId: string, sourceId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { data, error } = await ctx.supabase.from("knowledge_sources").delete().eq("company_id", companyId).eq("id", sourceId).select("id");
    dbError(error);
    if (!data?.length) throw new ActionError("Document not found.");
    revalidateCompany(ctx);
    return { ok: true, message: "Removed from the library" };
  });
}

async function storeToken(ctx: CompanyContext, connectionId: string) {
  const { data: conn } = await ctx.supabase.from("integration_connections").select("id, provider, status, config, display_name").eq("company_id", ctx.company.companyId).eq("id", connectionId).maybeSingle();
  if (!conn || !["sharepoint", "onedrive", "google_drive"].includes(conn.provider)) throw new ActionError("Not a document-store connection.");
  if (conn.status !== "connected") throw new ActionError(`${conn.display_name} is not authorised yet.`);
  const { data: blob, error } = await ctx.supabase.rpc("connection_ciphertext", { p_connection: connectionId });
  rpcError(error);
  if (!blob) throw new ActionError(`${conn.display_name} has no credentials.`);
  return { provider: conn.provider as StoreProvider, token: decryptSecret(blob as string), config: (conn.config ?? {}) as Record<string, unknown>, name: conn.display_name };
}

/** Browse a connected document store (administrators). */
export async function browseStore(companyId: string, connectionId: string, folderId: string | null): Promise<ActionResult<{ items: StoreItem[] }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const s = await storeToken(ctx, connectionId);
    try {
      return { ok: true, data: { items: await listStore(s.provider, s.token, s.config, folderId) } };
    } catch (e) {
      if (e instanceof StoreError) throw new ActionError(e.message);
      throw e;
    }
  });
}

/** Import only the files the administrator selected (a folder imports its files, one level). */
export async function importFromStore(companyId: string, connectionId: string, items: StoreItem[], docTypeValue: string, acquisitionId: string | null): Promise<ActionResult<{ imported: number; failed: string[] }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const dt = docType.parse(docTypeValue);
    const sel = z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(["folder", "file"]), size: z.number().nullable(), mime: z.string().nullable(), modified: z.string().nullable() })).max(50).parse(items);
    const s = await storeToken(ctx, connectionId);
    let imported = 0;
    const failed: string[] = [];
    const files: StoreItem[] = [];
    for (const it of sel) {
      if (it.kind === "file") files.push(it);
      else files.push(...(await listStore(s.provider, s.token, s.config, it.id).catch(() => [])).filter((f) => f.kind === "file").slice(0, 50));
    }
    for (const f of files.slice(0, 100)) {
      try {
        const dl = await downloadFromStore(s.provider, s.token, s.config, f, MAX_UPLOAD_BYTES);
        const r = await ingestDocument(ctx.supabase, { companyId, acquisitionId, title: f.name.replace(/\.[a-z0-9]+$/i, ""), filename: dl.filename, mime: dl.mime, bytes: dl.bytes, docType: dt, origin: s.provider, connectionId, externalRef: f.id });
        if (r.status === "ready") imported++;
        else failed.push(`${f.name}: ${r.error ?? r.status}`);
      } catch (e) {
        failed.push(`${f.name}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    revalidateCompany(ctx);
    return { ok: true, message: `Imported ${imported} of ${files.length} files from ${s.name}`, data: { imported, failed } };
  });
}

// ---------------------------------------------------------------------------
// Master playbooks
// ---------------------------------------------------------------------------
export async function generatePlaybook(companyId: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    if (!ctx.can.admin && ctx.company.role !== "executive") throw new ActionError("Only leadership can generate playbooks.");
    const sources = fd.getAll("source").map(String);
    const d = z.object({ name: zRequired("Name", 200), lineage_id: zOptionalUuid }).parse(formObject(fd));
    if (!sources.length) throw new ActionError("Select at least one document to analyse.");
    const ids = z.array(z.string().uuid()).max(200).parse(sources);
    await integrationAgentOn(ctx);
    const { data: ok } = await ctx.supabase.from("knowledge_sources").select("id").eq("company_id", companyId).in("id", ids).eq("status", "ready");
    if (!ok?.length) throw new ActionError("None of the selected documents could be read.");
    const lineage = d.lineage_id;
    let version = 1;
    let basedOn: string | null = null;
    if (lineage) {
      const { data: prev } = await ctx.supabase.from("integration_playbooks").select("id, version, status").eq("company_id", companyId).eq("lineage_id", lineage).order("version", { ascending: false }).limit(1).single();
      if (!prev) throw new ActionError("Playbook not found.");
      if (prev.status === "generating" || prev.status === "draft") throw new ActionError("This playbook already has an open draft. Approve or discard it first.");
      version = prev.version + 1;
      basedOn = prev.id;
    }
    const id = crypto.randomUUID();
    const { error } = await ctx.supabase.from("integration_playbooks").insert({
      id, company_id: companyId, lineage_id: lineage ?? id, version, name: d.name, status: "generating", source_ids: ok.map((x) => x.id), generator: "claude", based_on_id: basedOn,
      content: { workstreams: [] },
    });
    dbError(error);
    await queue(ctx, "integration.generate_playbook", `Generate playbook: ${d.name}`, "playbook", id, {});
    revalidateCompany(ctx);
    return { ok: true, message: "The M&A Integration Agent is analysing the documents", data: { id } };
  });
}

export async function createBlankPlaybook(companyId: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const d = z.object({ name: zRequired("Name", 200) }).parse(formObject(fd));
    const id = crypto.randomUUID();
    const content: PlaybookContent = playbookContent.parse({ summary: "Written by management.", workstreams: [] });
    const { error } = await ctx.supabase.from("integration_playbooks").insert({ id, company_id: companyId, lineage_id: id, version: 1, name: d.name, status: "draft", generator: "manual", content: content as never });
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, data: { id } };
  });
}

/** Save the edited draft (whole document, validated; optimistic concurrency on updated_at). */
export async function savePlaybookDraft(companyId: string, playbookId: string, payload: { content: unknown; name: string; applies_when: string; acquisition_types: string[]; updated_at: string }): Promise<ActionResult<{ updated_at: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const content = playbookContent.parse(payload.content);
    const meta = z.object({ name: zRequired("Name", 200), applies_when: z.string().max(2000), acquisition_types: z.array(z.string().max(80)).max(10) }).parse(payload);
    const { data, error } = await ctx.supabase
      .from("integration_playbooks")
      .update({ content: content as never, name: meta.name, applies_when: meta.applies_when, acquisition_types: meta.acquisition_types })
      .eq("company_id", companyId).eq("id", playbookId).eq("status", "draft").eq("updated_at", payload.updated_at)
      .select("updated_at")
      .maybeSingle();
    rpcError(error);
    if (!data) throw new ActionError("This draft changed since you opened it (or is no longer a draft). Reload to see the latest version.");
    revalidateCompany(ctx);
    return { ok: true, message: "Draft saved", data: { updated_at: data.updated_at } };
  });
}

export async function approvePlaybook(companyId: string, playbookId: string, note: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { error } = await ctx.supabase.rpc("approve_playbook", { p_playbook: playbookId, p_note: note.slice(0, 1000) || undefined });
    rpcError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Playbook approved — it is now the company's integration template" };
  });
}

export async function discardPlaybookDraft(companyId: string, playbookId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { data, error } = await ctx.supabase.from("integration_playbooks").update({ status: "archived" }).eq("company_id", companyId).eq("id", playbookId).in("status", ["draft", "failed"]).select("id");
    rpcError(error);
    if (!data?.length) throw new ActionError("Only drafts can be discarded.");
    revalidateCompany(ctx);
    return { ok: true, message: "Draft discarded" };
  });
}

/** Start a new draft version from the current approved version (for manual revision). */
export async function revisePlaybook(companyId: string, playbookId: string): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { data: pb } = await ctx.supabase.from("integration_playbooks").select("*").eq("company_id", companyId).eq("id", playbookId).single();
    if (!pb || pb.status !== "approved") throw new ActionError("Revise from the approved version.");
    const id = crypto.randomUUID();
    const { error } = await ctx.supabase.from("integration_playbooks").insert({
      id, company_id: companyId, lineage_id: pb.lineage_id, version: pb.version + 1, name: pb.name, applies_when: pb.applies_when, acquisition_types: pb.acquisition_types,
      status: "draft", content: pb.content, source_ids: pb.source_ids, generator: "revision", based_on_id: pb.id, change_summary: "Manual revision",
    });
    if (error?.code === "23505") throw new ActionError("This playbook already has an open draft.");
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, data: { id } };
  });
}

/** Accept or reject an agent-proposed improvement. Acceptance creates (or extends) a draft version — never the approved one. */
export async function decideChangeProposal(companyId: string, proposalId: string, decision: "accepted" | "rejected", note: string): Promise<ActionResult<{ playbookId?: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { data: p } = await ctx.supabase.from("playbook_change_proposals").select("*").eq("company_id", companyId).eq("id", proposalId).single();
    if (!p || p.status !== "pending") throw new ActionError("This proposal has already been decided.");
    if (decision === "rejected") {
      if (note.trim().length < 3) throw new ActionError("Say why it is rejected.");
      const { error } = await ctx.supabase.from("playbook_change_proposals").update({ status: "rejected", decided_by: ctx.viewer.id, decided_at: new Date().toISOString(), decision_note: note }).eq("id", proposalId);
      dbError(error);
      revalidateCompany(ctx);
      return { ok: true, message: "Proposal rejected" };
    }
    const { data: target } = await ctx.supabase.from("integration_playbooks").select("*").eq("company_id", companyId).eq("id", p.playbook_id).single();
    const { data: open } = await ctx.supabase.from("integration_playbooks").select("*").eq("company_id", companyId).eq("lineage_id", target!.lineage_id).in("status", ["draft", "generating"]).maybeSingle();
    const change = changeOp.parse(p.change);
    let draftId: string;
    if (open) {
      if (open.status === "generating") throw new ActionError("A new version is being generated; decide once it is ready.");
      const next = applyChange(playbookContent.parse(open.content), change);
      const { error } = await ctx.supabase.from("integration_playbooks").update({ content: next as never, change_summary: `${open.change_summary ? `${open.change_summary}; ` : ""}${p.title}`.slice(0, 2000) }).eq("id", open.id);
      dbError(error);
      draftId = open.id;
    } else {
      const { data: current } = await ctx.supabase.from("integration_playbooks").select("*").eq("company_id", companyId).eq("lineage_id", target!.lineage_id).eq("status", "approved").single();
      const next = applyChange(playbookContent.parse(current!.content), change);
      draftId = crypto.randomUUID();
      const { error } = await ctx.supabase.from("integration_playbooks").insert({
        id: draftId, company_id: companyId, lineage_id: current!.lineage_id, version: current!.version + 1, name: current!.name, applies_when: current!.applies_when,
        acquisition_types: current!.acquisition_types, status: "draft", content: next as never, source_ids: current!.source_ids, generator: "revision", based_on_id: current!.id, change_summary: p.title,
      });
      dbError(error);
    }
    const { error } = await ctx.supabase.from("playbook_change_proposals").update({ status: "accepted", decided_by: ctx.viewer.id, decided_at: new Date().toISOString(), decision_note: note || null, resulting_playbook_id: draftId }).eq("id", proposalId);
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Applied to a new draft version — approve the draft to publish it", data: { playbookId: draftId } };
  });
}

// ---------------------------------------------------------------------------
// Acquisitions and plans
// ---------------------------------------------------------------------------
const acqFields = z.object({
  name: zRequired("Acquired company", 200),
  completion_date: zDate,
  rationale: z.string().trim().max(4000).default(""),
  objectives: z.string().trim().max(4000).default(""),
  operating_model: z.string().trim().max(4000).default(""),
  integration_model: z.string().trim().max(200).default(""),
  expected_synergies: z.string().trim().max(4000).default(""),
  key_risks: z.string().trim().max(4000).default(""),
  diligence_findings: z.string().trim().max(8000).default(""),
  commitments: z.string().trim().max(4000).default(""),
  systems_info: z.string().trim().max(4000).default(""),
  org_info: z.string().trim().max(4000).default(""),
  sponsor_crew_id: zOptionalUuid,
  leader_crew_id: zOptionalUuid,
  annual_goal_id: zOptionalUuid,
  quarterly_priority_id: zOptionalUuid,
});

export async function saveAcquisition(companyId: string, acquisitionId: string | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const d = acqFields.parse(formObject(fd));
    if (acquisitionId) {
      const { data: cur } = await ctx.supabase.from("acquisitions").select("status").eq("company_id", companyId).eq("id", acquisitionId).single();
      if (cur && ["ready", "active"].includes(cur.status) && d.completion_date === null) throw new ActionError("An approved plan needs a completion date.");
      const { error } = await ctx.supabase.from("acquisitions").update(d).eq("company_id", companyId).eq("id", acquisitionId);
      dbError(error);
      revalidateCompany(ctx);
      return { ok: true, message: "Saved", data: { id: acquisitionId } };
    }
    const { data, error } = await ctx.supabase.from("acquisitions").insert({ ...d, company_id: companyId }).select("id").single();
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Acquisition created", data: { id: data!.id } };
  });
}

/** M&A Agent → M&A Integration Agent: hand over an approved target for integration planning. */
export async function handoverTarget(companyId: string, targetId: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const d = z.object({ completion_date: zDate, leader_crew_id: zOptionalUuid, include_financials: z.string().optional() }).parse(formObject(fd));
    const { data: t } = await ctx.supabase.from("ma_targets").select("*, ma_theses(title, rationale, integration_requirements)").eq("company_id", companyId).eq("id", targetId).single();
    if (!t) throw new ActionError("Target not found.");
    if (!["diligence", "in_discussion", "approached", "closed"].includes(t.stage)) throw new ActionError("Only targets in discussion or diligence can be handed over for integration planning.");
    const thesis = t.ma_theses as unknown as { title: string; rationale: string; integration_requirements: string } | null;
    const financials = d.include_financials === "on";
    const handover = {
      from: "M&A Agent pipeline", target_id: t.id, thesis: thesis?.title ?? null, fit_score: t.fit_score, fit_breakdown: t.fit_breakdown, source: t.source,
      financials: financials ? { revenue: t.revenue, ebitda: t.ebitda, source: t.financials_source } : "withheld — confidential transaction information not shared with integration participants",
      approved_by: ctx.viewer.fullName, at: new Date().toISOString(),
    };
    const missing = [!d.completion_date && "Expected completion date", "Approved integration strategy and target operating model", "Expected synergies with amounts and dates", "Relevant diligence findings", "Transaction commitments (earn-out, TSA, employment)", "Key contacts at the acquired company"].filter(Boolean);
    const { data, error } = await ctx.supabase
      .from("acquisitions")
      .insert({
        company_id: companyId, name: t.name.replace(/\s+(ltd|limited)$/i, ""), ma_target_id: t.id, completion_date: d.completion_date, leader_crew_id: d.leader_crew_id ?? t.owner_crew_id,
        rationale: thesis ? `${thesis.title}. ${thesis.rationale}` : "", objectives: thesis?.integration_requirements ? `Integration requirements from the thesis: ${thesis.integration_requirements}` : "",
        handover: { ...handover, missing } as never, handover_approved_by: ctx.viewer.id,
      })
      .select("id")
      .single();
    if (error?.code === "23505") throw new ActionError("This target has already been handed over.");
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Handed over for integration planning", data: { id: data!.id } };
  });
}

export async function setAgentPaused(companyId: string, acquisitionId: string, paused: boolean): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { error } = await ctx.supabase.from("acquisitions").update({ agent_paused: paused }).eq("company_id", companyId).eq("id", acquisitionId);
    dbError(error);
    await ctx.supabase.from("agent_events").insert({ company_id: companyId, agent_key: "integration", kind: "config", actor_id: ctx.viewer.id, summary: `${paused ? "Paused" : "Resumed"} the M&A Integration Agent for an integration`, data: { acquisition_id: acquisitionId, paused } });
    revalidateCompany(ctx);
    return { ok: true, message: paused ? "Agent paused for this integration" : "Agent resumed" };
  });
}

export async function setAcquisitionStatus(companyId: string, acquisitionId: string, status: "active" | "completed" | "on_hold" | "cancelled"): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { data: a } = await ctx.supabase.from("acquisitions").select("status, completion_date").eq("company_id", companyId).eq("id", acquisitionId).single();
    if (!a) throw new ActionError("Not found.");
    if (status === "active" && !["ready", "on_hold"].includes(a.status)) throw new ActionError("Only an approved plan can be activated.");
    if (status === "active" && a.completion_date && a.completion_date > today()) throw new ActionError("The transaction has not completed yet; the plan activates on the completion date.");
    const { error } = await ctx.supabase.from("acquisitions").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("company_id", companyId).eq("id", acquisitionId);
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: status === "completed" ? "Integration completed — run the post-integration review to improve the playbook" : "Status updated" };
  });
}

export async function recommendForAcquisition(companyId: string, acquisitionId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const [{ data: a }, { data: pbs }] = await Promise.all([
      ctx.supabase.from("acquisitions").select("*").eq("company_id", companyId).eq("id", acquisitionId).single(),
      ctx.supabase.from("integration_playbooks").select("id, name, applies_when, acquisition_types").eq("company_id", companyId).eq("status", "approved"),
    ]);
    if (!a) throw new ActionError("Not found.");
    if (!pbs?.length) throw new ActionError("Approve a master playbook first.");
    const r = recommendPlaybook(pbs, a);
    const { error } = await ctx.supabase.from("acquisitions").update({ recommended_playbook_id: r!.p.id, recommendation: { reason: r!.reason, score: r!.score } }).eq("id", acquisitionId);
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: `Recommended: ${r!.p.name}` };
  });
}

export async function generateIntegrationPlan(companyId: string, acquisitionId: string, playbookId: string): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    await integrationAgentOn(ctx);
    const [{ data: a }, { data: pb }, { data: last }] = await Promise.all([
      ctx.supabase.from("acquisitions").select("id, name, status").eq("company_id", companyId).eq("id", acquisitionId).single(),
      ctx.supabase.from("integration_playbooks").select("id, name, status").eq("company_id", companyId).eq("id", playbookId).single(),
      ctx.supabase.from("integration_plans").select("version, status").eq("company_id", companyId).eq("acquisition_id", acquisitionId).order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!a || !["planning", "plan_in_review"].includes(a.status)) throw new ActionError("Plans can be generated before a plan is approved.");
    if (!pb || pb.status !== "approved") throw new ActionError("Choose an approved playbook.");
    if (last && ["generating", "draft"].includes(last.status)) {
      // replace the open draft
      await ctx.supabase.from("integration_plans").update({ status: "superseded" }).eq("company_id", companyId).eq("acquisition_id", acquisitionId).in("status", ["draft", "failed"]);
      if (last.status === "generating") throw new ActionError("A plan is already being generated.");
    }
    const id = crypto.randomUUID();
    const { error } = await ctx.supabase.from("integration_plans").insert({ id, company_id: companyId, acquisition_id: acquisitionId, version: (last?.version ?? 0) + 1, playbook_id: playbookId, status: "generating", content: { workstreams: [] } });
    dbError(error);
    await ctx.supabase.from("acquisitions").update({ playbook_id: playbookId }).eq("id", acquisitionId);
    await queue(ctx, "integration.generate_plan", `Generate integration plan: ${a.name}`, "plan", id, { acquisition_id: acquisitionId });
    revalidateCompany(ctx);
    return { ok: true, message: "The M&A Integration Agent is adapting the playbook to this acquisition", data: { id } };
  });
}

export async function savePlanDraft(companyId: string, planId: string, payload: { content: unknown; updated_at: string }): Promise<ActionResult<{ updated_at: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const content = planContent.parse(payload.content);
    const { data, error } = await ctx.supabase.from("integration_plans").update({ content: content as never }).eq("company_id", companyId).eq("id", planId).eq("status", "draft").eq("updated_at", payload.updated_at).select("updated_at").maybeSingle();
    rpcError(error);
    if (!data) throw new ActionError("This plan changed since you opened it (or is no longer a draft). Reload to see the latest version.");
    revalidateCompany(ctx);
    return { ok: true, message: "Plan saved", data: { updated_at: data.updated_at } };
  });
}

export async function approveIntegrationPlan(companyId: string, planId: string, note: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { error } = await ctx.supabase.rpc("approve_integration_plan", { p_plan: planId, p_note: note.slice(0, 1000) || undefined });
    rpcError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Plan approved. The M&A Integration Agent will drive it from the completion date." };
  });
}

// ---------------------------------------------------------------------------
// Execution records
// ---------------------------------------------------------------------------
export async function updateActivity(companyId: string, activityId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const d = z
      .object({ status: z.enum(["not_started", "in_progress", "blocked", "done", "not_needed"]), owner_crew_id: zOptionalUuid, due_date: zDate, evidence_note: zOptional(2000), blocked_reason: zOptional(1000) })
      .superRefine((v, c) => {
        if (v.status === "blocked" && !v.blocked_reason) c.addIssue({ code: "custom", path: ["blocked_reason"], message: "Say what is blocking it" });
      })
      .parse(formObject(fd));
    const { error } = await ctx.supabase.from("integration_activities").update({ ...d, blocked_reason: d.status === "blocked" ? d.blocked_reason : null }).eq("company_id", companyId).eq("id", activityId);
    rpcError(error);
    revalidateCompany(ctx);
    return { ok: true, message: d.status === "done" ? "Marked done — completion criteria still need verifying" : "Saved" };
  });
}

/** Done is not complete: someone accountable confirms the completion criteria were met. */
export async function verifyActivity(companyId: string, activityId: string, met: boolean, note: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const { data: a } = await ctx.supabase.from("integration_activities").select("status, acquisition_id").eq("company_id", companyId).eq("id", activityId).single();
    if (!a || a.status !== "done") throw new ActionError("Only completed activities can be verified.");
    if (!met && note.trim().length < 3) throw new ActionError("Say which criteria are not met.");
    const { error } = await ctx.supabase.from("integration_activities").update({ criteria_met: met, evidence_note: note || null, ...(met ? {} : { status: "in_progress" }) }).eq("company_id", companyId).eq("id", activityId);
    rpcError(error);
    revalidateCompany(ctx);
    return { ok: true, message: met ? "Completion criteria verified" : "Reopened: criteria not met" };
  });
}

export async function approveActivity(companyId: string, activityId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { error } = await ctx.supabase.from("integration_activities").update({ approval_status: "approved" }).eq("company_id", companyId).eq("id", activityId).eq("approval_status", "pending");
    rpcError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Approval recorded" };
  });
}

export async function saveSynergy(companyId: string, acquisitionId: string, synergyId: string | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const d = z.object({
      category: z.enum(["revenue", "cross_sell", "cost", "procurement", "operational", "product", "technology", "capability", "other"]),
      description: zRequired("Description", 1000), unit: z.enum(["currency", "number", "percent"]), baseline: zNumber, target: zNumber.pipe(z.number({ message: "Target is required" })),
      measurement: z.enum(["annual_run_rate", "cumulative", "monthly"]), owner_crew_id: zOptionalUuid, evidence_source: z.string().trim().max(500).default(""),
      start_date: zDate, expected_realisation_date: zDate,
    }).parse(formObject(fd));
    const supporting = z.array(z.string().uuid()).max(30).parse(fd.getAll("supporting").map(String));
    const row = { ...d, baseline: d.baseline ?? 0, supporting_activity_ids: supporting };
    const { error } = synergyId
      ? await ctx.supabase.from("integration_synergies").update(row).eq("company_id", companyId).eq("id", synergyId)
      : await ctx.supabase.from("integration_synergies").insert({ ...row, company_id: companyId, acquisition_id: acquisitionId, key: `custom_${crypto.randomUUID().slice(0, 8)}` });
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Synergy saved" };
  });
}

export async function recordSynergyResult(companyId: string, synergyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const d = z.object({ period_start: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/), value: zNumber.pipe(z.number({ message: "Enter a value" })), kind: z.enum(["actual", "forecast"]), source: zRequired("Source of evidence", 300), note: zOptional(1000), verified: z.string().optional() }).parse(formObject(fd));
    const period = d.period_start.length === 7 ? `${d.period_start}-01` : d.period_start;
    const verified = d.kind === "actual" && d.verified === "on";
    if (verified && !ctx.can.admin) throw new ActionError("Only the CEO or a company administrator can mark a result verified.");
    const { error } = await ctx.supabase.from("synergy_actuals").upsert({ company_id: companyId, synergy_id: synergyId, period_start: period, value: d.value, kind: d.kind, source: d.source, note: d.note, verified }, { onConflict: "synergy_id,period_start,kind" });
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: d.kind === "forecast" ? "Forecast recorded (not counted as realised)" : verified ? "Verified result recorded" : "Result recorded — unverified until an administrator verifies it" };
  });
}

export async function verifySynergyResult(companyId: string, actualId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "admin");
    const { error } = await ctx.supabase.from("synergy_actuals").update({ verified: true }).eq("company_id", companyId).eq("id", actualId).eq("kind", "actual");
    dbError(error);
    revalidateCompany(ctx);
    return { ok: true, message: "Verified" };
  });
}

export async function startReview(companyId: string, acquisitionId: string): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    await integrationAgentOn(ctx);
    const { data: a } = await ctx.supabase.from("acquisitions").select("name, status").eq("company_id", companyId).eq("id", acquisitionId).single();
    if (!a || !["active", "completed"].includes(a.status)) throw new ActionError("Reviews run on integrations that are under way or complete.");
    const { data: open } = await ctx.supabase.from("integration_reviews").select("id").eq("company_id", companyId).eq("acquisition_id", acquisitionId).eq("status", "generating").maybeSingle();
    if (open) throw new ActionError("A review is already being prepared.");
    const id = crypto.randomUUID();
    const { error } = await ctx.supabase.from("integration_reviews").insert({ id, company_id: companyId, acquisition_id: acquisitionId, status: "generating" });
    dbError(error);
    await queue(ctx, "integration.review", `Post-integration review: ${a.name}`, "review", id, { acquisition_id: acquisitionId });
    revalidateCompany(ctx);
    return { ok: true, message: "The M&A Integration Agent is reviewing the integration", data: { id } };
  });
}
