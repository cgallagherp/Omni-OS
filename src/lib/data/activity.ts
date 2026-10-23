import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import { STATUS_META } from "@/lib/domain/status";

export interface ActivityEntry {
  id: string;
  at: string;
  actor: string;
  kind: "comment" | "update" | "change" | "created" | "deleted";
  body?: string;
  changes?: Array<{ field: string; from: string; to: string }>;
}

const FIELD_LABEL: Record<string, string> = {
  status: "Status",
  progress: "Progress",
  owner_id: "Owner",
  title: "Title",
  description: "Description",
  due_date: "Due date",
  start_date: "Start date",
  measurable_outcome: "Measurable outcome",
  target_value: "Target",
  target_min: "Range minimum",
  target_max: "Range maximum",
  current_value: "Current value",
  value: "Value",
  target: "Period target",
  priority: "Priority",
  resolution: "Resolution",
  escalated_to_omni: "Escalated to Omni",
  annual_goal_id: "12-month objective",
  winning_move_id: "Three-Year Outcome",
  quarter_id: "Quarter",
  tolerance_pct: "Tolerance",
  direction: "Direction",
  name: "Name",
  archived: "Archived",
  note: "Note",
  is_key: "Shown on Blueprint",
  carried_from_id: "Carried over from",
  reports_to: "Reports to",
};
const HIDDEN = new Set(["id", "company_id", "sort_order", "entered_by", "created_by", "completed_at", "resolved_at", "source", "updated_by"]);

function show(v: unknown, field: string, names: Map<string, string>): string {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "status" && typeof v === "string" && v in STATUS_META) return STATUS_META[v as keyof typeof STATUS_META].label;
  if (field.endsWith("_id") && typeof v === "string") return names.get(v) ?? "another record";
  if (field === "progress") return `${v}%`;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v);
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}

/**
 * Combined audit trail and comments for one or more records. `tables` are audit
 * table names; `commentType` the comments entity type for the primary record.
 */
export async function loadActivity(
  supabase: Supabase,
  companyId: string,
  opts: { tables: string[]; ids: string[]; commentType?: string; commentId?: string; labelFor?: (table: string, row: Record<string, unknown>) => string | null },
): Promise<ActivityEntry[]> {
  if (!opts.ids.length) return [];
  const [audit, comments] = await Promise.all([
    supabase
      .from("audit_log")
      .select("*")
      .eq("company_id", companyId)
      .in("entity_type", opts.tables)
      .in("entity_id", opts.ids)
      .order("created_at", { ascending: false })
      .limit(200),
    opts.commentType && opts.commentId
      ? supabase.from("comments").select("*").eq("company_id", companyId).eq("entity_type", opts.commentType).eq("entity_id", opts.commentId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const actorIds = new Set<string>();
  for (const a of audit.data ?? []) if (a.actor_id) actorIds.add(a.actor_id);
  for (const c of comments.data ?? []) actorIds.add((c as { author_id: string }).author_id);
  const [{ data: profiles }, { data: crew }, { data: goals }, { data: moves }] = await Promise.all([
    actorIds.size ? supabase.from("profiles").select("id, full_name").in("id", [...actorIds]) : Promise.resolve({ data: [] }),
    supabase.from("crew_members").select("id, full_name").eq("company_id", companyId),
    supabase.from("annual_goals").select("id, title").eq("company_id", companyId),
    supabase.from("winning_moves").select("id, title").eq("company_id", companyId),
  ]);
  const people = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const names = new Map<string, string>([
    ...(crew ?? []).map((c) => [c.id, c.full_name] as [string, string]),
    ...(goals ?? []).map((g) => [g.id, g.title] as [string, string]),
    ...(moves ?? []).map((m) => [m.id, m.title] as [string, string]),
  ]);

  const entries: ActivityEntry[] = [];
  let systemLoads = 0;
  let systemLoadAt = "";
  for (const a of audit.data ?? []) {
    // Collapse bulk system loads (seed / integrations) into one entry
    if (a.action === "insert" && !a.actor_id && a.entity_type === "metric_values") {
      systemLoads += 1;
      systemLoadAt = systemLoadAt || a.created_at;
      continue;
    }
    const actor = a.actor_id ? (people.get(a.actor_id) ?? "A user") : "System (seed/import)";
    const changes = a.changes as Record<string, unknown>;
    const prefix = opts.labelFor?.(a.entity_type, changes) ?? null;
    if (a.action === "insert") {
      entries.push({ id: `a${a.id}`, at: a.created_at, actor, kind: "created", body: prefix ?? undefined });
    } else if (a.action === "delete") {
      entries.push({ id: `a${a.id}`, at: a.created_at, actor, kind: "deleted", body: prefix ?? undefined });
    } else {
      const list = Object.entries(changes)
        .filter(([k]) => !HIDDEN.has(k))
        .map(([k, v]) => {
          const d = v as { from: unknown; to: unknown };
          return { field: FIELD_LABEL[k] ?? k.replace(/_/g, " "), from: show(d.from, k, names), to: show(d.to, k, names) };
        });
      if (list.length) entries.push({ id: `a${a.id}`, at: a.created_at, actor, kind: "change", changes: list, body: prefix ?? undefined });
    }
  }
  if (systemLoads) entries.push({ id: "system-load", at: systemLoadAt, actor: "System (seed/import)", kind: "created", body: `${systemLoads} historical values loaded` });
  for (const c of (comments.data ?? []) as Array<{ id: string; created_at: string; author_id: string; body: string; kind: "comment" | "update" }>) {
    entries.push({ id: `c${c.id}`, at: c.created_at, actor: people.get(c.author_id) ?? "A user", kind: c.kind, body: c.body });
  }
  return entries.sort((x, y) => y.at.localeCompare(x.at));
}
