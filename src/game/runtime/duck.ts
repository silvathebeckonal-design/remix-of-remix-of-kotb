// Port of DuckManager (+ DuckSound animation events and the duck's SineMovement child).
// Without a board (overworld, ChessMatchManager == null) the duck only swims past, as in the original.
import { ESTIMATED, type V2 } from "../data";
import { range } from "../assets";
import { evaluateCurve, type CurveKey } from "../animationCurve";
import { playSound } from "../audio";
import { roundPoint } from "../rules";
import { sprite, type View } from "./draw";

export type DuckState = "Inactive" | "Swimming" | "Walking" | "HeldByPlayer";
export type DuckLayer = "Background" | "Fill" | "Top";
type Clip = "idle" | "walk" | "swim" | "flap" | "honk";

const D = ESTIMATED.duck;
const CLIPS: Record<Clip, { frames: string[]; loop: boolean }> = {
  idle: { frames: range("duck_idle", 1, 6), loop: true },
  walk: { frames: range("duck_walk", 1, 6), loop: true },
  swim: { frames: ["duck_swim"], loop: true },
  flap: { frames: range("duck_flap", 1, 9), loop: false },
  honk: { frames: range("duck_honk", 1, 9), loop: false },
};
export const DUCK_SPRITES = Object.values(CLIPS).flatMap((c) => c.frames);
const clipLength = (c: Clip) => CLIPS[c].frames.length / D.clipFps;

export interface DuckBoard {
  boardSizeX: number;
  boardSizeY: number;
  /** ChessMatchManager.currentTurnColor */
  turn: () => "White" | "Black";
  /** positions of white + black + utility pieces */
  piecePositions: () => V2[];
}

export interface DuckCargo {
  x: number;
  y: number;
}

type Co = Generator<number | null, void, number>;

export class Duck {
  x = 0;
  y = 0;
  bobY = 0;
  state: DuckState = "Inactive";
  flipX = true;
  holderX = 0.25;
  holdingPiece = false;
  heldPiece: DuckCargo | null = null;
  /** set by the duck-ending cutscene (duckManager.enabled = false) */
  enabled = true;
  private clip: Clip = "swim";
  private clipStart = 0;
  private lastFrame = -1;
  private time = 0;
  private noise = Math.random();
  private sine = false;
  private vx = 0;
  private offset: V2 = { x: 0, y: 0 };
  private isMoving = false;
  private isHoldable = true;
  private inactivityTime = 0;
  private elapsedInactivityTime = 0;
  private visitedSpots = 0;
  private isWet = false;
  private elapsedFlipTime = 0;
  private xDelta = 0;
  triedToLeave = false;
  private pressed = false;
  private cos: { gen: Co; wait: number }[] = [];
  private lastDt = 0;

  constructor(
    private board: DuckBoard | null,
    private rand: () => number = Math.random,
  ) {
    this.startInactive();
  }

  get layer(): DuckLayer {
    if (this.state === "HeldByPlayer") return "Top";
    if (this.state === "Walking") return "Fill";
    return "Background";
  }

  private rangeF(a: number, b: number) {
    return a + this.rand() * (b - a);
  }

  private play(c: Clip) {
    this.clip = c;
    this.clipStart = this.time;
    this.lastFrame = -1;
  }

  frameName(): string {
    const c = CLIPS[this.clip];
    const i = Math.floor((this.time - this.clipStart) * D.clipFps);
    const n = c.frames.length;
    return c.frames[c.loop ? i % n : Math.min(n - 1, i)] ?? c.frames[0]!;
  }

  // ---------------------------------------------------------------- states
  startInactive() {
    if (this.holdingPiece) {
      this.heldPiece = null;
      this.holdingPiece = false;
    }
    this.state = "Inactive";
    this.inactivityTime = this.rangeF(D.minInactivityTime, D.maxInactivityTime);
    this.elapsedInactivityTime = 0;
    this.visitedSpots = 0;
    this.triedToLeave = false;
    this.vx = 0;
    this.x = D.inactivityDistance;
    // Random.Range(5, -5) (int): [-4, 5]
    this.y = Math.floor(this.rangeF(-4, 6));
    this.flipLeft();
  }

  startSwimming() {
    this.state = "Swimming";
    this.sine = true;
    this.play("swim");
    this.flipLeft();
    this.isWet = true;
  }

  startWalking() {
    this.state = "Walking";
    this.vx = 0;
    this.xDelta = 0;
    this.play("idle");
    playSound("chess_piece_drop");
  }

  private startHeldByPlayer(world: V2) {
    if (!this.board) return;
    this.state = "HeldByPlayer";
    this.vx = 0;
    this.offset = { x: this.x - world.x, y: this.y - world.y };
    this.sine = false;
    playSound("chess_piece_grab");
    playSound("duck_honk");
  }

  // ---------------------------------------------------------------- input
  hit(w: V2) {
    return Math.abs(w.x - this.x) <= 0.6 && Math.abs(w.y - (this.y + this.bobY)) <= 0.6;
  }

  /** OnMouseDown; returns true when the duck took the click. */
  pointerDown(w: V2): boolean {
    if (!this.enabled || !this.hit(w)) return false;
    this.pressed = true;
    if (this.state !== "Inactive") {
      if (this.isHoldable && !this.holdingPiece) this.startHeldByPlayer(w);
      else playSound("duck_flap");
    }
    return true;
  }

  pointerMove(w: V2) {
    if (this.state === "HeldByPlayer") {
      this.x = w.x + this.offset.x;
      this.y = w.y + this.offset.y;
    }
  }

  /** OnMouseUp (only for the collider that got the mouse down). */
  pointerUp(): boolean {
    if (!this.pressed) return false;
    this.pressed = false;
    if (this.state !== "Inactive" && this.isHoldable && !this.holdingPiece && this.board) {
      const half = Math.trunc(this.board.boardSizeX / 2);
      if (this.x < half && this.x > -half) {
        this.startWalking();
        return true;
      }
      this.startSwimming();
      playSound("overworld_lilypad");
    }
    return true;
  }

  /** ChessMatchManager: a piece dropped within 0.8 of the duck is carried away. */
  canTake(p: V2) {
    return (
      this.state !== "HeldByPlayer" &&
      this.state !== "Inactive" &&
      !this.holdingPiece &&
      Math.hypot(p.x - this.x, p.y - this.y) < 0.8
    );
  }

  take(p: DuckCargo) {
    this.holdingPiece = true;
    this.heldPiece = p;
  }

  // ---------------------------------------------------------------- update
  update(dt: number) {
    this.time += dt;
    this.lastDt = dt;
    if (this.sine) this.bobY = Math.sin((this.time + this.noise) * D.sineFreq) * D.sineAmp;
    this.runCoroutines(dt);
    if (this.enabled) {
      switch (this.state) {
        case "Inactive":
          if (this.elapsedInactivityTime < this.inactivityTime) this.elapsedInactivityTime += dt;
          else this.startSwimming();
          break;
        case "Swimming":
          this.vx = this.board && this.board.turn() === "Black" ? 0 : -D.swimSpeed;
          if (this.x < -24) this.startInactive();
          break;
        case "Walking":
          if (!this.isMoving) this.startCoroutine(this.walkToSpot());
          this.updateSpriteFlip(dt);
          break;
        case "HeldByPlayer":
          break;
      }
    }
    this.x += this.vx * dt;
    this.animationEvents();
    if (this.heldPiece) {
      this.heldPiece.x = this.x + this.holderX;
      this.heldPiece.y = this.y + this.bobY + D.pieceHolderY;
    }
  }

  /** Swim straight left forever (duck ending: rb.velocity = left * swimSpeed with the manager disabled). */
  swimAway() {
    this.startSwimming();
    this.enabled = false;
    this.vx = -D.swimSpeed;
  }

  private animationEvents() {
    if (this.state === "Inactive") return; // DuckSound.CheckState
    const i = Math.floor((this.time - this.clipStart) * D.clipFps);
    if (i === this.lastFrame) return;
    const n = CLIPS[this.clip].frames.length;
    const f = CLIPS[this.clip].loop ? i % n : i;
    this.lastFrame = i;
    if (this.clip === "honk" && f === 0) playSound("duck_honk");
    if (this.clip === "flap" && f === 0) playSound("duck_flap");
    if (this.clip === "walk" && (f === 0 || f === 3)) playSound("duck_walk");
    if (this.clip === "idle" && f === 0) playSound("duck_idle");
  }

  private startCoroutine(gen: Co) {
    const r = gen.next(0);
    if (!r.done) this.cos.push({ gen, wait: r.value ?? 0 });
  }

  private runCoroutines(dt: number) {
    const keep: { gen: Co; wait: number }[] = [];
    for (const c of this.cos) {
      if (c.wait > 0) {
        c.wait -= dt;
        keep.push(c);
        continue;
      }
      const r = c.gen.next(dt);
      if (!r.done) keep.push({ gen: c.gen, wait: r.value ?? 0 });
    }
    this.cos = keep;
  }

  private *walkToSpot(): Co {
    this.isMoving = true;
    this.isHoldable = false;
    if (this.isWet) {
      this.isWet = false;
      this.play("flap");
      yield clipLength("flap");
    }
    this.play("honk");
    yield clipLength("honk");
    this.play("walk");
    let spot = this.getNewSpot();
    const leaving = this.visitedSpots >= D.spotVisitsBeforeLeaving;
    if (leaving) spot = { x: -3.75, y: this.rangeF(-3, 3) };
    const off = { x: this.rangeF(-0.4, 0.4), y: this.rangeF(-0.4, 0.4) };
    const tx = spot.x + off.x;
    const ty = spot.y + off.y;
    const num = Math.hypot(tx - this.x, ty - this.y) / D.walkSpeed;
    const mid = { x: (this.x + tx) / 2, y: (this.y + ty) / 2 };
    const cx: CurveKey[] = [
      { time: 0, value: this.x, inTangent: 0, outTangent: 0 },
      { time: num / 2, value: mid.x, inTangent: 0, outTangent: D.walkCurveMidOutTangent },
      { time: num, value: tx, inTangent: 0, outTangent: 0 },
    ];
    const cy: CurveKey[] = [
      { time: 0, value: this.y, inTangent: 0, outTangent: 0 },
      { time: num, value: ty, inTangent: 0, outTangent: 0 },
    ];
    let s = 0;
    while (s < num) {
      this.x = evaluateCurve(cx, s);
      this.y = evaluateCurve(cy, s);
      this.xDelta = evaluateCurve(cx, s) - evaluateCurve(cx, s - this.lastDt);
      s += yield null;
    }
    this.x = tx;
    this.y = ty;
    if (leaving) {
      this.flipLeft();
      this.play("swim");
      playSound("duck_flap");
      const ox = this.x;
      const oy = this.y;
      const len = D.leaveCurveX.at(-1)?.time ?? 0;
      let l = 0;
      while (l < len) {
        this.x = ox + evaluateCurve(D.leaveCurveX, l);
        this.y = oy + evaluateCurve(D.leaveCurveY, l);
        l += yield null;
      }
      this.triedToLeave = true;
      this.startSwimming();
      playSound("overworld_lilypad");
    } else {
      this.visitedSpots++;
      this.play("idle");
      this.isHoldable = true;
      yield this.rangeF(D.minTimeBetweenWalk, D.maxTimeBetweenWalk);
    }
    this.isHoldable = true;
    this.isMoving = false;
  }

  /** DuckManager.GetNewSpot (including its early `break` when the duck stands on the candidate). */
  getNewSpot(): V2 {
    const b = this.board;
    if (!b) return { x: 0, y: 0 };
    const list: V2[] = [];
    const occupied = b.piecePositions().map((p) => roundPoint(p));
    const here = roundPoint({ x: this.x, y: this.y });
    const hx = Math.trunc(b.boardSizeX / 2);
    const hy = Math.trunc(b.boardSizeY / 2);
    for (let nx = -hx + 0.5; nx < hx + 0.5; nx += 1) {
      for (let ny = -hy + 0.5; ny < hy + 0.5; ny += 1) {
        const d = Math.hypot(nx - this.x, ny - this.y);
        if (!(d < D.nextSpotMaxDistance) || !(d > 1)) continue;
        if (here.x === nx && here.y === ny) break;
        if (occupied.some((o) => o.x === nx && o.y === ny)) continue;
        list.push({ x: nx, y: ny });
      }
    }
    if (list.length > 0) return list[Math.floor(this.rand() * list.length)] ?? { x: 0, y: 0 };
    return { x: 0, y: 0 };
  }

  private updateSpriteFlip(dt: number) {
    if (this.elapsedFlipTime < D.flipTime) {
      this.elapsedFlipTime += dt;
      return;
    }
    this.elapsedFlipTime = 0;
    if (this.xDelta <= 0) this.flipLeft();
    else this.flipRight();
  }

  private flipRight() {
    this.flipX = false;
    this.holderX = -0.25;
  }

  private flipLeft() {
    this.flipX = true;
    this.holderX = 0.25;
  }
}

/** Duck sprite (authored in full colour, drawn as-is) with its carried piece just behind it. */
export function drawDuck(
  ctx: CanvasRenderingContext2D,
  v: View,
  duck: Duck,
  _t: number,
  drawCargo?: () => void,
) {
  if (duck.state === "Inactive") return;
  drawCargo?.();
  sprite(ctx, v, duck.frameName(), duck.x, duck.y + duck.bobY, { flipX: duck.flipX });
}
