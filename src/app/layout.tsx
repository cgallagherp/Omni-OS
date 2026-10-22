import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brand } from "@/config/brand";
import "./globals.css";

const rubik = Rubik({ subsets: ["latin"], variable: "--font-rubik", weight: ["300", "400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: brand.product, template: `%s · ${brand.product}` },
  description: "The Omni Operating System — North Star, Flight Plan, Crew and Rhythm for portfolio companies.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={rubik.variable} style={{ ["--brand" as string]: brand.primary }}>
      <body className="min-h-dvh font-sans">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" toastOptions={{ className: "!font-sans !text-sm" }} />
      </body>
    </html>
  );
}
