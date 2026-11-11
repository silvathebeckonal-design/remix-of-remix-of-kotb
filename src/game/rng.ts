// Unity's Random.Range semantics on top of a pluggable [0,1) source.
export interface Rng {
  next(): number;
}

export const mathRng: Rng = { next: () => Math.random() };

/** Seeded mulberry32, used by tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Random.Range(float, float): inclusive float range. */
export function rangeF(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

/** Random.Range(int, int): max exclusive. */
export function rangeI(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng.next() * (max - min));
}

/** Indexed access that fails loudly instead of returning undefined. */
export function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of range (${arr.length})`);
  return v;
}

/** Random element (Unity: list[Random.Range(0, list.Count)]). */
export function pickFrom<T>(rng: Rng, arr: readonly T[]): T {
  return at(arr, rangeI(rng, 0, arr.length));
}
