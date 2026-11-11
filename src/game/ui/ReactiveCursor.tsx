// Port of ReactiveCursor: software cursor (cursor_default / cursor_dragable, hotspot top-left).
// Touch: appears with a pop-in where the finger lands, follows the drag, and vanishes as soon as the finger lifts.
// Switches to the dragable cursor over interactables (buttons or canvases flagging data-cursor="drag").
import { useEffect, useRef, useState } from "react";
import { tex } from "../assets";

const CLICKABLE = 'button, a, [role=button], [data-clickable], [data-cursor="drag"]';

/** 32px on a 1080p-like screen, scaled down on small screens (min 18px). */
const cursorScale = () =>
  Math.max(18 / 32, Math.min(1, Math.min(window.innerWidth / 1920, window.innerHeight / 1080) * 1.4));

export function ReactiveCursor() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [clickable, setClickable] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    setScale(cursorScale());
    const resize = () => setScale(cursorScale());
    const place = (e: PointerEvent) => {
      const el = ref.current;
      if (el) el.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      const t = document.elementFromPoint(e.clientX, e.clientY);
      setClickable(!!t?.closest?.(CLICKABLE));
    };
    const down = (e: PointerEvent) => {
      // touch pointers are implicitly captured by the first target; release so dragging over
      // buttons fires pointerenter (hover). Canvases re-capture in their own handlers.
      if (e.pointerType !== "mouse" && e.target instanceof Element && e.target.hasPointerCapture?.(e.pointerId))
        e.target.releasePointerCapture(e.pointerId);
      place(e);
      setShown(true);
    };
    const move = (e: PointerEvent) => {
      place(e);
      if (e.pointerType === "mouse") setShown(true);
    };
    const up = (e: PointerEvent) => {
      place(e);
      if (e.pointerType !== "mouse") setShown(false);
    };
    const leave = () => setShown(false);
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", down, opts);
    window.addEventListener("pointermove", move, opts);
    window.addEventListener("pointerup", up, opts);
    window.addEventListener("pointercancel", up, opts);
    window.addEventListener("resize", resize);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointerdown", down, opts);
      window.removeEventListener("pointermove", move, opts);
      window.removeEventListener("pointerup", up, opts);
      window.removeEventListener("pointercancel", up, opts);
      window.removeEventListener("resize", resize);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);

  const w = 32 * scale;
  const h = (clickable ? 40 : 32) * scale;
  return (
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-[9999]" aria-hidden>
      <img
        src={tex(clickable ? "cursor_dragable" : "cursor_default")}
        alt=""
        data-testid="reactive-cursor"
        data-state={clickable ? "dragable" : "default"}
        data-shown={shown ? "1" : "0"}
        className="block origin-top-left [image-rendering:pixelated] transition-[opacity,transform] duration-150 ease-out"
        style={{ width: w, height: h, opacity: shown ? 1 : 0, transform: `scale(${shown ? 1 : 0.4})` }}
      />
    </div>
  );
}
