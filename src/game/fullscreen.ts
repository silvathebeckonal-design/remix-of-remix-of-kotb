// Web stand-in for SettingsManager.ApplyFullScreenSetting: browsers only allow fullscreen from a user gesture,
// so the first tap/click/key anywhere requests it (when the FULLSCREEN option is ON).
import { getSettings } from "./settings";

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

let requested = false;

export function isFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as FsDocument;
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

export function enterFullscreen() {
  if (typeof document === "undefined" || isFullscreen()) return;
  const el = document.documentElement as FsElement;
  try {
    const p = el.requestFullscreen
      ? el.requestFullscreen({ navigationUI: "hide" })
      : el.webkitRequestFullscreen?.();
    if (p && typeof (p as Promise<void>).then === "function")
      (p as Promise<void>).then(lockLandscape, () => {});
    else lockLandscape();
  } catch {
    /* not allowed (iframe / iOS) */
  }
}

/** The game is a 16:9 landscape game: on phones, keep it sideways while fullscreen (Android Chrome). */
function lockLandscape() {
  const o = (screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
  try {
    o?.lock?.("landscape")?.catch?.(() => {});
  } catch {
    /* unsupported (desktop / iOS) */
  }
}

export function exitFullscreen() {
  if (typeof document === "undefined" || !isFullscreen()) return;
  const d = document as FsDocument;
  try {
    const p = d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Call from a user-gesture handler; only the first call does anything. */
export function requestFullscreenOnce() {
  if (requested) return;
  requested = true;
  if (getSettings().fullscreen !== 0) enterFullscreen();
}

export function applyFullscreenSetting() {
  if (getSettings().fullscreen !== 0) enterFullscreen();
  else exitFullscreen();
}
