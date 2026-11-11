// Bridge scenery shared by the overworld (level1) and the chess arena: the BridgeSequence prefab
// (tiled by BridgeLoop), animated canal water and the LilyPad clusters (SineMovement + LilyPad.Buoyance).
import { COLORS, ESTIMATED, SCENE_BACKGROUND, type ColorName, type SceneSprite } from "../data";
import { cssColor, range } from "../assets";
import { evaluateCurve, type CurveKey } from "../animationCurve";
import { playSound } from "../audio";
import { rect, sprite, viewBounds, type View } from "./draw";

export const WATER_FRAMES = range("water_", 1, 22);
const W = ESTIMATED.water;
const L = ESTIMATED.lilypad;

const isLily = (s: SceneSprite) => s.sprite.startsWith("lillypad");
const clusterOf = (s: SceneSprite) => (s.path ?? "").split("/HOLDERHOLDER")[0] ?? "";
const colorOf = (name: string | null): ColorName | null =>
  name && name in COLORS ? (name as ColorName) : null;

/** Every sprite of the BridgeSequence prefab (one 20-unit bridge segment with its lily pads). */
export const BRIDGE_SEQUENCE = SCENE_BACKGROUND.filter((s) =>
  (s.path ?? "").startsWith("Background/BridgeSequence"),
).sort((a, b) => a.order - b.order);
export const SEQUENCE_HEIGHT = ESTIMATED.overworld.bridgeSequenceOffsetY;

export interface LilyCluster {
  key: string;
  x: number;
  y: number;
}
export const LILY_CLUSTERS: LilyCluster[] = [
  ...new Map(BRIDGE_SEQUENCE.filter(isLily).map((s) => [clusterOf(s), s])).values(),
].map((s) => ({ key: clusterOf(s), x: s.x, y: s.y }));

/** Animated water: 22 frames, tiled across the canal on both sides of the bridge rocks. */
export function drawWater(ctx: CanvasRenderingContext2D, v: View, t: number) {
  const frame = WATER_FRAMES[Math.floor(t * W.fps) % WATER_FRAMES.length];
  const b = viewBounds(v);
  for (let cx = Math.floor(b.minX) + 0.5; cx < b.maxX + 1; cx += 1) {
    if (Math.abs(cx) < W.minAbsX) continue;
    for (let cy = Math.floor(b.minY) + 0.5; cy < b.maxY + 1; cy += 1)
      sprite(ctx, v, frame, cx, cy, { color: W.tint });
  }
}

/** Per-instance lily pad state: SineMovement noise on HOLDER, Buoyance coroutine on HOLDERHOLDER. */
export class LilyPads {
  private noise = new Map<string, number>();
  private buoy = new Map<string, number>();

  private keyOf(seq: number, c: LilyCluster) {
    return `${seq}|${c.key}`;
  }

  private noiseOf(k: string) {
    let n = this.noise.get(k);
    if (n === undefined) {
      n = Math.random(); // SineMovement.doNoise
      this.noise.set(k, n);
    }
    return n;
  }

  /** Local y offset of a cluster (bob + buoyance). */
  offset(seq: number, c: LilyCluster, t: number): number {
    const k = this.keyOf(seq, c);
    const bob = Math.sin((t + this.noiseOf(k)) * L.sineFreq) * L.sineAmp;
    const start = this.buoy.get(k);
    let b = 0;
    if (start !== undefined) {
      const keys: CurveKey[] = L.buoyanceCurve;
      const el = t - start;
      if (el >= (keys[keys.length - 1]?.time ?? 0)) this.buoy.delete(k);
      else b = evaluateCurve(keys, el);
    }
    return bob + b;
  }

  /** LilyPad.OnMouseDown; returns true when a pad was hit. */
  tap(wx: number, wy: number, t: number, seqs: number[] = [0]): boolean {
    for (const seq of seqs) {
      for (const c of LILY_CLUSTERS) {
        const cy = c.y + seq * SEQUENCE_HEIGHT;
        if (Math.abs(wx - c.x) > 0.5 || Math.abs(wy - cy) > 0.5) continue;
        const k = this.keyOf(seq, c);
        if (!this.buoy.has(k)) {
          this.buoy.set(k, t);
          playSound("overworld_lilypad");
        }
        return true;
      }
    }
    return false;
  }
}

/** Sequence indices (BridgeLoop copies) overlapping the view. */
export function visibleSequences(v: View): number[] {
  const b = viewBounds(v);
  const half = SEQUENCE_HEIGHT / 2;
  const out: number[] = [];
  for (
    let i = Math.floor((b.minY + half) / SEQUENCE_HEIGHT) - 1;
    i <= Math.ceil((b.maxY - half) / SEQUENCE_HEIGHT) + 1;
    i++
  )
    out.push(i);
  return out;
}

export function drawSceneSprite(ctx: CanvasRenderingContext2D, v: View, s: SceneSprite, dy = 0) {
  if (s.sprite === "Square") {
    const c = colorOf(s.color);
    rect(ctx, v, s.x, s.y + dy, s.sx ?? 1, s.sy ?? 1, cssColor(c ? COLORS[c] : s.tint));
    return;
  }
  sprite(ctx, v, s.sprite, s.x, s.y + dy, { color: colorOf(s.color), sx: s.sx, sy: s.sy });
}

/** One copy of the BridgeSequence prefab at sequence index `seq`. */
export function drawBridgeSequence(
  ctx: CanvasRenderingContext2D,
  v: View,
  t: number,
  lilies: LilyPads,
  seq: number,
) {
  const dy = seq * SEQUENCE_HEIGHT;
  const clusters = new Map(LILY_CLUSTERS.map((c) => [c.key, c]));
  for (const s of BRIDGE_SEQUENCE) {
    if (isLily(s)) {
      const c = clusters.get(clusterOf(s));
      drawSceneSprite(ctx, v, s, dy + (c ? lilies.offset(seq, c, t) : 0));
    } else drawSceneSprite(ctx, v, s, dy);
  }
}

export { isLily, clusterOf };
