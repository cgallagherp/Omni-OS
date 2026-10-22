import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <p className="text-sm font-medium text-brand">404</p>
      <h1 className="mt-1 text-lg font-semibold">Not found</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="mt-4 text-sm font-medium underline-offset-4 hover:underline">
        Go to your home page
      </Link>
    </main>
  );
}
