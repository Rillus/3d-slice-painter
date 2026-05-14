import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  createProjectBundleZip,
  readProjectBundleZip,
  validateProjectManifest,
} from "./projectBundle.js";
import { buildProjectManifest, slicePngFilename } from "./exportBundle.js";

const manifest = buildProjectManifest(
  {
    sliceCount: 2,
    spacingWorld: 0.12,
    canvasSize: 512,
    planeWidthWorld: 2.4,
    planeHeightWorld: 2.4,
    sliceStackQuaternions: [
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 0, y: 0, z: 0, w: 1 },
    ],
    sliceOrientationCardinals: ["pz", null],
    sliceAlongStackOffsets: [0, 0.02],
    slicePlaneOffsetX: [0, 0.1],
    slicePlaneOffsetY: [0, -0.2],
    slicePlaneScaleX: [1, 1.5],
    slicePlaneScaleY: [1, 0.75],
  },
  "2026-05-14T15:54:00.000Z",
);

describe("validateProjectManifest", () => {
  it("accepts the canonical project manifest shape", () => {
    expect(validateProjectManifest(manifest)).toEqual(manifest);
  });

  it("rejects invalid manifest values and mismatched per-slice arrays", () => {
    expect(validateProjectManifest({ ...manifest, version: 2 })).toBe(null);
    expect(validateProjectManifest({ ...manifest, sliceCount: 0 })).toBe(null);
    expect(validateProjectManifest({ ...manifest, spacingWorld: Number.NaN })).toBe(null);
    expect(validateProjectManifest({ ...manifest, slicePlaneScaleX: [1] })).toBe(null);
  });
});

describe("project bundle zip", () => {
  it("round-trips project.json with PNG slice entries", () => {
    const slices = [new Uint8Array([137, 80, 78, 71, 1]), new Uint8Array([137, 80, 78, 71, 2])];
    const zipped = createProjectBundleZip({ manifest, pngSlices: slices });

    const bundle = readProjectBundleZip(zipped);

    expect(bundle.manifest).toEqual(manifest);
    expect(bundle.slices.map((s) => s.filename)).toEqual([slicePngFilename(0), slicePngFilename(1)]);
    expect(bundle.slices.map((s) => Array.from(s.bytes))).toEqual(slices.map((s) => Array.from(s)));
  });

  it("rejects bundles without project.json or required PNG slices", () => {
    expect(() => readProjectBundleZip(zipSync({ [slicePngFilename(0)]: new Uint8Array([1]) }))).toThrow(
      /project\.json/i,
    );

    const missingSlice = zipSync({
      "project.json": strToU8(JSON.stringify(manifest)),
      [slicePngFilename(0)]: new Uint8Array([1]),
    });
    expect(() => readProjectBundleZip(missingSlice)).toThrow(/slice_0001\.png/i);
  });
});
