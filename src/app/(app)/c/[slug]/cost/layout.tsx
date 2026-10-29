import { loadIntelligence } from "@/lib/data/intelligence";
import { EmptyState, PageHeader } from "@/components/os/page";
import { ModuleTabs } from "@/components/intelligence/tabs";
import { SyntheticBanner } from "@/components/intelligence/status";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/trends", label: "Trends" },
  { href: "/analysis", label: "Budget vs actual" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/bridges", label: "Profit bridges" },
  { href: "/people", label: "People & productivity" },
  { href: "/quality", label: "Data quality" },
  { href: "/definitions", label: "Definitions" },
];

export default async function CostLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = await loadIntelligence(slug);
  if (!i.src) {
    return (
      <div className="fade-in">
        <PageHeader eyebrow="Intelligence" title="Cost Intelligence" />
        <EmptyState title="No governed data source connected" description="Cost Intelligence reads governed ARR, customer and contract data from the company's data warehouse (Snowflake/dbt). It has not been connected for this company yet." />
      </div>
    );
  }
  if (!i.domains.includes("cost")) {
    return (
      <div className="fade-in">
        <PageHeader eyebrow="Intelligence" title="Cost Intelligence" />
        <EmptyState title="Restricted" description="Cost and profitability data is available to the CEO, company administrators, assigned Omni staff and people granted the cost domain. Ask an administrator for access in Settings." />
      </div>
    );
  }
  return (
    <div className="fade-in">
      <ModuleTabs base={`/c/${slug}/cost`} tabs={TABS} label="Cost Intelligence" />
      {i.src.info.is_synthetic && <SyntheticBanner label={i.src.info.label} />}
      {children}
    </div>
  );
}
