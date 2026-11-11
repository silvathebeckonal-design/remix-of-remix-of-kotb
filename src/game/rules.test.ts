import { describe, expect, it } from "vitest";
import { Cheat, PIECES, type ChessColor, type PieceKey } from "./data";
import { checkForCheatingRaw, type BoardState, type LogicPiece } from "./rules";

let id = 1;
const piece = (key: PieceKey, color: ChessColor, x: number, y: number): LogicPiece => ({
  id: id++,
  data: PIECES[key],
  color,
  x,
  y,
  isSleeping: false,
});

function board(pieces: LogicPiece[]): BoardState<LogicPiece> {
  return {
    white: pieces.filter((p) => p.color === "White"),
    black: pieces.filter((p) => p.color === "Black"),
    utility: pieces.filter((p) => p.color === "Utility"),
    boardSizeX: 8,
    boardSizeY: 8,
    currentTurnColor: "White",
    nextPlayerWonCheat: false,
  };
}

describe("troll cheat detection (CheckForCheating port)", () => {
  it("a pawn stepping one square forward is legal", () => {
    const p = piece("Pawn", "White", 0.5, -2.5);
    expect(checkForCheatingRaw(board([p]), p, { x: 0.5, y: -2.5 }, { x: 0.5, y: -1.5 })).toEqual([]);
  });

  it("moving a piece of the other color is WrongColorMoved", () => {
    const k = piece("Knight", "Black", 1.5, 3.5);
    const b = board([k]);
    const r = checkForCheatingRaw(b, k, { x: 1.5, y: 3.5 }, { x: 2.5, y: 1.5 });
    expect(r).toContain(Cheat.WrongColorMoved);
  });

  it("a knight leaving the board is MoveOutOfBounds", () => {
    const k = piece("Knight", "White", 3.5, -3.5);
    const r = checkForCheatingRaw(board([k]), k, { x: 3.5, y: -3.5 }, { x: 5.5, y: -2.5 });
    expect(r).toContain(Cheat.MoveOutOfBounds);
  });

  it("moving a landmine is LandmineWasMoved", () => {
    const m = piece("Landmine", "Utility", 0.5, 0.5);
    const r = checkForCheatingRaw(board([m]), m, { x: 0.5, y: 0.5 }, { x: 0.5, y: 1.5 });
    expect(r).toContain(Cheat.LandmineWasMoved);
  });

  it("moving a castle is CastleWasMoved", () => {
    const c = piece("Castle", "Utility", 0.5, 0.5);
    const r = checkForCheatingRaw(board([c]), c, { x: 0.5, y: 0.5 }, { x: 1.5, y: 0.5 });
    expect(r).toContain(Cheat.CastleWasMoved);
  });
});
