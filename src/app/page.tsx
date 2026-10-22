import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";

export default async function Home() {
  const viewer = await requireViewer();
  if (viewer.isOmniStaff) redirect("/portfolio");
  const first = viewer.companies[0];
  if (first) redirect(`/c/${first.slug}`);
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold">No company access yet</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ask your company administrator or the Omni team to grant you access.</p>
      </div>
    </main>
  );
}
