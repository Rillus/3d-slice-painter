import { describe, expect, it } from "vitest";
import { formatHexRgb, formatHexRgba, parseHexRgb, parseHexRgba, swatchKeyFromRgba } from "./hex.js";

describe("parseHexRgb", () => {
  it("parses six-digit hex with hash", () => {
    expect(parseHexRgb("#aB12Cd")).toEqual({ r: 171, g: 18, b: 205 });
  });

  it("parses without hash", () => {
    expect(parseHexRgb("000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("returns null for invalid strings", () => {
    expect(parseHexRgb("#fff")).toBeNull();
    expect(parseHexRgb("#gg0000")).toBeNull();
    expect(parseHexRgb("")).toBeNull();
  });

  it("rejects eight-digit hex", () => {
    expect(parseHexRgb("#ff000080")).toBeNull();
  });
});

describe("parseHexRgba", () => {
  it("parses eight-digit hex with alpha", () => {
    expect(parseHexRgba("#ff000080")).toEqual({ r: 255, g: 0, b: 0, a: 128 });
  });

  it("parses six-digit as opaque", () => {
    expect(parseHexRgba("#00ff00")).toEqual({ r: 0, g: 255, b: 0, a: 255 });
  });

  it("parses fully transparent", () => {
    expect(parseHexRgba("#00000000")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
});

describe("swatchKeyFromRgba", () => {
  it("uses short hex when opaque", () => {
    expect(swatchKeyFromRgba({ r: 10, g: 20, b: 30, a: 255 })).toBe("#0a141e");
  });

  it("uses eight-digit when translucent", () => {
    expect(swatchKeyFromRgba({ r: 0, g: 0, b: 0, a: 0 })).toBe("#00000000");
  });
});

describe("formatHexRgba", () => {
  it("formats eight digits", () => {
    expect(formatHexRgba(0, 128, 255, 0)).toBe("#0080ff00");
  });
});

describe("formatHexRgb", () => {
  it("round-trips with parseHexRgb", () => {
    const rgb = { r: 12, g: 200, b: 99 };
    expect(parseHexRgb(formatHexRgb(rgb.r, rgb.g, rgb.b))).toEqual(rgb);
  });

  it("clamps channels", () => {
    expect(formatHexRgb(-5, 300, 128)).toBe("#00ff80");
  });
});
