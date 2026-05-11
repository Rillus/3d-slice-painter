import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadHudDockExpanded, saveHudDockExpanded } from "./hudDockPrefs.js";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear() {
      m.clear();
    },
    getItem(k: string) {
      return m.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      m.set(k, String(v));
    },
    removeItem(k: string) {
      m.delete(k);
    },
    key(i: number) {
      return [...m.keys()][i] ?? null;
    },
  } as Storage;
}

describe("hudDockPrefs", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to expanded when unset", () => {
    expect(loadHudDockExpanded("toolbar")).toBe(true);
    expect(loadHudDockExpanded("left", false)).toBe(false);
  });

  it("round-trips expanded state per dock", () => {
    saveHudDockExpanded("toolbar", false);
    saveHudDockExpanded("left", true);
    expect(loadHudDockExpanded("toolbar")).toBe(false);
    expect(loadHudDockExpanded("left")).toBe(true);
    expect(loadHudDockExpanded("right")).toBe(true);
  });
});
