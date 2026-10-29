import { loadIntelligence } from "@/lib/data/intelligence";
import { EmptyState, PageHeader } from "@/components/os/page";
import { ModuleTabs } from "@/components/intelligence/tabs";
import { SyntheticBanner } from "@/components/intelligence/status";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/bridge", label: "ARR bridge" },
  { href: "/retention", label: "Retention" },
  { href: "/cohorts", label: "Cohorts" },
  { href: "/segments", label: "Segments" },
  { href: "/customers", label: "Customers" },
  { href: "/quality", label: "Data quality" },
  { href: "/definitions", label: "Definitions" },
];

export default async function RevenueLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = await loadIntelligence(slug);
  if (!i.src) {
    return (
      <div className="fade-in">
        <PageHeader eyebrow="Intelligence" title="Revenue Intelligence" />
        <EmptyState title="No governed data source connected" description="Revenue Intelligence reads governed ARR, customer and contract data from the company's data warehouse (Snowflake/dbt). It has not been connected for this company yet." />
      </div>
    );
  }
  if (!i.domains.includes("revenue")) {
    return (
      <div className="fade-in">
        <PageHeader eyebrow="Intelligence" title="Revenue Intelligence" />
        <EmptyState title="Restricted" description="Revenue and customer data is available to the CEO, company administrators, assigned Omni staff and people granted the revenue domain. Ask an administrator for access in Settings." />
      </div>
    );
  }
  return (
    <div className="fade-in">
      <ModuleTabs base={`/c/${slug}/revenue`} tabs={TABS} label="Revenue Intelligence" />
      {i.src.info.is_synthetic && <SyntheticBanner label={i.src.info.label} />}
      {children}
    </div>
  );
}
