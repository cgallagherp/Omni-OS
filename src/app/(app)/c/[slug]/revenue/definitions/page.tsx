import type { Metadata } from "next";
import { loadIntelligence } from "@/lib/data/intelligence";
import { PageHeader } from "@/components/os/page";
import { DefinitionsView } from "@/components/intelligence/definitions";

export const metadata: Metadata = { title: "Revenue definitions" };

export default async function RevenueDefinitions({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = await loadIntelligence(slug);
  const defs = (await i.src!.definitions()).filter((d) => d.domain === "revenue");
  const history = new Map(await Promise.all(defs.map(async (d) => [d.key, await i.src!.definitionHistory(d.key)] as const)));
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Revenue Intelligence" title="Metric definitions" description="Governed, versioned metric contracts. In production these definitions live with the dbt models; every figure in this module refers to one of them." />
      <DefinitionsView defs={defs} history={history} canAdmin={i.ctx.can.admin} companyId={i.ctx.company.companyId} />
    </div>
  );
}
