// Menu sounds from the original game (SoundEffect volume + random pitch range per clip).
import grab from "@/assets/audio/chess_piece_grab.mp3.asset.json";
import drop from "@/assets/audio/chess_piece_drop.mp3.asset.json";
import impact from "@/assets/audio/titel_impact.mp3.asset.json";
import ambience from "@/assets/audio/overworld_bridge_ambience.mp3.asset.json";
import correct from "@/assets/audio/chess_accusation_correct.mp3.asset.json";
import wrong from "@/assets/audio/chess_accusation_false.mp3.asset.json";
import flip from "@/assets/audio/chess_rulebook_page_flip.mp3.asset.json";
import capture from "@/assets/audio/chess_piece_capture.mp3.asset.json";

const CLIPS = {
  chess_piece_grab: { url: grab.url, volume: 0.4, pitch: 0.072 },
  chess_piece_drop: { url: drop.url, volume: 0.5, pitch: 0.072 },
  titel_impact: { url: impact.url, volume: 0.516, pitch: 0.034 },
  overworld_bridge_ambience: { url: ambience.url, volume: 0.58, pitch: 0 },
  chess_accusation_correct: { url: correct.url, volume: 0.879, pitch: 0 },
  chess_accusation_false: { url: wrong.url, volume: 0.879, pitch: 0 },
  chess_rulebook_page_flip: { url: flip.url, volume: 0.716, pitch: 0.035 },
  chess_piece_capture: { url: capture.url, volume: 0.489, pitch: 0.051 },
} as const;

export type SoundId = keyof typeof CLIPS;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
const buffers = new Map<SoundId, Promise<AudioBuffer | null>>();
let ambienceNode: AudioBufferSourceNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(ctx.destination);
  }
  return ctx;
}

function load(id: SoundId) {
  let p = buffers.get(id);
  if (!p) {
    const c = audio();
    p = c
      ? fetch(CLIPS[id].url)
          .then((r) => r.arrayBuffer())
          .then((b) => c.decodeAudioData(b))
          .catch(() => null)
      : Promise.resolve(null);
    buffers.set(id, p);
  }
  return p;
}

export function preloadSounds() {
  for (const id of Object.keys(CLIPS) as SoundId[]) if (id !== "overworld_bridge_ambience") void load(id);
}

/** Browsers keep audio muted until the first tap or key press. */
export function unlockAudio() {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
  startAmbience();
}

export function playSound(id: SoundId) {
  const c = audio();
  if (!c || !out || c.state !== "running") return;
  void load(id).then((buf) => {
    if (!buf || !out) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    const clip = CLIPS[id];
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * clip.pitch;
    const g = c.createGain();
    g.gain.value = clip.volume;
    src.connect(g).connect(out);
    src.start();
  });
}

function startAmbience() {
  const c = audio();
  if (!c || ambienceNode) return;
  ambienceNode = c.createBufferSource();
  const node = ambienceNode;
  void load("overworld_bridge_ambience").then((buf) => {
    if (!buf || !out) return;
    node.buffer = buf;
    node.loop = true;
    const g = c.createGain();
    g.gain.value = CLIPS.overworld_bridge_ambience.volume * 0.6;
    node.connect(g).connect(out);
    node.start();
  });
}
