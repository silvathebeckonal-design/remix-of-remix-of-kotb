import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Full-screen stage (Unity CanvasScaler, match height). Screens wider than 16:9 fill edge to edge: the
 * world canvas shows more of the scene sideways (height-based camera), and the 1920x1080 reference canvas
 * stays centered, scaled to the screen height. Narrower screens (portrait) letterbox top/bottom.
 * Full-bleed overlays use the `inset-x-bleed` utility to reach past the 1920 box to the screen edges.
 */
export function Stage({ world, children, transparent }: { world?: ReactNode; children?: ReactNode; transparent?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const fit = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (W <= 0 || H <= 0) return;
      // wider than 16:9 -> fill; narrower -> keep 16:9 and letterbox vertically
      const h = W / H >= 16 / 9 ? H : (W * 9) / 16;
      setSize({ w: Math.floor(W), h: Math.floor(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("orientationchange", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", fit);
    };
  }, []);
  const scale = size.h / 1080;
  const refW = Math.max(1920, size.w / scale);
  const bleed = (refW - 1920) / 2;
  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${transparent ? "" : "bg-kotb-black"}`}
      style={{ width: size.w, height: size.h }}
    >
      {world}
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{ width: refW, height: 1080, transform: `scale(${scale})` }}
      >
        <div
          className="absolute top-0"
          style={{ left: bleed, width: 1920, height: 1080, ["--stage-bleed" as string]: `${bleed}px` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Position helper: Unity UI coordinates (origin at center, y up) on the 1920x1080 canvas. */
export function uiPos(x: number, y: number) {
  return { left: 960 + x, top: 540 - y } as const;
}
