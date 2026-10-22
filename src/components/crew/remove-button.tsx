"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removeCrewMember } from "@/lib/actions/crew";

export function RemoveCrewButton({ companyId, id, slug }: { companyId: string; id: string; slug: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("Remove this person from the accountability chart?")) return;
        start(async () => {
          const r = await removeCrewMember(companyId, id);
          if (r.ok) {
            toast.success("Removed");
            router.push(`/c/${slug}/crew`);
          } else toast.error(r.error);
        });
      }}
    >
      <Trash2 /> Remove
    </Button>
  );
}
