import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { DOC_TYPES } from "@/lib/integration/ingest";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Source document" };

/** The indexed passages of a document: citations link here, to the exact passage. */
export default async function SourcePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const { data: s } = await ctx.supabase.from("knowledge_sources").select("*").eq("company_id", cid).eq("id", id).maybeSingle();
  if (!s) notFound();
  const { data: chunks } = await ctx.supabase.from("knowledge_chunks").select("id, ordinal, heading, text, page").eq("company_id", cid).eq("source_id", id).order("ordinal");
  return (
    <div className="max-w-4xl space-y-4">
      <Link href={s.acquisition_id ? `/c/${slug}/integrations/${s.acquisition_id}?tab=documents` : `/c/${slug}/integrations/knowledge`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Back</Link>
      <div>
        <div className="flex items-center gap-2"><Badge variant="outline">{DOC_TYPES[s.doc_type as keyof typeof DOC_TYPES] ?? s.doc_type}</Badge>{s.restricted && <Badge variant="none"><Lock className="size-3" /> Confidential</Badge>}</div>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight">{s.title}</h1>
        <p className="text-sm text-muted-foreground">{s.filename} · {chunks?.length ?? 0} passages{s.status !== "ready" ? ` · ${s.error}` : ""}</p>
      </div>
      <Card className="divide-y">
        {(chunks ?? []).map((c) => (
          <section key={c.id} id={`p-${c.id}`} className="scroll-mt-20 px-4 py-3 target:bg-brand-subtle">
            {c.heading && <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{c.heading}</p>}
            <p className="whitespace-pre-line text-[13px] leading-relaxed">{c.text}</p>
          </section>
        ))}
      </Card>
    </div>
  );
}
