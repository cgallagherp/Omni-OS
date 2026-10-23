"use client";
import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { draftNarrative } from "@/lib/actions/assistant";
import type { SourceRef, TaskKey } from "@/lib/data/insights";

function withCitations(text: string, sources: Map<string, SourceRef>) {
  const parts = text.split(/(\[S\d+(?:,\s*S\d+)*\])/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[(S\d+(?:,\s*S\d+)*)\]$/);
    if (!m) return <Fragment key={i}>{p}</Fragment>;
    return (
      <span key={i} className="whitespace-nowrap">
        {m[1].split(/,\s*/).map((id) => {
          const s = sources.get(id);
          return s ? (
            <Link key={id} href={s.href} title={s.label} className="ml-0.5 rounded bg-muted px-1 text-[10.5px] font-medium text-muted-foreground align-super hover:bg-brand/15 hover:text-brand-ink">
              {id}
            </Link>
          ) : (
            <span key={id} className="ml-0.5 text-[10.5px] text-off-ink align-super" title="Unknown source">
              {id}?
            </span>
          );
        })}
      </span>
    );
  });
}

function Rendered({ text, sources }: { text: string; sources: Map<string, SourceRef> }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if (b.startsWith("## ")) return <h3 key={i} className="pt-1 text-[13px] font-semibold">{b.slice(3)}</h3>;
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s/.test(l) || l.startsWith("## ")))
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (l.startsWith("## ") ? <h3 key={j} className="-ml-5 pt-1 text-[13px] font-semibold list-none">{l.slice(3)}</h3> : <li key={j}>{withCitations(l.replace(/^\s*[-*•]\s/, ""), sources)}</li>))}
            </ul>
          );
        return (
          <p key={i}>
            {lines.map((l, j) => (l.startsWith("## ") ? <span key={j} className="block pt-1 font-semibold">{l.slice(3)}</span> : <Fragment key={j}>{withCitations(l, sources)} </Fragment>))}
          </p>
        );
      })}
    </div>
  );
}

export function AiDraft({ companyId, task, sources, enabled }: { companyId: string; task: TaskKey; sources: SourceRef[]; enabled: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ text: string; model: string } | null>(null);
  const map = new Map(sources.map((s) => [s.id, s]));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="brand"
          size="sm"
          disabled={!enabled || pending}
          onClick={() =>
            start(async () => {
              const r = await draftNarrative(companyId, task);
              if (r.ok) setResult(r.data!);
              else toast.error(r.error);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {result ? "Redraft" : "Draft narrative with AI"}
        </Button>
        {!enabled && <span className="text-xs text-muted-foreground">AI drafting is off — set <code>ANTHROPIC_API_KEY</code> on the server. The analysis below is generated from records without AI.</span>}
        {result && (
          <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(result.text); toast.success("Copied"); }}>
            <Copy /> Copy
          </Button>
        )}
      </div>
      {result && (
        <div className="mt-4 rounded-lg border border-brand/30 bg-[color-mix(in_oklch,var(--brand)_4%,var(--card))] p-4">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-brand-ink uppercase">AI draft · {result.model} · review before sharing</p>
          <Rendered text={result.text} sources={map} />
        </div>
      )}
    </div>
  );
}
