import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { claudeConfigured } from "@/lib/integration/claude";
import { DOC_TYPES } from "@/lib/integration/ingest";
import { formatDate } from "@/lib/domain/format";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GeneratePlaybookDialog, KnowledgeUploader, StoreBrowser } from "@/components/integration/controls";
import { DeleteKnowledgeButton } from "@/components/integration/knowledge-actions";

export const metadata: Metadata = { title: "Integration knowledge" };

export default async function KnowledgePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const [{ data: sources }, { data: conns }, { data: lineages }, { data: cfg }] = await Promise.all([
    ctx.supabase.from("knowledge_sources").select("id, title, filename, doc_type, origin, status, error, restricted, char_count, page_count, created_at").eq("company_id", cid).is("acquisition_id", null).order("created_at", { ascending: false }),
    ctx.supabase.from("integration_connections").select("id, provider, display_name, status").eq("company_id", cid).in("provider", ["sharepoint", "onedrive", "google_drive"]),
    ctx.supabase.from("integration_playbooks").select("lineage_id, name, version").eq("company_id", cid).in("status", ["approved", "superseded"]).order("version", { ascending: false }),
    ctx.supabase.from("agent_configs").select("enabled, allow_external_ai").eq("company_id", cid).eq("agent_key", "integration").maybeSingle(),
  ]);
  const ready = (sources ?? []).filter((s) => s.status === "ready");
  const uniqueLineages = [...new Map((lineages ?? []).map((l) => [l.lineage_id, { id: l.lineage_id, name: l.name }])).values()];
  const aiEnabled = Boolean(cfg?.allow_external_ai) && claudeConfigured();
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Integrations"
        title="Integration knowledge"
        description="The documents your company integrates acquisitions by: playbooks, previous plans and checklists, reviews, lessons, diligence and Board papers. Only documents you select are analysed."
        actions={ctx.can.write && (
          cfg?.enabled ? (
            <GeneratePlaybookDialog companyId={cid} slug={slug} sources={ready} lineages={uniqueLineages} aiEnabled={aiEnabled} trigger={<Button variant="brand" size="sm" disabled={!ready.length}><Sparkles /> Generate Playbook with AI</Button>} />
          ) : (
            <Button asChild variant="outline" size="sm"><Link href={`/c/${slug}/agents/settings?agent=integration`}>Enable the M&A Integration Agent to generate playbooks</Link></Button>
          )
        )}
      />
      {ctx.can.write && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Add documents</CardTitle>
            <div className="flex flex-wrap gap-2">
              {(conns ?? []).filter((c) => c.status === "connected").map((c) => ctx.can.admin && <StoreBrowser key={c.id} companyId={cid} connectionId={c.id} name={c.display_name} />)}
              {ctx.can.admin && !(conns ?? []).length && <Link href={`/c/${slug}/agents/settings?agent=integration`} className="text-xs text-muted-foreground hover:text-foreground">Connect SharePoint, OneDrive or Google Drive →</Link>}
            </div>
          </CardHeader>
          <CardContent><KnowledgeUploader companyId={cid} canRestrict={ctx.can.admin} defaultType="integration_plan" /></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Library · {sources?.length ?? 0} documents</CardTitle></CardHeader>
        {sources?.length ? (
          <table className="w-full text-[13px]" data-testid="knowledge-table">
            <thead className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><tr>{["Document", "Type", "Source", "Status", "Size", "Added", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2"><Link href={`/c/${slug}/integrations/knowledge/${s.id}`} className="font-medium hover:underline">{s.title}</Link>{s.restricted && <Lock className="ml-1.5 inline size-3 text-muted-foreground" aria-label="Confidential" />}<span className="block text-xs text-muted-foreground">{s.filename}</span></td>
                  <td className="px-3 py-2">{DOC_TYPES[s.doc_type as keyof typeof DOC_TYPES] ?? s.doc_type}</td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">{s.origin.replace("_", " ")}</td>
                  <td className="px-3 py-2">{s.status === "ready" ? <Badge variant="on">Indexed</Badge> : <Badge variant={s.status === "unsupported" ? "none" : "off"} title={s.error ?? ""}>{s.status === "unsupported" ? "Unsupported" : "Failed"}</Badge>}{s.error && <span className="block text-xs text-muted-foreground">{s.error}</span>}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular">{s.char_count ? `${Math.round(s.char_count / 1000)}k chars` : "—"}{s.page_count ? ` · ${s.page_count} pages` : ""}</td>
                  <td className="px-3 py-2 text-xs tabular">{formatDate(s.created_at)}</td>
                  <td className="px-3 py-2 text-right">{ctx.can.admin && <DeleteKnowledgeButton companyId={cid} id={s.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <CardContent><EmptyState title="No documents yet" description="Upload previous integration plans, checklists, reviews and lessons learned to begin." /></CardContent>
        )}
      </Card>
    </div>
  );
}
