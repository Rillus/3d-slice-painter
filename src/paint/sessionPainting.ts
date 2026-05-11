export const SESSION_PAINTING_KEY = "3dsp.sessionPainting.v1";

export type SessionPaintingV1 = {
  v: 1;
  w: number;
  h: number;
  /** PNG data URLs, one per slice index. */
  layers: string[];
};

export function parseSessionPaintingJson(raw: string): SessionPaintingV1 | null {
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const rec = o as { v?: unknown; w?: unknown; h?: unknown; layers?: unknown };
    if (rec.v !== 1) return null;
    if (typeof rec.w !== "number" || typeof rec.h !== "number") return null;
    if (!Array.isArray(rec.layers)) return null;
    const layers = rec.layers.filter((x): x is string => typeof x === "string");
    if (layers.length !== rec.layers.length) return null;
    if (layers.length < 1 || layers.length > 128) return null;
    return { v: 1, w: rec.w, h: rec.h, layers };
  } catch {
    return null;
  }
}

export function serialiseSessionPainting(payload: SessionPaintingV1): string {
  return JSON.stringify(payload);
}
