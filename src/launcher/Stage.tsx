import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 1920x1080 reference canvas scaled to the screen height (Unity CanvasScaler, match height), as in
 * the game's menu. Wider screens bleed sideways; narrower screens letterbox top and bottom.
 */
export function Stage({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const fit = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (W <= 0 || H <= 0) return;
      const h = W / H >= 16 / 9 ? H : (W * 9) / 16;
      setSize({ w: Math.floor(W), h: Math.floor(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = size.h / 1080;
  const refW = Math.max(1920, size.w / scale);
  const bleed = (refW - 1920) / 2;
  return (
    <div ref={ref} className="relative overflow-hidden bg-kotb-outline" style={{ width: size.w, height: size.h }}>
      <div
        className="absolute left-0 top-0 origin-top-left"
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
