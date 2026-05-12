import { describe, expect, it } from "vitest";
import {
  parseSessionPaintingJson,
  serialiseSessionPainting,
  type SessionPaintingV1,
} from "./sessionPainting.js";

describe("sessionPainting", () => {
  it("parses valid v1 payload", () => {
    const payload: SessionPaintingV1 = {
      v: 1,
      w: 512,
      h: 512,
      layers: ["data:image/png;base64,xx", "data:image/png;base64,yy"],
    };
    const round = parseSessionPaintingJson(serialiseSessionPainting(payload));
    expect(round).toEqual(payload);
  });

  it("parses payload with sliceMeta matching layers", () => {
    const payload = {
      v: 1 as const,
      w: 512,
      h: 512,
      layers: ["data:image/png;base64,aa", "data:image/png;base64,bb"],
      spacingWorld: 0.15,
      activeSliceIndex: 1,
      sliceMeta: [
        {
          along: 0,
          px: 0,
          py: 0,
          sx: 1,
          sy: 1,
          qx: 0,
          qy: 0,
          qz: 0,
          qw: 1,
          facing: "pz",
          tsx: 2,
          tsy: 0,
        },
        {
          along: 0.1,
          px: 0.2,
          py: -0.1,
          sx: 1.2,
          sy: 0.9,
          qx: 0,
          qy: 0,
          qz: 0,
          qw: 1,
          facing: "px",
        },
      ],
    };
    expect(parseSessionPaintingJson(JSON.stringify(payload))).toEqual(payload);
  });

  it("rejects sliceMeta length mismatch", () => {
    expect(
      parseSessionPaintingJson(
        JSON.stringify({
          v: 1,
          w: 512,
          h: 512,
          layers: ["a", "b"],
          sliceMeta: [{ along: 0, px: 0, py: 0, sx: 1, sy: 1, qx: 0, qy: 0, qz: 0, qw: 1, facing: "pz" }],
        }),
      ),
    ).toBe(null);
  });

  it("rejects invalid JSON and wrong shapes", () => {
    expect(parseSessionPaintingJson("")).toBe(null);
    expect(parseSessionPaintingJson("{}")).toBe(null);
    expect(parseSessionPaintingJson(JSON.stringify({ v: 2, w: 512, h: 512, layers: ["a"] }))).toBe(null);
    expect(parseSessionPaintingJson(JSON.stringify({ v: 1, w: "x", h: 512, layers: ["a"] }))).toBe(null);
    expect(parseSessionPaintingJson(JSON.stringify({ v: 1, w: 512, h: 512, layers: [] }))).toBe(null);
  });
});
