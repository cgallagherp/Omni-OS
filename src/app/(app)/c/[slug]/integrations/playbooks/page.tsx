import type { Metadata } from "next";
import Link from "next/link";
import { getCompanyContext } from "@/lib/auth";
import { loadIntegrationHome } from "@/lib/data/integration";
import { formatDate } from "@/lib/domain/format";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/integration/controls";

export const metadata: Metadata = { title: "Integration playbooks" };

export default async function PlaybooksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const home = await loadIntegrationHome(ctx.supabase, ctx.company.companyId);
  const base = `/c/${slug}/integrations`;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Integrations"
        title="Master playbooks"
        description="Your company's approved integration templates. You can keep different playbooks for different kinds of acquisition; each says when it applies. Approved versions are frozen; changes create a new version that needs approval."
        actions={<Button asChild variant="brand" size="sm"><Link href={`${base}/knowledge`}>Generate Playbook with AI</Link></Button>}
      />
      {home.proposals.length > 0 && (
        <Card className="border-risk/40 p-4 text-[13px]">
          <p className="font-medium">{home.proposals.length} proposed improvement{home.proposals.length === 1 ? "" : "s"} from post-integration reviews await a decision</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">{home.proposals.map((p) => <li key={p.id}><Link className="hover:underline" href={`${base}/playbooks/${p.playbook_id}#improvements`}>{p.title}</Link></li>)}</ul>
        </Card>
      )}
      {home.playbooks.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {home.playbooks.map((p) => (
            <Card key={p.latest.lineage_id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`${base}/playbooks/${(p.approved ?? p.latest).id}`} className="text-[15px] font-semibold hover:underline">{p.latest.name}</Link>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{p.latest.applies_when || "—"}</p>
                </div>
                <StatusPill status={p.approved ? "approved" : p.latest.status} />
              </div>
              {p.latest.acquisition_types.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{p.latest.acquisition_types.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div>}
              <ul className="mt-3 divide-y border-t text-[12.5px]">
                {p.versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between py-1.5">
                    <Link href={`${base}/playbooks/${v.id}`} className="hover:underline">Version {v.version}</Link>
                    <span className="flex items-center gap-2 text-muted-foreground">{v.generator === "claude" ? "AI-generated" : v.generator === "rules" ? "Rule-based extraction" : v.generator === "revision" ? "Revision" : "Written by management"} · {v.status === "approved" ? `approved ${formatDate(v.approved_at)}` : v.status}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No playbooks yet" description="Generate your first master playbook from your integration documents." action={<Button asChild variant="brand"><Link href={`${base}/knowledge`}>Go to integration knowledge</Link></Button>} />
      )}
    </div>
  );
}
