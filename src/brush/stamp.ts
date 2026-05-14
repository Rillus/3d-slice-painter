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

export type BrushShape = "round" | "square" | "diamond";
export type BrushTexture = "smooth" | "grain" | "streak";

export type BrushStampOptions = {
  shape: BrushShape;
  slantDeg: number;
  texture: BrushTexture;
};

export const DEFAULT_BRUSH_STAMP_OPTIONS: BrushStampOptions = {
  shape: "round",
  slantDeg: 0,
  texture: "smooth",
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normaliseStampOptions(options?: Partial<BrushStampOptions>): BrushStampOptions {
  return {
    shape: options?.shape ?? DEFAULT_BRUSH_STAMP_OPTIONS.shape,
    slantDeg: Number.isFinite(options?.slantDeg) ? (options?.slantDeg ?? 0) : DEFAULT_BRUSH_STAMP_OPTIONS.slantDeg,
    texture: options?.texture ?? DEFAULT_BRUSH_STAMP_OPTIONS.texture,
  };
}

function slantPoint(dx: number, dy: number, slantDeg: number): { x: number; y: number } {
  const clamped = Math.max(-60, Math.min(60, slantDeg));
  const shear = Math.tan((clamped * Math.PI) / 180);
  return { x: dx - dy * shear, y: dy };
}

function shapeDistance(dx: number, dy: number, shape: BrushShape): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (shape === "square") return Math.max(ax, ay);
  if (shape === "diamond") return ax + ay;
  return Math.hypot(dx, dy);
}

function hashNoise01(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function textureMultiplier(texture: BrushTexture, dx: number, dy: number, radiusPx: number): number {
  if (texture === "smooth") return 1;
  if (texture === "grain") {
    const x = Math.floor(dx * 2 + 8192);
    const y = Math.floor(dy * 2 + 8192);
    return 0.45 + hashNoise01(x, y) * 0.55;
  }

  const stripe = Math.sin((dy + radiusPx) * 2.4 + dx * 0.35);
  return stripe > -0.18 ? 1 : 0.5;
}

/**
 * Normalised brush stamp alpha at an offset from the stamp centre.
 *
 * Shape and texture are evaluated in slanted local stamp space so square,
 * diamond, grain, and streak options follow the visible dab angle.
 */
export function stampAlphaAt(
  dx: number,
  dy: number,
  radiusPx: number,
  hardness: number,
  options?: Partial<BrushStampOptions>,
): number {
  if (radiusPx <= 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  const stampOptions = normaliseStampOptions(options);
  const p = slantPoint(dx, dy, stampOptions.slantDeg);
  const dist = shapeDistance(p.x, p.y, stampOptions.shape);
  const alpha = stampAlpha(dist, radiusPx, hardness);
  if (alpha <= 0) return 0;
  return clamp01(alpha * textureMultiplier(stampOptions.texture, p.x, p.y, radiusPx));
}

/**
 * Stamp a dab onto an RGBA8888 buffer (straight alpha, 0–255 channels).
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
  options?: Partial<BrushStampOptions>,
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
      const stamp = stampAlphaAt(dx, dy, radiusPx, hardness, options);
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
  options?: Partial<BrushStampOptions>,
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
      const stamp = stampAlphaAt(dx, dy, radiusPx, hardness, options);
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
