import type { Metadata } from "next";
import { loadIntelligence } from "@/lib/data/intelligence";
import { PageHeader } from "@/components/os/page";
import { DefinitionsView } from "@/components/intelligence/definitions";

export const metadata: Metadata = { title: "Cost definitions" };

export default async function CostDefinitions({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = await loadIntelligence(slug);
  const defs = (await i.src!.definitions()).filter((d) => d.domain === "cost" || (d.domain === "people" && i.domains.includes("people")));
  const history = new Map(await Promise.all(defs.map(async (d) => [d.key, await i.src!.definitionHistory(d.key)] as const)));
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Cost Intelligence" title="Metric definitions" description="Governed, versioned definitions for profitability, cost and people metrics. P&L classifications come from the company's chart of accounts, not from Omni OS." />
      <DefinitionsView defs={defs} history={history} canAdmin={false} companyId={i.ctx.company.companyId} />
    </div>
  );
}
