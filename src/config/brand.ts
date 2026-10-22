/**
 * Brand configuration. Official Omni brand values have not been supplied, so the
 * accent colour is read from NEXT_PUBLIC_BRAND_PRIMARY (placeholder default) and
 * used sparingly for focus, selection and primary highlights.
 */
export const brand = {
  name: "Omni",
  product: "Omni OS",
  tagline: "Begin with the buyer. Focus on less. Execute every week.",
  primary: process.env.NEXT_PUBLIC_BRAND_PRIMARY || "#F26A21",
};

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
