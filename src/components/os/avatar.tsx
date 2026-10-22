import { initials } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

const PALETTE = ["#0EA5E9", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "#EC4899", "#14B8A6", "#6366F1"];

function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({ name, color, size = "sm", open, className }: { name: string; color?: string | null; size?: "xs" | "sm" | "md" | "lg"; open?: boolean; className?: string }) {
  const dims = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-11 text-sm" }[size];
  if (open) {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground", dims, className)} title={name}>
        ?
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white", dims, className)}
      style={{ backgroundColor: color ?? colorFor(name) }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function Owner({ person, showName = true, className }: { person?: { full_name: string; avatar_color: string | null; is_open_seat?: boolean } | null; showName?: boolean; className?: string }) {
  if (!person) return <span className="text-xs text-muted-foreground">Unassigned</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Avatar name={person.full_name} color={person.avatar_color} size="xs" open={person.is_open_seat} />
      {showName && <span className="truncate text-[13px]">{person.full_name.split(" ")[0]}</span>}
    </span>
  );
}
