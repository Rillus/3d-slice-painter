import { describe, expect, it } from "vitest";
import { createRectOutlineLoop, stackPositionZForIndex } from "./outlineGeometry.js";

describe("stackPositionZForIndex", () => {
  it("places index 0 on the origin plane", () => {
    expect(stackPositionZForIndex(0, 0.12)).toBe(0);
  });

  it("steps by negative Z for increasing index", () => {
    expect(stackPositionZForIndex(1, 0.1)).toBeCloseTo(-0.1);
    expect(stackPositionZForIndex(3, 0.05)).toBeCloseTo(-0.15);
  });

  it("treats negative gap as zero", () => {
    expect(stackPositionZForIndex(2, -1)).toBe(0);
  });
});

describe("createRectOutlineLoop", () => {
  it("creates a position buffer with four corners", () => {
    const g = createRectOutlineLoop(2, 2, 0);
    const pos = g.getAttribute("position");
    expect(pos?.count).toBe(4);
    expect(pos?.getX(0)).toBeCloseTo(-1);
    expect(pos?.getY(0)).toBeCloseTo(-1);
    expect(pos?.getX(2)).toBeCloseTo(1);
    expect(pos?.getY(2)).toBeCloseTo(1);
  });
});
