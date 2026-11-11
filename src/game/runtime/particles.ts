// Ambient overworld particles from level1. Every BridgeSequence owns one LeafManager/LeafParticles
// system (vertical 1x24 box at local x 22.2, leaves blown left by a world force, simulationSpeed 0.1)
// and one WindGustManager (rotated 180 deg about Y, so local +x is world -x) with NormalWind and
// SwirlyWind systems (max 3 particles each, velocity-over-lifetime curves, 0.1s trails).
// Systems simulate in their sequence's local space and prewarm one duration, as Unity does.
// Settings: gamedata.json `particles` (extracted ParticleSystem modules).
import raw from "../data/gamedata.json";
import { COLORS, type ColorName } from "../data";
import { cssColor } from "../assets";
import { evaluateCurve, type CurveKey } from "../animationCurve";
import { sprite, worldToScreen, type View } from "./draw";
import { SEQUENCE_HEIGHT, visibleSequences } from "./overworld";

const P = raw.particles;
const LEAF = P.leaf;
const WIND = P.wind;
// Unity TrailModule.lifetime is a multiplier of the owning particle's lifetime, not seconds:
// 0.1 x 5s = 0.5s of trail, which is what gives the gusts their long white swirly streaks.
export const WIND_TRAIL_SECONDS = WIND.trailLifetime * WIND.lifetime;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Colour-over-lifetime alpha (gradient alpha keys, linear blend). */
export function leafAlpha(life: number) {
  const k = LEAF.alphaKeys;
  if (life <= k[0]![0]!) return k[0]![1]!;
  for (let i = 1; i < k.length; i++) {
    const a = k[i - 1]!;
    const b = k[i]!;
    if (life <= b[0]!) return a[1]! + ((b[1]! - a[1]!) * (life - a[0]!)) / (b[0]! - a[0]! || 1);
  }
  return k[k.length - 1]![1]!;
}

// ---- 3D gradient noise (Unity NoiseModule stand-in: per-axis, octaves, scrolling) ----
const PERM = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  return [...p, ...p];
})();
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h: number, x: number, y: number, z: number) {
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
function perlin(x: number, y: number, z: number) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = PERM[X]! + Y, AA = PERM[A]! + Z, AB = PERM[A + 1]! + Z;
  const B = PERM[X + 1]! + Y, BA = PERM[B]! + Z, BB = PERM[B + 1]! + Z;
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(grad(PERM[AA]! & 15, x, y, z), grad(PERM[BA]! & 15, x - 1, y, z), u),
      l(grad(PERM[AB]! & 15, x, y - 1, z), grad(PERM[BB]! & 15, x - 1, y - 1, z), u), v),
    l(l(grad(PERM[AA + 1]! & 15, x, y, z - 1), grad(PERM[BA + 1]! & 15, x - 1, y, z - 1), u),
      l(grad(PERM[AB + 1]! & 15, x, y - 1, z - 1), grad(PERM[BB + 1]! & 15, x - 1, y - 1, z - 1), u), v),
    w,
  );
}
const N = LEAF.noise;
function noise(x: number, y: number, t: number, axis: number) {
  let sum = 0, amp = 1, f = N.frequency;
  for (let o = 0; o < N.octaves; o++) {
    sum += perlin(x * f + axis * 31.7, y * f + axis * 17.3, t * N.scrollSpeed * f + o * 7.1) * amp;
    amp *= N.octaveMultiplier;
    f *= N.octaveScale;
  }
  return Math.max(-1, Math.min(1, sum));
}

interface Leaf { x: number; y: number; vx: number; vy: number; age: number; size: number; rot: number }
interface TrailPt { x: number; y: number; t: number }
interface Gust { x: number; y: number; age: number; trail: TrailPt[] }
type WindKind = "normal" | "swirly";

/** One BridgeSequence's ambient systems, in that sequence's local space. */
class SequenceSystems {
  leaves: Leaf[] = [];
  gusts: Record<WindKind, Gust[]> = { normal: [], swirly: [] };
  private leafAcc = 0;
  private windAcc: Record<WindKind, number> = { normal: 0, swirly: 0 };
  private simTime = 0;

  constructor() {
    // prewarm: simulate one full loop duration of each system
    const lStep = 1 / 30;
    for (let t = 0; t < LEAF.duration / LEAF.simulationSpeed; t += lStep) this.stepLeaves(lStep);
    for (let t = 0; t < WIND.duration; t += 1 / 60) this.stepWind(1 / 60);
  }

  update(dt: number) {
    this.stepLeaves(dt);
    this.stepWind(dt);
  }

  private stepLeaves(realDt: number) {
    const dt = realDt * LEAF.simulationSpeed;
    this.simTime += dt;
    this.leafAcc += dt * LEAF.rate;
    while (this.leafAcc >= 1) {
      this.leafAcc -= 1;
      if (this.leaves.length >= LEAF.max) continue;
      this.leaves.push({
        x: LEAF.emitterX + rnd(-LEAF.boxW / 2, LEAF.boxW / 2),
        y: LEAF.boxCenterY + rnd(-LEAF.boxH / 2, LEAF.boxH / 2),
        vx: 0, // startSpeed is along local +Z (into the screen): no 2D motion
        vy: 0,
        age: 0,
        size: rnd(LEAF.sizeMin, LEAF.sizeMax),
        rot: rnd(LEAF.rotMinRad, LEAF.rotMaxRad),
      });
    }
    for (const l of this.leaves) {
      l.age += dt;
      const life = l.age / LEAF.lifetime;
      l.vx += LEAF.forceX * dt;
      l.vy -= 9.81 * LEAF.gravity * dt;
      l.x += (l.vx + noise(l.x, l.y, this.simTime, 0) * N.strengthX) * dt;
      l.y += (l.vy + noise(l.x, l.y, this.simTime, 1) * N.strengthY) * dt;
      l.rot += LEAF.angVelScaleRad * evaluateCurve(LEAF.angVelCurve as CurveKey[], life) * dt;
    }
    this.leaves = this.leaves.filter((l) => l.age < LEAF.lifetime);
  }

  private stepWind(dt: number) {
    const dir = WIND.mirrorX ? -1 : 1;
    for (const kind of ["normal", "swirly"] as const) {
      const k = WIND[kind];
      const list = this.gusts[kind];
      this.windAcc[kind] += dt * rnd(k.rateMin, k.rateMax);
      while (this.windAcc[kind] >= 1) {
        this.windAcc[kind] -= 1;
        if (list.length >= k.max) continue;
        const g: Gust = {
          x: rnd(-WIND.boxW / 2, WIND.boxW / 2),
          y: rnd(-WIND.boxH / 2, WIND.boxH / 2),
          age: 0,
          trail: [],
        };
        g.trail.push({ x: g.x, y: g.y, t: 0 });
        list.push(g);
      }
      for (const g of list) {
        g.age += dt;
        const life = g.age / WIND.lifetime;
        g.x += dir * evaluateCurve(k.velX as CurveKey[], life) * WIND.speedModifier * dt;
        g.y += evaluateCurve(k.velY as CurveKey[], life) * WIND.speedModifier * dt;
        const last = g.trail[g.trail.length - 1]!;
        if (Math.hypot(g.x - last.x, g.y - last.y) >= WIND.trailMinVertexDistance)
          g.trail.push({ x: g.x, y: g.y, t: g.age });
        while (g.trail.length > 0 && g.age - g.trail[0]!.t > WIND_TRAIL_SECONDS) g.trail.shift();
      }
      this.gusts[kind] = list.filter((g) => g.age < WIND.lifetime);
    }
  }
}

export class AmbientParticles {
  private systems = new Map<number, SequenceSystems>();

  update(dt: number, v: View) {
    const want = new Set(visibleSequences(v));
    for (const seq of want) if (!this.systems.has(seq)) this.systems.set(seq, new SequenceSystems());
    for (const seq of [...this.systems.keys()]) if (!want.has(seq)) this.systems.delete(seq);
    for (const s of this.systems.values()) s.update(dt);
  }

  draw(ctx: CanvasRenderingContext2D, v: View) {
    drawSystems(ctx, v, [...this.systems].map(([seq, s]) => [0, seq * SEQUENCE_HEIGHT, s] as const));
  }
}

/** The same wind gusts + leaves around the chess board (the arena sits on the same canal). */
export class BoardAmbience {
  private s = new SequenceSystems();
  update(dt: number) {
    this.s.update(dt);
  }
  draw(ctx: CanvasRenderingContext2D, v: View, cx: number, cy: number) {
    drawSystems(ctx, v, [[cx, cy, this.s]]);
  }
}

function drawSystems(
  ctx: CanvasRenderingContext2D,
  v: View,
  list: (readonly [number, number, SequenceSystems])[],
) {
  {
    // WindGustManager renderers (order 9) under LeafParticles (order 10)
    ctx.save();
    ctx.strokeStyle = cssColor(COLORS[WIND.color as ColorName]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [dx, dy, s] of list) {
      for (const g of [...s.gusts.normal, ...s.gusts.swirly]) {
        const size = WIND.size * evaluateCurve(WIND.sizeCurve as CurveKey[], g.age / WIND.lifetime);
        const pts = [...g.trail, { x: g.x, y: g.y, t: g.age }];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1]!;
          const b = pts[i]!;
          // widthOverTrail: 0 = head (newest), 1 = tail (oldest vertex)
          const u = Math.min(1, (g.age - (a.t + b.t) / 2) / WIND_TRAIL_SECONDS);
          const w = size * evaluateCurve(WIND.trailWidthCurve as CurveKey[], u) * v.ppu;
          if (w <= 0.05) continue;
          const pa = worldToScreen(v, a.x + dx, a.y + dy);
          const pb = worldToScreen(v, b.x + dx, b.y + dy);
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    for (const [dx, dy, s] of list) {
      for (const l of s.leaves) {
        const sc = l.size * 2; // leaf.png is 16px = 0.5 unit; particle quad = size units
        // authored full-colour sprite: drawn untinted. Unity particle rotation is clockwise-positive.
        sprite(ctx, v, LEAF.sprite, l.x + dx, l.y + dy, {
          sx: sc,
          sy: sc,
          rot: (-l.rot * 180) / Math.PI,
          alpha: leafAlpha(l.age / LEAF.lifetime),
        });
      }
    }
  }
}
