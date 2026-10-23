"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useQuickAction } from "@/components/os/forms";
import { publishReport, saveReportSection } from "@/lib/actions/reporting";
import type { ReportKind } from "@/lib/domain/reporting";

export function ReportSection({ companyId, kind, period, section, label, hint, value, editable }: { companyId: string; kind: ReportKind; period: string; section: string; label: string; hint: string; value: string; editable: boolean }) {
  const [text, setText] = useState(value);
  const q = useQuickAction();
  return (
    <section className="break-inside-avoid">
      <h3 className="text-[13px] font-semibold">{label}</h3>
      {editable ? (
        <div className="mt-1.5 grid gap-1.5 print:hidden">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={hint} aria-label={label} />
          <div>
            <Button
              size="xs"
              variant="outline"
              disabled={q.pending || text === value}
              onClick={() => {
                const fd = new FormData();
                fd.set("section", section);
                fd.set("text", text);
                q.run(() => saveReportSection(companyId, kind, period, fd), "Saved");
              }}
            >
              Save
            </Button>
          </div>
        </div>
      ) : null}
      <p className={editable ? "hidden whitespace-pre-line text-[13px] print:block" : "mt-1 whitespace-pre-line text-[13px]"}>{value || <span className="text-muted-foreground italic">Not provided</span>}</p>
    </section>
  );
}

export function PublishReportButton({ companyId, kind, period, label }: { companyId: string; kind: ReportKind; period: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="brand"
      size="sm"
      disabled={pending}
      className="print:hidden"
      onClick={() => {
        if (!confirm(`Publish the ${label}? The figures are frozen as they are now and the report becomes read-only.`)) return;
        start(async () => {
          const r = await publishReport(companyId, kind, period);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.message ?? "Published");
            router.refresh();
          }
        });
      }}
    >
      <CheckCircle2 /> {pending ? "Publishing…" : "Publish"}
    </Button>
  );
}
