"use client";
import { useActionState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { signIn } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Avatar } from "@/components/os/avatar";



export function LoginForm({ next, personas, demoPassword }: { next?: string; personas: Array<{ group: string; email: string; name: string; role: string }>; demoPassword?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function quick(email: string) {
    if (!emailRef.current || !passwordRef.current) return;
    emailRef.current.value = email;
    passwordRef.current.value = demoPassword ?? "";
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={action} className="mt-6 grid gap-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email">
          <Input ref={emailRef} name="email" type="email" autoComplete="email" required placeholder="you@company.com" className="h-9" />
        </Field>
        <Field label="Password">
          <Input ref={passwordRef} name="password" type="password" autoComplete="current-password" required className="h-9" />
        </Field>
        {state?.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending && <Loader2 className="animate-spin" />} Sign in
        </Button>
      </form>

      {personas.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Demonstration accounts</p>
            <p className="text-[11px] text-muted-foreground">password <code className="rounded bg-muted px-1">{demoPassword}</code></p>
          </div>
          <div className="mt-2 divide-y overflow-hidden rounded-lg border bg-card">
            {personas.map((p) => (
              <button
                key={p.email}
                type="button"
                disabled={pending}
                onClick={() => quick(p.email)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent disabled:opacity-60"
              >
                <Avatar name={p.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.role}</span>
                </span>
                <span className="text-[11px] text-muted-foreground">{p.group}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
