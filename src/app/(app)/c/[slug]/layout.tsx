import { getCompanyContext } from "@/lib/auth";

/**
 * Resolves company access before any page in the company streams, so a user
 * without access gets a real 404 (the loading boundary sits below this layout).
 */
export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  await getCompanyContext((await params).slug);
  return children;
}
