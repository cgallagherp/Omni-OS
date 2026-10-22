"use client";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { InlineForm, SubmitButton } from "@/components/os/forms";
import { addOmniNote } from "@/lib/actions/omni";

export function OmniNoteForm({ companyId }: { companyId: string }) {
  return (
    <InlineForm action={(fd) => addOmniNote(companyId, fd)}>
      {({ pending }) => (
        <div className="grid gap-2">
          <Textarea name="body" rows={2} placeholder="Operating partner note…" required />
          <div className="flex gap-2">
            <NativeSelect name="intervention_level" defaultValue="monitor" className="h-7 w-40 text-xs">
              <option value="none">No concerns</option>
              <option value="monitor">Monitor</option>
              <option value="support">Support</option>
              <option value="intervene">Intervene</option>
            </NativeSelect>
            <SubmitButton pending={pending} size="sm" variant="outline">
              Add note
            </SubmitButton>
          </div>
        </div>
      )}
    </InlineForm>
  );
}
