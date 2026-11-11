// Port-only stand-in for the Steam achievements. Kept outside the save file so WIPE SAVE keeps them.
import type { PlayerSaveData } from "./save";

export const ACHIEVEMENTS = [
  { id: "GoodEnding", label: "You crossed the bridge." },
  { id: "BadEnding", label: "You remain on the bridge..." },
  { id: "AscensionEnding", label: "You have ascended..." },
  { id: "DuckEnding", label: "You got rid of the troll..." },
  { id: "AllPages", label: "Found every rulebook page." },
  { id: "FirstCheat", label: "Cheated for the first time." },
  { id: "FirstScrap", label: "Collected a valorite scrap." },
] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];

const KEY = "kotb.achievements.v1";

export function getAchievements(): Set<AchievementId> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as AchievementId[]);
  } catch {
    return new Set();
  }
}

export function allAchievementsUnlocked() {
  const got = getAchievements();
  return ACHIEVEMENTS.every((a) => got.has(a.id));
}

/** Achievements earned by a save snapshot. */
export function achievementsFromSave(s: PlayerSaveData): AchievementId[] {
  const out: AchievementId[] = [];
  if (s.ending !== "None") out.push(s.ending);
  if (s.pageFogEntries.length > 0 && s.pageFogEntries.every((e) => !e.isFog)) out.push("AllPages");
  if (s.totalCheatCount > 0) out.push("FirstCheat");
  if (s.totalScrapCount > 0) out.push("FirstScrap");
  return out;
}

export function recordAchievements(s: PlayerSaveData) {
  if (typeof window === "undefined") return;
  const got = getAchievements();
  const before = got.size;
  for (const id of achievementsFromSave(s)) got.add(id);
  if (got.size === before) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...got]));
  } catch {
    /* storage blocked */
  }
}
