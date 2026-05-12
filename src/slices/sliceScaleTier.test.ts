import { describe, expect, it } from "vitest";
import {
  bumpTierUpUntilMeshFits,
  clampMeshScale,
  clampMeshScaleToTierCap,
  inferTierFromMeshScale,
  meshScaleFromSliderValue,
  MESH_SCALE_MIN,
  ratchetTierDown,
  ratchetTierUp,
  SLIDER_TIER_MAXES,
} from "./sliceScaleTier.js";

describe("sliceScaleTier", () => {
  it("maps slider 0 to mesh minimum scale", () => {
    expect(meshScaleFromSliderValue(0, 2)).toBe(MESH_SCALE_MIN);
  });

  it("maps slider value within tier directly when >= mesh min", () => {
    expect(meshScaleFromSliderValue(1, 2)).toBe(1);
    expect(meshScaleFromSliderValue(2, 2)).toBe(2);
  });

  it("infers tier from mesh scale", () => {
    expect(inferTierFromMeshScale(0.5)).toBe(0);
    expect(inferTierFromMeshScale(2)).toBe(0);
    expect(inferTierFromMeshScale(3)).toBe(1);
    expect(inferTierFromMeshScale(7)).toBe(2);
    expect(inferTierFromMeshScale(25)).toBe(3);
  });

  it("bumps tier up until mesh fits cap", () => {
    expect(bumpTierUpUntilMeshFits(0, 8)).toBe(2);
    expect(bumpTierUpUntilMeshFits(0, 2)).toBe(0);
    expect(bumpTierUpUntilMeshFits(3, 50)).toBe(3);
  });

  it("ratchets tier up and down", () => {
    expect(ratchetTierUp(0)).toBe(1);
    expect(ratchetTierUp(3)).toBe(3);
    expect(ratchetTierDown(1)).toBe(0);
    expect(ratchetTierDown(0)).toBe(0);
  });

  it("clamps mesh to tier cap when ratcheting down", () => {
    expect(clampMeshScaleToTierCap(8, 1)).toBe(SLIDER_TIER_MAXES[1]);
    expect(clampMeshScale(clampMeshScaleToTierCap(4, 0))).toBe(2);
  });
});
