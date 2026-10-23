"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialog, InlineForm, SubmitButton, useQuickAction } from "@/components/os/forms";
import { createCompany, inviteMember, removeMember, setMemberRole, setOmniAssignment } from "@/lib/actions/admin";
import { updateCompanySettings } from "@/lib/actions/strategy";
import { TEMPLATES } from "@/lib/domain/templates";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function TempPasswordDialog({ password, onClose }: { password: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!password} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Temporary password</DialogTitle>
          <DialogDescription>Demo mode: share this once, securely. In production Supabase Auth sends an invitation email instead.</DialogDescription>
        </DialogHeader>
        <code className="rounded-md bg-muted px-3 py-2 text-sm">{password}</code>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(password ?? "");
              toast.success("Copied");
            }}
          >
            <Copy /> Copy
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompanySettingsForm({ companyId, defaults }: { companyId: string; defaults: { name: string; sector: string | null; description: string | null; headquarters: string | null; currency: string; fiscal_year_start_month: number; max_three_year_outcomes: number; priority_target: number; max_priorities: number } }) {
  return (
    <InlineForm action={(fd) => updateCompanySettings(companyId, fd)} resetOnSuccess={false}>
      {({ pending, errors }) => (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Company name" error={errors.name}>
            <Input name="name" defaultValue={defaults.name} required />
          </Field>
          <Field label="Sector" error={errors.sector}>
            <Input name="sector" defaultValue={defaults.sector ?? ""} />
          </Field>
          <Field label="Description" error={errors.description} className="md:col-span-2">
            <Textarea name="description" defaultValue={defaults.description ?? ""} rows={2} />
          </Field>
          <Field label="Headquarters" error={errors.headquarters}>
            <Input name="headquarters" defaultValue={defaults.headquarters ?? ""} />
          </Field>
          <Field label="Reporting currency" error={errors.currency}>
            <NativeSelect name="currency" defaultValue={defaults.currency}>
              <option value="GBP">GBP (£)</option>
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
            </NativeSelect>
          </Field>
          <Field label="Fiscal year starts" error={errors.fiscal_year_start_month}>
            <NativeSelect name="fiscal_year_start_month" defaultValue={String(defaults.fiscal_year_start_month)}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Maximum Three-Year Outcomes" hint="Omni default is 5 — focus on less." error={errors.max_three_year_outcomes}>
            <Input name="max_three_year_outcomes" type="number" min={1} max={10} defaultValue={defaults.max_three_year_outcomes} />
          </Field>
          <Field label="Target 90-Day Priorities per quarter" hint="Omni guidance is about three. A warning shows above this number." error={errors.priority_target}>
            <Input name="priority_target" type="number" min={1} max={10} defaultValue={defaults.priority_target} />
          </Field>
          <Field label="Hard limit on 90-Day Priorities" hint="Enforced in the database; stopped priorities don't count." error={errors.max_priorities}>
            <Input name="max_priorities" type="number" min={1} max={10} defaultValue={defaults.max_priorities} />
          </Field>
          <div className="md:col-span-2">
            <SubmitButton pending={pending}>Save settings</SubmitButton>
          </div>
        </div>
      )}
    </InlineForm>
  );
}

export function InviteMemberDialog({ companyId, trigger }: { companyId: string; trigger: ReactNode }) {
  const [password, setPassword] = useState<string | null>(null);
  return (
    <>
      <FormDialog
        trigger={trigger}
        title="Invite a team member"
        description="Executives can update the plan, KPIs and meetings. Observers have read-only access."
        action={async (fd) => {
          const r = await inviteMember(companyId, fd);
          if (r.ok && r.data?.tempPassword) setPassword(r.data.tempPassword);
          return r;
        }}
        submitLabel="Invite"
      >
        {(e) => (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" error={e.full_name}>
                <Input name="full_name" required />
              </Field>
              <Field label="Email" error={e.email}>
                <Input name="email" type="email" required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title" error={e.title}>
                <Input name="title" />
              </Field>
              <Field label="Role" error={e.role}>
                <NativeSelect name="role" defaultValue="executive">
                  <option value="executive">Executive</option>
                  <option value="ceo">CEO</option>
                  <option value="company_admin">Company administrator</option>
                  <option value="observer">Chair / Board observer (read-only)</option>
                </NativeSelect>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="add_to_crew" defaultChecked className="size-4 accent-brand" /> Add to the accountability chart
            </label>
          </>
        )}
      </FormDialog>
      <TempPasswordDialog password={password} onClose={() => setPassword(null)} />
    </>
  );
}

export function MemberControls({ companyId, userId, role, isSelf }: { companyId: string; userId: string; role: string; isSelf: boolean }) {
  const q = useQuickAction();
  if (role === "omni") return <span className="text-xs text-muted-foreground">Managed by Omni</span>;
  if (isSelf) return <span className="text-xs text-muted-foreground">You</span>;
  return (
    <div className="flex items-center gap-2">
      <NativeSelect value={role} disabled={q.pending} onChange={(e) => q.run(() => setMemberRole(companyId, userId, e.target.value as "executive"))} className="h-7 w-40 text-xs">
        <option value="ceo">CEO</option>
        <option value="company_admin">Company admin</option>
        <option value="executive">Executive</option>
        <option value="observer">Chair / observer</option>
      </NativeSelect>
      <Button
        variant="ghost"
        size="xs"
        disabled={q.pending}
        onClick={() => {
          if (confirm("Remove this person's access?")) q.run(() => removeMember(companyId, userId));
        }}
      >
        Remove
      </Button>
    </div>
  );
}

export function OmniAssignmentToggle({ companyId, userId, assigned }: { companyId: string; userId: string; assigned: boolean }) {
  const q = useQuickAction();
  return (
    <input
      type="checkbox"
      checked={assigned}
      disabled={q.pending}
      onChange={(e) => q.run(() => setOmniAssignment(companyId, userId, e.target.checked))}
      className="size-4 accent-brand"
      aria-label="Assigned"
    />
  );
}

export function NewCompanyDialog({ trigger }: { trigger: ReactNode }) {
  const [password, setPassword] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <FormDialog
        trigger={trigger}
        title="Onboard a portfolio company"
        description="Creates the company with the Omni standard operating cadence, a North Star to complete, the active quarter, and a starter Scoreboard from the chosen template."
        size="lg"
        submitLabel="Create company"
        action={async (fd) => {
          const r = await createCompany(fd);
          if (r.ok) {
            if (r.data?.tempPassword) {
              setSlug(r.data.slug);
              setPassword(r.data.tempPassword);
            } else router.push(`/c/${r.data!.slug}`);
          }
          return r;
        }}
      >
        {(e) => (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company name" error={e.name}>
                <Input name="name" required />
              </Field>
              <Field label="URL slug" error={e.slug} hint="e.g. acme">
                <Input name="slug" required pattern="[a-z0-9-]{2,48}" />
              </Field>
              <Field label="Sector" error={e.sector}>
                <Input name="sector" />
              </Field>
              <Field label="Headquarters" error={e.headquarters}>
                <Input name="headquarters" />
              </Field>
              <Field label="Investment date" error={e.acquired_on}>
                <Input name="acquired_on" type="date" />
              </Field>
              <Field label="Company colour (optional)" error={e.brand_color} hint="Leave blank to keep the Omni identity; logo and colours can be set later in Appearance & Branding.">
                <Input name="brand_color" placeholder="#0C4AAD" pattern="#[0-9a-fA-F]{6}" />
              </Field>
              <Field label="Currency" error={e.currency}>
                <NativeSelect name="currency" defaultValue="GBP">
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </NativeSelect>
              </Field>
              <Field label="Fiscal year starts" error={e.fiscal_year_start_month}>
                <NativeSelect name="fiscal_year_start_month" defaultValue="1">
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label="Omni template" error={e.template}>
              <NativeSelect name="template" defaultValue="saas">
                {TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} — {t.metrics.length} KPIs
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="CEO name" error={e.ceo_name}>
                <Input name="ceo_name" required />
              </Field>
              <Field label="CEO title" error={e.ceo_title}>
                <Input name="ceo_title" defaultValue="Chief Executive Officer" />
              </Field>
              <Field label="CEO email (creates login)" error={e.ceo_email}>
                <Input name="ceo_email" type="email" />
              </Field>
            </div>
          </>
        )}
      </FormDialog>
      <TempPasswordDialog
        password={password}
        onClose={() => {
          setPassword(null);
          if (slug) router.push(`/c/${slug}`);
        }}
      />
    </>
  );
}
