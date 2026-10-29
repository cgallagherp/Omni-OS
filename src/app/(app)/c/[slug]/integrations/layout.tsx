import { getCompanyContext } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/os/page";
import { IntegrationTabs } from "@/components/integration/tabs";

const LEADERSHIP = ["omni", "ceo", "company_admin", "executive"];

export default async function IntegrationsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!LEADERSHIP.includes(ctx.company.role)) {
    return (
      <div className="fade-in">
        <PageHeader eyebrow="Integrations" title="M&A integration" />
        <EmptyState title="Restricted" description="Integrations are available to company leadership and Omni. Transaction information is not shared more widely." />
      </div>
    );
  }
  const { count } = await ctx.supabase.from("playbook_change_proposals").select("id", { count: "exact", head: true }).eq("company_id", ctx.company.companyId).eq("status", "pending");
  return (
    <div className="fade-in">
      <IntegrationTabs base={`/c/${slug}/integrations`} proposals={count ?? 0} />
      {children}
    </div>
  );
}
