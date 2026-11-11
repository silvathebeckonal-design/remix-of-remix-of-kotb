// Port of the rule checks in ChessMatchManager.cs (CheckForCheating / CheckForCapture).
import { Cheat, PieceType, type CheatId, type ChessColor, type PieceData, type V2 } from "./data";

export interface LogicPiece {
  id: number;
  data: PieceData;
  color: ChessColor;
  x: number;
  y: number;
  isSleeping: boolean;
}

export interface BoardState<P extends LogicPiece = LogicPiece> {
  white: P[];
  black: P[];
  utility: P[];
  boardSizeX: number;
  boardSizeY: number;
  currentTurnColor: ChessColor;
  nextPlayerWonCheat: boolean;
}

/** Unity's Mathf.Round (banker's rounding on exact halves). */
export function mathfRound(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

export function roundPoint(p: V2): V2 {
  return { x: mathfRound(p.x + 0.5) - 0.5, y: mathfRound(p.y + 0.5) - 0.5 };
}

/** Unity Vector3 equality (squared distance < 1e-10). */
export function vEq(a: V2, b: V2): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < 9.99999944e-11;
}

export function vAdd(a: V2, b: V2): V2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
export function vSub(a: V2, b: V2): V2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function normalized(v: V2): V2 {
  const m = Math.hypot(v.x, v.y);
  if (m <= 1e-5) return { x: 0, y: 0 };
  return { x: v.x / m, y: v.y / m };
}

const intDiv = (a: number, b: number) => Math.trunc(a / b);

export function isOOB(board: Pick<BoardState, "boardSizeX" | "boardSizeY">, p: V2): boolean {
  if (p.x < -intDiv(board.boardSizeX, 2) + 0.5 || p.x > intDiv(board.boardSizeX, 2)) return true;
  if (p.y < -intDiv(board.boardSizeY, 2) + 0.5 || p.y > intDiv(board.boardSizeY, 2)) return true;
  return false;
}

export function piecePos(p: LogicPiece): V2 {
  return roundPoint({ x: p.x, y: p.y });
}

export function checkForCapture<P extends LogicPiece>(board: BoardState<P>, moved: P, movedPosition: V2): P[] {
  let list: P[] = [];
  const result: P[] = [];
  switch (moved.color) {
    case "White":
      list = [...board.black];
      if (moved.data.type === PieceType.Rook) {
        list.push(...board.white);
        list = list.filter((p) => p !== moved);
      }
      break;
    case "Black":
      list = [...board.white];
      if (moved.data.type === PieceType.Rook) {
        list.push(...board.black);
        list = list.filter((p) => p !== moved);
      }
      break;
    case "Utility":
      list = [...board.black, ...board.white];
      break;
  }
  for (const item of list) if (vEq(movedPosition, piecePos(item))) result.push(item);
  for (const u of board.utility) if (vEq(movedPosition, piecePos(u))) result.push(u);
  return result.filter((p) => p !== moved);
}

/** CheckForCheating without the final "payback" clear (the caller decides). */
export function checkForCheatingRaw<P extends LogicPiece>(
  board: BoardState<P>,
  moved: P,
  origin: V2,
  movedPosition: V2,
  exclude?: P[],
): CheatId[] {
  const list: CheatId[] = [];
  const type = moved.data.type;
  if (type !== PieceType.Queen && board.currentTurnColor !== moved.color) list.push(Cheat.WrongColorMoved);
  if (type !== PieceType.Bishop) {
    if (movedPosition.x < -intDiv(board.boardSizeX, 2) + 0.5 || movedPosition.x > intDiv(board.boardSizeX, 2))
      list.push(Cheat.MoveOutOfBounds);
    if (movedPosition.y < -intDiv(board.boardSizeY, 2) + 0.5 || movedPosition.y > intDiv(board.boardSizeY, 2))
      list.push(Cheat.MoveOutOfBounds);
  }
  // Collide with own color
  let collide = false;
  const own = moved.color === "White" ? board.white : moved.color === "Black" ? board.black : [];
  for (const item of own) {
    if (moved === item || !vEq(movedPosition, piecePos(item))) continue;
    if (exclude) {
      if (!exclude.includes(item)) collide = true;
    } else collide = true;
  }
  if (collide && type !== PieceType.Rook) list.push(Cheat.CollideWithOwnColor);

  // Move allowed by type
  let allowed = false;
  const delta = vSub(movedPosition, origin);
  for (const a of moved.data.allowed) {
    if (moved.color === "White") {
      if (vEq(delta, a)) allowed = true;
      if (moved.data.infinite && vEq(normalized(delta), normalized(a))) allowed = true;
    } else if (moved.color === "Black") {
      const inv = vSub(origin, movedPosition);
      if (vEq(inv, a)) allowed = true;
      if (moved.data.infinite && vEq(normalized(inv), normalized(a))) allowed = true;
    }
  }
  if (!allowed && !vEq(delta, { x: 0, y: 0 })) list.push(Cheat.MoveNotAllowedByType);

  // Block ignored
  let blocked = false;
  if (!moved.data.jump) {
    const n = normalized(delta);
    const dir = { x: mathfRound(n.x), y: mathfRound(n.y) };
    let v = vAdd(origin, dir);
    let num = 0;
    const all = [...board.white, ...board.black, ...board.utility];
    while (!vEq(v, movedPosition) && num < 8) {
      for (const item of all) {
        if (!blocked && item !== moved && item.data.type !== PieceType.Landmine && vEq(piecePos(item), v)) {
          blocked = true;
          if (exclude && exclude.includes(item)) blocked = false;
        }
      }
      v = vAdd(v, dir);
      num++;
    }
  }
  if (blocked) list.push(Cheat.BlockWasIgnored);

  if (type === PieceType.Queen) {
    if (checkForCapture(board, moved, movedPosition).some((p) => p.data.type === PieceType.King))
      list.push(Cheat.QueenHasAffair);
  }
  if (type === PieceType.Landmine) list.push(Cheat.LandmineWasMoved);
  if (type === PieceType.Castle) list.push(Cheat.CastleWasMoved);
  return list;
}

export function checkForCheating<P extends LogicPiece>(
  board: BoardState<P>,
  moved: P,
  origin: V2,
  movedPosition: V2,
  exclude?: P[],
): CheatId[] {
  const list = checkForCheatingRaw(board, moved, origin, movedPosition, exclude);
  return board.nextPlayerWonCheat ? [] : list;
}
