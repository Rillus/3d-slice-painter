export type Point2 = { x: number; y: number };

/**
 * Evenly spaced samples from (x0,y0) to (x1,y1) inclusive.
 * Consecutive samples are separated by at most `maxStepPx` (Euclidean distance).
 */
export function samplesAlongSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  maxStepPx: number,
): Point2[] {
  const step = Number.isFinite(maxStepPx) && maxStepPx > 0 ? maxStepPx : 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return [{ x: x0, y: y0 }];

  const nSteps = Math.max(1, Math.ceil(dist / step));
  const out: Point2[] = [];
  for (let i = 0; i <= nSteps; i++) {
    const t = i / nSteps;
    out.push({ x: x0 + dx * t, y: y0 + dy * t });
  }
  return dedupeConsecutive(out);
}

function dedupeConsecutive(points: Point2[]): Point2[] {
  const out: Point2[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) out.push(p);
  }
  return out;
}

/** Recommended max distance between dab centres for a continuous stroke. */
export function dabSpacingForRadius(radiusPx: number): number {
  const r = Math.max(1, radiusPx);
  return r * 0.38;
}

export function maxGapBetweenConsecutive(points: Point2[]): number {
  let max = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    max = Math.max(max, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return max;
}
