import { useEffect, useState } from "react";
import { getGameTime } from "../gameTime";
import { speedrunOn } from "../settings";

/** SpeedrunTimer HUD: total run time, shown only while Speedrun Mode is on. */
export function formatSpeedrun(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

export function SpeedrunTimer() {
  const [t, setT] = useState<number | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setT(speedrunOn() ? getGameTime() : null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (t === null) return null;
  return (
    <div className="pointer-events-none fixed right-3 top-2 z-50 font-kotb text-[22px] text-kotb-white [text-shadow:2px_2px_0_var(--kotb-outline)]">
      {formatSpeedrun(t)}
    </div>
  );
}
