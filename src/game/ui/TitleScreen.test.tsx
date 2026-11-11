import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../audio", () => ({
  playSound: vi.fn(),
  stopLoop: vi.fn(),
  unlockAudio: vi.fn(),
  preloadSounds: vi.fn(),
}));

import { TitleScreen } from "./TitleScreen";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.kotbQuit;
});

const menuLabels = () =>
  Array.from(screen.getByRole("navigation", { name: "Main menu" }).querySelectorAll("button")).map(
    (b) => b.querySelector("[aria-label]")?.getAttribute("aria-label"),
  );

it("shows START, EXTRAS, OPTIONS, QUIT on the main menu, and QUIT asks the wrapper to close the game", async () => {
  const quit = vi.fn();
  window.kotbQuit = quit;
  render(<TitleScreen onChoose={vi.fn()} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(menuLabels()).toEqual(["START", "EXTRAS", "OPTIONS", "QUIT"]);
  fireEvent.click(screen.getByLabelText("QUIT").closest("button")!);
  expect(quit).toHaveBeenCalledTimes(1);
});

it("keeps CREDITS reachable inside EXTRAS", async () => {
  render(<TitleScreen onChoose={vi.fn()} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  fireEvent.click(screen.getByLabelText("EXTRAS").closest("button")!);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(menuLabels()).toEqual(["LOST PAGES", "ACHIEVEMENTS", "CREDITS", "BACK"]);
});
