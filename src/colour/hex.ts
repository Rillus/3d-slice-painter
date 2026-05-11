export type RgbByte = { r: number; g: number; b: number };
export type RgbaByteColour = { r: number; g: number; b: number; a: number };

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

/** Parses `#RRGGBB` or `#RRGGBBAA` (alpha 00 = fully transparent). */
export function parseHexRgba(hex: string): RgbaByteColour | null {
  const s = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(s)) {
    return {
      r: Number.parseInt(s.slice(0, 2), 16),
      g: Number.parseInt(s.slice(2, 4), 16),
      b: Number.parseInt(s.slice(4, 6), 16),
      a: 255,
    };
  }
  if (/^[0-9a-fA-F]{8}$/.test(s)) {
    return {
      r: Number.parseInt(s.slice(0, 2), 16),
      g: Number.parseInt(s.slice(2, 4), 16),
      b: Number.parseInt(s.slice(4, 6), 16),
      a: Number.parseInt(s.slice(6, 8), 16),
    };
  }
  return null;
}

/** Six-digit RGB only (no alpha). Eight-digit strings must use `parseHexRgba`. */
export function parseHexRgb(hex: string): RgbByte | null {
  const s = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return {
    r: Number.parseInt(s.slice(0, 2), 16),
    g: Number.parseInt(s.slice(2, 4), 16),
    b: Number.parseInt(s.slice(4, 6), 16),
  };
}

export function formatHexRgb(r: number, g: number, b: number): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function formatHexRgba(r: number, g: number, b: number, a: number): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}${h(a)}`;
}

/** Canonical key for swatches / storage (opaque uses six-digit form). */
export function swatchKeyFromRgba(c: RgbaByteColour): string {
  if (c.a >= 255) return formatHexRgb(c.r, c.g, c.b).toLowerCase();
  return formatHexRgba(c.r, c.g, c.b, c.a).toLowerCase();
}
