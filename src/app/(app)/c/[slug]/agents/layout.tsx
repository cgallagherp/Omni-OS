import { getCompanyContext } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/os/page";
import { AgentsTabs } from "@/components/agents/agents-tabs";

const SUPERVISORS = ["omni", "ceo", "company_admin", "executive"];

export default async function AgentsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!SUPERVISORS.includes(ctx.company.role)) {
    return (
      <div className="fade-in">
        <PageHeader eyebrow="Agents" title="Agent Control Centre" />
        <EmptyState title="Restricted" description="The Agent Control Centre is available to company leadership and Omni." />
      </div>
    );
  }
  const { count } = await ctx.supabase.from("agent_approvals").select("id", { count: "exact", head: true }).eq("company_id", ctx.company.companyId).eq("status", "pending");
  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Agents"
        title="Agent Control Centre"
        description="Five agents work across the North Star, Flight Plan, Crew, Mission Control and integrations: they investigate, act within the authority management delegates, and follow through. What they found, what they did, what needs your decision, and what happened as a result."
      />
      <AgentsTabs base={`/c/${slug}/agents`} pending={count ?? 0} admin={ctx.can.admin} />
      {children}
    </div>
  );
}
