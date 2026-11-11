// View for the Overworld scene (OverworldScene): letterboxed 16:9 canvas plus the title card,
// troll dialogue, ACT display and the ACT II "[ SPACE ] CHALLENGE" prompt.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { OVERWORLD_STRINGS, type V2 } from "../data";
import { stopLoop, unlockAudio } from "../audio";
import type { Ending, OverworldState } from "../save";
import { OverworldScene, type OverworldUI } from "../runtime/OverworldScene";
import { DialogBox } from "./DialogBox";
import { Stage } from "./Stage";

const EMPTY: OverworldUI = { card: null, dialog: null, prompt: false, act: null };
const noop = () => () => {};

export interface BridgeWalkProps {
  act: OverworldState;
  ending?: Ending | undefined;
  trollCapture?: V2 | undefined;
  /** IntroCutscene / StartChessMatch finished on the bridge */
  onStartChess: (withStartTopic: boolean) => void;
  /** Credits() title cards finished (load the Credits scene) */
  onCredits?: () => void;
}

export function BridgeWalk({
  act,
  ending,
  trollCapture,
  onStartChess,
  onCredits,
}: BridgeWalkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const promptRef = useRef<HTMLButtonElement>(null);
  const cb = useRef({ onStartChess, onCredits });
  cb.current = { onStartChess, onCredits };
  const [scene, setScene] = useState<OverworldScene | null>(null);

  useEffect(() => {
    const s = new OverworldScene(
      { act, ending, trollCapture },
      {
        onStartChess: (w) => cb.current.onStartChess(w),
        onCredits: () => cb.current.onCredits?.(),
      },
    );
    setScene(s);
    return () => {
      s.dispose();
      stopLoop("overworld_bridge_ambience");
    };
    // the scene is created once per mount, like a Unity scene load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ui = useSyncExternalStore(
    scene?.subscribe ?? noop,
    scene?.getUI ?? (() => EMPTY),
    () => EMPTY,
  );

  useEffect(() => {
    if (!scene) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      scene.update(dt);
      const c = canvasRef.current;
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(c.clientWidth * dpr);
        const h = Math.round(c.clientHeight * dpr);
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        const ctx = c.getContext("2d");
        if (ctx && w > 0 && h > 0) scene.render(ctx, w, h);
      }
      const pr = promptRef.current;
      if (pr) {
        pr.style.left = `${scene.promptUI.x}px`;
        pr.style.top = `${scene.promptUI.y}px`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") e.preventDefault();
      scene.keyDown(e.key, e.code, e.repeat);
    };
    const up = (e: KeyboardEvent) => scene.keyUp(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [scene]);

  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    return { x: (e.clientX - r.left) * d, y: (e.clientY - r.top) * d };
  };

  const card = ui.card;
  return (
    <Stage
      world={
        <canvas
          ref={canvasRef}
          aria-label="Bridge over the canal"
          className="absolute inset-0 h-full w-full touch-none [image-rendering:pixelated]"
          onPointerDown={(e) => {
            unlockAudio();
            if (!scene) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = local(e);
            scene.pointerDown(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!scene) return;
            const p = local(e);
            scene.pointerMove(p.x, p.y);
            if (scene.isOverInteractable(p.x, p.y)) e.currentTarget.dataset["cursor"] = "drag";
            else delete e.currentTarget.dataset["cursor"];
          }}
          onPointerUp={() => scene?.pointerUp()}
          onPointerCancel={() => scene?.pointerUp()}
          onLostPointerCapture={() => scene?.pointerUp()}
        />
      }
    >
      {ui.prompt && !ui.dialog && (
        <button
          ref={promptRef}
          type="button"
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-kotb-outline px-6 py-2 font-kotb text-[40px] leading-none text-kotb-white hover:text-kotb-danger"
          style={{ left: scene?.promptUI.x ?? 960, top: scene?.promptUI.y ?? 400 }}
          onClick={() => {
            unlockAudio();
            scene?.startChessMatchButton();
          }}
        >
          {OVERWORLD_STRINGS.TitleChallengeTrollKey}
        </button>
      )}
      {ui.act && (
        <p className="animate-kotb-fade absolute left-0 right-0 top-[90px] text-center font-kotb text-[64px] text-kotb-white [text-shadow:0_4px_0_var(--kotb-outline)]">
          {ui.act}
        </p>
      )}
      {ui.dialog && (
        <DialogBox
          text={ui.dialog.text}
          visible={ui.dialog.visible}
          noAnimation={ui.dialog.noAnimation}
        />
      )}
      {card && (
        <div
          className={`pointer-events-auto absolute -inset-y-[200px] inset-x-bleed z-50 flex items-center justify-center px-[160px] text-center font-kotb text-[72px] leading-tight ${
            card.inverted ? "bg-kotb-white text-kotb-outline" : "bg-kotb-outline text-kotb-white"
          }`}
          data-testid="title-card"
          onPointerDown={() => {
            if (scene) scene.mouseClicked = true;
          }}
        >
          {card.showText && <span className="whitespace-pre-line">{card.text}</span>}
        </div>
      )}
    </Stage>
  );
}
