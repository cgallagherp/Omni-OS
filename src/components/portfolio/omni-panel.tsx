import { Lock } from "lucide-react";
import type { Supabase } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/domain/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OmniNoteForm } from "./omni-note-form";

const LEVEL = { none: "No concerns", monitor: "Monitor", support: "Support", intervene: "Intervene" } as const;

/** Omni-only confidential panel. RLS returns nothing for company users even if rendered. */
export async function OmniPanel({ supabase, companyId, currency }: { supabase: Supabase; companyId: string; currency: string }) {
  const [{ data: ic }, { data: notes }] = await Promise.all([
    supabase.from("investment_cases").select("*").eq("company_id", companyId).maybeSingle(),
    supabase.from("omni_notes").select("*, profiles(full_name)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
  ]);
  return (
    <Card className="border-dashed border-brand/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Lock className="size-3.5 text-brand" /> Omni confidential
        </CardTitle>
        <span className="text-xs text-muted-foreground">Not visible to management</span>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div>
          {ic ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-muted-foreground">Entry EV</dt>
              <dd className="text-right tabular">{formatMoney(Number(ic.entry_ev), currency)} ({Number(ic.entry_multiple)}x)</dd>
              <dt className="text-muted-foreground">Target exit EV</dt>
              <dd className="text-right tabular">{formatMoney(Number(ic.target_exit_ev), currency)}</dd>
              <dt className="text-muted-foreground">Target MOIC / IRR</dt>
              <dd className="text-right tabular">
                {Number(ic.target_moic).toFixed(1)}x / {(Number(ic.target_irr) * 100).toFixed(0)}%
              </dd>
              <dt className="text-muted-foreground">Target exit</dt>
              <dd className="text-right">{formatDate(ic.target_exit_date)}</dd>
              <dt className="col-span-2 mt-1 text-muted-foreground">Internal thesis</dt>
              <dd className="col-span-2">{ic.internal_thesis}</dd>
              <dt className="col-span-2 mt-1 text-muted-foreground">Key risks</dt>
              <dd className="col-span-2">{ic.key_risks}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No investment case recorded.</p>
          )}
        </div>
        <div>
          <OmniNoteForm companyId={companyId} />
          <ul className="mt-3 space-y-2.5">
            {(notes ?? []).map((n) => (
              <li key={n.id} className="text-[13px]">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={n.intervention_level === "intervene" ? "off" : n.intervention_level === "support" ? "risk" : "outline"}>{LEVEL[n.intervention_level as keyof typeof LEVEL]}</Badge>
                  {(n.profiles as { full_name: string } | null)?.full_name} · {formatDate(n.created_at)}
                </div>
                <p className="mt-1">{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
