import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { getCompanyContext, roleLabel } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/os/avatar";
import { CompanySettingsForm, InviteMemberDialog, MemberControls } from "@/components/admin/forms";
import { formatDate } from "@/lib/domain/format";
import { AgentDomain, DomainGrant } from "@/components/intelligence/access";
import { DOMAIN_LABEL, DOMAINS } from "@/lib/analytics/contracts";
import { AGENTS } from "@/lib/agents/registry";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can.admin) redirect(`/c/${slug}`);
  const cid = ctx.company.companyId;
  const [{ data: company }, { data: members }, { data: grants }, { data: source }, { data: agentCfgs }] = await Promise.all([
    ctx.supabase.from("companies").select("*").eq("id", cid).single(),
    ctx.supabase.from("company_memberships").select("user_id, role, created_at, profiles(full_name, email, title)").eq("company_id", cid).neq("role", "agent").order("created_at"),
    ctx.supabase.from("an_grants").select("user_id, domain").eq("company_id", cid),
    ctx.supabase.from("an_sources").select("label, is_synthetic").eq("company_id", cid).maybeSingle(),
    ctx.supabase.from("agent_configs").select("agent_key, enabled, data_domains").eq("company_id", cid).in("agent_key", ["ceo", "commercial"]),
  ]);
  if (!company) redirect("/");
  const settings = (company.settings ?? {}) as { max_three_year_outcomes?: number; priority_target?: number; max_priorities?: number };

  return (
    <div className="max-w-5xl">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
            {company.is_demo && <span className="text-xs text-muted-foreground">Demonstration company</span>}
          </CardHeader>
          <CardContent>
            <CompanySettingsForm
              companyId={cid}
              defaults={{
                ...company,
                max_three_year_outcomes: settings.max_three_year_outcomes ?? 5,
                priority_target: settings.priority_target ?? 3,
                max_priorities: settings.max_priorities ?? 5,
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <InviteMemberDialog companyId={cid} trigger={<Button size="sm"><UserPlus /> Invite</Button>} />
          </CardHeader>
          <div className="divide-y">
            {(members ?? []).map((m) => {
              const p = m.profiles as unknown as { full_name: string; email: string; title: string | null } | null;
              return (
                <div key={m.user_id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar name={p?.full_name ?? "?"} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{p?.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p?.email} · {roleLabel[m.role]} since {formatDate(m.created_at)}
                      </p>
                    </div>
                  </div>
                  <MemberControls companyId={cid} userId={m.user_id} role={m.role} isSelf={m.user_id === ctx.viewer.id} />
                </div>
              );
            })}
          </div>
        </Card>
        {source && (
          <Card>
            <CardHeader>
              <CardTitle>Revenue and Cost Intelligence access</CardTitle>
              <span className="text-xs text-muted-foreground">{source.label}</span>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">The CEO and administrators see every domain; assigned Omni staff see revenue, cost and aggregated people data. Everyone else sees only the domains granted here. The database enforces this for every query, export and agent.</p>
              <table className="w-full text-[13px]">
                <thead className="text-[11px] text-muted-foreground"><tr><th className="py-1 text-left font-medium">Person</th>{DOMAINS.map((d) => <th key={d} className="px-2 text-center font-medium">{DOMAIN_LABEL[d]}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {(members ?? []).map((m) => {
                    const p = m.profiles as unknown as { full_name: string } | null;
                    const all = m.role === "ceo" || m.role === "company_admin";
                    return (
                      <tr key={m.user_id}>
                        <td className="py-1.5">{p?.full_name} <span className="text-xs text-muted-foreground">({roleLabel[m.role]})</span></td>
                        {DOMAINS.map((d) => (
                          <td key={d} className="px-2 text-center">
                            {all || (m.role === "omni" && d !== "transactions") ? <span className="text-xs text-muted-foreground">by role</span> : <DomainGrant companyId={cid} userId={m.user_id} domain={d} granted={(grants ?? []).some((g) => g.user_id === m.user_id && g.domain === d)} label={`${DOMAIN_LABEL[d]} for ${p?.full_name}`} />}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {(agentCfgs ?? []).map((a) => (
                    <tr key={a.agent_key}>
                      <td className="py-1.5">{AGENTS[a.agent_key as "ceo"].name} <span className="text-xs text-muted-foreground">(agent{a.enabled ? "" : ", off"})</span></td>
                      {DOMAINS.map((d) => <td key={d} className="px-2 text-center"><AgentDomain companyId={cid} agent={a.agent_key} domain={d} domains={a.data_domains} label={`${DOMAIN_LABEL[d]} for ${AGENTS[a.agent_key as "ceo"].name}`} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
