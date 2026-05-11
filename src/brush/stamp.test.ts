import { describe, expect, it } from "vitest";
import { compositeDab, smoothstep, stampAlpha } from "./stamp.js";

describe("smoothstep", () => {
  it("returns 0 at or below the lower edge", () => {
    expect(smoothstep(0.2, 0.8, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.8, 0.2)).toBe(0);
  });

  it("returns 1 at or above the upper edge", () => {
    expect(smoothstep(0.2, 0.8, 0.9)).toBe(1);
    expect(smoothstep(0.2, 0.8, 0.8)).toBe(1);
  });

  it("is monotonic between edges", () => {
    const a = smoothstep(0, 1, 0.25);
    const b = smoothstep(0, 1, 0.75);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeLessThan(1);
    expect(b).toBeGreaterThan(a);
  });
});

describe("stampAlpha", () => {
  it("returns 0 outside radius", () => {
    expect(stampAlpha(10, 8, 0.5)).toBe(0);
  });

  it("returns 1 at centre for positive radius", () => {
    expect(stampAlpha(0, 20, 0.5)).toBe(1);
  });

  it("with full hardness, interior of disc is solid", () => {
    expect(stampAlpha(7.9, 8, 1)).toBe(1);
  });

  it("with zero hardness, falls off smoothly from centre", () => {
    expect(stampAlpha(0, 10, 0)).toBe(1);
    const mid = stampAlpha(5, 10, 0);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("clamps hardness to 0..1", () => {
    expect(stampAlpha(4, 10, -1)).toBe(stampAlpha(4, 10, 0));
    expect(stampAlpha(4, 10, 2)).toBe(stampAlpha(4, 10, 1));
  });
});

describe("compositeDab", () => {
  it("writes opaque stroke at centre", () => {
    const w = 32;
    const h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    compositeDab(data, w, h, 16, 16, 8, 0.8, 1, { r: 200, g: 40, b: 40, a: 255 });
    const idx = (16 * w + 16) * 4;
    expect(data[idx]).toBeGreaterThan(180);
    expect(data[idx + 3]).toBeGreaterThan(200);
  });

  it("leaves pixels outside radius unchanged", () => {
    const w = 64;
    const h = 64;
    const data = new Uint8ClampedArray(w * h * 4);
    data.fill(0);
    compositeDab(data, w, h, 32, 32, 6, 1, 1, { r: 0, g: 255, b: 0, a: 255 });
    const corner = (0 * w + 0) * 4;
    expect(data[corner]).toBe(0);
    expect(data[corner + 3]).toBe(0);
  });

  it("respects opacity at centre", () => {
    const w = 16;
    const h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    compositeDab(data, w, h, 8, 8, 6, 1, 0.5, { r: 100, g: 0, b: 0, a: 255 });
    const idx = (8 * w + 8) * 4;
    expect(data[idx + 3]).toBeLessThan(200);
    expect(data[idx + 3]).toBeGreaterThan(100);
  });

  it("accumulates a second dab over the first", () => {
    const w = 24;
    const h = 24;
    const data = new Uint8ClampedArray(w * h * 4);
    compositeDab(data, w, h, 12, 12, 10, 0.5, 0.4, { r: 255, g: 0, b: 0, a: 255 });
    const afterFirst = data[(12 * w + 12) * 4 + 3] ?? 0;
    compositeDab(data, w, h, 12, 12, 10, 0.5, 0.6, { r: 0, g: 0, b: 255, a: 255 });
    const afterSecond = data[(12 * w + 12) * 4 + 3] ?? 0;
    expect(afterSecond).toBeGreaterThanOrEqual(afterFirst);
  });
});
