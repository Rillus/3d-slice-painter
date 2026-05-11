/** Smooth Hermite interpolation 0..1 for x in [edge0, edge1]. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const denom = edge1 - edge0;
  if (denom === 0) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / denom));
  return t * t * (3 - 2 * t);
}

/**
 * Normalised brush stamp alpha (0..1) before global stroke opacity.
 *
 * @param distance — distance from stamp centre (pixels)
 * @param radiusPx — outer radius (pixels)
 * @param hardness — 0 = soft feather from centre, 1 = solid disc to the outer edge
 */
export function stampAlpha(distance: number, radiusPx: number, hardness: number): number {
  if (radiusPx <= 0 || !Number.isFinite(distance)) return 0;
  if (distance >= radiusPx) return 0;
  const h = Math.max(0, Math.min(1, hardness));
  const inner = radiusPx * h;
  if (distance <= inner) return 1;
  return 1 - smoothstep(inner, radiusPx, distance);
}

export type RgbaByte = { r: number; g: number; b: number; a: number };

/**
 * Stamp a circular dab onto an RGBA8888 buffer (straight alpha, 0–255 channels).
 * Blend mode: source-over.
 */
export function compositeDab(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radiusPx: number,
  hardness: number,
  opacity: number,
  colour: RgbaByte,
): void {
  const op = Math.max(0, Math.min(1, opacity));
  if (op <= 0 || radiusPx <= 0) return;

  const r0 = Math.ceil(radiusPx);
  const x0 = Math.max(0, Math.floor(cx - r0));
  const y0 = Math.max(0, Math.floor(cy - r0));
  const x1 = Math.min(width - 1, Math.ceil(cx + r0));
  const y1 = Math.min(height - 1, Math.ceil(cy + r0));

  const sR0 = colour.r / 255;
  const sG0 = colour.g / 255;
  const sB0 = colour.b / 255;
  const sA0 = colour.a / 255;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      const stamp = stampAlpha(dist, radiusPx, hardness);
      const srcA = stamp * op * sA0;
      if (srcA <= 0) continue;

      const idx = (y * width + x) * 4;
      const dr = (data[idx] ?? 0) / 255;
      const dg = (data[idx + 1] ?? 0) / 255;
      const db = (data[idx + 2] ?? 0) / 255;
      const da = (data[idx + 3] ?? 0) / 255;

      const outA = srcA + da * (1 - srcA);
      if (outA <= 0) continue;

      const outR = (sR0 * srcA + dr * da * (1 - srcA)) / outA;
      const outG = (sG0 * srcA + dg * da * (1 - srcA)) / outA;
      const outB = (sB0 * srcA + db * da * (1 - srcA)) / outA;

      data[idx] = Math.round(outR * 255);
      data[idx + 1] = Math.round(outG * 255);
      data[idx + 2] = Math.round(outB * 255);
      data[idx + 3] = Math.round(outA * 255);
    }
  }
}

/**
 * Soft circular erase: scales existing premultiplied colour and alpha by (1 − stamp×opacity).
 * Fully transparent when strength reaches 1.
 */
export function compositeEraseDab(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radiusPx: number,
  hardness: number,
  opacity: number,
): void {
  const op = Math.max(0, Math.min(1, opacity));
  if (op <= 0 || radiusPx <= 0) return;

  const r0 = Math.ceil(radiusPx);
  const x0 = Math.max(0, Math.floor(cx - r0));
  const y0 = Math.max(0, Math.floor(cy - r0));
  const x1 = Math.min(width - 1, Math.ceil(cx + r0));
  const y1 = Math.min(height - 1, Math.ceil(cy + r0));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      const stamp = stampAlpha(dist, radiusPx, hardness);
      const strength = stamp * op;
      if (strength <= 0) continue;

      const idx = (y * width + x) * 4;
      const dr = (data[idx] ?? 0) / 255;
      const dg = (data[idx + 1] ?? 0) / 255;
      const db = (data[idx + 2] ?? 0) / 255;
      const da = (data[idx + 3] ?? 0) / 255;

      const factor = 1 - strength;
      const outA = da * factor;
      if (outA <= 0) {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
        continue;
      }

      data[idx] = Math.round(dr * factor * 255);
      data[idx + 1] = Math.round(dg * factor * 255);
      data[idx + 2] = Math.round(db * factor * 255);
      data[idx + 3] = Math.round(outA * 255);
    }
  }
}
