import { describe, expect, it } from "vitest";
import { dabSpacingForRadius, maxGapBetweenConsecutive, samplesAlongSegment } from "./strokePath.js";

describe("samplesAlongSegment", () => {
  it("returns a single point when start and end coincide", () => {
    const pts = samplesAlongSegment(3, 4, 3, 4, 4);
    expect(pts).toEqual([{ x: 3, y: 4 }]);
  });

  it("returns endpoints when segment is shorter than max step", () => {
    const pts = samplesAlongSegment(0, 0, 3, 4, 10);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ]);
  });

  it("limits gap between consecutive samples to at most maxStepPx", () => {
    const step = 5;
    const pts = samplesAlongSegment(0, 0, 100, 0, step);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(maxGapBetweenConsecutive(pts)).toBeLessThanOrEqual(step + 1e-6);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 });
  });

  it("uses step of 1 when maxStepPx is invalid", () => {
    const pts = samplesAlongSegment(0, 0, 5, 0, 0);
    expect(maxGapBetweenConsecutive(pts)).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("dabSpacingForRadius", () => {
  it("scales with radius", () => {
    expect(dabSpacingForRadius(10)).toBeGreaterThan(dabSpacingForRadius(5));
  });
});
