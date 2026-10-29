// Ingest one document: extract text and structure, index it as passages for retrieval and
// citation, and record failures and unsupported files visibly rather than dropping them.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { chunkText, extractDocument, sha256 } from "./extract";

type Db = SupabaseClient<Database>;
export const DOC_TYPES = {
  playbook: "Integration playbook / policy",
  integration_plan: "Previous integration plan",
  checklist: "Integration checklist",
  diligence: "Due diligence report",
  ic_paper: "Investment committee paper",
  board_paper: "Board paper",
  meeting_notes: "Management meeting notes",
  sop: "Standard operating procedure",
  post_acquisition_review: "Post-acquisition review",
  lessons_learned: "Lessons learned",
  contract: "Contract / obligations",
  strategy: "Acquisition strategy",
  other: "Other",
} as const;
export type DocType = keyof typeof DOC_TYPES;

export interface IngestInput {
  companyId: string;
  acquisitionId?: string | null;
  title: string;
  filename: string;
  mime: string | null;
  bytes: Uint8Array;
  docType: DocType;
  origin: "upload" | "sharepoint" | "onedrive" | "google_drive" | "seed";
  restricted?: boolean;
  connectionId?: string | null;
  externalRef?: string | null;
}

export async function ingestDocument(db: Db, i: IngestInput): Promise<{ id: string; status: "ready" | "failed" | "unsupported"; error?: string; duplicate?: boolean; passages?: number }> {
  const hash = sha256(i.bytes);
  let dup = db.from("knowledge_sources").select("id, status").eq("company_id", i.companyId).eq("sha256", hash);
  dup = i.acquisitionId ? dup.eq("acquisition_id", i.acquisitionId) : dup.is("acquisition_id", null);
  const { data: existing } = await dup.maybeSingle();
  if (existing) return { id: existing.id, status: existing.status as "ready", duplicate: true };
  const ex = await extractDocument(i.bytes, i.filename, i.mime);
  const text = ex.status === "ready" ? ex.text : null;
  const { data: src, error } = await db
    .from("knowledge_sources")
    .insert({
      company_id: i.companyId, acquisition_id: i.acquisitionId ?? null, title: i.title.slice(0, 300), filename: i.filename.slice(0, 300), mime: i.mime, doc_type: i.docType,
      origin: i.origin, connection_id: i.connectionId ?? null, external_ref: i.externalRef ?? null, size_bytes: i.bytes.byteLength, sha256: hash,
      status: ex.status, error: ex.status === "ready" ? null : ex.error, text_content: text, page_count: ex.status === "ready" ? ex.pageCount : null, char_count: text?.length ?? null,
      restricted: Boolean(i.restricted),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (ex.status !== "ready") return { id: src.id, status: ex.status, error: ex.error };
  const chunks = chunkText(ex.text);
  for (let n = 0; n < chunks.length; n += 200) {
    const { error: ce } = await db.from("knowledge_chunks").insert(
      chunks.slice(n, n + 200).map((c) => ({ company_id: i.companyId, source_id: src.id, ordinal: c.ordinal, heading: c.heading, text: c.text, page: c.page, char_start: c.charStart, char_end: c.charEnd })),
    );
    if (ce) throw new Error(ce.message);
  }
  return { id: src.id, status: "ready", passages: chunks.length };
}
