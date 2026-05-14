import {
  DEFAULT_BRUSH_STAMP_OPTIONS,
  type BrushShape,
  type BrushStampOptions,
  type BrushTexture,
} from "./stamp.js";

export type BrushParamsInput = {
  size: string | number | null | undefined;
  opacityPct: string | number | null | undefined;
  hardnessPct: string | number | null | undefined;
  shape: string | null | undefined;
  slantDeg: string | number | null | undefined;
  texture: string | null | undefined;
};

export type BrushParams = BrushStampOptions & {
  radiusPx: number;
  opacity: number;
  hardness: number;
};

const BRUSH_SIZE_MIN_PX = 1;
const BRUSH_SIZE_DEFAULT_PX = 32;
const BRUSH_SLANT_MIN_DEG = -60;
const BRUSH_SLANT_MAX_DEG = 60;

const BRUSH_SHAPES: BrushShape[] = ["round", "square", "diamond"];
const BRUSH_TEXTURES: BrushTexture[] = ["smooth", "grain", "streak"];

function numberOrDefault(value: string | number | null | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normaliseShape(value: string | null | undefined): BrushShape {
  return BRUSH_SHAPES.includes(value as BrushShape) ? (value as BrushShape) : DEFAULT_BRUSH_STAMP_OPTIONS.shape;
}

function normaliseTexture(value: string | null | undefined): BrushTexture {
  return BRUSH_TEXTURES.includes(value as BrushTexture)
    ? (value as BrushTexture)
    : DEFAULT_BRUSH_STAMP_OPTIONS.texture;
}

export function normaliseBrushParams(input: BrushParamsInput): BrushParams {
  const size = numberOrDefault(input.size, BRUSH_SIZE_DEFAULT_PX);
  const opacityPct = numberOrDefault(input.opacityPct, 85);
  const hardnessPct = numberOrDefault(input.hardnessPct, 65);
  const slantDeg = numberOrDefault(input.slantDeg, DEFAULT_BRUSH_STAMP_OPTIONS.slantDeg);

  return {
    radiusPx: Math.max(BRUSH_SIZE_MIN_PX, size),
    opacity: clamp(opacityPct / 100, 0, 1),
    hardness: clamp(hardnessPct / 100, 0, 1),
    shape: normaliseShape(input.shape),
    slantDeg: clamp(slantDeg, BRUSH_SLANT_MIN_DEG, BRUSH_SLANT_MAX_DEG),
    texture: normaliseTexture(input.texture),
  };
}
