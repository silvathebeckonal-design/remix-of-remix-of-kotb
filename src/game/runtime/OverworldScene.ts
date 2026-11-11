// Runtime port of the "Overworld" scene (level1): OverworldTrollManager, PlayerMovement, CameraFollow,
// BridgeLoop, TrollDialogManager.PerformDialog (overworld use), ObjectShake / SineScale and the duck.
// ACT_I: title card, player intro, intro cutscene. ACT_II: rematch bridge. ACT_III: the four endings + Credits().
import raw from "../data/gamedata.json";
import {
  COLORS,
  CREDITS_STRINGS,
  ESTIMATED,
  OVERWORLD_STRINGS,
  TOPICS,
  TOPIC_LISTS,
  type DialogLine,
  type V2,
} from "../data";
import { cssColor, getImage, tex } from "../assets";
import { evaluateCurve, type CurveKey } from "../animationCurve";
import { playSound } from "../audio";
import { at, mathRng, pickFrom } from "../rng";
import { loadSave, storeSave, type Ending, type OverworldState } from "../save";
import { doScreenshake } from "../settings";
import { formatGameTime, getGameTime, setCountTime } from "../gameTime";
import { Scheduler } from "./scheduler";
import { screenToWorld, sprite, worldToScreen, type View } from "./draw";
import { LilyPads, drawBridgeSequence, drawWater, visibleSequences } from "./overworld";
import { Duck, drawDuck } from "./duck";
import { AmbientParticles } from "./particles";

const O = ESTIMATED.overworld;
const OUT = ESTIMATED.outro;
const INTRO = raw.overworldIntro;
const MOVE_SPEED = 2.5; // PlayerMovement.moveSpeed
const ACT1_POS: V2 = { x: 0, y: INTRO.playerStartY };
const ACT3_POS: V2 = { x: 0, y: O.act3PlayerY };
const UI_PPU = 1080 / (O.cameraOrthoSize * 2);
const C = CREDITS_STRINGS as typeof CREDITS_STRINGS & Record<string, string>;

export interface OverworldUI {
  card: null | { text: string; showText: boolean; inverted: boolean };
  dialog: null | { text: string; visible: number; noAnimation: boolean };
  prompt: boolean;
  act: string | null;
}

export interface OverworldOptions {
  act: OverworldState;
  ending?: Ending | undefined;
  /** OverworldTrollManager.trollCapturePosition */
  trollCapture?: V2 | undefined;
}

export interface OverworldCallbacks {
  onStartChess: (withStartTopic: boolean) => void;
  onCredits: () => void;
}

type Shake = { until: number; mag: number };

/** Copy of a curve with some key fields replaced (the C# code edits Keyframe[] before evaluating). */
function editCurve(keys: readonly CurveKey[], edit: (k: CurveKey[]) => void): CurveKey[] {
  const out = keys.map((k) => ({ ...k }));
  edit(out);
  return out;
}
const lastTime = (k: readonly CurveKey[]) => k[k.length - 1]?.time ?? 0;

export class OverworldScene {
  readonly sched = new Scheduler();
  readonly act: OverworldState;
  readonly ending: Ending;
  private cb: OverworldCallbacks;
  private disposed = false;

  // player (Rigidbody2D velocity persists while PlayerMovement is disabled)
  p: V2 = { x: 0, y: 0 };
  vel: V2 = { x: 0, y: 0 };
  dir: "up" | "down" | "left" | "right" = "up";
  playerVisible = true;
  playerMovementEnabled = true;
  playerShake: Shake = { until: 0, mag: 0 };
  sineScale = false;
  bridgeCollision = true;

  // camera
  cam: V2 = { x: 0, y: 0 };
  cameraFollow = true;
  camShake: Shake = { until: 0, mag: 0 };

  // OverworldTrollManager transform + troll child
  base: V2 = { x: 0, y: 0 };
  trollLocal: V2 = { x: 0, y: 0 };
  trollVisible = true;
  trollAnimate = true;
  trollRot = 0;
  trollShakeMag = 0;
  trollOnDuck = false;
  /** Duck ending only: the player turned troll, drawn while the old troll stays on the duck. */
  newTroll: V2 | null = null;
  manholeLocal = 0;

  // flags
  introCutscene = false;
  inTitelCard = false;
  outroCutscene = false;
  private performedInput = false;
  mouseClicked = false;
  private dialogClicked = false;
  isInDialog = false;
  private spacePressed = false;

  // UI
  card: OverworldUI["card"] = null;
  dialog: OverworldUI["dialog"] = null;
  promptVisible = false;
  promptUI: V2 = { x: 960, y: 540 };
  actText: string | null = null;

  lilies = new LilyPads();
  particles = new AmbientParticles();
  private lastPlayerFrame: string | null = null;
  duck: Duck;

  // input
  keys = new Set<string>();
  target: V2 | null = null;
  holding: V2 | null = null; // screen point held (canvas px)
  lastView: View | null = null;

  private listeners = new Set<() => void>();
  private uiCache: OverworldUI | null = null;

  constructor(opts: OverworldOptions, cb: OverworldCallbacks) {
    this.act = opts.act;
    this.ending = opts.ending ?? loadSave().ending;
    this.cb = cb;
    this.duck = new Duck(null);
    this.start(opts);
  }

  get time() {
    return this.sched.time;
  }

  dispose() {
    this.disposed = true;
    this.sched.dispose();
    this.listeners.clear();
  }

  // ------------------------------------------------------------------ store
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getUI = (): OverworldUI => {
    if (!this.uiCache) this.uiCache = this.snapshot();
    return this.uiCache;
  };
  private snapshot(): OverworldUI {
    return {
      card: this.card ? { ...this.card } : null,
      dialog: this.dialog ? { ...this.dialog } : null,
      prompt: this.promptVisible,
      act: this.actText,
    };
  }
  private emit() {
    const n = this.snapshot();
    const o = this.uiCache;
    if (o && JSON.stringify(o) === JSON.stringify(n)) return;
    this.uiCache = n;
    for (const l of this.listeners) l();
  }
  private run(fn: () => Promise<unknown>) {
    void fn().catch((e) => console.error(e));
  }
  private wait(s: number) {
    return this.sched.wait(s);
  }
  private until(fn: () => boolean) {
    return this.sched.until(fn);
  }
  /** Per-frame curve loop: fn(elapsed) until elapsed >= len (while elapsedSeconds < curve end). */
  private async curveLoop(len: number, fn: (el: number) => void) {
    const start = this.time;
    for (;;) {
      const el = this.time - start;
      if (el >= len) return;
      fn(el);
      await this.sched.frame();
    }
  }

  // ------------------------------------------------------------------ Start()
  private start(opts: OverworldOptions) {
    playSound("overworld_bridge_ambience");
    setCountTime(true);
    switch (this.act) {
      case "ACT_I":
        this.trollVisible = false;
        this.setRealWorld(ACT1_POS, 0);
        this.run(() => this.titleCard(OVERWORLD_STRINGS.TitleCrossTheBridgeKey));
        this.run(() => this.displayAct(7));
        break;
      case "ACT_II":
        this.p = { x: 0, y: O.act2PlayerY };
        this.cam = { ...this.p };
        this.run(() =>
          this.performDialog(pickFrom(mathRng, TOPIC_LISTS.rematchInvitationTopics), 1),
        );
        this.run(() => this.displayAct(0));
        break;
      case "ACT_III": {
        this.introCutscene = true;
        this.setRealWorld(ACT3_POS, 2.5);
        const e = this.ending;
        if (e === "GoodEnding" || e === "BadEnding" || e === "None") {
          this.trollAnimate = false;
          const cap = opts.trollCapture ?? { x: 0, y: 2.5 };
          this.trollLocal = { x: cap.x, y: cap.y - 2.5 };
          this.run(() => this.outroCutscene_());
        }
        if (e === "AscensionEnding") {
          this.card = { text: "", showText: false, inverted: true };
          this.run(() => this.credits());
        }
        if (e === "DuckEnding") {
          this.duck.x = ESTIMATED.duck.endingStartX;
          this.duck.y = this.p.y + 1;
          this.duck.swimAway();
          this.cameraFollow = false;
          this.cam = { x: this.duck.x, y: this.p.y };
          this.trollOnDuck = true;
          this.bridgeCollision = false;
          this.run(() => this.duckCutscene());
        }
        this.run(() => this.displayAct(0));
        break;
      }
    }
    this.emit();
  }

  private setRealWorld(pos: V2, trollBonusYOffset: number) {
    this.p = { ...pos };
    this.base = { x: pos.x, y: 0 + trollBonusYOffset };
    this.cam = { ...pos };
  }

  // ------------------------------------------------------------------ Update()
  update(dt: number) {
    if (this.disposed) return;
    this.sched.update(dt);
    this.duck.update(dt);
    if (this.lastView) this.particles.update(dt, this.lastView);

    if (this.act === "ACT_I" && this.p.y > -2.5 && !this.introCutscene) {
      this.introCutscene = true;
      this.run(() => this.introCutsceneCo());
      this.stopMovement();
    }
    if (this.act === "ACT_II" && !this.introCutscene) this.checkForStartInput();
    if (this.act === "ACT_III" && this.p.y > 20 && !this.outroCutscene) {
      this.outroCutscene = true;
      this.stopMovement();
      this.run(() => this.playerOutro());
    }
    if (this.act !== "ACT_II" && this.p.y < -60) {
      // walked the wrong way (WALK_WRONG_WAY)
      this.stopMovement();
      this.setRealWorld(ACT1_POS, this.act === "ACT_III" ? 2.5 : 0);
      this.run(() => this.titleCard(OVERWORLD_STRINGS.TitleCrossTheBridgeKey));
    }
    this.spacePressed = false;

    // PlayerMovement.Update
    if (this.playerMovementEnabled && !this.isInDialog && !this.introCutscene && !this.inTitelCard)
      this.moveInput(dt);
    this.p.x += this.vel.x * dt;
    this.p.y += this.vel.y * dt;
    if (this.bridgeCollision)
      this.p.x = Math.max(-O.walkHalfWidth, Math.min(O.walkHalfWidth, this.p.x));
    if (Math.abs(this.vel.x) > Math.abs(this.vel.y)) this.dir = this.vel.x > 0 ? "right" : "left";
    else if (this.vel.y !== 0) this.dir = this.vel.y > 0 ? "up" : "down";

    // CameraFollow.LateUpdate (y only)
    if (this.cameraFollow) this.cam.y = this.p.y;
    this.emit();
  }

  private moveInput(dt: number) {
    const k = this.keys;
    let ix =
      (k.has("arrowright") || k.has("d") ? 1 : 0) - (k.has("arrowleft") || k.has("a") ? 1 : 0);
    let iy = (k.has("arrowup") || k.has("w") ? 1 : 0) - (k.has("arrowdown") || k.has("s") ? 1 : 0);
    if (ix !== 0 || iy !== 0) this.target = null;
    else {
      // touch / click-and-hold: walk toward the held point
      if (this.holding && this.lastView)
        this.target = screenToWorld(this.lastView, this.holding.x, this.holding.y);
      if (this.target) {
        const dx = this.target.x - this.p.x;
        const dy = this.target.y - this.p.y;
        const l = Math.hypot(dx, dy);
        if (l < 0.05) {
          if (!this.holding) this.target = null;
        } else {
          const step = Math.min(1, l / (MOVE_SPEED * dt));
          ix = (dx / l) * step;
          iy = (dy / l) * step;
        }
      }
    }
    this.vel = { x: ix * MOVE_SPEED, y: iy * MOVE_SPEED };
  }

  stopMovement() {
    this.vel = { x: 0, y: 0 };
    this.target = null;
    this.holding = null;
  }

  private checkForStartInput() {
    if (this.performedInput) return;
    if (Math.hypot(this.p.x - this.base.x, this.p.y - this.base.y) < O.distanceToInput) {
      if (this.spacePressed && !this.isInDialog) this.startChessMatchButton();
      else this.promptVisible = true;
    } else this.promptVisible = false;
  }

  startChessMatchButton() {
    if (this.performedInput || !this.promptVisible) return;
    this.run(() => this.performDialog(pickFrom(mathRng, TOPIC_LISTS.rematchAcceptTopics), 0));
    this.performedInput = true;
    this.promptVisible = false;
    this.stopMovement();
    this.playerMovementEnabled = false;
    this.run(async () => {
      await this.until(() => !this.isInDialog);
      this.cb.onStartChess(false);
    });
    this.emit();
  }

  // ------------------------------------------------------------------ coroutines
  private async titleCard(title: string) {
    this.inTitelCard = true;
    this.card = { text: title, showText: false, inverted: false };
    this.emit();
    await this.wait(2);
    this.card = { text: title, showText: true, inverted: false };
    playSound("titel_impact");
    this.emit();
    await this.wait(2);
    this.card = null;
    this.inTitelCard = false;
    this.emit();
    await this.playerIntro();
  }

  private async playerIntro() {
    this.cameraFollow = false;
    const stored = ACT1_POS.y;
    this.p.y = stored - 10;
    this.vel = { x: 0, y: MOVE_SPEED };
    this.playerMovementEnabled = false;
    await this.until(() => this.p.y >= stored);
    this.p.y = stored;
    this.cameraFollow = true;
    this.playerMovementEnabled = true;
    this.stopMovement();
  }

  private async introCutsceneCo() {
    await this.wait(1);
    this.shakeCamera(0.25, 0.125);
    playSound("chess_piece_capture");
    await this.wait(1);
    this.shakeCamera(0.25, 0.25);
    playSound("chess_piece_capture");
    await this.wait(1);
    this.shakeCamera(0.25, 0.5);
    playSound("chess_piece_capture");
    playSound("chess_piece_slip");
    let shook = false;
    await this.curveLoop(lastTime(INTRO.manholeCurve), (el) => {
      this.manholeLocal = evaluateCurve(INTRO.manholeCurve, el);
      if (el > (INTRO.manholeCurve[2]?.time ?? 0) && !shook) {
        this.shakeCamera(0.25, 0.05);
        playSound("overworld_manhole_blast");
        shook = true;
      }
    });
    this.manholeLocal = evaluateCurve(INTRO.manholeCurve, lastTime(INTRO.manholeCurve));
    this.shakeCamera(0.25, 0.05);
    this.trollLocal = { x: 0, y: 20 };
    this.trollVisible = true;
    shook = false;
    await this.curveLoop(lastTime(INTRO.trollCurve), (el) => {
      this.trollLocal.y = evaluateCurve(INTRO.trollCurve, el);
      if (el > (INTRO.trollCurve[2]?.time ?? 0) && !shook) {
        this.shakeCamera(0.25, 0.05);
        playSound("chess_accusation_false");
        playSound("player_walk");
        shook = true;
      }
    });
    this.trollLocal.y = evaluateCurve(INTRO.trollCurve, lastTime(INTRO.trollCurve));
    await this.wait(1);
    this.run(() => this.performDialog(TOPIC_LISTS.introductionTopic, 1));
    await this.wait(3);
    await this.until(() => !this.isInDialog);
    this.playerMovementEnabled = false;
    this.cb.onStartChess(true);
  }

  private async outroCutscene_() {
    this.trollShakeMag = 0.025;
    this.shakeCamera(0.25, 0.25);
    playSound("chess_piece_capture");
    const x0 = this.trollLocal.x;
    const y0 = this.trollLocal.y;
    const cx = editCurve(OUT.trollDefeatXCurve, (k) => {
      k[0]!.value = x0;
      k[0]!.outTangent = 1;
      if (k[1]) k[1].inTangent = 1;
    });
    const cy = editCurve(OUT.trollDefeatYCurve, (k) => {
      k[0]!.value = y0;
      k[0]!.outTangent = 1;
    });
    await this.curveLoop(lastTime(cy), (el) => {
      this.trollLocal = { x: evaluateCurve(cx, el), y: evaluateCurve(cy, el) };
    });
    this.trollLocal = { x: evaluateCurve(cx, lastTime(cy)), y: evaluateCurve(cy, lastTime(cy)) };
    playSound("overworld_manhole_blast");
    await this.wait(1);
    const topic =
      this.ending === "BadEnding"
        ? TOPIC_LISTS.outroCheaterTopic
        : TOPIC_LISTS.outroFairPlayerTopic;
    this.run(() => this.performDialog(topic, 1, true));
    await this.wait(3);
    await this.until(() => !this.isInDialog);
    await this.wait(1);
    this.trollShakeMag = 0;
    await this.wait(1);
    playSound("chess_piece_slip");
    await this.curveLoop(lastTime(OUT.slipYCurve), (el) => {
      this.trollRot = evaluateCurve(OUT.slipRotationCurve, el);
      this.trollLocal = { x: 0, y: evaluateCurve(OUT.slipYCurve, el) };
    });
    this.introCutscene = false;
  }

  private async duckCutscene() {
    await this.wait(2);
    this.run(() => this.performDialog(at(TOPIC_LISTS.duckBoundTrollTopics, 0), 1));
    await this.until(() => !this.isInDialog);
    await this.wait(3);
    const fromX = this.cam.x;
    const toX = this.p.x;
    const curve = editCurve(OUT.cameraCurve, (k) => {
      k[0]!.value = fromX;
      if (k[1]) k[1].value = toX;
    });
    await this.curveLoop(lastTime(curve), (el) => {
      this.cam.x = evaluateCurve(curve, el);
    });
    this.cam = { x: this.p.x, y: this.p.y };
    this.bridgeCollision = true;
    this.cameraFollow = true;
    // The original re-parents the troll to the bridge here, but the duck is still swimming past the
    // bridge at that moment, so the troll visibly hopped off into the water. It stays bound to the duck.
    this.trollAnimate = false;
    this.introCutscene = false;
  }

  private async playerOutro() {
    if (this.ending === "GoodEnding") {
      this.cameraFollow = false;
      const stored = this.p.y + 10;
      this.vel = { x: 0, y: MOVE_SPEED };
      this.playerMovementEnabled = false;
      await this.until(() => this.p.y >= stored);
    } else {
      this.playerMovementEnabled = false;
      await this.wait(3);
      this.shakePlayer(0.25, 0.1);
      playSound("player_heart_pounce");
      await this.wait(1.25);
      this.shakePlayer(0.5, 0.1);
      playSound("player_heart_pounce");
      await this.wait(1.5);
      this.shakePlayer(1, 0.1);
      playSound("player_heart_pounce");
      await this.wait(3);
      playSound("player_troll_transformation");
      this.sineScale = true;
      await this.wait(1);
      this.shakePlayer(3, 0.25);
      await this.wait(3);
      this.sineScale = false;
      this.playerVisible = false;
      if (this.trollOnDuck) {
        // Duck ending: the old troll keeps riding the duck; the player becomes a second troll.
        this.newTroll = { ...this.p };
      } else {
        this.trollRot = 0;
        this.trollLocal = { x: this.p.x - this.base.x, y: this.p.y - this.base.y };
      }
      await this.wait(3);
    }
    this.p.y = 10;
    this.stopMovement();
    await this.credits();
  }

  /** OverworldTrollManager.Credits: ending title cards with the run's stats. */
  private async credits() {
    this.inTitelCard = true;
    const inverted = this.ending === "AscensionEnding";
    this.card = { text: "", showText: false, inverted };
    const save = loadSave();
    storeSave(save);
    setCountTime(false);
    this.emit();
    await this.wait(2);
    const endingText: Record<string, string> = {
      BadEnding: C.BadEndingKey,
      GoodEnding: C.GoodEndingKey,
      AscensionEnding: C.AscensionEndingKey,
      DuckEnding: C.DuckEndingKey,
    };
    const show = async (text: string, extra?: () => Promise<void>) => {
      this.card = { text, showText: true, inverted };
      playSound("titel_impact");
      this.emit();
      if (extra) await extra();
      await this.wait(O.lookTime);
      this.mouseClicked = false;
      await this.until(() => this.mouseClicked);
      this.mouseClicked = false;
    };
    const hide = async () => {
      this.card = { text: this.card?.text ?? "", showText: false, inverted };
      this.emit();
      await this.wait(1);
    };
    await show(endingText[this.ending] ?? C.BadEndingKey, async () => {
      if (this.ending === "DuckEnding") {
        await this.wait(1);
        playSound("duck_honk");
      }
    });
    if (this.ending === "AscensionEnding" || this.ending === "DuckEnding") {
      await hide();
      await show(C.RemainOnBridgeKey);
    }
    await hide();
    await show(
      save.totalAttemptCount !== 1
        ? C.AttemptCountMultipleKey.replace("{attemptCount}", String(save.totalAttemptCount))
        : C.AttemptCountSingularKey,
    );
    await hide();
    const time = formatGameTime(getGameTime(), {
      hour: C.TimeCountHourKey,
      hours: C.TimeCountHoursKey,
      minute: C.TimeCountMinuteKey,
      minutes: C.TimeCountMinutesKey,
      second: C.TimeCountSecondKey,
      seconds: C.TimeCountSecondsKey,
    });
    await show(`${C.TimeCountTextKey} ${time}`);
    if (save.totalScrapCount > 0) {
      await hide();
      await show(
        save.totalScrapCount === 1
          ? C.ScrapCountSingularKey
          : C.ScrapCountMultipleKey.replace("{scrapCount}", String(save.totalScrapCount)),
      );
    }
    await hide();
    await show(
      save.totalCheatCount === 0
        ? C.CheatCountZeroKey
        : save.totalCheatCount === 1
          ? C.CheatCountSingularKey
          : C.CheatCountMultipleKey.replace("{cheatCount}", String(save.totalCheatCount)),
    );
    this.card = { text: "", showText: false, inverted };
    const s2 = loadSave();
    s2.overworldState = "ACT_II";
    storeSave(s2);
    this.emit();
    await this.wait(1);
    this.cb.onCredits();
  }

  private async displayAct(delay: number) {
    await this.wait(delay);
    const n = this.act === "ACT_I" ? "I" : this.act === "ACT_II" ? "II" : "III";
    this.actText = `${OVERWORLD_STRINGS.ActDisplayKey} ${n}`;
    this.emit();
    await this.wait(O.actDisplaySeconds);
    this.actText = null;
    this.emit();
  }

  /** TrollDialogManager.PerformDialog (overworld). */
  async performDialog(topicName: string, delay: number, noAnimation = false) {
    const lines: DialogLine[] = TOPICS[topicName] ?? [];
    this.isInDialog = true;
    await this.wait(0.25);
    playSound("troll_dialog_alert");
    await this.wait(delay);
    this.dialogClicked = false;
    for (const line of lines) {
      this.dialog = { text: line.text, visible: 0, noAnimation };
      this.emit();
      for (let i = 0; i < line.text.length; i++) {
        this.dialog.visible = i + 1;
        this.emit();
        if (!/\s/.test(line.text.charAt(i))) {
          playSound("troll_dialog_voice");
          await this.wait(line.speed);
        }
        if (this.dialogClicked && line.canSkip) break;
      }
      this.dialog.visible = line.text.length;
      this.dialogClicked = false;
      this.emit();
      await this.until(() => this.dialogClicked);
      this.dialogClicked = false;
    }
    this.dialog = null;
    this.isInDialog = false;
    this.emit();
  }

  // ------------------------------------------------------------------ shakes
  private shakeCamera(dur: number, mag: number) {
    if (!doScreenshake()) return;
    if (this.camShake.until > this.time) return; // ObjectShake.isShaking
    this.camShake = { until: this.time + dur, mag };
  }
  private shakePlayer(dur: number, mag: number) {
    if (this.playerShake.until > this.time) return;
    this.playerShake = { until: this.time + dur, mag };
  }

  // ------------------------------------------------------------------ input
  keyDown(key: string, code: string, repeat: boolean) {
    const k = key.toLowerCase();
    this.keys.add(k);
    if (code === "Space" && !repeat) {
      this.spacePressed = true;
      this.mouseClicked = true;
      if (this.isInDialog) this.dialogClicked = true;
    }
  }
  keyUp(key: string) {
    this.keys.delete(key.toLowerCase());
  }

  /** Canvas pointer down at canvas pixel (sx, sy). Returns true when consumed by a click target. */
  pointerDown(sx: number, sy: number): void {
    this.mouseClicked = true;
    if (this.isInDialog) {
      this.dialogClicked = true;
      return;
    }
    const v = this.lastView;
    if (!v) return;
    const w = screenToWorld(v, sx, sy);
    if (this.duck.pointerDown(w)) return;
    if (this.lilies.tap(w.x, w.y, this.time, visibleSequences(v))) return;
    if (!this.playerMovementEnabled || this.introCutscene || this.inTitelCard) return;
    this.holding = { x: sx, y: sy };
    this.target = w;
  }
  pointerMove(sx: number, sy: number) {
    if (this.holding) this.holding = { x: sx, y: sy };
  }
  pointerUp() {
    this.duck.pointerUp();
    this.holding = null;
  }
  isOverInteractable(sx: number, sy: number) {
    const v = this.lastView;
    if (!v) return false;
    const w = screenToWorld(v, sx, sy);
    return (this.duck.state !== "Inactive" && this.duck.hit(w)) || this.promptVisible;
  }

  // ------------------------------------------------------------------ render
  trollWorld(): V2 {
    // parented to duck.pieceHolder at local (0, 0.25)
    if (this.trollOnDuck)
      return {
        x: this.duck.x + this.duck.holderX,
        y: this.duck.y + this.duck.bobY + ESTIMATED.duck.pieceHolderY + 0.25,
      };
    return { x: this.base.x + this.trollLocal.x, y: this.base.y + this.trollLocal.y };
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const t = this.time;
    let ox = 0;
    let oy = 0;
    if (this.camShake.until > t) {
      ox = (Math.random() * 2 - 1) * this.camShake.mag;
      oy = (Math.random() * 2 - 1) * this.camShake.mag;
    }
    const v: View = {
      w,
      h,
      ppu: h / (O.cameraOrthoSize * 2),
      camX: this.cam.x + ox,
      camY: this.cam.y + oy,
    };
    this.lastView = { ...v, camX: this.cam.x, camY: this.cam.y };
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = cssColor(COLORS.Black);
    ctx.fillRect(0, 0, w, h);
    drawWater(ctx, v, t);
    drawDuck(ctx, v, this.duck, t);
    if (this.trollOnDuck) this.drawTroll(ctx, v, t);
    for (const seq of visibleSequences(v)) drawBridgeSequence(ctx, v, t, this.lilies, seq);
    const hole = { x: this.base.x, y: this.base.y + INTRO.manholeLocalY };
    sprite(ctx, v, "sludge_hole", hole.x, hole.y);
    sprite(ctx, v, INTRO.manholeSprite, hole.x, hole.y + this.manholeLocal);
    // DepthSorter: higher y drawn first
    const tw = this.trollWorld();
    const items: { y: number; draw: () => void }[] = [
      { y: this.p.y, draw: () => this.drawPlayer(ctx, v) },
    ];
    if (!this.trollOnDuck) items.push({ y: tw.y, draw: () => this.drawTroll(ctx, v, t) });
    const nt = this.newTroll;
    if (nt) items.push({ y: nt.y, draw: () => this.drawTrollAt(ctx, v, nt, 1, 0) });
    items.sort((a, b) => b.y - a.y).forEach((i) => i.draw());
    this.particles.draw(ctx, v);
    // prompt above the troll manager transform
    // reference-canvas (1920x1080) position for the "[ SPACE ] CHALLENGE" prompt
    this.promptUI = worldToScreen(
      { w: 1920, h: 1080, ppu: UI_PPU, camX: this.cam.x, camY: this.cam.y },
      this.base.x,
      this.base.y + O.promptOffsetY,
    );
  }

  private drawTroll(ctx: CanvasRenderingContext2D, v: View, t: number) {
    if (!this.trollVisible) return;
    const p = this.trollWorld();
    let x = p.x;
    let y = p.y;
    if (this.trollShakeMag > 0) {
      x += (Math.random() * 2 - 1) * this.trollShakeMag;
      y += (Math.random() * 2 - 1) * this.trollShakeMag;
    }
    const frame = this.trollAnimate ? (Math.floor(t * 8) % 18) + 1 : 1;
    this.drawTrollAt(ctx, v, { x, y }, frame, this.trollRot);
  }

  private drawTrollAt(ctx: CanvasRenderingContext2D, v: View, p: V2, frame: number, rot: number) {
    sprite(ctx, v, `${INTRO.trollFill}${frame}`, p.x, p.y, { color: "White", rot });
    sprite(ctx, v, `${INTRO.trollOutline}${frame}`, p.x, p.y, { color: "Outline", rot });
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, v: View) {
    if (!this.playerVisible) return;
    const t = this.time;
    let x = this.p.x;
    let y = this.p.y;
    if (this.playerShake.until > t) {
      x += (Math.random() * 2 - 1) * this.playerShake.mag;
      y += (Math.random() * 2 - 1) * this.playerShake.mag;
    }
    const moving = this.vel.x !== 0 || this.vel.y !== 0;
    const f = (Math.floor(t / 0.12) % 4) + 1;
    const name = moving ? `player_move_${this.dir}${f}` : `player_idle${f}`;
    const scale = this.sineScale ? 1 + Math.sin(t * O.sineScaleFreq) * O.sineScaleAmp : 1;
    // keep showing the last loaded frame while a new one is still loading (no flicker)
    const draw = getImage(tex(name)) ? name : this.lastPlayerFrame;
    if (!draw) return;
    this.lastPlayerFrame = draw;
    sprite(ctx, v, draw, x, y, { sx: scale, sy: scale });
  }
}
