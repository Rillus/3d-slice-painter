import { describe, expect, it } from "vitest";
import { stackNudgeStepWorld, stackPositionScalar } from "./stackPosition.js";

describe("stackPositionScalar", () => {
  it("places index 0 at the origin when offset is zero", () => {
    expect(stackPositionScalar(0, 0.12, 0)).toBe(0);
  });

  it("steps by −gap per index", () => {
    expect(stackPositionScalar(1, 0.1, 0)).toBeCloseTo(-0.1);
  });

  it("applies along-stack offset on top of nominal index position", () => {
    expect(stackPositionScalar(0, 0.1, 0.05)).toBeCloseTo(-0.05);
    expect(stackPositionScalar(1, 0.1, 0)).toBeCloseTo(-0.1);
  });
});

describe("stackNudgeStepWorld", () => {
  it("scales with gap with a sensible floor", () => {
    expect(stackNudgeStepWorld(0.12)).toBeCloseTo(0.03);
    expect(stackNudgeStepWorld(0.02)).toBe(0.01);
  });
});
