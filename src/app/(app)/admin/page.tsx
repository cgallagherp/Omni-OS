import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/os/page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyMark } from "@/components/os/logo";
import { NewCompanyDialog, OmniAssignmentToggle } from "@/components/admin/forms";
import { formatDate } from "@/lib/domain/format";
import { TEMPLATES } from "@/lib/domain/templates";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage() {
  const viewer = await requireViewer();
  if (!viewer.isPlatformAdmin) redirect("/");
  const supabase = await createClient();
  const [{ data: companies }, { data: staff }, { data: memberships }] = await Promise.all([
    supabase.from("companies").select("*").order("name"),
    supabase.from("profiles").select("id, full_name, email, title, platform_role").not("platform_role", "is", null).order("full_name"),
    supabase.from("company_memberships").select("company_id, user_id, role"),
  ]);
  const count = (cid: string) => (memberships ?? []).filter((m) => m.company_id === cid && m.role !== "omni").length;
  const isAssigned = (cid: string, uid: string) => (memberships ?? []).some((m) => m.company_id === cid && m.user_id === uid && m.role === "omni");

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Platform administration"
        description="Portfolio companies, Omni team access and onboarding templates."
        actions={<NewCompanyDialog trigger={<Button size="sm"><Building2 /> Onboard company</Button>} />}
      />
      <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1.3fr_1fr]">
        <Card className="overflow-x-auto">
          <CardHeader>
            <CardTitle>Omni team access</CardTitle>
            <span className="text-xs text-muted-foreground">Explicit assignment per company</span>
          </CardHeader>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">Person</th>
                {(companies ?? []).map((c) => (
                  <th key={c.id} className="px-3 py-2 text-center font-medium">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(staff ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.title} · {s.platform_role === "platform_admin" ? "Platform admin (all companies)" : "Omni team"}
                    </p>
                  </td>
                  {(companies ?? []).map((c) => (
                    <td key={c.id} className="px-3 py-2.5 text-center">
                      {s.platform_role === "platform_admin" ? <span className="text-xs text-muted-foreground">All</span> : <OmniAssignmentToggle companyId={c.id} userId={s.id} assigned={isAssigned(c.id, s.id)} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Portfolio companies</CardTitle>
          </CardHeader>
          <div className="divide-y">
            {(companies ?? []).map((c) => (
              <Link key={c.id} href={`/c/${c.slug}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                <CompanyMark name={c.name} color={c.brand_color} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.sector} · {count(c.id)} company users · since {formatDate(c.acquired_on)}
                  </p>
                </div>
                {c.is_demo && <Badge variant="brand">Demo</Badge>}
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Omni onboarding templates</CardTitle>
        </CardHeader>
        <div className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
          {TEMPLATES.map((t) => (
            <div key={t.key} className="px-4 py-3">
              <p className="text-[13px] font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.description}</p>
              <ul className="mt-2 flex flex-wrap gap-1">
                {t.metrics.map((m) => (
                  <li key={m.name}>
                    <Badge variant="outline">{m.name}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
