import { redirect } from "next/navigation";
import { getCompanyContext } from "@/lib/auth";
import { PageHeader } from "@/components/os/page";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can.admin) redirect(`/c/${slug}`);
  return (
    <div className="fade-in max-w-6xl">
      <PageHeader eyebrow="Settings" title={`${ctx.company.name} settings`} description="Company profile, operating rules, access and appearance. Only the CEO, company administrators and Omni can change these." />
      <SettingsTabs base={`/c/${slug}/settings`} />
      {children}
    </div>
  );
}
