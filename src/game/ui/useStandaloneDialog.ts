import { useCallback, useEffect, useRef, useState } from "react";
import { TOPICS } from "../data";
import { playSound } from "../audio";

/** TrollDialogManager.PerformDialog for scenes outside the chess match (intro, rematch, outro). */
export function useStandaloneDialog(topic: string | null, onDone: () => void, startDelay = 0.75) {
  const [state, setState] = useState<{ text: string; visible: number } | null>(null);
  const clicked = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!topic) return;
    const lines = TOPICS[topic] ?? [];
    let cancelled = false;
    const sleep = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));
    const waitClick = () =>
      new Promise<void>((r) => {
        const tick = () => {
          if (cancelled) return;
          if (clicked.current) {
            clicked.current = false;
            r();
          } else setTimeout(tick, 16);
        };
        tick();
      });
    void (async () => {
      await sleep(0.25);
      playSound("troll_dialog_alert");
      await sleep(startDelay);
      clicked.current = false;
      for (const line of lines) {
        for (let i = 0; i < line.text.length; i++) {
          if (cancelled) return;
          setState({ text: line.text, visible: i + 1 });
          if (!/\s/.test(line.text.charAt(i))) {
            playSound("troll_dialog_voice");
            await sleep(line.speed);
          }
          if (clicked.current && line.canSkip) break;
        }
        if (cancelled) return;
        setState({ text: line.text, visible: line.text.length });
        clicked.current = false;
        await waitClick();
      }
      if (cancelled) return;
      setState(null);
      doneRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [topic, startDelay]);

  const advance = useCallback(() => {
    clicked.current = true;
  }, []);

  useEffect(() => {
    if (!topic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        clicked.current = true;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [topic]);

  return { dialog: state, advance };
}
