import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, FileText, Lightbulb } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { loadPlaybook } from "@/lib/data/integration";
import { describeChange, changeOp } from "@/lib/integration/learning";
import { formatDate, formatDateTime } from "@/lib/domain/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChangeProposalActions, GenerationWatch, RevisePlaybookButton, StatusPill } from "@/components/integration/controls";
import { PlaybookEditor } from "@/components/integration/playbook-editor";

export const metadata: Metadata = { title: "Integration playbook" };

export default async function PlaybookPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const d = await loadPlaybook(ctx.supabase, cid, id);
  if (!d) notFound();
  const { pb, content } = d;
  const base = `/c/${slug}/integrations`;
  const pending = d.proposals.filter((p) => p.status === "pending");
  return (
    <div className="space-y-4">
      <Link href={`${base}/playbooks`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Playbooks</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StatusPill status={pb.status} />
            <Badge variant="outline">Version {pb.version}</Badge>
            <Badge variant="outline">{pb.generator === "claude" ? `AI-generated${pb.model ? ` · ${pb.model}` : ""}` : pb.generator === "rules" ? "Rule-based extraction (no AI provider)" : pb.generator === "revision" ? "Revision" : "Written by management"}</Badge>
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight">{pb.name}</h1>
          {pb.generation_note && <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">{pb.generation_note}</p>}
          {pb.status === "approved" && <p className="mt-1 text-[13px] text-on-ink">Approved by {d.approverName ?? "management"} on {formatDate(pb.approved_at)}{pb.approval_note ? ` — “${pb.approval_note}”` : ""}. This is the company&apos;s authoritative template.</p>}
        </div>
        {pb.status === "approved" && ctx.can.admin && <RevisePlaybookButton companyId={cid} slug={slug} playbookId={pb.id} />}
      </div>

      <GenerationWatch active={pb.status === "generating"} label="The M&A Integration Agent is analysing the selected documents and drafting the playbook" />
      {pb.status === "failed" && <Card className="border-off/50 p-4 text-sm text-off-ink">{pb.generation_note ?? "Generation failed."}</Card>}

      {pending.length > 0 && (
        <section id="improvements" className="scroll-mt-20 space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="size-4 text-risk-ink" /> Proposed improvements from post-integration reviews</h2>
          {pending.map((p) => {
            const op = changeOp.safeParse(p.change);
            return (
              <Card key={p.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2"><p className="text-[13.5px] font-medium">{p.title}</p><Badge variant="risk">Awaiting decision</Badge></div>
                <p className="text-[13px]">{p.what_happened}</p>
                {op.success && content && <p className="rounded-md bg-muted/40 px-2.5 py-1.5 text-[13px]"><span className="text-muted-foreground">Proposed change:</span> {describeChange(op.data, content)}</p>}
                <p className="text-[13px]"><span className="text-muted-foreground">Expected benefit:</span> {p.expected_benefit} <span className="text-muted-foreground">· Applies to: {p.applies_to}</span></p>
                <ul className="space-y-1">
                  {(p.evidence as Array<{ kind: string; text: string; source_id?: string; chunk_id?: string; source_title?: string }>).map((e, i) => (
                    <li key={i} className="rounded-md border-l-2 border-brand/50 bg-muted/40 px-2.5 py-1.5 text-[12.5px]">
                      {e.text}
                      {e.source_id && <Link href={`${base}/knowledge/${e.source_id}${e.chunk_id ? `#p-${e.chunk_id}` : ""}`} className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><FileText className="size-3" /> {e.source_title}</Link>}
                    </li>
                  ))}
                </ul>
                {ctx.can.admin && <ChangeProposalActions companyId={cid} slug={slug} proposalId={p.id} />}
              </Card>
            );
          })}
        </section>
      )}

      {content && pb.status !== "generating" && (
        <PlaybookEditor
          companyId={cid}
          slug={slug}
          playbook={{ id: pb.id, name: pb.name, version: pb.version, status: pb.status, applies_when: pb.applies_when, acquisition_types: pb.acquisition_types, updated_at: pb.updated_at }}
          initial={content}
          canEdit={ctx.can.write}
          canApprove={ctx.can.admin}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Version history</p>
          <ul className="divide-y text-[13px]">
            {d.versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-1.5">
                <Link href={`${base}/playbooks/${v.id}`} className={v.id === pb.id ? "font-semibold" : "hover:underline"}>Version {v.version}</Link>
                <span className="text-xs text-muted-foreground">{v.status}{v.approved_at ? ` · approved ${formatDate(v.approved_at)}` : ` · ${formatDateTime(v.created_at)}`}{v.change_summary ? ` · ${v.change_summary}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Documents analysed</p>
          <ul className="space-y-1 text-[13px]">
            {d.sources.map((s) => <li key={s.id}><Link href={`${base}/knowledge/${s.id}`} className="inline-flex items-center gap-1.5 hover:underline"><FileText className="size-3.5 text-muted-foreground" /> {s.title}</Link></li>)}
            {!d.sources.length && <li className="text-muted-foreground">None (written or revised by management).</li>}
          </ul>
          {d.run && <Link href={`/c/${slug}/agents/investigations/${d.run.id}`} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Bot className="size-3.5" /> Agent record of this generation</Link>}
        </Card>
      </div>
    </div>
  );
}
