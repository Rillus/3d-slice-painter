import { describe, expect, it } from "vitest";
import { normaliseBrushParams } from "./params.js";

describe("normaliseBrushParams", () => {
  it("allows a 1px brush size", () => {
    expect(
      normaliseBrushParams({
        size: "1",
        opacityPct: "85",
        hardnessPct: "65",
        shape: "round",
        slantDeg: "0",
        texture: "smooth",
      }).radiusPx,
    ).toBe(1);
  });

  it("clamps invalid numeric input to safe painting ranges", () => {
    expect(
      normaliseBrushParams({
        size: "-4",
        opacityPct: "250",
        hardnessPct: "-10",
        shape: "round",
        slantDeg: "120",
        texture: "smooth",
      }),
    ).toMatchObject({
      radiusPx: 1,
      opacity: 1,
      hardness: 0,
      slantDeg: 60,
    });
  });

  it("normalises brush option values and falls back to defaults", () => {
    expect(
      normaliseBrushParams({
        size: "32",
        opacityPct: "85",
        hardnessPct: "65",
        shape: "not-a-shape",
        slantDeg: "not-a-number",
        texture: "not-a-texture",
      }),
    ).toMatchObject({
      shape: "round",
      slantDeg: 0,
      texture: "smooth",
    });
  });
});
