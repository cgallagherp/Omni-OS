import { cn } from "@/lib/utils";

/** Placeholder wordmark until official Omni brand assets are supplied. */
export function OmniMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="relative inline-flex size-6 items-center justify-center rounded-md bg-foreground text-background">
        <span className="size-2.5 rounded-full border-[2.5px] border-brand" />
      </span>
      <span>
        Omni<span className="font-normal text-muted-foreground"> OS</span>
      </span>
    </span>
  );
}

export function CompanyMark({ name, color, size = "sm" }: { name: string; color: string; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "size-5 text-[10px] rounded", md: "size-7 text-xs rounded-md", lg: "size-10 text-base rounded-lg" }[size];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center font-semibold text-white", dims)} style={{ backgroundColor: color }}>
      {name[0]}
    </span>
  );
}
