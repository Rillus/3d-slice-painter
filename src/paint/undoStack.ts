/** Pushes a copy of `pixels` and drops oldest entries when over `maxDepth`. */
export function pushPreStrokeSnapshot(
  stack: Uint8ClampedArray[],
  pixels: Uint8ClampedArray,
  maxDepth: number,
): void {
  stack.push(new Uint8ClampedArray(pixels));
  while (stack.length > maxDepth) stack.shift();
}
