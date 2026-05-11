import { describe, expect, it } from "vitest";
import { buildProjectManifest, serialiseManifest, slicePngFilename } from "./exportBundle.js";

describe("slicePngFilename", () => {
  it("pads slice index to four digits", () => {
    expect(slicePngFilename(0)).toBe("slice_0000.png");
    expect(slicePngFilename(12)).toBe("slice_0012.png");
  });
});

describe("buildProjectManifest", () => {
  it("builds a version 1 manifest", () => {
    const m = buildProjectManifest(
      {
        sliceCount: 3,
        spacingWorld: 0.1,
        canvasSize: 512,
        planeWidthWorld: 2.4,
        planeHeightWorld: 2.4,
      },
      "2026-05-11T12:00:00.000Z",
    );
    expect(m.version).toBe(1);
    expect(m.sliceCount).toBe(3);
    expect(m.spacingWorld).toBe(0.1);
    expect(m.exportedAt).toBe("2026-05-11T12:00:00.000Z");
  });

  it("includes per-slice plane offset and scale arrays when provided", () => {
    const m = buildProjectManifest(
      {
        sliceCount: 2,
        spacingWorld: 0.12,
        canvasSize: 512,
        planeWidthWorld: 2.4,
        planeHeightWorld: 2.4,
        slicePlaneOffsetX: [0.1, -0.2],
        slicePlaneOffsetY: [0, 0.3],
        slicePlaneScaleX: [1, 1.5],
        slicePlaneScaleY: [1, 0.8],
      },
      "2026-05-11T12:00:00.000Z",
    );
    expect(m.slicePlaneOffsetX).toEqual([0.1, -0.2]);
    expect(m.slicePlaneScaleY).toEqual([1, 0.8]);
  });

  it("accepts per-slice stack quaternions when provided", () => {
    const m = buildProjectManifest(
      {
        sliceCount: 1,
        spacingWorld: 0.12,
        canvasSize: 512,
        planeWidthWorld: 2.4,
        planeHeightWorld: 2.4,
        sliceStackQuaternions: [{ x: 0, y: 0, z: 0, w: 1 }],
        sliceOrientationCardinals: ["pz"],
      },
      "2026-05-11T12:00:00.000Z",
    );
    expect(m.sliceStackQuaternions?.[0]?.w).toBe(1);
    expect(m.sliceOrientationCardinals?.[0]).toBe("pz");
  });
});

describe("serialiseManifest", () => {
  it("ends with a newline", () => {
    const m = buildProjectManifest(
      {
        sliceCount: 1,
        spacingWorld: 0.12,
        canvasSize: 512,
        planeWidthWorld: 2.4,
        planeHeightWorld: 2.4,
      },
      "2026-01-01T00:00:00.000Z",
    );
    expect(serialiseManifest(m).endsWith("\n")).toBe(true);
  });
});
