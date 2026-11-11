import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("../audio", () => ({ playSound: vi.fn(), unlockAudio: vi.fn(), preloadSounds: vi.fn(), stopLoop: vi.fn() }));
import { OVERHANG, Overlays } from "./ChessView";
import type { UIState } from "../runtime/ChessScene";

const base = {
  dialog: null, guessText: "[ SPACE ] ACCUSE", guessColor: "White", guessHolderY: -432, guessTextHidden: false,
  guessBar: 0, confirmVisible: false, retryVisible: false, retryBar: 0, attempting: false, inspecting: false, canAccuse: true,
} as unknown as UIState;

const states: [string, Partial<UIState>][] = [
  ["accuse", { guessBar: 1 }],
  ["confirm", { guessBar: 1, confirmVisible: true }],
  ["retry", { retryVisible: true, retryBar: 1 }],
];

for (const [name, s] of states) {
  it(`${name} bar opens instantly with one shake, reaches past both screen edges, centred, no outline`, () => {
    const { container } = render(<Overlays ui={{ ...base, ...s }} scene={null} />);
    const bars = [...container.querySelectorAll<HTMLElement>('[data-testid="kotb-bar"]')].filter((b) =>
      b.className.includes("animate-kotb-shake-once"),
    );
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(OVERHANG).toBe("calc(var(--stage-bleed, 0px) * -1 - 960px)");
      expect(bar.style.width).toBe("");
      expect(bar.className).toContain("items-center");
      expect(bar.className).toContain("justify-center");
      expect(bar.className).not.toMatch(/transition/);
      for (const b of bar.querySelectorAll("button")) {
        expect(b.className).toContain("outline-none");
        expect(b.className).toContain("focus-visible:outline-none");
        expect(b.querySelector("span")?.getAttribute("style") ?? "").not.toMatch(/shadow/);
      }
    }
  });
}
