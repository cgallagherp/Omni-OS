import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { getCompanyContext, roleLabel } from "@/lib/auth";
import { PageHeader } from "@/components/os/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/os/avatar";
import { CompanySettingsForm, InviteMemberDialog, MemberControls } from "@/components/admin/forms";
import { formatDate } from "@/lib/domain/format";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can.admin) redirect(`/c/${slug}`);
  const cid = ctx.company.companyId;
  const [{ data: company }, { data: members }] = await Promise.all([
    ctx.supabase.from("companies").select("*").eq("id", cid).single(),
    ctx.supabase.from("company_memberships").select("user_id, role, created_at, profiles(full_name, email, title)").eq("company_id", cid).order("created_at"),
  ]);
  if (!company) redirect("/");
  const settings = (company.settings ?? {}) as { max_winning_moves?: number };

  return (
    <div className="fade-in max-w-5xl">
      <PageHeader eyebrow="Settings" title={`${company.name} settings`} description="Company profile, operating rules and who has access." />
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
            {company.is_demo && <span className="text-xs text-muted-foreground">Demonstration company</span>}
          </CardHeader>
          <CardContent>
            <CompanySettingsForm
              companyId={cid}
              defaults={{ ...company, max_winning_moves: settings.max_winning_moves ?? 5 }}
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
      </div>
    </div>
  );
}
