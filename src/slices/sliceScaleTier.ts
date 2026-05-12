/** Slider upper bounds; drag past edge + release to ratchet to the next tier. */
export const SLIDER_TIER_MAXES = [2, 5, 10, 50] as const;

export const SLIDER_VALUE_MIN = 0;

export const MESH_SCALE_MIN = 0.05;
export const MESH_SCALE_MAX = 50;

export type ScaleTierIndex = 0 | 1 | 2 | 3;

export function clampMeshScale(n: number): number {
  return Math.min(MESH_SCALE_MAX, Math.max(MESH_SCALE_MIN, n));
}

/** Slider 0 maps to minimum mesh scale so the quad stays visible. */
export function meshScaleFromSliderValue(sliderVal: number, tierMaxVal: number): number {
  const tMax = Math.min(MESH_SCALE_MAX, tierMaxVal);
  const v = Math.max(SLIDER_VALUE_MIN, Math.min(tMax, sliderVal));
  if (v <= SLIDER_VALUE_MIN) return MESH_SCALE_MIN;
  return clampMeshScale(v);
}

export function tierMaxForIndex(i: ScaleTierIndex): number {
  return SLIDER_TIER_MAXES[i];
}

export function clampTierIndex(n: number): ScaleTierIndex {
  const t = Math.floor(n);
  return Math.max(0, Math.min(3, t)) as ScaleTierIndex;
}

/** Pick smallest tier whose cap fits `scale` (after clamp). */
export function inferTierFromMeshScale(scale: number): ScaleTierIndex {
  const s = clampMeshScale(scale);
  for (let i = 0; i < SLIDER_TIER_MAXES.length; i++) {
    const cap = SLIDER_TIER_MAXES[i];
    if (cap !== undefined && s <= cap) return i as ScaleTierIndex;
  }
  return 3;
}

/** Raise tier until mesh scale fits within current tier max (for restore / external edits). */
export function bumpTierUpUntilMeshFits(tier: ScaleTierIndex, meshScale: number): ScaleTierIndex {
  let t = tier;
  const s = clampMeshScale(meshScale);
  while (t < 3 && s > (SLIDER_TIER_MAXES[t] ?? MESH_SCALE_MAX)) {
    t = (t + 1) as ScaleTierIndex;
  }
  return t;
}

export function ratchetTierUp(tier: ScaleTierIndex): ScaleTierIndex {
  return tier < 3 ? ((tier + 1) as ScaleTierIndex) : tier;
}

export function ratchetTierDown(tier: ScaleTierIndex): ScaleTierIndex {
  return tier > 0 ? ((tier - 1) as ScaleTierIndex) : tier;
}

/** After ratcheting down, clamp mesh scale so it fits the new tier cap. */
export function clampMeshScaleToTierCap(meshScale: number, tier: ScaleTierIndex): number {
  const cap = SLIDER_TIER_MAXES[tier];
  return clampMeshScale(Math.min(meshScale, cap));
}

export function sliderStepForTierMax(tierMaxVal: number): string {
  if (tierMaxVal <= 2) return "0.02";
  if (tierMaxVal <= 5) return "0.05";
  return "0.1";
}
