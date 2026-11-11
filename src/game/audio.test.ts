import { describe, expect, it } from "vitest";
import { MASTER_DRY_DB, pickPitch, trimmedFrames } from "./audio";
import { CLIP_SECONDS, CLIP_URLS } from "./audioClips";
import { SOUNDS } from "./data";

describe("original sound playback", () => {
  it("plays the accusation clip for its real 3.95s, not the 13.4s looped decode", () => {
    // AudioClip chess_accusation_in: 174234 samples at 44.1 kHz
    expect(trimmedFrames(592200, 44100, CLIP_SECONDS["chess_accusation_in"])).toBe(174234);
  });

  it("never pads a clip that decoded shorter than its length", () => {
    expect(trimmedFrames(1000, 48000, 1)).toBe(1000);
  });

  it("randomizes pitch within 1 ± pitchRange like Random.Range", () => {
    const grab = SOUNDS["chess_piece_grab"]!;
    expect(pickPitch(grab, 0)).toBeCloseTo(0.928, 5);
    expect(pickPitch(grab, 1)).toBeCloseTo(1.072, 5);
    expect(pickPitch(SOUNDS["overworld_bridge_ambience"]!, 0)).toBe(1);
  });

  it("applies the Master reverb dry level from the game's mixer", () => {
    expect(MASTER_DRY_DB).toBe(-4.36);
  });

  it("has a file and a length for every clip a sound effect uses", () => {
    for (const def of Object.values(SOUNDS))
      for (const clip of def.clips) {
        expect(CLIP_URLS[clip], clip).toBeTruthy();
        expect(CLIP_SECONDS[clip], clip).toBeGreaterThan(0);
      }
  });
});
