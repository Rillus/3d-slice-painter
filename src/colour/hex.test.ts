import { describe, expect, it } from "vitest";
import { formatHexRgb, parseHexRgb } from "./hex.js";

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
