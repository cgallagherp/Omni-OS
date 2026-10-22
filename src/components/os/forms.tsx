"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ClientActionResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string; fieldErrors?: Record<string, string> };
export type FormAction = (fd: FormData) => Promise<ClientActionResult>;

/** Runs a server action from a form, surfacing errors and success toasts. */
export function useFormAction(action: FormAction, opts: { onSuccess?: (r: ClientActionResult) => void; successMessage?: string } = {}) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function submit(fd: FormData) {
    start(async () => {
      const res = await action(fd);
      if (res.ok) {
        setErrors({});
        setError(null);
        if (res.message || opts.successMessage) toast.success(res.message ?? opts.successMessage);
        opts.onSuccess?.(res);
        router.refresh();
      } else {
        setErrors(res.fieldErrors ?? {});
        setError(res.error);
        toast.error(res.error);
      }
    });
  }
  return { submit, pending, errors, error };
}

export function SubmitButton({ pending, children, variant = "default", className, size }: { pending: boolean; children: ReactNode; variant?: "default" | "brand" | "outline" | "destructive" | "secondary"; className?: string; size?: "default" | "sm" | "xs" }) {
  return (
    <Button type="submit" disabled={pending} variant={variant} className={className} size={size}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

/** A dialog containing a form bound to a server action. Children may be a render function receiving field errors. */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Save",
  children,
  size = "md",
  successMessage,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: ReactNode;
  title: string;
  description?: string;
  action: FormAction;
  submitLabel?: string;
  children: ReactNode | ((errors: Record<string, string>) => ReactNode);
  size?: "sm" | "md" | "lg" | "xl";
  successMessage?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const { submit, pending, errors, error } = useFormAction(action, { onSuccess: () => setOpen(false), successMessage });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form action={submit} className="grid gap-4">
          {typeof children === "function" ? children(errors) : children}
          {error && !Object.keys(errors).length && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Inline form (no dialog). */
export function InlineForm({ action, children, className, resetOnSuccess = true, successMessage }: { action: FormAction; children: ReactNode | ((s: { pending: boolean; errors: Record<string, string> }) => ReactNode); className?: string; resetOnSuccess?: boolean; successMessage?: string }) {
  const [key, setKey] = useState(0);
  const { submit, pending, errors } = useFormAction(action, { onSuccess: () => resetOnSuccess && setKey((k) => k + 1), successMessage });
  return (
    <form key={key} action={submit} className={cn(className)}>
      {typeof children === "function" ? children({ pending, errors }) : children}
    </form>
  );
}

/** Calls a server action immediately (e.g. on select change or checkbox toggle). */
export function useQuickAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  function run(fn: () => Promise<ClientActionResult>, successMessage?: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else {
        if (res.message || successMessage) toast.success(res.message ?? successMessage);
        router.refresh();
      }
    });
  }
  return { run, pending };
}
