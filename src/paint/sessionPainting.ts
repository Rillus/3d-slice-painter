export const SESSION_PAINTING_KEY = "3dsp.sessionPainting.v1";

/** Per-slice layout saved with the session (same order as `layers`). */
export type SessionSliceMetaV1 = {
  along: number;
  px: number;
  py: number;
  sx: number;
  sy: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  facing: string;
};

export type SessionPaintingV1 = {
  v: 1;
  w: number;
  h: number;
  /** PNG data URLs, one per slice index. */
  layers: string[];
  /** World spacing between nominal slice indices. */
  spacingWorld?: number;
  /** Active slice index when saved. */
  activeSliceIndex?: number;
  /** Per-slice offsets, scale, orientation; length must match `layers` when present. */
  sliceMeta?: SessionSliceMetaV1[];
};

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isSliceMetaRow(o: unknown): o is SessionSliceMetaV1 {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return (
    isFiniteNum(r.along) &&
    isFiniteNum(r.px) &&
    isFiniteNum(r.py) &&
    isFiniteNum(r.sx) &&
    isFiniteNum(r.sy) &&
    isFiniteNum(r.qx) &&
    isFiniteNum(r.qy) &&
    isFiniteNum(r.qz) &&
    isFiniteNum(r.qw) &&
    typeof r.facing === "string"
  );
}

export function parseSessionPaintingJson(raw: string): SessionPaintingV1 | null {
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const rec = o as {
      v?: unknown;
      w?: unknown;
      h?: unknown;
      layers?: unknown;
      spacingWorld?: unknown;
      activeSliceIndex?: unknown;
      sliceMeta?: unknown;
    };
    if (rec.v !== 1) return null;
    if (typeof rec.w !== "number" || typeof rec.h !== "number") return null;
    if (!Array.isArray(rec.layers)) return null;
    const layers = rec.layers.filter((x): x is string => typeof x === "string");
    if (layers.length !== rec.layers.length) return null;
    if (layers.length < 1 || layers.length > 128) return null;

    let sliceMeta: SessionSliceMetaV1[] | undefined;
    if (rec.sliceMeta !== undefined) {
      if (!Array.isArray(rec.sliceMeta) || rec.sliceMeta.length !== layers.length) return null;
      const rows = rec.sliceMeta.map((x) => (isSliceMetaRow(x) ? x : null));
      if (rows.some((x) => x === null)) return null;
      sliceMeta = rows as SessionSliceMetaV1[];
    }

    let spacingWorld: number | undefined;
    if (rec.spacingWorld !== undefined) {
      if (!isFiniteNum(rec.spacingWorld)) return null;
      spacingWorld = rec.spacingWorld;
    }

    let activeSliceIndex: number | undefined;
    if (rec.activeSliceIndex !== undefined) {
      if (!isFiniteNum(rec.activeSliceIndex)) return null;
      activeSliceIndex = rec.activeSliceIndex;
    }

    return { v: 1, w: rec.w, h: rec.h, layers, spacingWorld, activeSliceIndex, sliceMeta };
  } catch {
    return null;
  }
}

export function serialiseSessionPainting(payload: SessionPaintingV1): string {
  return JSON.stringify(payload);
}
