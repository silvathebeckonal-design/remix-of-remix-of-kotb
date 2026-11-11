import { useEffect, useRef } from "react";
import { renderBackdrop } from "../runtime/render";

export function Backdrop({ dim = 0 }: { dim?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = () => {
      const c = ref.current;
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(c.clientWidth * dpr);
        const h = Math.round(c.clientHeight * dpr);
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        renderBackdrop(c.getContext("2d")!, w, h, (performance.now() - start) / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <canvas ref={ref} className="absolute inset-0 h-full w-full [image-rendering:pixelated]" aria-hidden />
      {dim > 0 && <div className="absolute inset-0 bg-kotb-outline" style={{ opacity: dim }} />}
    </>
  );
}
