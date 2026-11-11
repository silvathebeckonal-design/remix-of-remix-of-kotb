import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOPICS, TOPIC_LISTS } from "../data";
import { useStandaloneDialog } from "./useStandaloneDialog";

vi.mock("../audio", () => ({ playSound: vi.fn() }));

describe("bridge introduction dialogue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("requires a separate advance for every original line and completes only after the last", async () => {
    const done = vi.fn();
    const lines = TOPICS[TOPIC_LISTS.introductionTopic] ?? [];
    expect(lines.length).toBeGreaterThan(0);
    const { result } = renderHook(() => useStandaloneDialog(TOPIC_LISTS.introductionTopic, done, 1));
    await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
    for (const line of lines) {
      await act(async () => { await vi.advanceTimersByTimeAsync(line.text.length * line.speed * 1000 + 100); });
      expect(result.current.dialog?.text).toBe(line.text);
      expect(result.current.dialog?.visible).toBe(line.text.length);
      expect(done).not.toHaveBeenCalled();
      await act(async () => {
        result.current.advance();
        await vi.advanceTimersByTimeAsync(16);
      });
    }
    expect(done).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toBeNull();
  });

  it("taps during the original unskippable riddle cannot jump to the next line", async () => {
    const done = vi.fn();
    const { result } = renderHook(() => useStandaloneDialog(TOPIC_LISTS.introductionTopic, done, 1));
    await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
    const first = (TOPICS[TOPIC_LISTS.introductionTopic] ?? [])[0];
    expect(first?.canSkip).toBe(false);
    await act(async () => {
      result.current.advance();
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.dialog?.text).toBe(first?.text);
    expect(result.current.dialog?.visible).toBe(first?.text.length);
    expect(done).not.toHaveBeenCalled();
  });
});