/**
 * Scalar multiplier for the stack axis unit vector (paint plane world normal).
 * Nominal slice index i sits at `scalar * worldNormal`; offsets shift along the same line.
 */
export function stackPositionScalar(index: number, gap: number, alongStackOffset: number): number {
  const g = Math.max(0.001, gap);
  const s = -(index * g + alongStackOffset);
  return s === 0 ? 0 : s;
}

export function stackNudgeStepWorld(gap: number): number {
  return Math.max(0.01, Math.max(0.001, gap) * 0.25);
}
