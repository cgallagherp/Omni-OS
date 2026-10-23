import { redirect } from "next/navigation";

/** The single "Board pack" was replaced by three distinct reporting outputs. */
export default async function ReportRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/c/${slug}/reporting`);
}
