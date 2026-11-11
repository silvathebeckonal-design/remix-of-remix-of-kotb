import { getAchievements } from "../achievements";
// Port of the "Menu" scene: MenuManager (layered menu items with GuessButtonBar grow/shrink, intro/outro
// black screen), SettingsManager options and LogoDestruction on Logo32.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ESTIMATED, MENU_STRINGS } from "../data";
import { tex } from "../assets";
import raw from "../data/gamedata.json";
import { evaluateCurve } from "../animationCurve";
import { playSound, stopLoop, unlockAudio } from "../audio";
import { applyFullscreenSetting } from "../fullscreen";
import { openExternal, quitGame } from "../quit";
import { allAchievementsUnlocked } from "../achievements";
import { SOCIAL_LINKS } from "../links";
import {
  cycleSetting,
  getSettings,
  settingText,
  subscribeSettings,
  type SettingId,
} from "../settings";
import { Stage } from "./Stage";

export type TitleChoice = "start" | "credits" | "pages" | "achievements" | "wipe" | "resetRun";

type LayerId = "root" | "extras" | "options" | "game" | "wipe" | "video" | "audio" | "text";

/** Port-only label: the original EXTRAS layer had Steam achievements/leaderboard instead. */
const LOST_PAGES_LABEL = "LOST PAGES";
const ACHIEVEMENTS_LABEL = "ACHIEVEMENTS";
const RESET_RUN_LABEL = "RESET RUN";
/** Menu text as measured on the original 1080p menu: slightly smaller Alagard with a little spacing. */
const MENU_FONT_PX = 46;
const MENU_TRACKING_PX = 3;
type Item =
  | { kind: "action"; label: string; run: () => void }
  | { kind: "layer"; label: string; to: LayerId }
  | { kind: "setting"; id: SettingId }
  | { kind: "back" };

const M = ESTIMATED.menu;
const LOGO_FLOAT = raw.menuLogo;
const U = 540 / 7;
/** MenuItemSound: hover sound is skipped until 0.25s have passed since that item's last sound. */
const MENU_ITEM_SOUND_COOLDOWN = 0.25; // Menu.unity camera: orthoSize 7 -> px per unit on the 1080p canvas

export function TitleScreen({
  onChoose,
}: {
  onChoose: (c: TitleChoice) => void;
  hasProgress?: boolean;
}) {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const [black, setBlack] = useState(true);
  // Speedrun mode unlocks once the whole rulebook has been uncovered.
  const [speedrunUnlocked, setSpeedrunUnlocked] = useState(false);
  useEffect(() => setSpeedrunUnlocked(getAchievements().has("AllPages")), []);
  const [layer, setLayer] = useState<LayerId>("root");
  // GuessButtonBar localScale.y, shared by every item of the visible layer (they grow/shrink together).
  const [barScale, setBarScale] = useState(0);
  const barScaleRef = useRef(0);
  const barRaf = useRef(0);
  // -1 = nothing selected: the pointer left the item and no arrow key was pressed since.
  const [sel, setSel] = useState(-1);
  const lastInput = useRef<"pointer" | "keyboard">("pointer");
  // MenuItemSound.elapsedSeconds per item (timestamp of its last grab/drop sound).
  const lastItemSound = useRef(new Map<string, number>());
  const parents = useRef<LayerId[]>([]);
  const busy = useRef(true);
  const leaving = useRef(false);

  /** GuessButtonBar.GrowIncreaseBar / GrowDecreaseBar: localScale.y = curve.Evaluate(growSeconds). */
  const animateBars = (keys: typeof M.barGrowIncreaseCurve) => {
    cancelAnimationFrame(barRaf.current);
    const target = keys[keys.length - 1]!;
    const growing = target.value > (keys[0]?.value ?? 0);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.max(0, (now - t0) / 1000);
      const v = t >= target.time ? target.value : evaluateCurve(keys, t);
      barScaleRef.current = v;
      setBarScale(v);
      const done = growing ? v >= target.value : v <= target.value;
      if (!done) barRaf.current = requestAnimationFrame(step);
    };
    barRaf.current = requestAnimationFrame(step);
  };

  // MenuManager.GetAllMenuItemLayers -> TransitionToNewLayer(root): bars grow behind the black screen.
  useEffect(() => {
    const t = setTimeout(() => {
      busy.current = false;
      animateBars(M.barGrowIncreaseCurve);
    }, M.barGrowSeconds * 1000);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(barRaf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MenuManager.Intro
  useEffect(() => {
    const t = setTimeout(() => {
      setBlack(false);
      playSound("titel_impact");
      playSound("overworld_bridge_ambience");
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  const outro = (c: TitleChoice) => {
    if (leaving.current) return;
    leaving.current = true;
    playSound("titel_impact");
    setBlack(true);
    stopLoop("overworld_bridge_ambience");
    setTimeout(() => onChoose(c), 2000);
  };

  const layers: Record<LayerId, Item[]> = {
    root: [
      { kind: "action", label: MENU_STRINGS.MenuStartKey, run: () => outro("start") },
      { kind: "layer", label: MENU_STRINGS.MenuExtrasKey, to: "extras" },
      { kind: "layer", label: MENU_STRINGS.MenuOptionsKey, to: "options" },
      { kind: "action", label: MENU_STRINGS.MenuQuitKey, run: () => quitGame() },
    ],
    extras: [
      { kind: "action", label: LOST_PAGES_LABEL, run: () => onChoose("pages") },
      { kind: "action", label: ACHIEVEMENTS_LABEL, run: () => onChoose("achievements") },
      { kind: "action", label: MENU_STRINGS.MenuCreditsKey, run: () => outro("credits") },
      { kind: "back" },
    ],
    options: [
      { kind: "layer", label: MENU_STRINGS.MenuGameKey, to: "game" },
      { kind: "layer", label: MENU_STRINGS.MenuVideoKey, to: "video" },
      { kind: "layer", label: MENU_STRINGS.MenuAudioKey, to: "audio" },
      { kind: "layer", label: MENU_STRINGS.MenuTextKey, to: "text" },
      { kind: "back" },
    ],
    game: [
      { kind: "setting", id: "speedChess" },
      ...(speedrunUnlocked ? ([{ kind: "setting", id: "speedrun" }] as Item[]) : []),
      ...(speedrunUnlocked && settings.speedrun === 1
        ? ([{ kind: "action", label: RESET_RUN_LABEL, run: () => onChoose("resetRun") }] as Item[])
        : []),
      { kind: "setting", id: "screenshake" },
      { kind: "layer", label: MENU_STRINGS.MenuWipeSaveKey, to: "wipe" },
      { kind: "back" },
    ],
    wipe: [
      {
        kind: "action",
        label: MENU_STRINGS.MenuApplyKey,
        run: () => {
          onChoose("wipe");
          ascend();
        },
      },
      { kind: "back" },
    ],
    video: [{ kind: "setting", id: "fullscreen" }, { kind: "back" }],
    audio: [
      { kind: "setting", id: "master" },
      { kind: "setting", id: "effects" },
      { kind: "setting", id: "ambience" },
      { kind: "back" },
    ],
    text: [{ kind: "setting", id: "language" }, { kind: "back" }],
  };
  const items = layers[layer];

  /** MenuManager.TransitionToNewLayer: shrink bars, 0.25s, grow the new layer. */
  const transition = (to: LayerId) => {
    if (busy.current) return;
    busy.current = true;
    animateBars(M.barGrowDecreaseCurve);
    setTimeout(() => {
      setLayer(to);
      setSel(lastInput.current === "keyboard" ? 0 : -1);
      busy.current = false;
      animateBars(M.barGrowIncreaseCurve);
    }, M.barGrowSeconds * 1000);
  };
  const descend = (to: LayerId) => {
    parents.current.push(layer);
    transition(to);
  };
  function ascend() {
    // OnItemAscendLayer -> SettingsManager.ApplySettings
    applyFullscreenSetting();
    transition(parents.current.pop() ?? "root");
  }

  const label = (it: Item) =>
    it.kind === "setting"
      ? settingText(it.id, settings)
      : it.kind === "back"
        ? MENU_STRINGS.MenuBackKey
        : it.label;

  /** MenuItemSound.OnPointerEnter: grab sound unless disabled (old layer), shrunk (< 0.2) or within 0.25s. */
  const hoverSound = (key: string) => {
    if (busy.current || leaving.current || barScaleRef.current < 0.2) return;
    const now = performance.now();
    if (now - (lastItemSound.current.get(key) ?? -Infinity) < MENU_ITEM_SOUND_COOLDOWN * 1000) return;
    lastItemSound.current.set(key, now);
    playSound("chess_piece_grab");
  };

  const activate = (it: Item, key: string) => {
    // EventMenuItem/SettingMenuItem.OnClick ignore items whose localScale.y < 0.2
    if (busy.current || leaving.current || black || barScaleRef.current < 0.2) return;
    unlockAudio();
    // MenuItemSound.OnPointerClick
    playSound("chess_piece_drop");
    lastItemSound.current.set(key, performance.now());
    if (it.kind === "action") it.run();
    else if (it.kind === "layer") descend(it.to);
    else if (it.kind === "back") ascend();
    else cycleSetting(it.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const move = (d: 1 | -1) => {
        lastInput.current = "keyboard";
        const next = sel < 0 ? (d === 1 ? 0 : items.length - 1) : (sel + d + items.length) % items.length;
        setSel(next);
        hoverSound(`${layer}-${next}`);
      };
      if (e.key === "ArrowDown" || e.key === "s") move(1);
      else if (e.key === "ArrowUp" || e.key === "w") move(-1);
      else if (e.key === "Enter" || e.code === "Space") {
        e.preventDefault();
        const it = sel >= 0 ? items[sel] : undefined;
        if (it) activate(it, `${layer}-${sel}`);
      } else if (e.key === "Escape" && layer !== "root") ascend();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const sprite = (name: string, w: number, h: number, y: number, z: number) => (
    <img
      src={tex(name)}
      alt=""
      aria-hidden
      className="absolute [image-rendering:pixelated]"
      style={{
        width: (w / 32) * U,
        height: (h / 32) * U,
        left: 960 - ((w / 32) * U) / 2,
        top: 540 - y * U - ((h / 32) * U) / 2,
        zIndex: z,
      }}
    />
  );

  return (
    <Stage>
      <div className="absolute inset-y-0 inset-x-bleed bg-kotb-outline">
        <div className="absolute inset-y-0" style={{ left: "var(--stage-bleed, 0px)", width: 1920 }}>
        {sprite("banner", 400, 225, 2.28, 0)}
        <Logo />
        {sprite("bridge_overlay", 400, 225, 2.28, 20)}
        <span className="sr-only">King of the Bridge</span>
        <nav
          aria-label="Main menu"
          className="pointer-events-none absolute left-0 right-0 z-30 [&>button]:pointer-events-auto"
          style={{ top: 694 }}
        >
          {items.map((it, i) => {
            const key = `${layer}-${i}`;
            return (
              <button
                key={key}
                type="button"
                onPointerEnter={(e) => {
                  lastInput.current = "pointer";
                  setSel(i);
                  if (e.pointerType !== "touch") hoverSound(key);
                }}
                onPointerLeave={() => setSel((s) => (s === i ? -1 : s))}
                onClick={() => activate(it, key)}
                className={`absolute left-1/2 flex w-max items-center justify-center whitespace-nowrap px-8 font-kotb leading-none ${
                  sel === i ? "text-kotb-danger" : "text-kotb-white"
                }`}
                style={{
                  top: i * 60 + (60 - M.barHeight) / 2,
                  height: M.barHeight,
                  minWidth: M.barMinWidth,
                  transform: "translateX(-50%)",
                  fontSize: MENU_FONT_PX,
                  letterSpacing: MENU_TRACKING_PX,
                  // letter-spacing trails the last glyph; balance it so the text stays centered
                  paddingLeft: 32 + MENU_TRACKING_PX,
                }}
              >
                {/* GuessButtonBar: only the bar scales; the text stays crisp */}
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{ transform: `scaleY(${barScale})` }}
                />
                <span className="relative" style={{ opacity: barScale < 0.2 ? 0 : 1 }}>
                  <WaveText text={sel === i ? `> ${label(it)} <` : label(it)} />
                </span>
              </button>
            );
          })}
        </nav>
        <span
          className="absolute z-30 font-kotb text-[42px] leading-none text-kotb-black"
          style={{ left: 75, top: 1008, letterSpacing: 5 }}
        >
          v1.024
        </span>
        <SocialIcons />
        <Sparkles />
        </div>
        {black && <div className="absolute inset-0 z-50 bg-kotb-outline" />}
      </div>
    </Stage>
  );
}

/** LogoDestruction: each click shakes, tilts and nudges the logo; after the threshold it falls 15 units. */
function Logo() {
  const ref = useRef<HTMLButtonElement>(null);
  const st = useRef({
    count: 0,
    shakeTime: 0.1,
    shakeAmount: 0.05,
    rot: 0,
    y: 3.5,
    destructing: false,
  });
  const [, force] = useState(0);
  const floatRef = useRef<HTMLDivElement>(null);
  // SineMovement on the logo Holder: localPosition.y = sin(time * freq) * amp
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const el = floatRef.current;
      if (el) {
        const y = Math.sin(((now - t0) / 1000) * LOGO_FLOAT.sineFreq) * LOGO_FLOAT.sineAmp;
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
      const k = (now - start) / 1000;
      if (k >= dur) {
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
    if (s.destructing) return;
    unlockAudio();
    s.destructing = true;
    shake(s.shakeTime, s.shakeAmount);
    playSound("chess_piece_capture");
    s.rot += Math.random() * 6 - 3;
    s.y -= 0.05;
    s.count++;
    s.shakeTime += 0.025;
    s.shakeAmount += 0.035;
    force((n) => n + 1);
    if (s.count >= M.destructionThreshold) {
      playSound("chess_piece_slip");
      const from = s.y;
      const keys = M.logoFallCurveY.map((k) => ({ ...k }));
      keys[0]!.value = from;
      keys[keys.length - 1]!.value = from - 15;
      const len = keys[keys.length - 1]!.time;
      const t0 = performance.now();
      await new Promise<void>((done) => {
        const step = (now: number) => {
          const el = (now - t0) / 1000;
          if (el >= len) {
            done();
            return;
          }
          s.y = evaluateCurve(keys, el);
          force((n) => n + 1);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      playSound("overworld_manhole_blast");
      playSound("titel_impact");
      await new Promise((r) => setTimeout(r, 1000));
    }
    await new Promise((r) => setTimeout(r, 250));
    s.destructing = false;
  };

  const s = st.current;
  return (
    <div ref={floatRef} className="pointer-events-none absolute inset-0 z-10">
    <button
      ref={ref}
      type="button"
      aria-label="King of the Bridge logo"
      onPointerDown={() => void click()}
      className="pointer-events-auto absolute z-10 p-0"
      style={{
        width: W,
        height: H,
        left: 960 - W / 2,
        top: 540 - s.y * U - H / 2,
        rotate: `${-s.rot}deg`,
      }}
    >
      <img
        src={tex("Logo32")}
        alt=""
        aria-hidden
        className="h-full w-full [image-rendering:pixelated]"
      />
    </button>
    </div>
  );
}

/** WaveText.cs: each glyph's y += sin(time * 2 + x * 0.03) * -2.5 (Unity y-up -> CSS +). */
function WaveText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const el = ref.current;
      if (el) {
        const t = now / 1000;
        for (const c of Array.from(el.children) as HTMLElement[]) {
          const x = c.offsetLeft + c.offsetWidth / 2;
          c.style.transform = `translateY(${Math.round(Math.sin(t * 2 + x * 0.03) * 2.5)}px)`;
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

/** Discord / X / YouTube buttons, bottom right, drawn in the palette. */
function SocialIcons() {
  const icons: { label: string; url: string; path: string }[] = [
    {
      label: "Discord",
      url: SOCIAL_LINKS.discord,
      path: "M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.8-3.6-13.8ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z",
    },
    {
      label: "X (Twitter)",
      url: SOCIAL_LINKS.x,
      path: "M18.2 2h3.4l-7.4 8.5L23 22h-6.8l-5.3-7-6.1 7H1.4l7.9-9.1L1 2h7l4.8 6.4L18.2 2Zm-1.2 18h1.9L7.1 3.9H5.1L17 20Z",
    },
    {
      label: "YouTube",
      url: SOCIAL_LINKS.youtube,
      path: "M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z",
    },
  ];
  return (
    <div className="absolute z-30 flex gap-[28px]" style={{ right: 75, top: 990 }}>
      {icons.map((ic) => (
        <button
          key={ic.label}
          type="button"
          aria-label={ic.label}
          onClick={() => {
            playSound("chess_piece_drop");
            openExternal(ic.url);
          }}
          className="h-[60px] w-[60px] text-kotb-black transition-transform hover:scale-110 hover:text-kotb-danger"
        >
          <svg viewBox="0 0 24 24" className="h-full w-full" fill="currentColor" aria-hidden>
            <path d={ic.path} />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** "Everything unlocked": twinkling sparkles around the logo once every achievement is earned. */
function Sparkles() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(allAchievementsUnlocked()), []);
  if (!on) return null;
  const spots = Array.from({ length: 14 }, (_, i) => ({
    x: 960 + Math.cos((i / 14) * Math.PI * 2) * (420 + (i % 3) * 40),
    y: 270 + Math.sin((i / 14) * Math.PI * 2) * (110 + (i % 2) * 30),
    d: (i * 0.37) % 2,
    s: 18 + (i % 3) * 8,
  }));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      {spots.map((p, i) => (
        <span
          key={i}
          className="kotb-sparkle absolute text-kotb-utility"
          style={{ left: p.x - p.s / 2, top: p.y - p.s / 2, width: p.s, height: p.s, animationDelay: `${p.d}s` }}
        >
          <svg viewBox="0 0 10 10" className="h-full w-full" fill="currentColor">
            <path d="M4 0h2v4h4v2H6v4H4V6H0V4h4z" />
          </svg>
        </span>
      ))}
    </div>
  );
}
