// Typed access to the data extracted from the original King of the Bridge build
// (ScriptableObjects, MonoBehaviour settings, localization tables and scene layout).
import raw from "./data/gamedata.json";

export type V2 = { x: number; y: number };
export type ChessColor = "White" | "Black" | "Utility";

export const PieceType = {
  Pawn: 0,
  Bishop: 1,
  Knight: 2,
  Rook: 3,
  Queen: 4,
  King: 5,
  Null: 6,
  Landmine: 7,
  Castle: 8,
} as const;
export type PieceTypeId = (typeof PieceType)[keyof typeof PieceType];

export const Cheat = {
  Null: 0,
  WrongColorMoved: 1,
  MoveOutOfBounds: 2,
  CollideWithOwnColor: 3,
  MoveNotAllowedByType: 4,
  BlockWasIgnored: 5,
  QueenHasAffair: 6,
  LandmineWasMoved: 7,
  CastleWasMoved: 8,
} as const;
export type CheatId = (typeof Cheat)[keyof typeof Cheat];

export interface PieceData {
  key: string;
  type: PieceTypeId;
  score: number;
  infinite: boolean;
  jump: boolean;
  fill: string;
  outline: string;
  name: string;
  favorable: V2[];
  allowed: V2[];
  cheat: V2[];
}

export interface DialogLine {
  text: string;
  speed: number;
  canSkip: boolean;
}

export interface RawPage {
  pageID: string;
  sprite: string | null;
  cheatReason: CheatId;
  cheatScore: number;
  ruleBreak: string | null;
  checkPiece: boolean;
  piece: PieceTypeId;
  trollTopic: string | null;
  checkFogPiece: boolean;
  fogPiece: PieceTypeId;
  fogTurns: number;
  contentSprites: string[];
}

export interface SoundDef {
  clips: string[];
  volume: number;
  pitchRange: number;
  loop: boolean;
}

export interface SceneSprite {
  sprite: string;
  x: number;
  y: number;
  sx?: number;
  sy?: number;
  color: string | null;
  tint: number[];
  order: number;
  flipX?: boolean;
  name?: string;
  path?: string;
  active?: boolean;
}

type RawPiece = {
  type: number;
  score: number;
  infinite: boolean;
  jump: boolean;
  fill: string;
  outline: string;
  name: string;
  favorable: number[][];
  allowed: number[][];
  cheat: number[][];
};

export type PieceKey = "Bishop" | "Castle" | "Landmine" | "King" | "Knight" | "Pawn" | "Queen" | "Rook";
export type ColorName = "Black" | "Outline" | "White" | "Background" | "Danger" | "Utility";
export type Rgba = readonly [number, number, number, number];

const toV = (a: number[][]): V2[] => a.map((p) => ({ x: p[0] ?? 0, y: p[1] ?? 0 }));

const rawPieces = raw.pieces as unknown as Record<PieceKey, RawPiece>;
export const PIECES = Object.fromEntries(
  (Object.keys(rawPieces) as PieceKey[]).map((key) => {
    const p = rawPieces[key];
    const data: PieceData = {
      ...p,
      key,
      type: p.type as PieceTypeId,
      favorable: toV(p.favorable),
      allowed: toV(p.allowed),
      cheat: toV(p.cheat),
    };
    return [key, data];
  }),
) as Record<PieceKey, PieceData>;

export const COLORS = raw.colors as unknown as Record<ColorName, Rgba>;
export const MATCH = raw.match;
export const TROLL = raw.troll;
export const DIALOG_MANAGER = raw.dialogManager;
export const INITIAL_PIECES = raw.initialPieces as { color: ChessColor; data: PieceKey; x: number; y: number }[];
export const RULEBOOK_SCREENS = raw.ruleBookScreens as unknown as { name: string; pages: [RawPage, RawPage] }[];
export const TOPICS = raw.topics as Record<string, DialogLine[]>;
export const TOPIC_LISTS = raw.topicLists as unknown as {
  startTopics: string[];
  caughtCheatingTopics: string[];
  falseAccusationTopics: string[];
  tauntTopics: string[];
  hintTopics: string[];
  speedChessFailTopics: string[];
  jugglerFailTopics: string[];
  duckBoundBlackTopics: string[];
  duckBoundWhiteTopics: string[];
  duckBoundTrollTopics: string[];
  rematchAcceptTopics: string[];
  rematchInvitationTopics: string[];
  introductionTopic: string;
  outroCheaterTopic: string;
  outroFairPlayerTopic: string;
};
/** Touch build: drop PC key hints like "[ SPACE ] " and unwrap "[ CHESS PIECE ]" (labels are tapped directly). */
export const stripKeyHints = <T extends Record<string, string>>(o: T): T =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, v.replace(/\[\s*(SPACE|Y|N)\s*\]\s*/g, "").replace(/\[\s*(.*?)\s*\]/g, "$1")]),
  ) as T;
export const CHESS_STRINGS = stripKeyHints(raw.chessStrings);
export const RULE_BREAK_STRINGS = raw.ruleBreakStrings as Record<string, string>;
export const CREDITS_STRINGS = raw.creditsStrings;
export const OVERWORLD_STRINGS = stripKeyHints(raw.overworldStrings);
export const MENU_STRINGS = raw.menuStrings;
export const SOUNDS = raw.sounds as Record<string, SoundDef>;
export const SCENE_BACKGROUND = raw.sceneBackground as SceneSprite[];
export const SCENE_BOOK = raw.sceneBook as SceneSprite[];

/** Original values not stored as plain fields (read from the scene / prefabs). */
export const CONSTANTS = {
  cameraOrthoSize: 7,
  startPageIndex: 3,
  ruleCountPerContentPage: 6,
  tocStartPositionLeft: { x: -2.4, y: 2.4 },
  tocOffsetPositionLeft: { x: 0.025, y: -1.1 },
  bookRestX: 15,
  bookInspectX: 10,
  cameraInspectX: 5,
  bookMoveSeconds: 0.5,
  bookShakeDelay: 1,
  pieceImageOffsetY: 0.25,
  sleepAfterTurn: 6,
  sleepResetTime: 2,
  textBalloonOffsetY: 1.25,
  bookFlipFrames: 4,
  bookFlipSeconds: 0.133,
};

/** Serialized values missing from the extraction (see gamedata.json `estimated._note`). */
export const ESTIMATED = (raw as unknown as { estimated: Estimated }).estimated;
type Curve = import("./animationCurve").CurveKey[];
export interface Estimated {
  overworld: {
    cameraOrthoSize: number;
    bridgeSequenceOffsetY: number;
    act2PlayerY: number;
    act3PlayerY: number;
    distanceToInput: number;
    promptOffsetY: number;
    walkHalfWidth: number;
    lookTime: number;
    actDisplaySeconds: number;
    sineScaleAmp: number;
    sineScaleFreq: number;
  };
  water: { fps: number; tint: ColorName; minAbsX: number };
  tapRing: { duration: number; maxRadius: number; lineWidth: number; color: ColorName };
  lilypad: { sineAmp: number; sineFreq: number; buoyanceCurve: Curve };
  duck: {
    swimSpeed: number;
    walkSpeed: number;
    inactivityDistance: number;
    minInactivityTime: number;
    maxInactivityTime: number;
    minTimeBetweenWalk: number;
    maxTimeBetweenWalk: number;
    nextSpotMaxDistance: number;
    spotVisitsBeforeLeaving: number;
    flipTime: number;
    clipFps: number;
    sineAmp: number;
    sineFreq: number;
    pieceHolderY: number;
    walkCurveMidOutTangent: number;
    leaveCurveX: Curve;
    leaveCurveY: Curve;
    endingStartX: number;
  };
  speedChess: {
    options: { value: number; label: string }[];
    incrementTime: number;
    flipRotationCurve: Curve;
    uiX: number;
    uiY: number;
    uiScale: number;
    shakePx: number;
  };
  menu: {
    destructionThreshold: number;
    logoFallCurveY: Curve;
    barGrowSeconds: number;
    barGrowIncreaseCurve: Curve;
    barGrowDecreaseCurve: Curve;
    barMinWidth: number;
    barHeight: number;
  };
  outro: { trollDefeatXCurve: Curve; trollDefeatYCurve: Curve; slipRotationCurve: Curve; slipYCurve: Curve; cameraCurve: Curve };
  volumeOptions: number[];
}
