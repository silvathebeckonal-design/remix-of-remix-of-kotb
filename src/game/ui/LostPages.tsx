import { useEffect, useState } from "react";
import { MENU_STRINGS } from "../data";
import { assetUrl, getTinted, loadImage, rgbOf, tex } from "../assets";
import { playSound } from "../audio";
import { Backdrop } from "./Backdrop";
import { Stage } from "./Stage";
import { useRef } from "react";
import { at } from "../rng";

const PAGES = Array.from({ length: 6 }, (_, i) => assetUrl(`SecretPages/english/secretpage${i}_eng.png`));

/** Secret page display (SecretPageDisplayManager) on the lost-page parchment. */
export function LostPages({ onBack }: { onBack: () => void }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    const srcs = [tex("lostpage_fill"), tex("lostpage_outline"), at(PAGES, i)] as const;
    void Promise.all(srcs.map(loadImage)).then(() => {
      const c = ref.current;
      if (!alive || !c) return;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      const fill = getTinted(srcs[0], rgbOf("White"));
      const outline = getTinted(srcs[1], rgbOf("Outline"));
      const page = getTinted(srcs[2], rgbOf("Outline"));
      if (fill) ctx.drawImage(fill, 0, 0, c.width, c.height);
      if (outline) ctx.drawImage(outline, 0, 0, c.width, c.height);
      if (page) ctx.drawImage(page, 0, 0, c.width, c.height);
    });
    return () => {
      alive = false;
    };
  }, [i]);

  const go = (d: number) => {
    playSound("chess_rulebook_page_flip");
    setI((x) => (x + d + PAGES.length) % PAGES.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Stage world={<Backdrop dim={0.6} />}>
      <canvas
        ref={ref}
        width={640}
        height={640}
        className="absolute [image-rendering:pixelated]"
        style={{ left: 960 - 400, top: 80, width: 800, height: 800 }}
        aria-label={`Secret page ${i + 1}`}
      />
      <div className="pointer-events-auto absolute bottom-[60px] left-0 flex w-full items-center justify-center gap-[120px] font-kotb text-[45px] text-kotb-white">
        <button type="button" className="hover:text-kotb-danger" onClick={() => go(-1)}>
          {"<"}
        </button>
        <span>
          {i + 1} / {PAGES.length}
        </span>
        <button type="button" className="hover:text-kotb-danger" onClick={() => go(1)}>
          {">"}
        </button>
        <button type="button" className="hover:text-kotb-danger" onClick={onBack}>
          {MENU_STRINGS.MenuBackKey}
        </button>
      </div>
    </Stage>
  );
}
