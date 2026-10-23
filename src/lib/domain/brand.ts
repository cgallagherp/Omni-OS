// Brand system: the official Omni identity (from the October 2026 Chair & CEO briefing)
// and derivation of a coherent, accessible token set from a company's chosen colours.

export const OMNI = {
  orange: "#F54E00",
  red: "#E30000",
  yellow: "#FFC02B",
  teal: "#17A1BD",
  blue: "#0C4AAD",
  charcoal: "#2E3331",
  grey: "#5B625F",
  lightGrey: "#F1F2F2",
  white: "#FFFFFF",
} as const;

export const OMNI_DEFAULT_BRANDING = { primary: OMNI.orange, secondary: OMNI.blue, accent: OMNI.teal } as const;

export interface BrandInput {
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
}

export interface BrandTokens {
  "--brand": string; // fills: primary buttons, active indicators
  "--brand-foreground": string; // text on --brand
  "--brand-hover": string;
  "--brand-ink": string; // brand-coloured text/links on white, ≥ 4.5:1
  "--brand-subtle": string; // tinted backgrounds (selected rows, highlights)
  "--brand-border": string;
  "--brand-secondary": string;
  "--brand-secondary-ink": string;
  "--brand-accent": string;
  "--chart-1": string;
  "--chart-2": string;
  "--chart-3": string;
  "--ring": string;
}

const HEX = /^#?([0-9a-f]{6})$/i;

export function isHex(v: string | null | undefined): v is string {
  return typeof v === "string" && HEX.test(v.trim());
}

export function normalizeHex(v: string): string {
  const m = v.trim().match(HEX);
  if (!m) throw new Error(`Invalid colour ${v}`);
  return `#${m[1].toUpperCase()}`;
}

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Linear blend: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Darkens a colour towards charcoal until it reaches the required contrast on white. */
export function inkOn(hex: string, background: string = OMNI.white, min = 4.5): string {
  let c = normalizeHex(hex);
  for (let i = 0; i < 20 && contrast(c, background) < min; i++) c = mix(c, "#111414", 0.12);
  return c;
}

/** Black or white, whichever reads better on the fill (prefers white for mid-tones). */
export function foregroundFor(fill: string): string {
  return contrast(fill, OMNI.white) >= 3 ? OMNI.white : OMNI.charcoal;
}

export function deriveBrandTokens(input: BrandInput = {}): BrandTokens {
  const primary = isHex(input.primary) ? normalizeHex(input.primary) : OMNI_DEFAULT_BRANDING.primary;
  const secondary = isHex(input.secondary) ? normalizeHex(input.secondary) : OMNI_DEFAULT_BRANDING.secondary;
  const accent = isHex(input.accent) ? normalizeHex(input.accent) : OMNI_DEFAULT_BRANDING.accent;
  // Very light primaries cannot carry white text or be used as a button fill on white;
  // derive a deeper fill so controls stay visible and accessible.
  const fill = contrast(primary, OMNI.white) < 1.6 ? inkOn(primary, OMNI.white, 3) : primary;
  const fg = foregroundFor(fill);
  return {
    "--brand": fill,
    "--brand-foreground": fg,
    "--brand-hover": mix(fill, fg === OMNI.white ? "#000000" : "#FFFFFF", 0.1),
    "--brand-ink": inkOn(primary),
    "--brand-subtle": mix(primary, OMNI.white, 0.92),
    "--brand-border": mix(primary, OMNI.white, 0.7),
    "--brand-secondary": secondary,
    "--brand-secondary-ink": inkOn(secondary),
    "--brand-accent": accent,
    "--chart-1": inkOn(primary, OMNI.white, 3),
    "--chart-2": inkOn(secondary, OMNI.white, 3),
    "--chart-3": inkOn(accent, OMNI.white, 3),
    "--ring": mix(primary, OMNI.white, 0.45),
  };
}

/** Warnings shown in the branding editor. Semantic statuses never take brand colours. */
export function brandWarnings(input: BrandInput): string[] {
  const out: string[] = [];
  const p = isHex(input.primary) ? normalizeHex(input.primary) : null;
  if (p && contrast(p, OMNI.white) < 1.6) out.push("The primary colour is very light; a deeper shade is used for buttons and text so they remain readable.");
  else if (p && contrast(p, OMNI.white) < 4.5) out.push("The primary colour is slightly light for text; links and headings use a darker shade automatically.");
  const statusHues: Array<[string, string]> = [
    ["#1E9E6A", "on track (green)"],
    ["#E30000", "off track (red)"],
    ["#FFC02B", "at risk (amber)"],
  ];
  for (const [hex, label] of statusHues) {
    if (p && colourDistance(p, hex) < 60)
      out.push(`The primary colour is close to the ${label} status colour. Statuses always show a label and icon, so they stay unambiguous.`);
  }
  return out;
}

export function colourDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
}

export function tokensToStyle(tokens: BrandTokens): Record<string, string> {
  return { ...tokens };
}
