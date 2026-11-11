export interface CurveKey {
  time: number;
  value: number;
  inTangent: number;
  outTangent: number;
}

/** Unity AnimationCurve.Evaluate for unweighted, clamped scene curves. */
export function evaluateCurve(keys: readonly CurveKey[], time: number): number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return 0;
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (!a || !b || time > b.time) continue;
    const duration = b.time - a.time;
    const t = (time - a.time) / duration;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a.value
      + (t3 - 2 * t2 + t) * duration * a.outTangent
      + (-2 * t3 + 3 * t2) * b.value
      + (t3 - t2) * duration * b.inTangent;
  }
  return last.value;
}