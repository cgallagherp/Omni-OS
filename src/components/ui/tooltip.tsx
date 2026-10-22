"use client";
import * as React from "react";
import { Tooltip as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const TooltipProvider = T.Provider;
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={200}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={4} className={cn("z-50 max-w-xs rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground shadow-md animate-in fade-in-0 zoom-in-95")}>
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
