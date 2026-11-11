import { expect, it } from "vitest";
import raw from "./data/gamedata.json";
import { evaluateCurve } from "./animationCurve";

it("plays every original manhole and troll keyframe exactly", () => {
  for (const curve of [raw.overworldIntro.manholeCurve, raw.overworldIntro.trollCurve]) {
    for (const key of curve) expect(evaluateCurve(curve, key.time)).toBeCloseTo(key.value, 10);
  }
  expect(evaluateCurve(raw.overworldIntro.trollCurve, 0)).toBe(10);
  expect(evaluateCurve(raw.overworldIntro.trollCurve, 1)).toBe(0);
  expect(evaluateCurve(raw.overworldIntro.trollCurve, 10)).toBe(0);
});

it("uses Unity's tangents between keys instead of a straight line", () => {
  expect(evaluateCurve(raw.overworldIntro.trollCurve, 0.5)).toBeCloseTo(7.802676483988762, 8);
});