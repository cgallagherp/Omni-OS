/* eslint-disable @next/next/no-img-element -- logos are small static or RLS-served images; next/image adds nothing here */
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/** The official Omni logo (unaltered asset from the Omni brand deck). */
export function OmniLogo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const src = onDark ? brand.logoOnDark : brand.logo;
  return (
    <img src={src.src} width={src.width} height={src.height} alt="Omni" className={cn("h-6 w-auto object-contain", className)} />
  );
}

/** Omni logo followed by the product name, used in navigation. */
export function OmniMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-medium tracking-tight", className)}>
      <OmniLogo className="h-[1.35em]" />
      <span className="border-l border-border pl-2 text-muted-foreground">OS</span>
    </span>
  );
}

/**
 * A company's logo when it has uploaded one (always contained, never stretched
 * or cropped), otherwise an initial on its primary colour.
 */
export function CompanyMark({
  name,
  color,
  logoUrl,
  size = "sm",
  className,
}: {
  name: string;
  color: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = { sm: "size-5 text-[10px] rounded", md: "size-7 text-xs rounded-md", lg: "size-10 text-base rounded-lg" }[size];
  if (logoUrl) {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden border bg-white p-px", dims, className)}>
        <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center font-semibold text-white", dims, className)} style={{ backgroundColor: color }}>
      {name[0]}
    </span>
  );
}

/** Wide company logo for headers (e.g. the sidebar or Blueprint). */
export function CompanyLogo({ name, logoUrl, className }: { name: string; logoUrl: string; className?: string }) {
  return <img src={logoUrl} alt={name} className={cn("h-7 w-auto max-w-[160px] object-contain", className)} />;
}
