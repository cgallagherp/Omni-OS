import { OMNI, OMNI_DEFAULT_BRANDING } from "@/lib/domain/brand";

/**
 * Omni identity — the default visual identity of Omni OS, taken from the
 * Chair & CEO Briefing (v4). Portfolio companies can override the colours and
 * logo for their own workspace in Settings → Appearance & Branding; the Omni
 * portfolio views always use these values.
 */
export const brand = {
  name: "Omni",
  product: "Omni OS",
  tagline: "Begin with the buyer. Focus on less. Execute every week.",
  palette: OMNI,
  defaults: OMNI_DEFAULT_BRANDING,
  logo: { src: "/brand/omni-logo.png", width: 960, height: 298 },
  logoOnDark: { src: "/brand/omni-logo-white.png", width: 960, height: 298 },
  mark: { src: "/brand/omni-mark.png", width: 298, height: 298 },
};

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
