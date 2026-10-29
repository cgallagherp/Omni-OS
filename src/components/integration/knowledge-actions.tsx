"use client";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuickAction } from "@/components/os/forms";
import { deleteKnowledge } from "@/lib/actions/integration";

export function DeleteKnowledgeButton({ companyId, id }: { companyId: string; id: string }) {
  const q = useQuickAction();
  return (
    <Button size="icon" variant="ghost" aria-label="Remove document" disabled={q.pending} onClick={() => confirm("Remove this document from the library? Approved playbooks keep their citations' text.") && q.run(() => deleteKnowledge(companyId, id))}>
      <Trash2 />
    </Button>
  );
}
