// Port of SettingsManager / Setting / SettingMenuItem: cyclable options persisted like "player_settings".
import { ESTIMATED, MENU_STRINGS } from "./data";

export type SettingId =
  "speedChess" | "speedrun" | "screenshake" | "fullscreen" | "master" | "effects" | "ambience" | "language";
export interface SettingOption {
  value: number;
  label: string;
}

const onOff: SettingOption[] = [
  { value: 1, label: MENU_STRINGS.MenuOnKey },
  { value: 0, label: MENU_STRINGS.MenuOffKey },
];
const volume: SettingOption[] = ESTIMATED.volumeOptions.map((v) => ({ value: v, label: `${v}%` }));

/** Options in serialized order; index 0 is the first-launch default (SettingsManager.Awake). */
export const SETTING_OPTIONS: Record<SettingId, SettingOption[]> = {
  speedChess: ESTIMATED.speedChess.options,
  // Port: off by default so runs only time when asked.
  speedrun: [onOff[1]!, onOff[0]!],
  screenshake: onOff,
  fullscreen: onOff,
  master: volume,
  effects: volume,
  ambience: volume,
  language: [{ value: 0, label: MENU_STRINGS.MenuEnglishKey }],
};

export const SETTING_LABEL_KEYS: Record<SettingId, keyof typeof MENU_STRINGS> = {
  speedChess: "MenuSpeedChessKey",
  speedrun: "MenuScreenshakeKey",
  screenshake: "MenuScreenshakeKey",
  fullscreen: "MenuFullscreenKey",
  master: "MenuMasterKey",
  effects: "MenuEffectsKey",
  ambience: "MenuAmbienceKey",
  language: "MenuLanguageKey",
};

export type Settings = Record<SettingId, number>;

const KEY = "kotb.settings.v1";
const ids = Object.keys(SETTING_OPTIONS) as SettingId[];

export function defaultSettings(): Settings {
  return Object.fromEntries(ids.map((id) => [id, SETTING_OPTIONS[id][0]?.value ?? 0])) as Settings;
}

let current: Settings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  if (current) return current;
  const base = defaultSettings();
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Settings>;
        // DataToSettings: only accept values that match a known option
        for (const id of ids) {
          const v = saved[id];
          if (typeof v === "number" && SETTING_OPTIONS[id].some((o) => o.value === v)) base[id] = v;
        }
      }
    } catch {
      /* ignore */
    }
  }
  current = base;
  return current;
}

export function subscribeSettings(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function store(next: Settings) {
  current = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  for (const l of listeners) l();
}

/** Setting.CycleSettingOption(Right). */
export function cycleSetting(id: SettingId): Settings {
  const s = getSettings();
  const opts = SETTING_OPTIONS[id];
  const i = opts.findIndex((o) => o.value === s[id]);
  const next = opts[(i + 1) % opts.length] ?? opts[0];
  const updated = { ...s, [id]: next?.value ?? 0 };
  store(updated);
  return updated;
}

export function optionLabel(id: SettingId, s: Settings = getSettings()): string {
  return SETTING_OPTIONS[id].find((o) => o.value === s[id])?.label ?? "";
}

/** Port-only label: the original string table entry for speedrun mode isn't in the extraction. */
export const SPEEDRUN_LABEL = "SPEEDRUN: {selectedOption}";

export function settingText(id: SettingId, s: Settings = getSettings()): string {
  if (id === "speedrun") return SPEEDRUN_LABEL.replace("{selectedOption}", optionLabel(id, s));
  return MENU_STRINGS[SETTING_LABEL_KEYS[id]].replace("{selectedOption}", optionLabel(id, s));
}

/** SettingsManager.CalculateVolume: 0..100 slider -> mixer dB (-40..0). */
export function calculateVolume(value: number): number {
  return (40 - (value / 100) * 40) * -1;
}

export const dbToGain = (db: number) => Math.pow(10, db / 20);

/** AccessibilityManager.doScreenshake */
export const doScreenshake = () => getSettings().screenshake !== 0;
/** SpeedChessManager.doSpeedChess / speedChessTime */
export const speedChessTime = () => getSettings().speedChess;

export const speedrunOn = () => getSettings().speedrun === 1;

export function resetSettingsCacheForTests() {
  current = null;
}
