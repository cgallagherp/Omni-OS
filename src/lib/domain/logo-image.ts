/**
 * Logo upload validation. Only raster formats whose content we can verify are
 * accepted; SVG is rejected because it can carry script. The file type is
 * decided from the bytes, never from the file name or the browser's MIME type.
 */
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type LogoMime = (typeof LOGO_TYPES)[number];
export const LOGO_ACCEPT = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

export interface LogoInfo {
  mime: LogoMime;
  width: number;
  height: number;
}

export function sniffLogo(bytes: Uint8Array): LogoInfo | null {
  const b = bytes;
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

  // PNG: signature then IHDR chunk with width/height.
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52) {
    return { mime: "image/png", width: u32be(16), height: u32be(20) };
  }
  // JPEG: walk segments to the first start-of-frame marker.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = u16be(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: "image/jpeg", height: u16be(i + 5), width: u16be(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  // WEBP: RIFF....WEBP then VP8 / VP8L / VP8X.
  if (b.length >= 30 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...b.slice(12, 16));
    if (chunk === "VP8 ") return { mime: "image/webp", width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === "VP8L") {
      const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { mime: "image/webp", width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { mime: "image/webp", width: u24le(24) + 1, height: u24le(27) + 1 };
  }
  return null;
}

/** Returns an error message, or null when the file is an acceptable logo. */
export function validateLogo(bytes: Uint8Array): { error: string } | { info: LogoInfo } {
  if (bytes.length === 0) return { error: "The file is empty." };
  if (bytes.length > LOGO_MAX_BYTES) return { error: "Logos must be 1 MB or smaller." };
  const info = sniffLogo(bytes);
  if (!info) return { error: "Upload a PNG, JPEG or WEBP image. SVG and other formats are not supported." };
  if (info.width < 32 || info.height < 16) return { error: "The logo is too small; use an image at least 32 × 16 pixels." };
  if (info.width > 4000 || info.height > 4000) return { error: "The logo is too large; use an image under 4000 pixels on each side." };
  return { info };
}
