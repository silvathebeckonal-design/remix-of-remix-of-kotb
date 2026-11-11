// Pieces of the original Menu scene: pixel sprites, the floating/destructible logo (LogoDestruction
// + SineMovement), WaveText glyph bobbing and GuessButtonBar-style menu items.
import { useEffect, useRef, useState, type ReactNode } from "react";
import logo from "@/assets/game/Logo32.png.asset.json";
import { evaluateCurve, type CurveKey } from "./animationCurve";
import { playSound, unlockAudio } from "./sound";

/** Menu.unity camera: orthographic size 7 -> pixels per world unit on the 1080p canvas. */
export const U = 540 / 7;
const LOGO_SINE = { amp: 0.075, freq: 1 };
const DESTRUCTION_THRESHOLD = 10;
const LOGO_FALL: CurveKey[] = [
  { time: 0, value: 0, inTangent: 0, outTangent: 0 },
  { time: 1, value: 1, inTangent: 2, outTangent: 2 },
];
export const BAR_SECONDS = 0.25;
export const MENU_FONT_PX = 46;
export const MENU_TRACKING_PX = 3;

/**
 * Nine-slice frame outline: stepped pixel corners (2 x 8px steps) instead of a plain rectangle,
 * so the same shape tiles over any button size without stretching the corners.
 */
const STEP = 8;
const S2 = STEP * 2;
const px = (v: number) => `${v}px`;
const inner = (v: number) => `calc(100% - ${v}px)`;
export const PIXEL_FRAME_CLIP = `polygon(${[
  `${px(S2)} 0`,
  `${inner(S2)} 0`,
  `${inner(S2)} ${px(STEP)}`,
  `${inner(STEP)} ${px(STEP)}`,
  `${inner(STEP)} ${px(S2)}`,
  `100% ${px(S2)}`,
  `100% ${inner(S2)}`,
  `${inner(STEP)} ${inner(S2)}`,
  `${inner(STEP)} ${inner(STEP)}`,
  `${inner(S2)} ${inner(STEP)}`,
  `${inner(S2)} 100%`,
  `${px(S2)} 100%`,
  `${px(S2)} ${inner(STEP)}`,
  `${px(STEP)} ${inner(STEP)}`,
  `${px(STEP)} ${inner(S2)}`,
  `0 ${inner(S2)}`,
  `0 ${px(S2)}`,
  `${px(STEP)} ${px(S2)}`,
  `${px(STEP)} ${px(STEP)}`,
  `${px(S2)} ${px(STEP)}`,
].join(", ")})`;

/** A 32-pixels-per-unit game sprite centred horizontally at world height y. */
export function Sprite({ src, w, h, y, z }: { src: string; w: number; h: number; y: number; z: number }) {
  const W = (w / 32) * U;
  const H = (h / 32) * U;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      className="pointer-events-none absolute [image-rendering:pixelated]"
      style={{ width: W, height: H, left: 960 - W / 2, top: 540 - y * U - H / 2, zIndex: z }}
    />
  );
}

export function Logo() {
  const ref = useRef<HTMLButtonElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const st = useRef({ count: 0, shakeTime: 0.1, shakeAmount: 0.05, rot: 0, y: 3.5, busy: false });
  const [, force] = useState(0);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const el = floatRef.current;
      if (el) {
        const y = Math.sin(((now - t0) / 1000) * LOGO_SINE.freq) * LOGO_SINE.amp;
        el.style.transform = `translateY(${-y * U}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const W = (312 / 32) * U;
  const H = (63 / 32) * U;

  const shake = (dur: number, mag: number) => {
    const el = ref.current;
    if (!el) return;
    const start = performance.now();
    const tick = (now: number) => {
      if ((now - start) / 1000 >= dur) {
        el.style.translate = "0px 0px";
        return;
      }
      el.style.translate = `${(Math.random() * 2 - 1) * mag * U}px ${(Math.random() * 2 - 1) * mag * U}px`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const click = async () => {
    const s = st.current;
    if (s.busy || s.count >= DESTRUCTION_THRESHOLD) return;
    unlockAudio();
    s.busy = true;
    shake(s.shakeTime, s.shakeAmount);
    playSound("chess_piece_capture");
    s.rot += Math.random() * 6 - 3;
    s.y -= 0.05;
    s.count++;
    s.shakeTime += 0.025;
    s.shakeAmount += 0.035;
    force((n) => n + 1);
    if (s.count >= DESTRUCTION_THRESHOLD) {
      const keys = LOGO_FALL.map((k) => ({ ...k }));
      keys[0]!.value = s.y;
      keys[1]!.value = s.y - 15;
      const t0 = performance.now();
      await new Promise<void>((done) => {
        const step = (now: number) => {
          const t = (now - t0) / 1000;
          if (t >= 1) return done();
          s.y = evaluateCurve(keys, t);
          force((n) => n + 1);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      playSound("titel_impact");
    }
    await new Promise((r) => setTimeout(r, 250));
    s.busy = false;
  };

  const s = st.current;
  return (
    <div ref={floatRef} className="pointer-events-none absolute inset-0 z-10">
      <button
        ref={ref}
        type="button"
        aria-label="King of the Bridge logo"
        onPointerDown={() => void click()}
        className="pointer-events-auto absolute p-0"
        style={{ width: W, height: H, left: 960 - W / 2, top: 540 - s.y * U - H / 2, rotate: `${-s.rot}deg` }}
      >
        <img src={logo.url} alt="" aria-hidden draggable={false} className="h-full w-full [image-rendering:pixelated]" />
      </button>
    </div>
  );
}

/** WaveText.cs: glyph y += sin(time * 2 + x * 0.03) * 2.5 (amp/freq/spread tunable per use). */
export function WaveText({
  text,
  amp = 2.5,
  freq = 2,
  spread = 0.03,
}: {
  text: string;
  amp?: number;
  freq?: number;
  spread?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const el = ref.current;
      if (el) {
        const t = now / 1000;
        for (const c of Array.from(el.children) as HTMLElement[]) {
          const x = c.offsetLeft + c.offsetWidth / 2;
          c.style.transform = `translateY(${Math.round(Math.sin(t * freq + x * spread) * amp)}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span ref={ref} aria-label={text} className="inline-flex">
      {Array.from(text).map((ch, i) => (
        <span key={i} aria-hidden className="inline-block whitespace-pre">
          {ch}
        </span>
      ))}
    </span>
  );
}

export interface MenuItem {
  label: string;
  run: () => void;
  /** Draw the row inside the stepped pixel frame instead of the plain bar. */
  framed?: boolean;
}

/**
 * The menu list: one item per 60px row, a bar that grows/shrinks vertically on layer changes,
 * "> LABEL <" in Danger colour on the selected item, keyboard arrows + Enter like MenuManager.
 */
export function MenuList({
  items,
  open,
  top,
  label,
}: {
  items: MenuItem[];
  open: boolean;
  top: number;
  label: string;
}) {
  const [sel, setSel] = useState(-1);
  const lastSound = useRef(new Map<number, number>());
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => setSel(-1), [items.length, items[0]?.label]);

  const hover = (i: number) => {
    if (!openRef.current) return;
    const now = performance.now();
    if (now - (lastSound.current.get(i) ?? -Infinity) < 250) return;
    lastSound.current.set(i, now);
    playSound("chess_piece_grab");
  };
  const activate = (i: number) => {
    if (!openRef.current) return;
    unlockAudio();
    playSound("chess_piece_drop");
    lastSound.current.set(i, performance.now());
    items[i]?.run();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!openRef.current || items.length === 0) return;
      const move = (d: 1 | -1) => {
        const next = sel < 0 ? (d === 1 ? 0 : items.length - 1) : (sel + d + items.length) % items.length;
        setSel(next);
        hover(next);
      };
      if (e.key === "ArrowDown" || e.key === "s") move(1);
      else if (e.key === "ArrowUp" || e.key === "w") move(-1);
      else if ((e.key === "Enter" || e.code === "Space") && sel >= 0) {
        e.preventDefault();
        activate(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <nav aria-label={label} className="absolute left-0 right-0 z-30" style={{ top }}>
      {items.map((it, i) => (
        <MenuRow
          key={`${it.label}-${i}`}
          index={i}
          text={sel === i ? `> ${it.label} <` : it.label}
          selected={sel === i}
          open={open}
          framed={it.framed ?? false}
          onEnter={(touch) => {
            setSel(i);
            if (!touch) hover(i);
          }}
          onLeave={() => setSel((s) => (s === i ? -1 : s))}
          onClick={() => activate(i)}
        />
      ))}
    </nav>
  );
}

function MenuRow({
  index,
  text,
  selected,
  open,
  framed,
  onEnter,
  onLeave,
  onClick,
}: {
  index: number;
  text: string;
  selected: boolean;
  open: boolean;
  framed?: boolean;
  onEnter: (touch: boolean) => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={open ? 0 : -1}
      onPointerEnter={(e) => onEnter(e.pointerType === "touch")}
      onPointerLeave={onLeave}
      onFocus={() => onEnter(true)}
      onClick={onClick}
      className={`kotb-clickable absolute left-1/2 flex w-max items-center justify-center whitespace-nowrap px-8 font-kotb leading-none outline-none ${
        selected ? "text-kotb-danger" : "text-kotb-white"
      }`}
      style={{
        top: index * 60 + (framed ? -4 : 4),
        height: framed ? 68 : 52,
        minWidth: 560,
        transform: "translateX(-50%)",
        fontSize: MENU_FONT_PX,
        letterSpacing: MENU_TRACKING_PX,
        paddingLeft: 32 + MENU_TRACKING_PX,
      }}
    >
      <span className="relative" style={{ opacity: open ? 1 : 0 }}>
        <WaveText text={text} />
      </span>
    </button>
  );
}

/** Text block shown in the menu area, revealed with the same bar timing as the items. */
export function MenuBlock({ open, top, children }: { open: boolean; top: number; children: ReactNode }) {
  return (
    <div
      className="absolute left-0 right-0 z-30 flex flex-col items-center font-kotb text-kotb-white"
      style={{
        top,
        visibility: open ? "visible" : "hidden",
      }}
    >
      {children}
    </div>
  );
}
