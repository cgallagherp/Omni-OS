"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuickAction } from "@/components/os/forms";
import { setAgentDomains, setDomainGrant } from "@/lib/actions/intelligence";

export function DomainGrant({ companyId, userId, domain, granted, label }: { companyId: string; userId: string; domain: string; granted: boolean; label: string }) {
  const { run, pending } = useQuickAction();
  return <Checkbox aria-label={label} checked={granted} disabled={pending} onCheckedChange={(v) => run(() => setDomainGrant(companyId, userId, domain, v === true))} />;
}

export function AgentDomain({ companyId, agent, domain, domains, label }: { companyId: string; agent: string; domain: string; domains: string[]; label: string }) {
  const { run, pending } = useQuickAction();
  const on = domains.includes(domain);
  return <Checkbox aria-label={label} checked={on} disabled={pending} onCheckedChange={(v) => run(() => setAgentDomains(companyId, agent, v === true ? [...domains, domain] : domains.filter((d) => d !== domain)))} />;
}
