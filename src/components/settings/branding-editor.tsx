"use client";
/* eslint-disable @next/next/no-img-element -- previews of local object URLs and RLS-served logos */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Circle, ImageUp, RotateCcw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { saveBranding, restoreOmniBranding } from "@/lib/actions/branding";
import { OMNI, OMNI_DEFAULT_BRANDING, brandWarnings, contrast, deriveBrandTokens, isHex, normalizeHex, tokensToStyle } from "@/lib/domain/brand";
import { LOGO_ACCEPT, LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/domain/logo-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { OmniLogo } from "@/components/os/logo";
import { SubmitButton } from "@/components/os/forms";
import { cn } from "@/lib/utils";

interface Saved {
  primary: string | null;
  secondary: string | null;
  accent: string | null;
  logoUrl: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
}

function ColourField({
  id,
  label,
  hint,
  value,
  fallback,
  onChange,
  optional,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  const valid = value === "" ? Boolean(optional) : isHex(value);
  const effective = isHex(value) ? normalizeHex(value) : fallback;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={`${id}-hex`} className="text-[13px] leading-none font-medium text-foreground/90">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={effective.toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-md border bg-card p-0.5"
        />
        <Input
          id={`${id}-hex`}
          name={id}
          value={value}
          placeholder={optional ? `${fallback} (Omni default)` : "#F54E00"}
          onChange={(e) => onChange(e.target.value.trim())}
          aria-invalid={!valid}
          maxLength={7}
          className="font-mono uppercase"
          spellCheck={false}
        />
        {optional && value && (
          <Button type="button" variant="ghost" size="xs" onClick={() => onChange("")}>
            Default
          </Button>
        )}
      </div>
      {!valid ? <p className="text-xs text-destructive">Use a six-digit hex colour such as #F54E00.</p> : <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A miniature of the workspace rendered with the draft branding tokens. */
function BrandPreview({ style, companyName, logoSrc }: { style: Record<string, string>; companyName: string; logoSrc: string | null }) {
  const bars = [62, 78, 54, 88, 71, 93];
  return (
    <div style={style} className="overflow-hidden rounded-lg border bg-background text-foreground" data-testid="brand-preview">
      <div className="grid grid-cols-[132px_1fr] max-sm:grid-cols-1">
        <aside className="border-r bg-sidebar p-2.5 max-sm:hidden">
          <div className="mb-3 flex h-7 items-center">
            {logoSrc ? (
              <img src={logoSrc} alt="" className="h-6 w-auto max-w-[110px] object-contain" />
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="flex size-5 items-center justify-center rounded bg-brand text-[10px] font-semibold text-brand-foreground">{companyName[0]}</span>
                <span className="truncate text-[11px] font-medium">{companyName}</span>
              </span>
            )}
          </div>
          {["Blueprint", "North Star", "Flight Plan", "Crew", "Mission Control"].map((l, i) => (
            <div
              key={l}
              className={cn(
                "flex h-6 items-center gap-1.5 rounded px-1.5 text-[11px] font-medium",
                i === 2 ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground",
              )}
            >
              <span className={cn("size-1.5 rounded-full", i === 2 ? "bg-brand" : "bg-muted-foreground/40")} />
              {l}
              {i === 2 && <span className="ml-auto h-3 w-0.5 rounded-full bg-brand" />}
            </div>
          ))}
        </aside>
        <div className="min-w-0 space-y-3 p-3.5">
          <div>
            <p className="text-[10.5px] font-medium text-brand-ink">Flight Plan</p>
            <h3 className="text-[15px] font-semibold tracking-tight">90-Day Priorities</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex h-7 items-center rounded-md bg-brand px-2.5 text-[12px] font-medium text-brand-foreground">Primary action</span>
            <span className="inline-flex h-7 items-center rounded-md bg-brand-hover px-2.5 text-[12px] font-medium text-brand-foreground">Hover</span>
            <span className="inline-flex h-7 items-center rounded-md border bg-card px-2.5 text-[12px] font-medium">Secondary</span>
            <span className="inline-flex h-7 items-center rounded-md px-2 text-[12px] font-medium text-brand-ink underline underline-offset-2">Link</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border bg-card p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[12px] font-medium">Launch the revised sales process</p>
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-on-bg px-1.5 text-[10.5px] font-medium text-on-ink">
                  <CheckCircle2 className="size-3" /> On track
                </span>
              </div>
              <Progress value={64} tone="brand" className="mt-2" />
              <p className="mt-1 text-[10.5px] text-muted-foreground">3 of 5 milestones · due in 6 weeks</p>
            </div>
            <div className="rounded-md border border-brand-border bg-brand-subtle p-2.5">
              <p className="text-[12px] font-medium">Highlighted card</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className="inline-flex items-center gap-1 rounded bg-risk-bg px-1.5 text-[10.5px] font-medium text-risk-ink">
                  <AlertTriangle className="size-3" /> At risk
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-off-bg px-1.5 text-[10.5px] font-medium text-off-ink">
                  <XCircle className="size-3" /> Off track
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-none-bg px-1.5 text-[10.5px] font-medium text-none-ink">
                  <Circle className="size-3" /> Not reported
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-md border bg-card p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Chart</p>
            <div className="mt-1.5 flex h-16 items-end gap-1.5" aria-hidden>
              {bars.map((h, i) => (
                <div key={i} className="flex h-full flex-1 items-end gap-0.5">
                  <div className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: "var(--chart-1)" }} />
                  <div className="flex-1 rounded-t-sm" style={{ height: `${h * 0.8}%`, background: "var(--chart-2)" }} />
                  <div className="flex-1 rounded-t-sm" style={{ height: `${h * 0.6}%`, background: "var(--chart-3)" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandingEditor({ companyId, companyName, saved, lastChanged }: { companyId: string; companyName: string; saved: Saved; lastChanged: string | null }) {
  const router = useRouter();
  const [primary, setPrimary] = useState(saved.primary ?? OMNI_DEFAULT_BRANDING.primary);
  const [secondary, setSecondary] = useState(saved.secondary ?? "");
  const [accent, setAccent] = useState(saved.accent ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [pending, start] = useTransition();
  const [restoring, startRestore] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Release each preview URL when it is replaced or the editor unmounts.
  useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl]);

  const draft = { primary: isHex(primary) ? primary : undefined, secondary: isHex(secondary) ? secondary : undefined, accent: isHex(accent) ? accent : undefined };
  const tokens = useMemo(() => deriveBrandTokens(draft), [draft.primary, draft.secondary, draft.accent]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useMemo(() => tokensToStyle(tokens), [tokens]);
  const warnings = brandWarnings(draft);
  const valid = isHex(primary) && (secondary === "" || isHex(secondary)) && (accent === "" || isHex(accent)) && !fileError;
  const logoSrc = removeLogo ? null : (fileUrl ?? saved.logoUrl);
  const dirty =
    normalizeOrEmpty(primary) !== normalizeOrEmpty(saved.primary ?? OMNI_DEFAULT_BRANDING.primary) ||
    normalizeOrEmpty(secondary) !== normalizeOrEmpty(saved.secondary ?? "") ||
    normalizeOrEmpty(accent) !== normalizeOrEmpty(saved.accent ?? "") ||
    Boolean(file) ||
    removeLogo;
  const isCustomised = Boolean(saved.primary || saved.secondary || saved.accent || saved.logoUrl);

  function pickFile(f: File | null) {
    setFileError(null);
    setRemoveLogo(false);
    if (!f) {
      setFile(null);
      setFileUrl(null);
      return;
    }
    if (!(LOGO_TYPES as readonly string[]).includes(f.type)) {
      setFileError("Upload a PNG, JPEG or WEBP image. SVG and other formats are not supported.");
      setFile(null);
      setFileUrl(null);
      return;
    }
    if (f.size > LOGO_MAX_BYTES) {
      setFileError("Logos must be 1 MB or smaller.");
      setFile(null);
      setFileUrl(null);
      return;
    }
    setFile(f);
    setFileUrl(URL.createObjectURL(f));
  }

  function clearFile() {
    setFile(null);
    setFileUrl(null);
    setFileError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function save() {
    const fd = new FormData();
    fd.set("primary_color", primary);
    if (secondary) fd.set("secondary_color", secondary);
    if (accent) fd.set("accent_color", accent);
    if (file) fd.set("logo", file);
    if (removeLogo) fd.set("remove_logo", "true");
    start(async () => {
      const res = await saveBranding(companyId, fd);
      if (!res.ok) {
        toast.error(res.error);
        if (res.fieldErrors?.logo) setFileError(res.fieldErrors.logo);
        return;
      }
      toast.success(res.message ?? "Branding saved");
      clearFile();
      setRemoveLogo(false);
      router.refresh();
    });
  }

  function restore() {
    startRestore(async () => {
      const res = await restoreOmniBranding(companyId);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message ?? "Omni defaults restored");
      setPrimary(OMNI_DEFAULT_BRANDING.primary);
      setSecondary("");
      setAccent("");
      clearFile();
      setRemoveLogo(false);
      setConfirmOpen(false);
      router.refresh();
    });
  }

  const ratio = isHex(primary) ? contrast(tokens["--brand"], tokens["--brand-foreground"]) : null;

  return (
    <form
      action={save}
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] [&>*]:min-w-0"
    >
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            {lastChanged && <span className="text-xs text-muted-foreground">{lastChanged}</span>}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:14px_14px] p-4">
              {logoSrc ? (
                <img src={logoSrc} alt={`${companyName} logo preview`} className="max-h-20 w-auto max-w-full object-contain" data-testid="logo-preview" />
              ) : (
                <div className="text-center text-xs text-muted-foreground">
                  <OmniLogo className="mx-auto mb-2 h-6 opacity-60" />
                  No company logo — the Omni identity is shown.
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-card px-3 text-[13px] font-medium shadow-xs hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
                <ImageUp className="size-4" />
                {saved.logoUrl || file ? "Replace logo" : "Upload logo"}
                <input ref={fileRef} type="file" name="logo" accept={LOGO_ACCEPT} className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              </label>
              {file && (
                <Button type="button" variant="ghost" size="sm" onClick={clearFile}>
                  Cancel upload
                </Button>
              )}
              {saved.logoUrl && !file && !removeLogo && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveLogo(true)}>
                  <Trash2 /> Remove logo
                </Button>
              )}
              {removeLogo && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveLogo(false)}>
                  Keep logo
                </Button>
              )}
            </div>
            {fileError ? (
              <p className="text-xs text-destructive" role="alert">
                {fileError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                PNG, JPEG or WEBP, up to 1 MB. A transparent PNG at least 400 px wide works best. Logos are always shown at their own proportions — never stretched or cropped.
                {file ? ` Selected: ${file.name} (${Math.round(file.size / 1024)} KB).` : saved.logoWidth ? ` Current: ${saved.logoWidth} × ${saved.logoHeight} px.` : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Colours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ColourField id="primary_color" label="Primary colour" hint="Buttons, active navigation, highlights and progress." value={primary} fallback={OMNI.orange} onChange={setPrimary} />
            <ColourField id="secondary_color" label="Secondary colour" hint="Second chart series and supporting accents." value={secondary} fallback={OMNI_DEFAULT_BRANDING.secondary} onChange={setSecondary} optional />
            <ColourField id="accent_color" label="Accent colour" hint="Third chart series and small details." value={accent} fallback={OMNI_DEFAULT_BRANDING.accent} onChange={setAccent} optional />
            <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              Hover, tint and text shades are derived automatically so they stay readable
              {ratio ? ` (button text contrast ${ratio.toFixed(1)}:1)` : ""}. Status colours — on track, at risk, off track and not reported — are fixed across Omni OS and never take brand colours.
            </div>
            {warnings.length > 0 && (
              <ul className="space-y-1.5" aria-live="polite">
                {warnings.map((w) => (
                  <li key={w} className="flex gap-2 text-xs text-risk-ink">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton pending={pending} variant="brand" className={cn(!valid && "pointer-events-none opacity-50")}>
            Save branding
          </SubmitButton>
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" className="ml-auto" disabled={!isCustomised}>
                <RotateCcw /> Restore Omni defaults
              </Button>
            </DialogTrigger>
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>Restore Omni defaults?</DialogTitle>
                <DialogDescription>
                  This removes {companyName}&apos;s logo and colours. The workspace will use the Omni identity until new branding is saved.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" onClick={restore} disabled={restoring}>
                  Restore defaults
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-2 lg:sticky lg:top-6 lg:self-start">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Live preview</p>
        <BrandPreview style={style} companyName={companyName} logoSrc={logoSrc} />
        <p className="text-xs text-muted-foreground">
          Branding applies to everyone in {companyName}&apos;s workspace. Omni&apos;s portfolio views always use the Omni identity.
        </p>
      </div>
    </form>
  );
}

function normalizeOrEmpty(v: string | null) {
  return v && isHex(v) ? normalizeHex(v) : (v ?? "");
}
