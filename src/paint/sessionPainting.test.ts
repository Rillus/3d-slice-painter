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

  it("rejects invalid JSON and wrong shapes", () => {
    expect(parseSessionPaintingJson("")).toBe(null);
    expect(parseSessionPaintingJson("{}")).toBe(null);
    expect(parseSessionPaintingJson(JSON.stringify({ v: 2, w: 512, h: 512, layers: ["a"] }))).toBe(null);
    expect(parseSessionPaintingJson(JSON.stringify({ v: 1, w: "x", h: 512, layers: ["a"] }))).toBe(null);
    expect(parseSessionPaintingJson(JSON.stringify({ v: 1, w: 512, h: 512, layers: [] }))).toBe(null);
  });
});
