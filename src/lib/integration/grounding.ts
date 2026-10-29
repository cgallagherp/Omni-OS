// Source grounding: every citation must point at a passage that was actually supplied and
// the quote must appear in it. Unverifiable citations are dropped; an "established" or
// "inferred" item left with no verified citation is demoted to an AI recommendation, so
// generic advice can never be presented as company practice.
import { enforceHumanOnly, type Citation, type PlaybookContent } from "./schema";

export interface SourceChunk {
  id: string;
  source_id: string;
  source_title: string;
  doc_type: string;
  heading: string | null;
  text: string;
  ordinal: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9£%]+/g, " ").trim();
const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length > 1);

/** A quote is supported if it appears (normalised) in the chunk, or 85% of its words do, in order. */
export function quoteSupported(quote: string, chunkText: string) {
  const q = norm(quote);
  const c = norm(chunkText);
  if (!q) return false;
  if (c.includes(q)) return true;
  const qt = tokens(quote);
  if (qt.length < 4) return false;
  const ct = tokens(chunkText);
  let i = 0;
  let hit = 0;
  for (const t of qt) {
    const at = ct.indexOf(t, i);
    if (at >= 0) {
      hit++;
      i = at + 1;
    }
  }
  return hit / qt.length >= 0.85;
}

export function verifyCitations(cites: Citation[], byId: Map<string, SourceChunk>) {
  const ok: Citation[] = [];
  let rejected = 0;
  for (const c of cites) {
    const ch = c.chunk_id ? byId.get(c.chunk_id) : undefined;
    if (ch && ch.source_id === c.source_id && quoteSupported(c.quote, ch.text)) ok.push({ ...c, source_title: ch.source_title });
    else rejected++;
  }
  return { ok, rejected };
}

/** Verify every citation in a playbook; demote unsupported practice to a recommendation. */
export function groundPlaybook(content: PlaybookContent, chunks: SourceChunk[]): PlaybookContent {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  let checked = 0;
  let rejected = 0;
  let demoted = 0;
  const check = <T extends { citations: Citation[]; basis?: string }>(item: T): T => {
    checked += item.citations.length;
    const v = verifyCitations(item.citations, byId);
    rejected += v.rejected;
    const out = { ...item, citations: v.ok };
    if (item.basis && item.basis !== "recommended" && v.ok.length === 0) {
      demoted++;
      return { ...out, basis: "recommended" };
    }
    return out;
  };
  const workstreams = content.workstreams.map((w) => {
    const ws = check(w);
    return {
      ...ws,
      decision: ws.basis === "recommended" ? ws.decision : ("accepted" as const),
      activities: w.activities.map((a) => {
        const g = enforceHumanOnly(check(a));
        const demotedNow = a.basis !== "recommended" && g.basis === "recommended";
        return {
          ...g,
          decision: g.basis === "recommended" ? (demotedNow ? ("pending" as const) : g.decision) : ("accepted" as const),
          rationale: demotedNow ? `Not supported by a verifiable passage in the selected documents, so shown as a recommendation. ${g.rationale}`.trim() : g.rationale,
        };
      }),
    };
  });
  // dependencies must point at activities that exist
  const keys = new Set(workstreams.flatMap((w) => w.activities.map((a) => a.key)));
  for (const w of workstreams) for (const a of w.activities) a.depends_on = a.depends_on.filter((d) => keys.has(d) && d !== a.key);
  const conflicts = content.conflicts.map((c) => ({ ...c, positions: c.positions.map((p) => ({ ...p, citations: verifyCitations(p.citations, byId).ok })) }));
  return {
    ...content,
    philosophy: content.philosophy.map(check),
    acquisition_types: content.acquisition_types.map(check),
    workstreams,
    risks: content.risks.map(check),
    kpis: content.kpis.map(check),
    synergy_rules: content.synergy_rules.map(check),
    conflicts,
    lessons: content.lessons.map((l) => ({ ...l, citations: verifyCitations(l.citations, byId).ok })).filter((l) => l.citations.length > 0),
    stats: { sources: new Set(chunks.map((c) => c.source_id)).size, chunks: chunks.length, citations_checked: checked, citations_rejected: rejected, demoted },
  };
}

/** Plain-text rendering of passages for a model prompt, with stable ids. */
export function passagesForPrompt(chunks: SourceChunk[]) {
  const ids = new Map<string, string>();
  const lines: string[] = [];
  let lastSource = "";
  chunks.forEach((c, i) => {
    const pid = `P${i + 1}`;
    ids.set(pid, c.id);
    if (c.source_id !== lastSource) {
      lines.push(`\n=== DOCUMENT: "${c.source_title}" (type: ${c.doc_type}) ===`);
      lastSource = c.source_id;
    }
    lines.push(`[${pid}]${c.heading ? ` (section: ${c.heading})` : ""}\n${c.text}`);
  });
  return { text: lines.join("\n"), ids };
}
