// Port of ChessTrollManager.cs move generation, scoring and cheat decision.
import { Cheat, PieceType, TROLL, type CheatId, type V2 } from "./data";
import { checkForCapture, checkForCheating, piecePos, vAdd, vEq, type BoardState, type LogicPiece } from "./rules";
import { rangeF, rangeI, type Rng } from "./rng";

export interface PossibleAction<P extends LogicPiece = LogicPiece> {
  piece: P;
  origin: V2;
  move: V2;
  moveScore: number;
  isCheating: boolean;
  cheekiness: number;
  isBanned: boolean;
}

export interface TrollContext<P extends LogicPiece = LogicPiece> {
  board: BoardState<P>;
  /** Revealed slippery tiles. */
  activeSlippery: V2[];
  /** Cheat reasons used by the troll's previous cheat (never repeated). */
  lastCheatReasons: CheatId[];
  /** Visible camera rect in world units, used for the out-of-screen penalty. */
  viewport: { minX: number; maxX: number; minY: number; maxY: number };
  rng: Rng;
  weights?: typeof TROLL;
}

export function calculateCheekiness(reasons: CheatId[]): number {
  let n = 0;
  if (reasons.includes(Cheat.WrongColorMoved)) n += 50;
  if (reasons.includes(Cheat.MoveOutOfBounds)) n += 75;
  if (reasons.includes(Cheat.CollideWithOwnColor)) n += 75;
  if (reasons.includes(Cheat.MoveNotAllowedByType)) n += 25;
  if (reasons.includes(Cheat.BlockWasIgnored)) n += 75;
  return n;
}

export function calculateCheatChanceBonus(a: Pick<PossibleAction, "cheekiness">): number {
  return Math.min(Math.max(Math.trunc((100 - a.cheekiness) / 20), 0), 100);
}

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

export function calculateMoveScore(
  w: typeof TROLL,
  s: {
    noise: number;
    capturedWhite: number;
    capturedBlack: number;
    trading: number;
    capturedThisTurn: number;
    capturedNextTurn: number;
    movingOtherColor: number;
    favorableTile: number;
    outOfBounds: number;
    slipping: number;
  },
): number {
  let noise = clamp(s.noise * 100, 0, 100) * w.scoreForNoiseWeight;
  let white = s.capturedWhite * 10;
  if (white > 0 && s.capturedNextTurn === 0) white *= 5;
  white = clamp(white, 0, 1000) * w.scoreForCapturedWhitePiecesWeight;
  const black = -(clamp(s.capturedBlack * 10, 0, 1000) * w.scoreForCapturedBlackPiecesWeight);
  const trading = clamp(100 - (s.trading * 10 - 10), 0, 1000) * w.scoreForTradingPieceWeight;
  const thisTurn = clamp(s.capturedThisTurn * 10, 0, 1000) * w.scoreForCapturedThisTurnWeight;
  const nextTurn = -(clamp(s.capturedNextTurn * 10, 0, 1000) * w.scoreForCapturedNextTurnWeight);
  const other = clamp(s.movingOtherColor * 10, 0, 1000) * w.scoreForMovingOtherColorWeight;
  const fav = clamp(s.favorableTile * 10, 0, 100) * w.scoreForFavorableTileWeight;
  const oob = -(clamp(s.outOfBounds, 0, 100) * w.scoreForOutOfBoundsWeight);
  const slip = -(clamp(s.slipping * 10, 0, 1000) * w.scoreForSlippingWeight);
  noise = noise + white + black + trading + thisTurn + nextTurn + other + fav + oob + slip;
  return clamp(noise / 6, 0, 1000);
}

function generateForMoves<P extends LogicPiece>(ctx: TrollContext<P>, piece: P, moves: V2[], origin: V2): PossibleAction<P>[] {
  const { board } = ctx;
  const w = ctx.weights ?? TROLL;
  const out: PossibleAction<P>[] = [];
  for (const m of moves) {
    const move = { x: -m.x, y: -m.y };
    const target = vAdd(origin, move);
    const a: PossibleAction<P> = { piece, origin, move, moveScore: 0, isCheating: false, cheekiness: 0, isBanned: false };
    const noise = rangeF(ctx.rng, 0, 1);
    let capturedWhite = 0;
    let capturedBlack = 0;
    let capturedThisTurn = 0;
    let capturedNextTurn = 0;
    let movingOtherColor = 0;
    let outOfBounds = 0;
    let slipping = 0;
    let capturesUtility = false;
    const captures = checkForCapture(board, piece, target);
    if (piece.color === "Black") {
      for (const c of captures) {
        if (c.color === "White") capturedWhite += c.data.score;
        if (c.color === "Utility") capturesUtility = true;
      }
    } else {
      for (const c of captures) {
        if (c.color === "Black") capturedBlack += c.data.score;
        if (c.color === "Utility") capturesUtility = true;
      }
    }
    const trading = piece.data.score;
    if (ctx.activeSlippery.some((s) => vEq(target, s))) slipping = piece.data.score;

    if (piece.color === "Black") {
      let threatenedNow = false;
      let threatenedAfter = false;
      const exclude: P[] = [piece, ...captures];
      for (const wp of board.white) {
        if (wp.isSleeping) break; // original breaks out of the loop here
        const wpos = piecePos(wp);
        for (const am of wp.data.allowed) {
          if (vEq(vAdd(am, wpos), origin)) {
            const l = checkForCheating(board, wp, wpos, vAdd(wpos, am)).filter((c) => c !== Cheat.WrongColorMoved);
            if (l.length < 1) threatenedNow = true;
          }
          if (vEq(vAdd(am, wpos), target)) {
            const l = checkForCheating(board, wp, wpos, vAdd(wpos, am), exclude).filter(
              (c) => c !== Cheat.WrongColorMoved,
            );
            if (l.length < 1) threatenedAfter = true;
          }
        }
      }
      if (threatenedNow && !threatenedAfter) capturedThisTurn = piece.data.score;
      if (threatenedAfter || capturesUtility) capturedNextTurn = piece.data.score;
    }
    if (piece.color !== "Black" && piece.data.type !== PieceType.King) {
      let attacked = false;
      for (const bp of board.black) {
        for (const am of bp.data.allowed) if (vEq(vAdd(am, piecePos(bp)), target)) attacked = true;
      }
      if (attacked) movingOtherColor = piece.data.score;
    }
    let minDist = 999;
    for (const f of piece.data.favorable) {
      const fp = piece.color === "Black" ? f : { x: -f.x, y: -f.y };
      const d = Math.hypot(fp.x - target.x, fp.y - target.y);
      if (d < minDist) minDist = d;
    }
    const favorableTile = ((8 - minDist) / 8) * 10;
    const vp = ctx.viewport;
    if (!(target.x >= vp.minX && target.x <= vp.maxX && target.y >= vp.minY && target.y <= vp.maxY)) outOfBounds = 100;

    const reasons = checkForCheating(board, piece, origin, target);
    if (reasons.length > 0) {
      a.isCheating = true;
      a.cheekiness = calculateCheekiness(reasons);
      if (reasons.some((r) => ctx.lastCheatReasons.includes(r))) a.isBanned = true;
    }
    if (piece.data.type === PieceType.King && piece.color === "White") a.isBanned = true;
    if (piece.data.type === PieceType.Landmine && captures.length > 0) a.isBanned = true;
    if (a.isCheating && capturesUtility) a.isBanned = true;
    if (piece.data.type === PieceType.Pawn) {
      if (piece.color === "White" && target.y >= 3.5) a.isBanned = true;
      if (piece.color === "Black" && target.y <= -3.5) a.isBanned = true;
    }
    a.moveScore = calculateMoveScore(w, {
      noise,
      capturedWhite,
      capturedBlack,
      trading,
      capturedThisTurn,
      capturedNextTurn,
      movingOtherColor,
      favorableTile,
      outOfBounds,
      slipping,
    });
    if (a.isBanned) a.moveScore = -999;
    out.push(a);
  }
  return out;
}

export function generatePossibleMoves<P extends LogicPiece>(ctx: TrollContext<P>): PossibleAction<P>[] {
  const out: PossibleAction<P>[] = [];
  const perColor = (pieces: P[]) => {
    for (const p of pieces) {
      const origin = piecePos(p);
      out.push(...generateForMoves(ctx, p, p.data.allowed, origin));
      if (p.color === "Black") out.push(...generateForMoves(ctx, p, p.data.cheat, origin));
    }
  };
  perColor(ctx.board.black);
  perColor(ctx.board.white);
  perColor(ctx.board.utility);
  return out;
}

export interface ChooseResult<P extends LogicPiece> {
  action: PossibleAction<P>;
  resetCheatingChance: boolean;
}

export function chooseActionBasedOnCheatingChance<P extends LogicPiece>(
  ctx: TrollContext<P>,
  possible: PossibleAction<P>[],
  cheatingChance: number,
): ChooseResult<P> | null {
  const { board } = ctx;
  const sorted = [...possible].sort((a, b) => b.moveScore - a.moveScore);
  if (board.nextPlayerWonCheat) {
    const king = board.black.find((p) => p.data.type === PieceType.King);
    if (king) {
      const kpos = piecePos(king);
      let wpos = { x: 0, y: 0 };
      for (const wp of board.white) if (wp.data.type === PieceType.King) wpos = piecePos(wp);
      return {
        action: {
          piece: king,
          origin: kpos,
          move: { x: wpos.x - kpos.x, y: wpos.y - kpos.y },
          moveScore: 1000,
          isCheating: true,
          cheekiness: 0,
          isBanned: false,
        },
        resetCheatingChance: false,
      };
    }
  }
  if (sorted.length === 0) return null;
  const top = sorted[0];
  if (!top) return null;
  if (!top.isCheating) return { action: top, resetCheatingChance: false };
  if (rangeF(ctx.rng, 0, 100) <= cheatingChance + calculateCheatChanceBonus(top)) {
    const caps = checkForCapture(board, top.piece, vAdd(top.origin, top.move));
    const capturesKing = caps.some((c) => c.data.type === PieceType.King);
    if (!capturesKing && top.isCheating) return { action: top, resetCheatingChance: true };
  }
  for (const alt of sorted.slice(1)) if (!alt.isCheating) return { action: alt, resetCheatingChance: false };
  return { action: top, resetCheatingChance: true };
}

/** CheckForFakeOut: returns true when the troll should pretend to move a piece. */
export function rollFakeOut(rng: Rng, blackCount: number, multiplier: number, fakeOutChance = TROLL.fakeOutChance): boolean {
  const num = rangeI(rng, 0, 100);
  let num2 = (1 - Math.trunc(blackCount / 16)) * 4;
  if (blackCount < 3) num2 += 50;
  return num < (fakeOutChance + num2) / multiplier;
}
