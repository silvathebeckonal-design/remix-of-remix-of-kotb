// Launcher sounds go through the game's own SoundManager port, so every clip uses the original
// SoundEffect volume, pitch range and mixer levels and shares one audio context with the game.
import {
  isLooping,
  playSound as playEffect,
  preloadSounds as preloadEffects,
  stopLoop,
  unlockAudio as unlockEffects,
} from "@/game/audio";

export type SoundId =
  | "chess_piece_grab"
  | "chess_piece_drop"
  | "titel_impact"
  | "overworld_bridge_ambience"
  | "chess_accusation_correct"
  | "chess_accusation_false"
  | "chess_rulebook_page_flip"
  | "chess_piece_capture";

export const preloadSounds = preloadEffects;

export function playSound(id: SoundId) {
  playEffect(id);
}

/** Browsers keep audio muted until the first tap or key press; the menu ambience starts then. */
export function unlockAudio() {
  unlockEffects();
  if (!isLooping("overworld_bridge_ambience")) playEffect("overworld_bridge_ambience");
}

/** The game's title screen starts its own ambience (MenuManager.Intro). */
export function stopLauncherAmbience() {
  stopLoop("overworld_bridge_ambience");
}
