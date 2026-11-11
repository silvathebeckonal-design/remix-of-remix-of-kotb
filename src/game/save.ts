// Browser port of SaveSystem/PlayerSaveData (localStorage).
import type { PageFogEntry } from "./rulebook";
import { recordAchievements } from "./achievements";

export type OverworldState = "ACT_I" | "ACT_II" | "ACT_III";
export type Ending = "None" | "GoodEnding" | "BadEnding" | "AscensionEnding" | "DuckEnding";

export interface PlayerSaveData {
  totalAttemptCount: number;
  totalCheatCount: number;
  totalScrapCount: number;
  pageFogEntries: PageFogEntry[];
  overworldState: OverworldState;
  ending: Ending;
  firstGameinScene: boolean;
}

const KEY = "kotb.save.v1";

export function defaultSave(): PlayerSaveData {
  return {
    totalAttemptCount: 0,
    totalCheatCount: 0,
    totalScrapCount: 0,
    pageFogEntries: [],
    overworldState: "ACT_I",
    ending: "None",
    firstGameinScene: true,
  };
}

export function loadSave(): PlayerSaveData {
  if (typeof window === "undefined") return defaultSave();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    return { ...defaultSave(), ...(JSON.parse(raw) as Partial<PlayerSaveData>) };
  } catch {
    return defaultSave();
  }
}

export function storeSave(data: PlayerSaveData) {
  if (typeof window === "undefined") return;
  recordAchievements(data);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked */
  }
}

export function wipeSave() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
