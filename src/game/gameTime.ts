// PlayerSaveData.totalGameTime, counted while SpeedrunTimer.doCountTime is on (overworld + chess scenes).
// Kept under its own key so scenes holding a PlayerSaveData copy can't overwrite it.
const KEY = "kotb.time.v1";

export function getGameTime(): number {
  if (typeof window === "undefined") return 0;
  const v = Number(window.localStorage.getItem(KEY) ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function addGameTime(seconds: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, String(getGameTime() + seconds));
  } catch {
    /* ignore */
  }
}

export function resetGameTime() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

/** OverworldTrollManager.Credits time line, e.g. "1 hour 2 minutes 3 seconds". */
export function formatGameTime(
  total: number,
  s: {
    hour: string;
    hours: string;
    minute: string;
    minutes: string;
    second: string;
    seconds: string;
  },
): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) - h * 60;
  const sec = Math.floor(total % 60);
  let text = "";
  if (h > 0) text = h !== 1 ? `${text}${h} ${s.hours} ` : `${text}1 ${s.hour} `;
  text = m !== 1 ? `${text}${m} ${s.minutes} ` : `${text}1 ${s.minute} `;
  text = sec !== 1 ? `${text}${sec} ${s.seconds}` : `${text}1 ${s.second}`;
  return text;
}

let counting = false;
/** SpeedrunTimer.doCountTime */
export function setCountTime(on: boolean) {
  counting = on;
}
export const isCountingTime = () => counting;
