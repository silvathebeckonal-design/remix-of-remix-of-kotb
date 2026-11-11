import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./audio", () => ({
  playSound: vi.fn(),
  stopLoop: vi.fn(),
  unlockAudio: vi.fn(),
  preloadSounds: vi.fn(),
}));

import { CREDITS_STRINGS, ESTIMATED } from "./data";
import {
  calculateVolume,
  cycleSetting,
  defaultSettings,
  getSettings,
  resetSettingsCacheForTests,
} from "./settings";
import { formatGameTime } from "./gameTime";
import { Duck } from "./runtime/duck";
import { LILY_CLUSTERS, LilyPads } from "./runtime/overworld";
import { OverworldScene } from "./runtime/OverworldScene";
import { ChessScene } from "./runtime/ChessScene";

beforeEach(() => {
  localStorage.clear();
  resetSettingsCacheForTests();
});

describe("SettingsManager", () => {
  it("maps the 0..100 volume slider to -40..0 dB like CalculateVolume", () => {
    expect(calculateVolume(100)).toBe(-0);
    expect(calculateVolume(50)).toBe(-20);
    expect(calculateVolume(0)).toBe(-40);
  });
  it("starts with fullscreen and screenshake on and speed chess off", () => {
    const s = defaultSettings();
    expect(s.fullscreen).toBe(1);
    expect(s.screenshake).toBe(1);
    expect(s.speedChess).toBe(0);
  });
  it("cycles an option to the right and wraps around", () => {
    expect(cycleSetting("screenshake").screenshake).toBe(0);
    expect(cycleSetting("screenshake").screenshake).toBe(1);
    expect(getSettings().screenshake).toBe(1);
  });
});

describe("Credits time line", () => {
  it("formats total game time like OverworldTrollManager.Credits", () => {
    const S = CREDITS_STRINGS;
    const s = {
      hour: S.TimeCountHourKey,
      hours: S.TimeCountHoursKey,
      minute: S.TimeCountMinuteKey,
      minutes: S.TimeCountMinutesKey,
      second: S.TimeCountSecondKey,
      seconds: S.TimeCountSecondsKey,
    };
    expect(formatGameTime(3725, s)).toBe("1 hour, 2 minutes and 5 seconds.");
    expect(formatGameTime(61, s)).toBe("1 minute and 1 second.");
  });
});

describe("LilyPad", () => {
  it("bobs back to rest after the buoyance curve and only reacts when a pad is tapped", () => {
    const pads = new LilyPads();
    const c = LILY_CLUSTERS[0]!;
    expect(pads.tap(0, 0, 0)).toBe(false);
    expect(pads.tap(c.x, c.y, 0)).toBe(true);
    const dip = ESTIMATED.lilypad.buoyanceCurve[1]!;
    const bob = (t: number) =>
      Math.sin(
        (t + (pads as unknown as { noise: Map<string, number> }).noise.get(`0|${c.key}`)!) *
          ESTIMATED.lilypad.sineFreq,
      ) * ESTIMATED.lilypad.sineAmp;
    expect(pads.offset(0, c, dip.time) - bob(dip.time)).toBeCloseTo(dip.value, 5);
    const end = ESTIMATED.lilypad.buoyanceCurve.at(-1)!.time + 0.01;
    expect(pads.offset(0, c, end) - bob(end)).toBeCloseTo(0, 5);
  });
});

describe("DuckManager", () => {
  const board = (turn: "White" | "Black", pieces: { x: number; y: number }[] = []) => ({
    boardSizeX: 8,
    boardSizeY: 8,
    turn: () => turn,
    piecePositions: () => pieces,
  });

  it("only swims during White's turn and resets once past x = -24", () => {
    const d = new Duck(board("Black"), () => 0.5);
    d.startSwimming();
    const x0 = d.x;
    d.update(1);
    expect(d.x).toBe(x0);
    const w = new Duck(board("White"), () => 0.5);
    w.startSwimming();
    w.x = -23.9;
    w.update(1);
    w.update(0.01);
    expect(w.state).toBe("Inactive");
    expect(w.x).toBe(ESTIMATED.duck.inactivityDistance);
  });

  it("walks after being dropped on the board, swims when dropped in the water", () => {
    const d = new Duck(board("White"), () => 0.5);
    d.startSwimming();
    d.x = 0;
    d.y = 0;
    expect(d.pointerDown({ x: 0, y: 0 })).toBe(true);
    expect(d.state).toBe("HeldByPlayer");
    d.pointerMove({ x: 1, y: 1 });
    d.pointerUp();
    expect(d.state).toBe("Walking");
    expect(d.pointerDown({ x: 1, y: 1 })).toBe(true); // not holdable while walking -> flap
    d.pointerUp();
    const s = new Duck(board("White"), () => 0.5);
    s.startSwimming();
    s.x = 7;
    s.y = 0;
    s.pointerDown({ x: 7, y: 0 });
    s.pointerUp();
    expect(s.state).toBe("Swimming");
  });

  it("picks a free board tile more than 1 and less than nextSpotMaxDistance away", () => {
    const d = new Duck(board("White", [{ x: 1.5, y: 0.5 }]), () => 0);
    d.x = 0.5;
    d.y = 0.5;
    for (let i = 0; i < 20; i++) {
      const s = d.getNewSpot();
      const dist = Math.hypot(s.x - 0.5, s.y - 0.5);
      expect(dist).toBeGreaterThan(1);
      expect(dist).toBeLessThan(ESTIMATED.duck.nextSpotMaxDistance);
      expect(s).not.toEqual({ x: 1.5, y: 0.5 });
    }
  });

  it("takes a piece dropped within 0.8 units unless held or inactive", () => {
    const d = new Duck(board("White"), () => 0.5);
    expect(d.canTake({ x: d.x, y: d.y })).toBe(false); // inactive
    d.startSwimming();
    expect(d.canTake({ x: d.x + 0.5, y: d.y })).toBe(true);
    expect(d.canTake({ x: d.x + 0.9, y: d.y })).toBe(false);
  });
});

describe("ACT II rematch bridge", () => {
  it("shows the challenge prompt only near the troll and starts the match after the accept dialog", async () => {
    const onStartChess = vi.fn();
    const s = new OverworldScene({ act: "ACT_II" }, { onStartChess, onCredits: vi.fn() });
    const flush = async () => {
      for (let k = 0; k < 5; k++) await Promise.resolve();
    };
    const step = async (n: number) => {
      for (let i = 0; i < n; i++) {
        s.update(0.05);
        await flush();
      }
    };
    await step(5);
    expect(s.getUI().prompt).toBe(false);
    // finish the invitation dialog
    for (let i = 0; i < 400 && (s.isInDialog || i < 30); i++) {
      s.pointerDown(0, 0);
      await step(2);
    }
    expect(s.isInDialog).toBe(false);
    s.p = { x: 0, y: -ESTIMATED.overworld.distanceToInput + 0.2 };
    await step(1);
    expect(s.getUI().prompt).toBe(true);
    s.keyDown(" ", "Space", false);
    await step(1);
    expect(s.getUI().prompt).toBe(false);
    for (let i = 0; i < 400 && !onStartChess.mock.calls.length; i++) {
      s.pointerDown(0, 0);
      await step(2);
    }
    expect(onStartChess).toHaveBeenCalledWith(false);
    s.dispose();
  });
});

describe("SpeedChessManager", () => {
  it("hands the turn to Black once White's time bank and increment run out", async () => {
    localStorage.setItem("kotb.settings.v1", JSON.stringify({ speedChess: 60 }));
    resetSettingsCacheForTests();
    const scene = new ChessScene({ onRetry: vi.fn(), onEscape: vi.fn(), onWhiteWin: vi.fn() });
    expect(scene.hourglass?.time).toBe(60);
    scene.lastMovedPieceByWhite = scene.board.white[0]!;
    // increment grace: no time is spent yet
    scene.update(ESTIMATED.speedChess.incrementTime - 0.1);
    expect(scene.hourglass?.elapsed).toBe(0);
    for (let i = 0; i < 70 * 10; i++) {
      scene.update(0.1);
      if (scene.board.currentTurnColor === "Black") break;
    }
    expect(scene.hourglass!.elapsed).toBeGreaterThanOrEqual(60);
    expect(scene.board.currentTurnColor).toBe("Black");
    expect(scene.blackWonTime).toBe(true);
    expect(scene.board.nextPlayerWonCheat).toBe(true);
    scene.dispose();
  });
});

describe("Duck ending", () => {
  it("keeps the troll on the duck after the cutscene and through the player's transformation", async () => {
    const s = new OverworldScene({ act: "ACT_III", ending: "DuckEnding" }, { onStartChess: vi.fn(), onCredits: vi.fn() });
    const flush = async () => {
      for (let k = 0; k < 5; k++) await Promise.resolve();
    };
    const onDuck = () => {
      const t = s.trollWorld();
      return Math.abs(t.x - (s.duck.x + s.duck.holderX)) < 1e-6;
    };
    // play the duck-bound dialog and the camera pan back to the player
    for (let i = 0; i < 2000 && (s.introCutscene || i < 60); i++) {
      if (s.isInDialog) s.pointerDown(0, 0);
      s.update(0.05);
      await flush();
    }
    expect(s.introCutscene).toBe(false);
    expect(s.trollOnDuck).toBe(true);
    expect(onDuck()).toBe(true);
    // the duck keeps swimming and the troll moves with it
    const before = s.trollWorld().x;
    for (let i = 0; i < 20; i++) s.update(0.05);
    expect(s.trollWorld().x).toBeLessThan(before);
    expect(onDuck()).toBe(true);
    // walk off the bridge: the player turns into a troll, the old one stays on the duck
    s.p = { x: 0, y: 21 };
    for (let i = 0; i < 400 && !s.newTroll; i++) {
      s.update(0.05);
      await flush();
    }
    expect(s.newTroll).not.toBeNull();
    expect(s.trollOnDuck).toBe(true);
    expect(onDuck()).toBe(true);
    s.dispose();
  });
});
