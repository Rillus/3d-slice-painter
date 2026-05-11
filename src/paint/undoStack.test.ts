import { describe, expect, it } from "vitest";
import { pushPreStrokeSnapshot } from "./undoStack.js";

describe("pushPreStrokeSnapshot", () => {
  it("keeps at most maxDepth snapshots, dropping oldest", () => {
    const stack: Uint8ClampedArray[] = [];
    for (let i = 0; i < 5; i++) {
      const p = new Uint8ClampedArray(4);
      p.fill(i);
      pushPreStrokeSnapshot(stack, p, 3);
    }
    expect(stack.length).toBe(3);
    expect(stack[0]![0]).toBe(2);
    expect(stack[2]![0]).toBe(4);
  });
});
