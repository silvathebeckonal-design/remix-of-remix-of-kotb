import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadSave } from "./save";
import { Game } from "./Game";

const flow = vi.hoisted(() => ({
  choose: undefined as undefined | ((choice: string) => void),
  finishBridge: undefined as undefined | (() => void),
  chessMount: vi.fn(),
  scene: { doStartTopic: false },
}));
vi.mock("./assets", async (orig) => ({
  ...(await orig<typeof import("./assets")>()),
  preloadAll: async () => {},
}));
vi.mock("./audio", () => ({
  playSound: vi.fn(),
  preloadSounds: vi.fn(),
  unlockAudio: vi.fn(),
  stopLoop: vi.fn(),
}));
vi.mock("./runtime/ChessScene", () => ({ ChessScene: flow.scene }));
vi.mock("./ui/TitleScreen", () => ({
  TitleScreen: ({ onChoose }: { onChoose: (c: string) => void }) => {
    flow.choose = onChoose;
    return null;
  },
}));
vi.mock("./ui/BridgeWalk", () => ({
  BridgeWalk: ({ onStartChess }: { onStartChess: (withStartTopic: boolean) => void }) => {
    flow.finishBridge = () => onStartChess(true);
    return null;
  },
}));
vi.mock("./ui/ChessView", () => ({
  ChessView: () => {
    flow.chessMount();
    return null;
  },
}));
vi.mock("./ui/ReactiveCursor", () => ({ ReactiveCursor: () => null }));
vi.mock("./ui/EndingScreen", () => ({ EndingScreen: () => null }));
vi.mock("./ui/LostPages", () => ({ LostPages: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  flow.scene.doStartTopic = false;
  flow.finishBridge = undefined;
  flow.chessMount.mockClear();
});
afterEach(() => vi.useRealTimers());

it("keeps chess off the bridge until dialogue finishes, then saves ACT_II and starts its welcome topic", async () => {
  render(<Game />);
  await act(async () => {
    flow.choose?.("start");
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(flow.finishBridge).toBeTypeOf("function");
  expect(loadSave().overworldState).toBe("ACT_I");
  expect(flow.chessMount).not.toHaveBeenCalled();
  await act(async () => {
    flow.finishBridge?.();
  });
  expect(loadSave().overworldState).toBe("ACT_II");
  expect(flow.scene.doStartTopic).toBe(true);
  expect(flow.chessMount).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(flow.chessMount).toHaveBeenCalled();
});
