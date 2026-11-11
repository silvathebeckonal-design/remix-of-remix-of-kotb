import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CHESS_STRINGS } from "../data";
import { playSound, unlockAudio } from "../audio";
import { linkPosition } from "../rulebook";
import { at } from "../rng";
import { ChessScene, type SceneCallbacks, type UIState } from "../runtime/ChessScene";
import { BOOK_BUTTONS, PAGE_Y, makeView, render, screenToWorld } from "../runtime/render";
import { DialogBox } from "./DialogBox";
import { Stage } from "./Stage";

const EMPTY_UI: UIState = {
  dialog: null,
  guessText: CHESS_STRINGS.AccusePromptKey,
  guessColor: "White",
  guessHolderY: -432,
  guessTextHidden: false,
  guessBar: 0,
  confirmVisible: false,
  retryVisible: false,
  retryBar: 0,
  attempting: false,
  inspecting: false,
  canAccuse: true,
};
const noop = () => () => {};
/** Prompt text as measured on the original 1080p chess scene: same cap height as 45px Alagard but wider
 * glyphs with a dark outline, and the cap line ~8px higher than CSS centering puts it. */
const PROMPT_TRACKING_PX = 2;
const PROMPT_STRETCH_X = 1.15;

function PromptLabel({ children }: { children: string }) {
  return (
    <span
      className="inline-block"
      style={{
        transform: `scaleX(${PROMPT_STRETCH_X})`,
        letterSpacing: PROMPT_TRACKING_PX,
        paddingLeft: PROMPT_TRACKING_PX,
      }}
    >
      {children}
    </span>
  );
}

type Hit =
  | { kind: "close" | "toc" | "prev" | "next" | "book" }
  | { kind: "page"; side: "left" | "right" }
  | { kind: "link"; index: number }
  | { kind: "piece" }
  | null;

function hitTest(scene: ChessScene, wx: number, wy: number): Hit {
  const bx = scene.bookX;
  const near = (dx: number, y: number) =>
    Math.abs(wx - (bx + dx)) <= 0.45 && Math.abs(wy - y) <= 0.45;
  if (scene.isInspectingBook && near(BOOK_BUTTONS.close.dx, BOOK_BUTTONS.close.y))
    return { kind: "close" };
  if (near(BOOK_BUTTONS.toc.dx, BOOK_BUTTONS.toc.y)) return { kind: "toc" };
  if (near(BOOK_BUTTONS.prev.dx, BOOK_BUTTONS.prev.y)) return { kind: "prev" };
  if (near(BOOK_BUTTONS.next.dx, BOOK_BUTTONS.next.y)) return { kind: "next" };
  const screen = at(scene.screens, scene.currentScreen);
  if (scene.isInspectingBook && screen.isTableOfContents && !scene.isFlipping) {
    for (let i = 0; i < screen.links.length; i++) {
      const lp = linkPosition(at(screen.links, i));
      if (Math.abs(wx - (bx + lp.x)) <= 2.5 && Math.abs(wy - lp.y) <= 0.5)
        return { kind: "link", index: i };
    }
  }
  if (Math.abs(wx - bx) <= 4.9 && wy >= PAGE_Y - 4.9 && wy <= PAGE_Y + 4.9) {
    if (!scene.isInspectingBook) return { kind: "book" };
    return { kind: "page", side: wx < bx ? "left" : "right" };
  }
  if (scene.pieceAt({ x: wx, y: wy })) return { kind: "piece" };
  return null;
}

export function ChessView(props: SceneCallbacks) {
  const cbRef = useRef(props);
  cbRef.current = props;
  const [scene, setScene] = useState<ChessScene | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const s = new ChessScene({
      onRetry: () => cbRef.current.onRetry(),
      onEscape: () => cbRef.current.onEscape(),
      onWhiteWin: (e, pos) => cbRef.current.onWhiteWin(e, pos),
      onDuckFade: () => cbRef.current.onDuckFade?.(),
    });
    setScene(s);
    // dev-only handle for automated browser checks
    if (import.meta.env.DEV) (window as unknown as { __kotbChess?: ChessScene }).__kotbChess = s;
    return () => s.dispose();
  }, []);

  const ui = useSyncExternalStore(
    scene?.subscribe ?? noop,
    scene?.getUI ?? (() => EMPTY_UI),
    () => EMPTY_UI,
  );

  // main loop
  useEffect(() => {
    if (!scene) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      scene.update(dt);
      const c = canvasRef.current;
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        const w = c.clientWidth;
        const h = c.clientHeight;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
          c.width = Math.round(w * dpr);
          c.height = Math.round(h * dpr);
        }
        if (h > 0) scene.viewAspect = w / h;
        const ctx = c.getContext("2d")!;
        render(ctx, scene, makeView(scene, c.width, c.height));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") e.preventDefault();
      if (e.key === "Escape" && scene.isInspectingBook) scene.toggleBook();
      else scene.keyDown(e.code === "Space" ? " " : e.key);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [scene]);

  const toWorld = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    const v = makeView(scene!, r.width, r.height);
    v.camX = scene!.camX;
    v.camY = 0;
    return screenToWorld(v, e.clientX - r.left, e.clientY - r.top);
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!scene) return;
    unlockAudio();
    e.currentTarget.setPointerCapture(e.pointerId);
    const w = toWorld(e);
    scene.tapRings.push({ x: w.x, y: w.y, start: scene.time });
    if (scene.pointerDownAny()) return;
    const duckOnTop = scene.duck.layer !== "Background";
    if (duckOnTop && scene.duck.pointerDown(w)) return;
    const hit = hitTest(scene, w.x, w.y);
    if (!hit) {
      if (!duckOnTop && scene.duck.pointerDown(w)) return;
      scene.lilies.tap(w.x, w.y, scene.time);
      return;
    }
    switch (hit.kind) {
      case "close":
        scene.toggleBook();
        break;
      case "toc":
        scene.returnToFirstPage();
        break;
      case "prev":
        scene.switchScreen(-1);
        break;
      case "next":
        scene.switchScreen(1);
        break;
      case "book":
        scene.toggleBook();
        break;
      case "link":
        scene.clickLink(hit.index);
        break;
      case "page":
        scene.clickPage(hit.side);
        break;
      case "piece": {
        const p = scene.pieceAt(w);
        if (p) scene.pieceMouseDown(p, w);
        break;
      }
    }
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!scene) return;
    const w = toWorld(e);
    scene.pointerMove(w);
    scene.duck.pointerMove(w);
    if (scene.dragPiece || scene.duck.state === "HeldByPlayer") {
      e.currentTarget.dataset["cursor"] = "drag";
      return;
    }
    const hit = hitTest(scene, w.x, w.y);
    const link = hit?.kind === "link" ? hit.index : -1;
    if (link !== scene.hoverLink && link >= 0) playSound("chess_rulebook_link_hover");
    scene.hoverLink = link;
    scene.hoverPage = hit?.kind === "page" ? hit.side : null;
    if (hit?.kind === "book") scene.hoverBook();
    const over = !!hit || (scene.duck.state !== "Inactive" && scene.duck.hit(w));
    if (over) e.currentTarget.dataset["cursor"] = "drag";
    else delete e.currentTarget.dataset["cursor"];
  };

  const onUp = () => {
    if (!scene) return;
    scene.duck.pointerUp();
    scene.pointerUp();
  };

  return (
    <Stage
      world={
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none [image-rendering:pixelated]"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Chess match on the bridge"
        />
      }
    >
      <Overlays ui={ui} scene={scene} />
    </Stage>
  );
}

/** Bars reach far past both screen edges so neither the shake nor a wide screen shows their ends. */
export const OVERHANG = "calc(var(--stage-bleed, 0px) * -1 - 960px)";
const BAR_H = 64;
const BTN =
  "pointer-events-auto whitespace-nowrap font-kotb text-[45px] leading-none outline-none ring-0 focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]";

/** Full-bleed dark bar: appears instantly with a single shake, contents centred both ways. */
function Bar({ y, show, children }: { y: number; show: boolean; children: React.ReactNode }) {
  return (
    <div
      data-testid="kotb-bar"
      className={`absolute flex items-center justify-center ${show ? "animate-kotb-shake-once" : ""}`}
      style={{ left: OVERHANG, right: OVERHANG, top: 540 - y - BAR_H / 2, height: BAR_H }}
    >
      {show && <div className="absolute inset-0 bg-kotb-outline" />}
      <div className="relative flex items-center justify-center gap-[200px]">{children}</div>
    </div>
  );
}

export function Overlays({ ui, scene }: { ui: UIState; scene: ChessScene | null }) {
  const color = ui.guessColor === "Danger" ? "text-kotb-danger" : "text-kotb-white";
  const barOn = ui.guessBar > 0;
  return (
    <>
      {!ui.retryVisible && (
        <Bar key={`guess-${barOn}`} y={ui.guessHolderY} show={barOn}>
          <button
            type="button"
            className={`${BTN} px-6 ${color} ${ui.attempting ? "animate-kotb-jitter" : ""} ${
              ui.guessTextHidden ? "opacity-0" : ""
            }`}
            onClick={() => {
              unlockAudio();
              scene?.onCheatGuessButton();
            }}
          >
            <PromptLabel>{ui.guessText}</PromptLabel>
          </button>
        </Bar>
      )}
      {ui.confirmVisible && (
        <Bar key="confirm" y={ui.guessHolderY - 75} show>
          <button type="button" className={`${BTN} text-kotb-danger hover:text-kotb-white`} onClick={() => scene?.onConfirm()}>
            <PromptLabel>{CHESS_STRINGS.ConfirmKey}</PromptLabel>
          </button>
          <button type="button" className={`${BTN} text-kotb-danger hover:text-kotb-white`} onClick={() => scene?.onCancel()}>
            <PromptLabel>{CHESS_STRINGS.CancelKey}</PromptLabel>
          </button>
        </Bar>
      )}
      {ui.retryVisible && (
        <Bar key="retry" y={-432} show>
          <button type="button" className={`${BTN} text-kotb-white hover:text-kotb-danger`} onClick={() => scene?.onRetry()}>
            <PromptLabel>{CHESS_STRINGS.RetryPromptKey}</PromptLabel>
          </button>
          <button type="button" className={`${BTN} text-kotb-white hover:text-kotb-danger`} onClick={() => scene?.onEscape()}>
            <PromptLabel>{CHESS_STRINGS.EscapePromptKey}</PromptLabel>
          </button>
        </Bar>
      )}
      {ui.dialog && <DialogBox {...ui.dialog} />}
    </>
  );
}
