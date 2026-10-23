import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-px text-[11px] font-medium leading-4 [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-muted-foreground",
        brand: "border-transparent bg-brand-subtle text-brand-ink",
        on: "border-transparent bg-on-bg text-on-ink",
        risk: "border-transparent bg-risk-bg text-risk-ink",
        off: "border-transparent bg-off-bg text-off-ink",
        done: "border-transparent bg-done-bg text-done-ink",
        none: "border-transparent bg-none-bg text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
