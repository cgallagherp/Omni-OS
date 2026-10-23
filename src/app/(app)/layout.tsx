import { requireViewer } from "@/lib/auth";
import { AppShell } from "@/components/os/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  return (
    <AppShell
      viewer={{
        fullName: viewer.fullName,
        email: viewer.email,
        title: viewer.title,
        isOmniStaff: viewer.isOmniStaff,
        isPlatformAdmin: viewer.isPlatformAdmin,
        companies: viewer.companies.map((c) => ({ slug: c.slug, name: c.name, brandColor: c.brandColor, role: c.role, isDemo: c.isDemo, sector: c.sector, branding: { primary: c.branding.primary, secondary: c.branding.secondary, accent: c.branding.accent, logoUrl: c.branding.logoUrl } })),
      }}
    >
      {children}
    </AppShell>
  );
}
