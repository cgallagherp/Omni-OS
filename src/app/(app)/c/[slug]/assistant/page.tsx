import type { Metadata } from "next";
import Link from "next/link";
import { Lightbulb, ShieldCheck } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { buildBrief, TASKS, type TaskKey } from "@/lib/data/insights";
import { formatDateTime } from "@/lib/domain/format";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiDraft } from "@/components/assistant/ai-draft";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ task?: string }> }) {
  const { slug } = await params;
  const { task: t } = await searchParams;
  const task = (TASKS.find((x) => x.key === t)?.key ?? "performance") as TaskKey;
  const ctx = await getCompanyContext(slug);
  const snap = await loadCompanySnapshot(ctx.supabase, ctx.company.companyId);
  if (!snap) return null;
  const brief = await buildBrief(ctx.supabase, snap, task);
  const sourceById = new Map(brief.sources.map((s) => [s.id, s]));

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Assistant"
        title="Operating analyst"
        description="Analysis of this company's plan, KPIs, meetings and actions. Facts link to their source records; recommendations are labelled as suggestions."
      />
      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[240px_1fr]">
        <nav className="space-y-0.5">
          {TASKS.map((x) => (
            <Link key={x.key} href={`/c/${slug}/assistant?task=${x.key}`} className={cn("block rounded-md px-2.5 py-2 text-[13px]", x.key === task ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              {x.label}
            </Link>
          ))}
          <div className="mt-4 rounded-lg border bg-card p-3 text-xs text-muted-foreground">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <ShieldCheck className="size-3.5 text-on" /> Permission-scoped
            </p>
            Built only from records you can access in {snap.company.name}. Omni-confidential data is never included.
          </div>
        </nav>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{brief.title}</CardTitle>
              <span className="text-xs text-muted-foreground">Generated {formatDateTime(brief.generatedAt)}</span>
            </CardHeader>
            <CardContent className="space-y-6">
              <AiDraft companyId={ctx.company.companyId} task={task} sources={brief.sources} enabled={Boolean(process.env.ANTHROPIC_API_KEY)} />
              {brief.sections.map((s) => (
                <section key={s.title}>
                  <h3 className="mb-2 text-sm font-semibold">{s.title}</h3>
                  <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">From the records</p>
                  <ul className="space-y-1.5 text-[13.5px] leading-relaxed">
                    {s.facts.map((f, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/40" />
                        <span>
                          {f.text}
                          {f.sources.map((id) => {
                            const src = sourceById.get(id);
                            return src ? (
                              <Link key={id} href={src.href} title={src.label} className="ml-1 rounded bg-muted px-1 text-[10.5px] font-medium text-muted-foreground align-super hover:bg-brand/15 hover:text-brand">
                                {id}
                              </Link>
                            ) : null;
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {s.recommendations.length > 0 && (
                    <div className="mt-3 rounded-md border border-dashed bg-muted/30 p-3">
                      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                        <Lightbulb className="size-3.5 text-risk" /> Suggested — judgement, not fact
                      </p>
                      <ul className="list-disc space-y-1 pl-4 text-[13px]">
                        {s.recommendations.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sources</CardTitle>
              <span className="text-xs text-muted-foreground">{brief.sources.length} records</span>
            </CardHeader>
            <div className="grid gap-x-4 px-4 py-3 text-[13px] sm:grid-cols-2">
              {brief.sources.map((s) => (
                <Link key={s.id} href={s.href} className="flex min-w-0 items-center gap-2 py-1 hover:underline">
                  <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">{s.id}</span>
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">{s.type.replace("_", " ")}</span>
                  <span className="truncate">{s.label}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
