import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import { quarterLabel } from "@/lib/domain/quarters";
import type { CompanySnapshot } from "./snapshot";

export interface FormOptions {
  crew: Array<{ id: string; full_name: string; title: string; is_open_seat: boolean }>;
  priorities: Array<{ id: string; title: string }>;
  goals: Array<{ id: string; title: string }>;
  moves: Array<{ id: string; title: string }>;
  metrics: Array<{ id: string; title: string }>;
  issues: Array<{ id: string; title: string }>;
  quarters: Array<{ id: string; title: string }>;
}

/** Select options for entity forms, derived from a company snapshot. */
export async function formOptions(supabase: Supabase, snap: CompanySnapshot): Promise<FormOptions> {
  const { data: quarters } = await supabase
    .from("quarters")
    .select("id, year, quarter, status")
    .eq("company_id", snap.company.id)
    .in("status", ["active", "planning"])
    .order("start_date");
  return {
    crew: snap.crew.map((c) => ({ id: c.id, full_name: c.full_name, title: c.title, is_open_seat: c.is_open_seat })),
    priorities: snap.priorities.map((p) => ({ id: p.id, title: p.title })),
    goals: snap.annualGoals.map((g) => ({ id: g.id, title: g.title })),
    moves: snap.winningMoves.map((m) => ({ id: m.id, title: m.title })),
    metrics: snap.metrics.map((m) => ({ id: m.metric.id, title: m.metric.name })),
    issues: snap.openIssues.map((i) => ({ id: i.id, title: i.title })),
    quarters: (quarters ?? []).map((q) => ({ id: q.id, title: `${quarterLabel(q)}${q.status === "planning" ? " (planning)" : ""}` })),
  };
}
