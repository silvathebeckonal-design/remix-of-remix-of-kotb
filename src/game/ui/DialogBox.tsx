import { useEffect, useRef } from "react";
import { COLORS } from "../data";
import { SPRITES, getTinted, rgbOf, tex } from "../assets";
import { at } from "../rng";

/**
 * Bands reach far past both screen edges (half a reference screen extra) so neither the shake nor any
 * rounding of the stage width can pull their ends into view; the Stage clips the overflow.
 */
const OVERHANG = "calc(var(--stage-bleed, 0px) * -1 - 960px)";
const WIDE = { left: OVERHANG, right: OVERHANG };

/** Port of the DialogBox canvas prefab: dim, band, rotoscoped troll and typewriter text. */
export function DialogBox({ text, visible, noAnimation }: { text: string; visible: number; noAnimation: boolean }) {
  return (
    <div className="absolute inset-0 animate-kotb-shake-once" data-noanim={noAnimation || undefined}>
      <div className="absolute inset-y-0 bg-kotb-outline/50" style={WIDE} />
      <div className="absolute bg-kotb-outline" style={{ ...WIDE, top: 540 - 160, height: 320 }} />
      <div className="absolute bg-kotb-white" style={{ ...WIDE, top: 540 - 156 - 4.2, height: 8.4 }} />
      <div className="absolute bg-kotb-white" style={{ ...WIDE, top: 540 + 156 - 4.2, height: 8.4 }} />
      <div
        className="absolute bg-kotb-outline"
        style={{ left: 960 - 1.8 - 103.85, top: 540 - 150.3 - 9.8, width: 207.7, height: 19.6 }}
      />
      <RotoTroll animate={!noAnimation} />
      <div
        className="absolute flex items-center justify-center text-center font-kotb text-kotb-white"
        style={{ left: 560, top: 540 - 140, width: 800, height: 280, fontSize: 45, lineHeight: 1.15 }}
      >
        <p className="whitespace-pre-wrap">
          <span>{text.slice(0, visible)}</span>
          <span className="opacity-0">{text.slice(visible)}</span>
        </p>
      </div>
    </div>
  );
}

function RotoTroll({ animate }: { animate: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const draw = () => {
      const c = ref.current;
      if (c) {
        const ctx = c.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, c.width, c.height);
        const i = animate ? Math.floor(((performance.now() - start) / 1000) * 8) % SPRITES.trollRotoFill.length : 0;
        const fill = getTinted(tex(at(SPRITES.trollRotoFill, i)), rgbOf("Outline"));
        const outline = getTinted(tex(at(SPRITES.trollRotoOutline, i)), [COLORS.White[0], COLORS.White[1], COLORS.White[2]]);
        if (fill) ctx.drawImage(fill, 0, 0, c.width, c.height);
        if (outline) ctx.drawImage(outline, 0, 0, c.width, c.height);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [animate]);
  // 800x300 box, preserveAspect on a 256x144 sprite -> 533x300
  return (
    <canvas
      ref={ref}
      width={512}
      height={288}
      className="absolute [image-rendering:pixelated]"
      style={{ left: 960 - 266.5, top: 540 - 301.5 - 150, width: 533, height: 300 }}
    />
  );
}
