import { useEffect, useState } from "react";
import { MENU_STRINGS } from "../data";
import { ACHIEVEMENTS, getAchievements } from "../achievements";
import { Backdrop } from "./Backdrop";
import { Stage } from "./Stage";

/** Port-only Extras page replacing Steam achievements, in the menu's pixel style. */
export function AchievementsView({ onBack }: { onBack: () => void }) {
  const [got, setGot] = useState<Set<string>>(new Set());
  useEffect(() => setGot(getAchievements()), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <Stage world={<Backdrop dim={0.6} />}>
      <div className="pointer-events-auto absolute left-[460px] top-[70px] w-[1000px] font-kotb text-kotb-white">
        <div className="mb-[30px] text-center text-[60px]">
          ACHIEVEMENTS {got.size} / {ACHIEVEMENTS.length}
        </div>
        <ul className="flex flex-col gap-[14px]">
          {ACHIEVEMENTS.map((a) => {
            const on = got.has(a.id);
            return (
              <li
                key={a.id}
                className={`flex items-center gap-[28px] border-[6px] border-kotb-white px-[24px] py-[12px] text-[34px] ${on ? "" : "opacity-40"}`}
              >
                <span className={`inline-block h-[36px] w-[36px] border-[6px] border-kotb-white ${on ? "bg-kotb-white" : ""}`} />
                <span>{on ? a.label : "???"}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-[30px] text-center text-[45px]">
          <button type="button" className="hover:text-kotb-danger" onClick={onBack}>
            {MENU_STRINGS.MenuBackKey}
          </button>
        </div>
      </div>
    </Stage>
  );
}
