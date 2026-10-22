"use client";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormDialog } from "@/components/os/forms";
import type { CrewOption } from "@/components/os/entity-forms";
import { scheduleMeeting, startAdHocMeeting, startMeeting } from "@/lib/actions/meetings";

export function StartMeetingButton({ companyId, meetingId, label = "Start meeting", size = "default", href }: { companyId: string; meetingId: string; label?: string; size?: "default" | "sm" | "lg"; href?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="brand"
      size={size}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await startMeeting(companyId, meetingId);
          if (!r.ok) toast.error(r.error);
          else if (href) router.push(href);
          else router.refresh();
        })
      }
    >
      <Play /> {pending ? "Preparing agenda…" : label}
    </Button>
  );
}

export function StartNowButton({ companyId, slug, type = "weekly", label = "Start weekly meeting now" }: { companyId: string; slug: string; type?: "weekly" | "monthly" | "quarterly"; label?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await startAdHocMeeting(companyId, type);
          if (!r.ok) toast.error(r.error);
          else router.push(`/c/${slug}/meetings/${r.data!.id}`);
        })
      }
    >
      <Play /> {pending ? "Starting…" : label}
    </Button>
  );
}

export function ScheduleMeetingDialog({ companyId, crew, trigger }: { companyId: string; crew: CrewOption[]; trigger: React.ReactNode }) {
  const nextWeek = new Date(Date.now() + 7 * 86400000);
  nextWeek.setHours(9, 0, 0, 0);
  const local = new Date(nextWeek.getTime() - nextWeek.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return (
    <FormDialog trigger={trigger} title="Schedule a meeting" action={(fd) => scheduleMeeting(companyId, fd)} submitLabel="Schedule">
      {(e) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" error={e.type}>
              <NativeSelect name="type" defaultValue="weekly">
                <option value="weekly">Weekly leadership meeting</option>
                <option value="monthly">Monthly operating review</option>
                <option value="quarterly">Quarterly strategic reset</option>
                <option value="annual">Annual strategic planning</option>
              </NativeSelect>
            </Field>
            <Field label="When" error={e.scheduled_at}>
              <Input name="scheduled_at" type="datetime-local" defaultValue={local} required />
            </Field>
          </div>
          <Field label="Title (optional)">
            <Input name="title" placeholder="Defaults to the meeting type" />
          </Field>
          <Field label="Facilitator">
            <NativeSelect name="facilitator_id" defaultValue="">
              <option value="">—</option>
              {crew.filter((c) => !c.is_open_seat).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-[13px] font-medium">Attendees</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {crew.filter((c) => !c.is_open_seat).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="attendee" value={c.id} defaultChecked className="size-4 accent-[var(--brand)]" /> {c.full_name}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </FormDialog>
  );
}
