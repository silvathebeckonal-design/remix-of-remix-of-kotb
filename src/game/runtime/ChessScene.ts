// Runtime port of the "Chess" scene: ChessMatchManager, ChessTrollManager, ChessPieceObject,
// TrollDialogManager, RuleBookScreenManager, RuleBookInteraction and RulebookFogManager.
import {
  CHESS_STRINGS,
  CONSTANTS,
  Cheat,
  DIALOG_MANAGER,
  ESTIMATED,
  INITIAL_PIECES,
  MATCH,
  PIECES,
  PieceType,
  TOPICS,
  TOPIC_LISTS,
  TROLL,
  type CheatId,
  type ChessColor,
  type DialogLine,
  type PieceData,
  type V2,
} from "../data";
import { playSound } from "../audio";
import { at, mathRng, pickFrom, rangeF, rangeI, type Rng } from "../rng";
import {
  buildRuleBookScreens,
  findCheatReasonInRuleBook,
  generateFogEntries,
  isCorrectAccusation,
  isPageFogged,
  progressFogClearing,
  type PageFogEntry,
  type RulePage,
  type RuleScreen,
} from "../rulebook";
import {
  checkForCapture,
  checkForCheatingRaw,
  isOOB,
  piecePos,
  roundPoint,
  vEq,
  type BoardState,
  type LogicPiece,
} from "../rules";
import { BoardAmbience } from "./particles";
import { loadSave, storeSave, type PlayerSaveData } from "../save";
import { chooseActionBasedOnCheatingChance, generatePossibleMoves, rollFakeOut } from "../trollAI";
import { Scheduler, easeInOut } from "./scheduler";
import { rgbOf, type Rgb } from "../assets";
import { doScreenshake, speedChessTime } from "../settings";
import { Duck } from "./duck";
import { LilyPads } from "./overworld";

export type FrameAnim = { frames: string[]; fps: number; start: number; loop: boolean };

export interface PieceObj extends LogicPiece {
  sleepTurn: number;
  sleepClicks: number;
  sleepResetTimer: number;
  rookEatScore: number;
  scale: number;
  flipX: boolean;
  alpha: number;
  fillHidden: boolean;
  outlineHidden: boolean;
  highlighted: boolean;
  rot: number;
  liftY: number;
  shakeUntil: number;
  shakeMag: number;
  bobNoise: number;
  scaleNoise: number;
  bob: boolean;
  trollIdle: boolean;
  outlineAnim: FrameAnim | null;
  fillAnim: FrameAnim | null;
  onTop: boolean;
  removed: boolean;
  halo: number;
  dragging: boolean;
  scrapTimer: number;
  isDuckBound: boolean;
}

export interface Ghost {
  piece: PieceObj;
  x: number;
  y: number;
}

export interface DamageNumber {
  text: string;
  piece: PieceObj;
  start: number;
}

export interface UIState {
  dialog: null | { text: string; visible: number; noAnimation: boolean };
  guessText: string;
  guessColor: "White" | "Danger";
  guessHolderY: number;
  guessTextHidden: boolean;
  guessBar: number;
  confirmVisible: boolean;
  retryVisible: boolean;
  retryBar: number;
  attempting: boolean;
  inspecting: boolean;
  canAccuse: boolean;
}

export interface SceneCallbacks {
  onRetry: () => void;
  onEscape: () => void;
  /** trollPos: OverworldTrollManager.trollCapturePosition (where the troll king fell) */
  onWhiteWin: (ending: PlayerSaveData["ending"], trollPos: V2) => void;
  /** duck ending: TransitionManager.StartTransition(Out) halfway through the troll's farewell */
  onDuckFade?: () => void;
}

const S = CHESS_STRINGS;
const GUESS_HOLDER_Y = -432;

let nextId = 1;

function makePiece(data: PieceData, color: ChessColor, x: number, y: number, rng: Rng): PieceObj {
  return {
    id: nextId++,
    data,
    color,
    x,
    y,
    isSleeping: false,
    sleepTurn: 0,
    sleepClicks: 0,
    sleepResetTimer: 0,
    rookEatScore: 0,
    scale: 1,
    flipX: false,
    alpha: 1,
    fillHidden: false,
    outlineHidden: false,
    highlighted: false,
    rot: 0,
    liftY: 0,
    shakeUntil: 0,
    shakeMag: 0,
    bobNoise: rangeF(rng, 0, 1),
    scaleNoise: rangeF(rng, 0, 1),
    bob: true,
    trollIdle: false,
    outlineAnim: null,
    fillAnim: null,
    onTop: false,
    removed: false,
    halo: 0,
    dragging: false,
    scrapTimer: 0,
    isDuckBound: false,
  };
}

export class ChessScene {
  readonly sched = new Scheduler();
  readonly rng: Rng;
  readonly save: PlayerSaveData;
  readonly cb: SceneCallbacks;

  // ---------- ChessMatchManager ----------
  board: BoardState<PieceObj>;
  all: PieceObj[] = [];
  tapRings: { x: number; y: number; start: number }[] = [];
  ambience = new BoardAmbience();
  boardSquares: { x: number; y: number; color: "White" | "Black"; inBoard: boolean }[] = [];
  slippery: { x: number; y: number; active: boolean }[] = [];
  oobVisible = false;
  turnCount = 1;
  colorHasWon = false;
  blockMovement = false;
  noMoveAllowed = false;
  whiteWonCheat = false;
  whiteCheatCount = 0;
  lastTurnMovedPiece: PieceObj | null = null;
  lastMovedPieceByWhite: PieceObj | null = null;
  lastTurnCheatReasons: CheatId[] = [];
  isJuggler = true;
  blackWonTime = false;
  trollCapturePosition: V2 | null = null;
  private duckEnding = false;
  duck: Duck;
  lilies = new LilyPads();
  /** SpeedChessManager (null when SPEED CHESS MODE is OFF) */
  hourglass: null | {
    time: number;
    elapsed: number;
    incrementElapsed: number;
    opacity: number;
    shakeUntil: number;
    flip: null | { from: number; to: number; start: number; fromColor: Rgb; toColor: Rgb };
    color: Rgb;
    rotation: number;
  } = null;
  juggleCounter = 0;
  ascensionCounter = 0;
  missedAccusationCounter = 0;
  isEndingTurn = false;
  flash: null | "Outline" | "White" = null;
  cameraShakeUntil = 0;
  cameraShakeMag = 0;
  ghosts: Ghost[] = [];
  damageNumbers: DamageNumber[] = [];

  // ---------- ChessTrollManager ----------
  static doStartTopic = false;
  cheatingChance = TROLL.cheatingChance;
  trollLastCheatReasons: CheatId[] = [];
  isPerformingAction = false;
  isPerformingFakeOut = false;

  // ---------- TrollDialogManager ----------
  isInDialog = false;
  private mouseClicked = false;
  topicChance = DIALOG_MANAGER.topicChance;
  discardedTopics: string[] = [];
  textBalloon: PieceObj | null = null;
  textBalloonStart = 0;
  dialog: UIState["dialog"] = null;

  // ---------- RuleBook ----------
  screens: RuleScreen[];
  currentScreen: number;
  flipBuffer: number[] = [];
  isFlipping = false;
  flipAnim: null | { start: number; flipX: boolean } = null;
  leftPage: RulePage;
  rightPage: RulePage;
  pageColorLeft: "Outline" | "Danger" = "Outline";
  pageColorRight: "Outline" | "Danger" = "Outline";
  pageShake: null | { side: "left" | "right"; until: number } = null;
  bookShakeUntil = 0;
  fogEntries: PageFogEntry[];
  fogClearing: null | { side: "left" | "right"; start: number } = null;
  isProgressingFog = false;
  piecesFogAlpha = 1;
  hoverPage: null | "left" | "right" = null;
  hoverLink = -1;

  // RuleBookInteraction
  bookX: number = CONSTANTS.bookRestX;
  camX = 0;
  /** screen aspect of the chess canvas (Camera.main.aspect); set by the view each frame */
  viewAspect = 16 / 9;
  isInspectingBook = false;
  private isEnteringBook = false;
  private isExitingBook = false;
  private isShakingBook = false;
  private shakeDelaySeconds = 0;
  private bookTweenToken = 0;

  // Accusation
  isAttemptingCheatGuess = false;
  isConfirmingCheatGuess = false;
  isAnimatingAttemptingCheatGuess = false;
  showingCheatGuessResult = false;
  cheatGuessPiece: PieceObj | null = null;
  cheatGuessPage: RulePage | null = null;
  guessText = S.AccusePromptKey;
  guessColor: "White" | "Danger" = "White";
  guessHolderY = GUESS_HOLDER_Y;
  guessTextHidden = false;
  guessBar = 0;
  confirmVisible = false;
  retryVisible = false;
  retryBar = 0;
  private gameIsOver = false;

  // Input
  dragPiece: PieceObj | null = null;
  private dragOffset: V2 = { x: 0, y: 0 };
  private dragLast: V2 = { x: 0, y: 0 };
  private moveIsBlocked = false;
  pointer: V2 | null = null;

  private listeners = new Set<() => void>();
  private uiCache: UIState | null = null;
  private disposed = false;

  constructor(cb: SceneCallbacks, rng: Rng = mathRng) {
    this.cb = cb;
    this.rng = rng;
    this.save = loadSave();
    this.board = {
      white: [],
      black: [],
      utility: [],
      boardSizeX: MATCH.boardSizeX,
      boardSizeY: MATCH.boardSizeY,
      currentTurnColor: "White",
      nextPlayerWonCheat: false,
    };
    this.screens = buildRuleBookScreens();
    this.currentScreen = CONSTANTS.startPageIndex;
    this.leftPage = at(this.screens, this.currentScreen).pages[0];
    this.rightPage = at(this.screens, this.currentScreen).pages[1];
    // RulebookFogManager.Start (fog entries persist in the save file)
    if (this.save.pageFogEntries.length < 1) this.save.pageFogEntries = generateFogEntries(this.screens);
    this.fogEntries = this.save.pageFogEntries;
    this.duck = new Duck({
      boardSizeX: MATCH.boardSizeX,
      boardSizeY: MATCH.boardSizeY,
      turn: () => (this.board.currentTurnColor === "Black" ? "Black" : "White"),
      piecePositions: () => [...this.board.white, ...this.board.black, ...this.board.utility],
    });
    const sct = speedChessTime();
    if (sct > 0)
      this.hourglass = { time: sct, elapsed: 0, incrementElapsed: 0, opacity: 0.5, shakeUntil: 0, flip: null, color: rgbOf("White"), rotation: 0 };
    this.awake();
  }

  // ======================================================================
  // Store plumbing for React overlays
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getUI = (): UIState => {
    if (!this.uiCache) this.uiCache = this.snapshot();
    return this.uiCache;
  };
  private snapshot(): UIState {
    return {
        dialog: this.dialog ? { ...this.dialog } : null,
        guessText: this.guessText,
        guessColor: this.guessColor,
        guessHolderY: this.guessHolderY,
        guessTextHidden: this.guessTextHidden,
        guessBar: this.guessBar,
        confirmVisible: this.confirmVisible,
        retryVisible: this.retryVisible,
        retryBar: this.retryBar,
        attempting: this.isAttemptingCheatGuess,
        inspecting: this.isInspectingBook,
        canAccuse: !this.board.nextPlayerWonCheat && this.board.currentTurnColor !== "Black" && !this.colorHasWon,
    };
  }
  private emit() {
    const next = this.snapshot();
    const prev = this.uiCache;
    if (prev && sameUI(prev, next)) return;
    this.uiCache = next;
    for (const l of this.listeners) l();
  }

  dispose() {
    this.disposed = true;
    this.sched.dispose();
    this.listeners.clear();
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

  // ======================================================================
  // Setup (Awake / SetupChessMatch / SetupPieceColor / Start)
  private awake() {
    this.save.totalAttemptCount++;
    this.save.overworldState = "ACT_II";
    for (const p of INITIAL_PIECES) {
      const obj = makePiece(PIECES[p.data], p.color, p.x, p.y, this.rng);
      if (p.color === "White") this.board.white.push(obj);
      else if (p.color === "Black") this.board.black.push(obj);
      else this.board.utility.push(obj);
      this.all.push(obj);
    }
    this.setupChessMatch();
    for (const p of [...this.board.white, ...this.board.black]) {
      if (p.color === "Black" && p.data.type === PieceType.King) this.trollIdle(p);
      if (p.x < 0) p.flipX = true;
    }
    this.lastTurnMovedPiece = this.board.white[0] ?? null;
    storeSave(this.save);
    // ChessTrollManager.Start
    if (ChessScene.doStartTopic) {
      ChessScene.doStartTopic = false;
      this.run(() => this.performDialog(this.getRandomTopic(TOPIC_LISTS.startTopics), 1));
      this.save.firstGameinScene = false;
    } else if (this.save.firstGameinScene) this.save.firstGameinScene = false;
    this.emit();
  }

  private setupChessMatch() {
    const bx = MATCH.boardSizeX;
    const by = MATCH.boardSizeY;
    let col: "White" | "Black" = "White";
    const inBoard: V2[] = [];
    for (let x = -bx * 3 + 0.5; x < bx * 3 + 0.5; x += 1) {
      col = col === "Black" ? "White" : "Black";
      for (let y = -by * 3 + 0.5; y < by * 3 + 0.5; y += 1) {
        const c = col;
        col = col === "Black" ? "White" : "Black";
        const inside =
          y >= -Math.trunc(by / 2) + 0.5 && y < Math.trunc(by / 2) + 0.5 && x >= -Math.trunc(bx / 2) + 0.5 && x < Math.trunc(bx / 2) + 0.5;
        this.boardSquares.push({ x, y, color: c, inBoard: inside });
        if (inside) inBoard.push({ x, y });
      }
    }
    const middle = inBoard.filter((v) => v.y >= -0.5 && v.y <= 0.5);
    for (let i = 0; i < MATCH.slipperyTileCount; i++) {
      const v = pickFrom(this.rng, middle);
      middle.splice(middle.indexOf(v), 1);
      this.slippery.push({ x: v.x, y: v.y, active: false });
    }
  }

  private trollIdle(p: PieceObj) {
    p.trollIdle = true;
    p.outlineAnim = null;
    p.fillAnim = null;
  }

  // ======================================================================
  // Per-frame update
  update(dt: number) {
    this.ambience.update(dt);
    if (this.disposed) return;
    this.sched.update(dt);
    const t = this.sched.time;
    this.duck.update(dt);
    this.updateSpeedChess(dt);
    if (this.shakeDelaySeconds < CONSTANTS.bookShakeDelay) this.shakeDelaySeconds += dt;

    // ChessTrollManager.Update
    if (!this.colorHasWon && !this.showingCheatGuessResult) {
      if (this.whiteWonCheat) {
        this.whiteWonCheat = false;
        this.blockMovement = true;
        this.run(() =>
          this.performDialog(this.getRandomTopic(TOPIC_LISTS.caughtCheatingTopics), 0.5, false, true),
        );
      }
      if (this.board.currentTurnColor === "Black" && !this.isPerformingAction) {
        this.isPerformingAction = true;
        this.run(() => this.performAction());
      }
      if (this.board.currentTurnColor !== "Black" && this.isPerformingAction) this.isPerformingAction = false;
    }

    // RuleBookScreenManager.Update
    if (!this.isFlipping && this.flipBuffer.length > 0) {
      const shift = this.flipBuffer.shift()!;
      this.run(() => this.transitionToScreen(shift));
    }
    if (this.colorHasWon) {
      if (!this.gameIsOver) {
        this.gameIsOver = true;
        this.onGameOver();
      }
    } else if (this.isAttemptingCheatGuess) {
      this.updateGuessText();
      if (this.cheatGuessPiece && this.cheatGuessPage && !this.isConfirmingCheatGuess && !this.isAnimatingAttemptingCheatGuess)
        this.run(() => this.startCheatGuessConfirmation());
    }

    // ChessPieceObject.Update bits
    for (const p of this.all) {
      if (p.removed) continue;
      if (p.data.type === PieceType.Castle && p.y < 15) {
        p.scrapTimer += dt;
        if (p.scrapTimer >= 10) {
          p.scrapTimer = 0;
          this.spawnDamageNumber(S.ScrapsKey, p);
          playSound("chess_piece_castle_scraps");
          this.save.totalScrapCount++;
        }
      }
      if (p.isSleeping && p.sleepClicks > 0) {
        if (p.sleepResetTimer < CONSTANTS.sleepResetTime) p.sleepResetTimer += dt;
        else {
          p.sleepResetTimer = 0;
          p.sleepClicks = 0;
          const from = p.rot;
          this.run(() => this.sched.tween(1, (k) => p.isSleeping && (p.rot = from + (60 - from) * k)));
        }
      }
    }
    this.damageNumbers = this.damageNumbers.filter((d) => t - d.start < 1.5);
    this.emit();
  }

  get time() {
    return this.sched.time;
  }

  // ======================================================================
  // ChessMatchManager.CompleteMove / CheckForCheating
  completeMove(moved: PieceObj, origin: V2, movedPosition: V2) {
    this.stopCheatGuessAttempt();
    const white = this.board.currentTurnColor === "White";
    if (this.lastTurnCheatReasons.length > 0 && !this.board.nextPlayerWonCheat && white) this.missedAccusationCounter++;
    if (white) {
      if (moved === this.lastMovedPieceByWhite) this.isJuggler = false;
      if (this.isJuggler) this.juggleCounter++;
    }
    const raw = checkForCheatingRaw(this.board, moved, origin, movedPosition);
    if (raw.length > 0 && white) {
      this.whiteCheatCount++;
      this.save.totalCheatCount++;
    }
    const list = this.board.nextPlayerWonCheat ? [] : raw;
    this.board.nextPlayerWonCheat = false;
    if (list.length > 0 && white) this.board.nextPlayerWonCheat = true;
    this.lastTurnMovedPiece = moved;
    this.lastTurnCheatReasons = list;
    const captured = checkForCapture(this.board, moved, movedPosition);
    this.run(() => this.endTurn(moved, captured, movedPosition, origin));
  }

  private removeFromLists(p: PieceObj) {
    this.board.white = this.board.white.filter((x) => x !== p);
    this.board.black = this.board.black.filter((x) => x !== p);
  }

  private hide(p: PieceObj) {
    p.removed = true;
    p.x = 0;
    p.y = 20;
    this.board.utility = this.board.utility.filter((x) => x !== p);
  }

  // SpeedChessManager.Update / DoCountTime / CountTime
  private updateSpeedChess(dt: number) {
    const hg = this.hourglass;
    if (!hg || !this.lastMovedPieceByWhite) return;
    const count =
      this.board.currentTurnColor === "White" &&
      !this.isEndingTurn &&
      !this.isInDialog &&
      !this.isConfirmingCheatGuess &&
      !this.showingCheatGuessResult;
    if (!count) {
      hg.incrementElapsed = 0;
      return;
    }
    if (hg.incrementElapsed < ESTIMATED.speedChess.incrementTime) {
      hg.incrementElapsed += dt;
      hg.opacity = 0.5;
      return;
    }
    if (hg.elapsed < hg.time) {
      hg.elapsed += dt;
      hg.opacity = 1;
      if (hg.shakeUntil <= this.time) hg.shakeUntil = this.time + 0.25;
    } else {
      this.board.nextPlayerWonCheat = true;
      this.blackWonTime = true;
      this.lastTurnCheatReasons = [];
      this.board.currentTurnColor = "Black";
    }
  }

  private flipHourglass(direction: number, color: Rgb) {
    const hg = this.hourglass;
    if (!hg) return;
    const f = hg.flip;
    const fromRot = f ? f.to : 0;
    const fromColor = f ? f.toColor : hg.color;
    hg.opacity = 0.5;
    hg.flip = { from: fromRot, to: direction, start: this.time, fromColor, toColor: color };
  }

  private shakeCamera(dur: number, mag: number) {
    if (!doScreenshake()) return;
    this.cameraShakeUntil = this.time + dur;
    this.cameraShakeMag = mag;
  }
  shakePiece(p: PieceObj, dur: number, mag: number) {
    if (p.shakeUntil > this.time) return;
    p.shakeUntil = this.time + dur;
    p.shakeMag = mag;
  }

  spawnUtility(pos: V2, key: "Landmine" | "Castle"): PieceObj {
    const p = makePiece(PIECES[key], "Utility", pos.x, pos.y, this.rng);
    if (key === "Landmine") p.bob = false;
    this.board.utility.push(p);
    this.all.push(p);
    return p;
  }

  private spawnDamageNumber(text: string, piece: PieceObj) {
    this.damageNumbers.push({ text, piece, start: this.time });
  }

  private async endTurn(moved: PieceObj, captured: PieceObj[], movedPosition: V2, origin: V2) {
    this.isEndingTurn = true;
    let whiteKingKilled = false;
    let blackKingKilled = false;
    let stopSleeping = false;
    if (moved.isSleeping) {
      moved.isSleeping = false;
      stopSleeping = true;
      void this.stopSleepingAnim(moved);
      await this.wait(1);
    }
    if (!stopSleeping) {
      // Rule 23: towers eat friendly pieces
      if (moved.data.type === PieceType.Rook && captured.some((c) => c.color === moved.color)) {
        this.spawnDamageNumber("X2", moved);
        moved.scale *= 1.05;
        playSound("chess_piece_rook_eat");
        moved.rookEatScore++;
      }
      // Rule 22: bishops drop landmines
      let landmineCaptures: PieceObj[] = [];
      let landmine: PieceObj | null = null;
      if (moved.data.type === PieceType.Bishop && !vEq(movedPosition, origin)) {
        const mine = this.spawnUtility(origin, "Landmine");
        playSound("chess_piece_landmine_spawn");
        landmineCaptures.push(...checkForCapture(this.board, mine, origin));
        if (landmineCaptures.length > 0) landmine = mine;
        landmineCaptures = landmineCaptures.filter((x) => x !== landmine);
      }
      if (!landmine) {
        for (const c of captured) {
          if (c.data.type !== PieceType.Landmine && moved.data.type !== PieceType.Landmine) continue;
          if (c.data.type === PieceType.Landmine) {
            landmineCaptures.push(moved);
            landmine = c;
            continue;
          }
          landmine = moved;
          if (c.data.type !== PieceType.King) landmineCaptures.push(c);
        }
      }
      if (landmine) {
        for (const p of landmineCaptures) if (p !== landmine && p.data.type !== PieceType.King) p.alpha = 0;
        landmine.onTop = true;
        landmine.outlineHidden = true;
        landmine.fillAnim = { frames: animFrames("landmine_explode", 5), fps: 12, start: this.time, loop: false };
        playSound("chess_piece_landmine_explode");
        this.shakeCamera(0.15, 0.25);
        await this.wait(5 / 12);
        captured.push(...landmineCaptures);
        captured.push(landmine);
      }
      for (const c of captured) {
        if (c.data.type === PieceType.King) {
          if (c.color === "White") whiteKingKilled = true;
          if (c.color === "Black") blackKingKilled = true;
          if (c.color === "Black") this.trollCapturePosition = { x: c.x, y: c.y };
          if (whiteKingKilled || blackKingKilled) {
            c.onTop = true;
            this.flash = whiteKingKilled ? "Outline" : "White";
            if (blackKingKilled) c.trollIdle = false;
            playSound("titel_impact");
            this.shakeCamera(0.5, 0.05);
            await this.wait(1);
            if (blackKingKilled && this.board.black.length === 1) {
              this.whiteWin();
              return;
            }
            playSound("chess_piece_capture");
            c.fillHidden = true;
            c.outlineAnim = { frames: animFrames("king_shatter", 5), fps: 12, start: this.time, loop: false };
            this.flash = null;
            await this.wait(1);
            c.onTop = false;
          }
        } else {
          this.shakeCamera(0.15, 0.05);
          playSound("chess_piece_capture");
        }
        this.removeFromLists(c);
        this.hide(c);
      }
      if (this.board.white.length < 1 || whiteKingKilled) {
        this.colorHasWon = true;
        this.board.currentTurnColor = "Black";
      }
      if (blackKingKilled) {
        if (this.board.black.length < 1) {
          this.colorHasWon = true;
          this.board.currentTurnColor = "White";
          this.whiteWin();
          return;
        }
        // Rule 11: the crown is given to another member of the royal guard
        await this.wait(1);
        const heir = pickFrom(this.rng, this.board.black);
        heir.data = PIECES.King;
        this.trollIdle(heir);
        for (let k = 0; k < 4; k++) {
          playSound("chess_piece_king_respawn");
          heir.alpha = 0.25;
          await this.wait(0.25);
          heir.alpha = 1;
          await this.wait(0.25);
        }
      }
      // Rule 27: slippery tiles
      let doSlip = false;
      const rp = roundPoint(movedPosition);
      for (const s of this.slippery) {
        if (vEq({ x: s.x, y: s.y }, rp)) {
          s.active = true;
          doSlip = true;
        }
      }
      if (doSlip && !moved.removed) {
        moved.isSleeping = true;
        moved.sleepTurn = this.turnCount;
        void this.slipOnFloor(moved);
        await this.wait(1);
      }
      // Rule 21: queen captures flip the world sideways
      if (moved.data.type === PieceType.Queen && captured.length > 0) {
        for (const p of [...this.board.white, ...this.board.black, ...this.board.utility]) {
          p.x = -p.x;
          this.shakePiece(p, 0.15, 0.05);
        }
        for (const s of this.slippery) s.x = -s.x;
        playSound("chess_piece_queen_worldflip");
        await this.wait(1.5);
      }
      // Rule 16: adjacent towers form a castle
      const rookPos = roundPoint(moved);
      if (moved.data.type === PieceType.Rook && !moved.removed) {
        let largest = moved.scale;
        const rooks = [...this.board.white, ...this.board.black].filter((p) => p.data.type === PieceType.Rook && p !== moved);
        const castle: PieceObj[] = [];
        for (const r of rooks) {
          const b = piecePos(r);
          if (Math.hypot(rookPos.x - b.x, rookPos.y - b.y) <= 1) {
            if (r.scale > largest) largest = r.scale;
            r.shakeUntil = 0;
            this.shakePiece(r, 1, 0.075);
            castle.push(r);
          }
        }
        if (castle.length > 0) {
          moved.shakeUntil = 0;
          this.shakePiece(moved, 1, 0.075);
          await this.wait(1.5);
          castle.push(moved);
          for (const r of castle) {
            this.removeFromLists(r);
            this.hide(r);
          }
          const c = this.spawnUtility(rookPos, "Castle");
          this.shakePiece(c, 0.15, 0.075);
          c.scale *= largest;
          this.lastTurnMovedPiece = c;
          playSound("chess_piece_castle_merge");
          captured.push(...castle);
        }
      }
      // Rule 20: pawns reaching the great beyond ascend
      if (moved.data.type === PieceType.Pawn && !moved.removed) {
        const y = roundPoint(moved).y;
        const asc = (moved.color === "White" && y >= 3.5) || (moved.color === "Black" && y <= -3.5);
        if (asc) {
          this.removeFromLists(moved);
          captured.push(moved);
          void this.ascension(moved);
          this.ascensionCounter++;
          if (this.ascensionCounter >= 8) {
            await this.wait(1);
            this.save.ending = "AscensionEnding";
            this.whiteWin("AscensionEnding");
            return;
          }
        }
      }
      // Duck: a piece dropped on the duck gets carried away (ChessMatchManager.EndTurn)
      if (this.board.currentTurnColor === "White" && this.duck.canTake(moved)) {
        this.duck.take(moved);
        moved.isDuckBound = true;
        moved.onTop = false;
        playSound("duck_honk");
        playSound("duck_flap");
        await this.wait(3);
        if (moved.data.type === PieceType.King && moved.color === "Black") {
          this.duckEnding = true;
          const t = TOPIC_LISTS.duckBoundTrollTopics;
          await this.performDialog(at(t, 0), 1);
          await this.wait(1);
          await this.performDialog(at(t, 1), 0.5);
          await this.wait(1);
          this.cb.onDuckFade?.();
          await this.performDialog(at(t, 2), 0.25);
          await this.wait(0.25);
          await this.performDialog(at(t, 3), 0);
          await this.wait(2);
          this.trollCapturePosition = { x: moved.x, y: moved.y };
          this.whiteWin("DuckEnding");
          return;
        }
        this.board.black = this.board.black.filter((x) => x !== moved);
        await this.performDialog(this.getRandomTopic(TOPIC_LISTS.duckBoundWhiteTopics), 1);
        await this.wait(1);
      }
      if (this.board.currentTurnColor === "White") this.lastMovedPieceByWhite = moved;
      else if (!this.colorHasWon && this.lastMovedPieceByWhite) {
        const entry = progressFogClearing(this.screens, this.fogEntries, this.lastMovedPieceByWhite.data.type);
        if (entry) {
          this.isProgressingFog = true;
          await this.clearFog(entry);
        }
      }
    }
    storeSave(this.save);
    if (!this.colorHasWon) {
      if (this.board.currentTurnColor === "White") {
        this.board.currentTurnColor = "Black";
        this.flipHourglass(180, rgbOf("Black"));
      } else {
        this.blockMovement = false;
        this.board.currentTurnColor = "White";
        this.flipHourglass(0, rgbOf("White"));
      }
      this.turnCount++;
    }
    this.isEndingTurn = false;
    this.emit();
  }

  private whiteWin(forced?: PlayerSaveData["ending"]) {
    let ending: PlayerSaveData["ending"];
    if (forced) ending = forced;
    else if (this.whiteCheatCount < 1) ending = "GoodEnding";
    else ending = "BadEnding";
    this.colorHasWon = true;
    this.gameIsOver = true;
    this.save.ending = ending;
    this.save.overworldState = "ACT_III";
    storeSave(this.save);
    const king = this.board.black.find((p) => p.data.type === PieceType.King);
    const pos = this.trollCapturePosition ?? (king ? { x: king.x, y: king.y } : { x: 0, y: 0 });
    this.cb.onWhiteWin(ending, pos);
  }

  // ---------- ChessPieceObject coroutines ----------
  private async slipOnFloor(p: PieceObj) {
    playSound("chess_piece_slip");
    await this.sched.tween(0.5, (k) => {
      const t = k * 0.5;
      p.rot = t < 0.1173 ? (t / 0.1173) * 147.66 : 147.66 + ((t - 0.1173) / (0.5 - 0.1173)) * (60 - 147.66);
      p.liftY = t < 0.311 ? (t / 0.311) * 0.7146 : 0.7146 * (1 - (t - 0.311) / (0.5 - 0.311));
    });
    p.liftY = 0;
  }

  private async stopSleepingAnim(p: PieceObj) {
    p.rot = 0;
    await this.sched.tween(0.5, (k) => {
      const t = k * 0.5;
      p.liftY = t < 0.311 ? (t / 0.311) * 0.7146 : 0.7146 * (1 - (t - 0.311) / (0.5 - 0.311));
    });
    p.liftY = 0;
  }

  private async ascension(p: PieceObj) {
    playSound("chess_piece_pawn_ascention");
    p.halo = 1;
    const y0 = p.y;
    await this.sched.tween(8, (k) => {
      p.y = y0 + 20 * k;
      const t = k * 8;
      p.alpha = Math.max(0, 1 - t / 3);
      p.halo = p.alpha;
    });
    p.removed = true;
  }

  private onGrab(p: PieceObj) {
    p.onTop = true;
    this.ghosts.push({ piece: p, x: p.x, y: p.y });
    playSound("chess_piece_grab");
  }

  private releaseGrab(p: PieceObj) {
    this.shakePiece(p, 0.1, 0.05);
    playSound("chess_piece_drop");
    this.ghosts = this.ghosts.filter((g) => g.piece !== p);
    p.onTop = false;
  }

  private async dragChessPiece(p: PieceObj, origin: V2, move: V2) {
    if (p.isSleeping) {
      this.completeMove(p, origin, origin);
      return;
    }
    this.onGrab(p);
    const off = { x: rangeF(this.rng, -0.15, 0.15), y: rangeF(this.rng, -0.15, 0.15) };
    const sx = p.x;
    const sy = p.y;
    const tx = origin.x + move.x + off.x;
    const ty = origin.y + move.y + off.y;
    await this.sched.tween(0.5, (k) => {
      const e = easeInOut(k);
      p.x = sx + (tx - sx) * e;
      p.y = sy + (ty - sy) * e;
    });
    p.x = tx;
    p.y = ty;
    this.completeMove(p, origin, { x: origin.x + move.x, y: origin.y + move.y });
    this.releaseGrab(p);
  }

  private async fakeOut(p: PieceObj) {
    await this.wait(0.25);
    this.onGrab(p);
    const y0 = p.y;
    await this.sched.tween(1, (k) => {
      const lift = k < 0.33 ? easeInOut(k / 0.33) : k < 0.66 ? 1 : 1 - easeInOut((k - 0.66) / 0.34);
      p.y = y0 + 0.5 * lift;
    });
    p.y = y0;
    this.releaseGrab(p);
    this.isPerformingFakeOut = false;
  }

  // ======================================================================
  // ChessTrollManager.PerformAction
  private viewport() {
    const halfH = CONSTANTS.cameraOrthoSize;
    const halfW = halfH * this.viewAspect;
    return { minX: this.camX - halfW, maxX: this.camX + halfW, minY: -halfH, maxY: halfH };
  }

  private async performAction() {
    if (this.board.nextPlayerWonCheat && this.blackWonTime) {
      void this.performDialog(this.getRandomTopic(TOPIC_LISTS.speedChessFailTopics), 0.5);
    } else if (this.board.nextPlayerWonCheat) {
      let found: { page: RulePage; screenIndex: number };
      const type = this.lastTurnMovedPiece?.data.type ?? PieceType.Pawn;
      if (this.lastTurnCheatReasons.length > 0) {
        void this.cheatScreen();
        await this.wait(4);
        found = findCheatReasonInRuleBook(this.screens, this.lastTurnCheatReasons, type, false);
      } else found = findCheatReasonInRuleBook(this.screens, null, type, true);
      this.flipToSpecificPage(found.screenIndex);
      this.spawnTextBalloon();
      await this.until(() => this.leftPage === found.page || this.rightPage === found.page);
      this.pageShake = { side: this.leftPage === found.page ? "left" : "right", until: this.time + 2 };
      await this.wait(1);
      if (isPageFogged(this.fogEntries, found.page)) {
        const entry = this.fogEntries.find((e) => e.pageID === found.page.pageID)!;
        this.isProgressingFog = true;
        void this.clearFog(entry);
      }
      await this.until(() => !this.isProgressingFog);
      const topic = found.page.trollTopic ?? this.getRandomTopic(TOPIC_LISTS.falseAccusationTopics);
      void this.performDialog(topic, 0.5);
    } else if (!this.isJuggler && this.juggleCounter >= 20) {
      this.juggleCounter = 0;
      void this.performDialog(this.getRandomTopic(TOPIC_LISTS.jugglerFailTopics), 0.5);
    } else this.rollForRandomDialog();
    await this.until(() => !this.isInDialog);

    let didFakeOut = false;
    for (let i = 1; i <= 3; i++) {
      const did = rollFakeOut(this.rng, this.board.black.length, i);
      if (did) {
        didFakeOut = true;
        this.performFakeOut();
      }
      await this.until(() => !this.isPerformingFakeOut);
    }
    const ctx = {
      board: this.board,
      activeSlippery: this.slippery.filter((s) => s.active),
      lastCheatReasons: this.trollLastCheatReasons,
      viewport: this.viewport(),
      rng: this.rng,
    };
    const possible = generatePossibleMoves(ctx);
    const chosen = chooseActionBasedOnCheatingChance(ctx, possible, this.cheatingChance);
    if (!chosen) return;
    if (chosen.resetCheatingChance) this.cheatingChance = 0;
    const a = chosen.action;
    const target = { x: a.origin.x + a.move.x, y: a.origin.y + a.move.y };
    const list = this.board.nextPlayerWonCheat ? [] : checkForCheatingRaw(this.board, a.piece, a.origin, target);
    if (list.length > 0) this.trollLastCheatReasons = list;
    await this.wait(didFakeOut ? 0.25 : rangeF(this.rng, 0.33, 0.66));
    void this.dragChessPiece(a.piece, a.origin, a.move);
    this.cheatingChance += rangeF(this.rng, TROLL.cheakingChanceIncreaseMin, TROLL.cheakingChanceIncreaseMax);
  }

  private performFakeOut() {
    const list = [...this.board.white, ...this.board.black, ...this.board.utility];
    const p = list[rangeI(this.rng, 0, list.length)];
    if (!p) return;
    this.isPerformingFakeOut = true;
    void this.fakeOut(p);
  }

  // ======================================================================
  // TrollDialogManager
  getRandomTopic(list: string[]): string {
    let pool = list.filter((t) => !this.discardedTopics.includes(t));
    if (pool.length < 1) {
      this.discardedTopics = this.discardedTopics.filter((t) => !list.includes(t));
      pool = [...list];
    }
    const t = pickFrom(this.rng, pool);
    this.discardedTopics.push(t);
    return t;
  }

  private rollForRandomDialog() {
    let flag = false;
    if (rangeF(this.rng, 0, 100) <= this.topicChance) {
      this.topicChance = 0;
      flag = true;
    }
    this.topicChance += rangeF(this.rng, DIALOG_MANAGER.topicChanceIncreaseMin, DIALOG_MANAGER.topicChanceIncreaseMax);
    if (flag) void this.performDialog(this.getRandomTopic([...TOPIC_LISTS.tauntTopics, ...TOPIC_LISTS.hintTopics]), 0.5);
  }

  spawnTextBalloon() {
    playSound("troll_dialog_alert");
    const king = this.board.black.find((p) => p.data.type === PieceType.King);
    if (king) {
      this.textBalloon = king;
      this.textBalloonStart = this.time;
    }
  }

  async performDialog(topicName: string, delay: number, noAnimation = false, cancelStopMovement = false) {
    const lines: DialogLine[] = TOPICS[topicName] ?? [];
    this.isInDialog = true;
    await this.wait(0.25);
    if (!this.textBalloon) this.spawnTextBalloon();
    await this.wait(delay);
    this.mouseClicked = false;
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
        if (this.mouseClicked && line.canSkip) break;
      }
      this.dialog.visible = line.text.length;
      this.mouseClicked = false;
      this.emit();
      await this.until(() => this.mouseClicked);
      this.mouseClicked = false;
    }
    this.dialog = null;
    this.textBalloon = null;
    this.noMoveAllowed = false;
    if (cancelStopMovement) this.blockMovement = false;
    this.isInDialog = false;
    this.emit();
  }

  // ======================================================================
  // RuleBookInteraction
  private async moveBook(toBook: number, toCam: number) {
    const token = ++this.bookTweenToken;
    const b0 = this.bookX;
    const c0 = this.camX;
    await this.sched.tween(CONSTANTS.bookMoveSeconds, (k) => {
      if (token !== this.bookTweenToken) return;
      const e = easeInOut(k);
      this.bookX = b0 + (toBook - b0) * e;
      this.camX = c0 + (toCam - c0) * e;
    });
  }

  startInspecting() {
    this.isShakingBook = false;
    this.isExitingBook = false;
    playSound("chess_rulebook_slide_in");
    this.isEnteringBook = true;
    this.run(async () => {
      await this.moveBook(CONSTANTS.bookInspectX, CONSTANTS.cameraInspectX);
      this.isEnteringBook = false;
      this.isInspectingBook = true;
      this.emit();
    });
  }

  stopInspecting() {
    this.stopCheatGuessAttempt();
    this.isShakingBook = false;
    this.isEnteringBook = false;
    playSound("chess_rulebook_slide_out");
    this.isExitingBook = true;
    this.isInspectingBook = false;
    this.run(async () => {
      await this.moveBook(CONSTANTS.bookRestX, 0);
      this.isExitingBook = false;
      this.emit();
    });
  }

  toggleBook() {
    if (this.isConfirmingCheatGuess || this.isAnimatingAttemptingCheatGuess || this.isEnteringBook || this.isExitingBook) return;
    this.shakeDelaySeconds = 0;
    if (!this.isInspectingBook) this.startInspecting();
    else this.stopInspecting();
  }

  hoverBook() {
    if (this.shakeDelaySeconds < CONSTANTS.bookShakeDelay || this.isShakingBook || this.isEnteringBook || this.isExitingBook) return;
    if (this.isInspectingBook) return;
    this.isShakingBook = true;
    this.shakeDelaySeconds = 0;
    const x0 = this.bookX;
    this.run(async () => {
      await this.sched.tween(0.5, (k) => {
        this.bookX = x0 - 0.5 * Math.sin(k * Math.PI);
      });
      this.bookX = x0;
      this.isShakingBook = false;
    });
  }

  // ======================================================================
  // RuleBookScreenManager
  flipToSpecificPage(screenIndex: number) {
    const shiftSum = this.flipBuffer.reduce((a, b) => a + b, 0);
    const diff = screenIndex - (this.currentScreen + shiftSum);
    for (let i = 0; i < Math.abs(diff); i++) this.flipBuffer.push(diff < 0 ? -1 : 1);
    if (!this.isInspectingBook && !this.isEnteringBook) this.startInspecting();
  }

  private async transitionToScreen(shift: number) {
    const next = this.currentScreen + shift;
    if (next < 0 || next > this.screens.length - 1) return;
    this.pageColorLeft = "Outline";
    this.pageColorRight = "Outline";
    this.cheatGuessPage = null;
    this.isFlipping = true;
    const flipX = shift < 0;
    this.flipAnim = { start: this.time, flipX };
    playSound("chess_rulebook_page_flip");
    const screen = at(this.screens, next);
    if (flipX) this.leftPage = screen.pages[0];
    else this.rightPage = screen.pages[1];
    await this.wait(CONSTANTS.bookFlipSeconds);
    if (flipX) this.rightPage = screen.pages[1];
    else this.leftPage = screen.pages[0];
    this.currentScreen = next;
    this.flipAnim = null;
    this.isFlipping = false;
  }

  switchScreen(dir: -1 | 1) {
    this.flipBuffer.push(dir);
  }

  returnToFirstPage() {
    this.flipToSpecificPage(0);
  }

  clickPage(side: "left" | "right") {
    if (
      this.isConfirmingCheatGuess ||
      this.isAnimatingAttemptingCheatGuess ||
      !this.isInspectingBook ||
      (this.board.currentTurnColor === "Black" && !this.colorHasWon)
    )
      return;
    const page = side === "left" ? this.leftPage : this.rightPage;
    if (this.isAttemptingCheatGuess) {
      if (this.cheatGuessPage !== page) {
        this.pageColorLeft = side === "left" ? "Danger" : "Outline";
        this.pageColorRight = side === "right" ? "Danger" : "Outline";
        this.cheatGuessPage = page;
        playSound(this.cheatGuessPiece ? "chess_accusation_rulebreak" : "chess_accusation_chesspiece");
      } else {
        this.cheatGuessPage = null;
        if (side === "left") this.pageColorLeft = "Outline";
        else this.pageColorRight = "Outline";
      }
    } else this.switchScreen(side === "left" ? -1 : 1);
  }

  clickLink(index: number) {
    const screen = at(this.screens, this.currentScreen);
    const link = screen.links[index];
    if (!link || this.isFlipping) return;
    playSound("chess_rulebook_page_flip");
    this.flipToSpecificPage(link.screenIndex);
  }

  private async clearFog(entry: PageFogEntry) {
    playSound("chess_rulebook_fog_dissipate");
    this.bookShakeUntil = this.time + 1;
    await this.sched.tween(0.5, (k) => (this.piecesFogAlpha = 1 - 0.2 * k));
    await this.wait(0.5);
    this.flipToSpecificPage(entry.screenIndex);
    await this.until(() => this.currentScreen === entry.screenIndex && !this.isFlipping);
    entry.isFog = false;
    const screen = at(this.screens, entry.screenIndex);
    const side = screen.pages[0].pageID === entry.pageID ? "left" : "right";
    this.fogClearing = { side, start: this.time };
    await this.wait(2);
    this.fogClearing = null;
    storeSave(this.save);
    await this.sched.tween(0.5, (k) => (this.piecesFogAlpha = 0.8 + 0.2 * k));
    this.isProgressingFog = false;
  }

  isFogged(page: RulePage) {
    return isPageFogged(this.fogEntries, page);
  }

  // ---------- accusation ----------
  startCheatGuessAttempt() {
    if (this.board.nextPlayerWonCheat) return;
    this.isAttemptingCheatGuess = true;
    this.guessColor = "Danger";
    this.cheatGuessPiece = null;
    void this.growBar("guessBar", 1);
    if (!this.isInspectingBook && !this.isEnteringBook) this.startInspecting();
    playSound("chess_accusation_in");
    this.emit();
  }

  stopCheatGuessAttempt() {
    this.isAttemptingCheatGuess = false;
    if (!this.board.nextPlayerWonCheat) this.guessText = S.AccusePromptKey;
    this.guessColor = "White";
    if (this.cheatGuessPiece) this.cheatGuessPiece.highlighted = false;
    this.cheatGuessPiece = null;
    if (this.guessBar > 0) void this.growBar("guessBar", 0);
    this.pageColorLeft = "Outline";
    this.pageColorRight = "Outline";
    this.cheatGuessPage = null;
    this.emit();
  }

  private async growBar(which: "guessBar" | "retryBar", to: number) {
    // Bars open/close instantly; the view adds the shake.
    this[which] = to;
    this.emit();
    await Promise.resolve();
  }

  onCheatGuessButton() {
    if (this.isConfirmingCheatGuess || this.isAnimatingAttemptingCheatGuess || this.colorHasWon) return;
    if (this.board.currentTurnColor === "Black") return;
    if (!this.isAttemptingCheatGuess) this.startCheatGuessAttempt();
    else this.stopCheatGuessAttempt();
  }

  private updateGuessText() {
    let color = "";
    let piece = S.ChessPieceKey;
    let rule = "+ " + S.RuleViolatedKey;
    if (this.cheatGuessPiece) {
      color = this.cheatGuessPiece.color === "White" ? S.WhiteKey : this.cheatGuessPiece.color === "Black" ? S.BlackKey : "";
      piece = this.cheatGuessPiece.data.name;
    }
    if (this.cheatGuessPage) {
      rule = this.cheatGuessPage.ruleBreak ?? "";
      if (this.isFogged(this.cheatGuessPage)) rule = "?";
    }
    this.guessText = `${color} ${piece} ${rule}`.toUpperCase().trim();
  }

  private toggleCheatGuessPiece(p: PieceObj) {
    if (this.isConfirmingCheatGuess) return;
    if (this.cheatGuessPiece !== p) {
      if (this.cheatGuessPiece) this.cheatGuessPiece.highlighted = false;
      this.cheatGuessPiece = p;
      p.highlighted = true;
      playSound(this.cheatGuessPage ? "chess_accusation_rulebreak" : "chess_accusation_chesspiece");
    } else {
      this.cheatGuessPiece = null;
      p.highlighted = false;
    }
  }

  private async startCheatGuessConfirmation() {
    this.isAnimatingAttemptingCheatGuess = true;
    this.flash = "Outline";
    const y0 = this.guessHolderY;
    await this.sched.tween(0.5, (k) => (this.guessHolderY = y0 + (37.5 - y0) * easeInOut(k)));
    await this.wait(1);
    this.isAnimatingAttemptingCheatGuess = false;
    this.isConfirmingCheatGuess = true;
    this.confirmVisible = true;
    this.emit();
  }

  onConfirm() {
    if (!this.isConfirmingCheatGuess) return;
    this.isConfirmingCheatGuess = false;
    this.confirmVisible = false;
    const piece = this.cheatGuessPiece!;
    const page = this.cheatGuessPage!;
    const correct = this.checkIfPlayerGuessedCheat(piece, page);
    playSound("chess_accusation_confirm");
    this.stopCheatGuessAttempt();
    this.run(() => this.cheatGuessResultScreen(correct));
  }

  onCancel() {
    if (!this.isConfirmingCheatGuess) return;
    this.confirmVisible = false;
    this.flash = null;
    this.guessHolderY = GUESS_HOLDER_Y;
    this.stopCheatGuessAttempt();
    this.isConfirmingCheatGuess = false;
    this.emit();
  }

  private checkIfPlayerGuessedCheat(piece: PieceObj, page: RulePage): boolean {
    const ok = isCorrectAccusation({
      accusedPieceId: piece.id,
      accusedPieceType: piece.data.type,
      lastMovedPieceId: this.lastTurnMovedPiece?.id ?? null,
      lastTurnCheatReasons: this.lastTurnCheatReasons,
      page,
    });
    this.board.nextPlayerWonCheat = true;
    this.lastTurnCheatReasons = [];
    if (!ok) {
      this.board.currentTurnColor = "Black";
      return false;
    }
    this.whiteWonCheat = true;
    return true;
  }

  private async cheatGuessResultScreen(correct: boolean) {
    this.showingCheatGuessResult = true;
    this.guessHolderY = 0;
    this.guessTextHidden = true;
    this.flash = "Outline";
    this.noMoveAllowed = true;
    await this.wait(2);
    this.guessTextHidden = false;
    if (correct) {
      this.guessText = S.YouMayCheatKey;
      playSound("chess_accusation_correct");
    } else {
      this.guessText = S.FalseAccusationKey;
      playSound("chess_accusation_false");
    }
    await this.wait(1);
    this.guessHolderY = GUESS_HOLDER_Y;
    this.flash = null;
    await this.wait(1);
    this.showingCheatGuessResult = false;
  }

  private async cheatScreen() {
    this.showingCheatGuessResult = true;
    await this.wait(1);
    const y0 = this.guessHolderY;
    this.guessHolderY = 0;
    this.guessTextHidden = true;
    this.flash = "Outline";
    await this.wait(1);
    this.guessTextHidden = false;
    this.guessText = S.YouCheatedKey;
    playSound("chess_accusation_false");
    await this.wait(1);
    this.guessHolderY = y0;
    this.flash = null;
    await this.wait(1);
    this.showingCheatGuessResult = false;
  }

  private onGameOver() {
    this.save.overworldState = "ACT_II";
    storeSave(this.save);
    this.retryVisible = true;
    void this.growBar("retryBar", 1);
  }

  onRetry() {
    if (this.colorHasWon && this.retryVisible) this.cb.onRetry();
  }
  onEscape() {
    if (this.colorHasWon && this.retryVisible) this.cb.onEscape();
  }

  // ======================================================================
  // Input
  keyDown(key: string) {
    const k = key.toLowerCase();
    if (k === " " || k === "space") {
      if (this.isInDialog) {
        this.mouseClicked = true;
        return;
      }
    }
    if (this.colorHasWon) {
      if (k === "y") this.onRetry();
      if (k === "n") this.onEscape();
      return;
    }
    if (this.isConfirmingCheatGuess) {
      if (k === "y") this.onConfirm();
      if (k === "n") this.onCancel();
    }
    if (this.board.currentTurnColor === "Black") return;
    if (k === " " || k === "space") {
      if (this.isAttemptingCheatGuess) this.onCheatGuessButton();
      else if (!this.isConfirmingCheatGuess) this.startCheatGuessAttempt();
    }
  }

  /** Topmost piece under a world point (sprite drawn 0.25 above its square). */
  pieceAt(p: V2): PieceObj | null {
    const list = [...this.board.white, ...this.board.black, ...this.board.utility].filter((x) => !x.removed);
    let best: PieceObj | null = null;
    for (const piece of list) {
      const hx = 0.5 * piece.scale;
      const top = piece.data.type === PieceType.Castle ? 1.6 : 0.5;
      if (Math.abs(p.x - piece.x) <= hx && p.y - (piece.y + 0.25) <= top * piece.scale && piece.y + 0.25 - p.y <= 0.5) {
        if (!best || piece.y < best.y) best = piece;
      }
    }
    return best;
  }

  /** Returns true when the click was consumed by dialog advance. */
  pointerDownAny(): boolean {
    if (this.isInDialog) {
      this.mouseClicked = true;
      return true;
    }
    return false;
  }

  pieceMouseDown(piece: PieceObj, world: V2) {
    if (this.blockMovement) {
      this.moveIsBlocked = true;
      return;
    }
    if (this.noMoveAllowed || this.isInDialog || this.isConfirmingCheatGuess || this.isAnimatingAttemptingCheatGuess) return;
    if (this.isAttemptingCheatGuess) {
      this.toggleCheatGuessPiece(piece);
      return;
    }
    if (piece.isDuckBound) return;
    if (this.board.currentTurnColor !== "White" || this.colorHasWon) return;
    this.dragLast = roundPoint(piece);
    this.dragOffset = { x: piece.x - world.x, y: piece.y - world.y };
    if (!piece.isSleeping) {
      this.dragPiece = piece;
      piece.dragging = true;
      this.onGrab(piece);
    } else {
      piece.sleepClicks++;
      if (piece.sleepClicks < 3) {
        this.shakePiece(piece, 0.1, 0.05);
        piece.rot -= 15;
        playSound("overworld_lilypad");
        piece.sleepResetTimer = 0;
        return;
      }
      piece.sleepClicks = 0;
      piece.sleepResetTimer = 0;
      this.blockMovement = true;
      this.completeMove(piece, this.dragLast, this.dragLast);
    }
  }

  pointerMove(world: V2) {
    this.pointer = world;
    const p = this.dragPiece;
    if (!p) return;
    p.x = world.x + this.dragOffset.x;
    p.y = world.y + this.dragOffset.y;
    if (this.isAttemptingCheatGuess) {
      p.x = this.dragLast.x;
      p.y = this.dragLast.y;
      this.endDrag(p);
      return;
    }
    this.oobVisible = isOOB(this.board, this.dragLast) || isOOB(this.board, roundPoint(p));
  }

  pointerUp() {
    if (this.moveIsBlocked) {
      this.moveIsBlocked = false;
      return;
    }
    const p = this.dragPiece;
    if (!p) return;
    if (
      this.noMoveAllowed ||
      this.isInDialog ||
      this.isAttemptingCheatGuess ||
      this.isConfirmingCheatGuess ||
      this.isAnimatingAttemptingCheatGuess ||
      this.board.currentTurnColor !== "White" ||
      this.colorHasWon ||
      p.isSleeping
    )
      return;
    const v = roundPoint(p);
    this.releaseGrab(p);
    if (!vEq(v, this.dragLast)) {
      this.blockMovement = true;
      this.completeMove(p, this.dragLast, v);
    } else {
      p.x = v.x;
      p.y = v.y;
    }
    this.oobVisible = false;
    p.dragging = false;
    this.dragPiece = null;
  }

  private endDrag(p: PieceObj) {
    this.releaseGrab(p);
    p.dragging = false;
    this.dragPiece = null;
    this.oobVisible = false;
  }
}

function sameUI(a: UIState, b: UIState) {
  for (const k of Object.keys(a) as (keyof UIState)[]) {
    if (k === "dialog") {
      const x = a.dialog;
      const y = b.dialog;
      if (x === y) continue;
      if (!x || !y || x.text !== y.text || x.visible !== y.visible || x.noAnimation !== y.noAnimation) return false;
    } else if (a[k] !== b[k]) return false;
  }
  return true;
}

function animFrames(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
}

export { Cheat };
