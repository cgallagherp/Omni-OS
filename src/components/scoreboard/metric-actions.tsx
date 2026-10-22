"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { archiveMetric } from "@/lib/actions/metrics";

export function ArchiveMetricButton({ companyId, metricId, slug }: { companyId: string; metricId: string; slug: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("Archive this KPI? Its history is kept but it will no longer appear on the Scoreboard.")) return;
        start(async () => {
          const r = await archiveMetric(companyId, metricId);
          if (r.ok) {
            toast.success("KPI archived");
            router.push(`/c/${slug}/scoreboard`);
          } else toast.error(r.error);
        });
      }}
    >
      <Archive /> Archive
    </Button>
  );
}
