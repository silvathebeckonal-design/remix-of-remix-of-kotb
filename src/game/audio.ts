// Port of SoundManager.LoadSoundEffect using the original AudioClips and SoundEffect settings.
// Mixer groups (SettingsManager): Master -> Effects / Ambience, each driven by CalculateVolume (dB).
import { SOUNDS } from "./data";
import { CLIP_URLS } from "./audioClips";
import { calculateVolume, dbToGain, getSettings, subscribeSettings } from "./settings";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let effects: GainNode | null = null;
let ambience: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const loops = new Map<string, AudioBufferSourceNode>();
let muted = false;

/** Sounds routed through SoundManager.ambientSource (Ambience mixer group). */
const AMBIENT = new Set(["overworld_bridge_ambience"]);

function applyVolumes() {
  if (!master || !effects || !ambience) return;
  const s = getSettings();
  master.gain.value = muted ? 0 : dbToGain(calculateVolume(s.master));
  effects.gain.value = dbToGain(calculateVolume(s.effects));
  ambience.gain.value = dbToGain(calculateVolume(s.ambience));
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    effects = ctx.createGain();
    ambience = ctx.createGain();
    effects.connect(master);
    ambience.connect(master);
    master.connect(ctx.destination);
    applyVolumes();
    subscribeSettings(applyVolumes);
  }
  return ctx;
}

/** Must be called from a user gesture once (browsers block audio until then). */
export function unlockAudio() {
  const c = ensureCtx();
  if (c && c.state === "suspended") void c.resume();
}

export function setMuted(m: boolean) {
  muted = m;
  applyVolumes();
}
export const isMuted = () => muted;

function loadClip(clip: string): Promise<AudioBuffer | null> {
  let p = buffers.get(clip);
  if (!p) {
    const url = CLIP_URLS[clip];
    const c = ensureCtx();
    p =
      url && c
        ? fetch(url)
            .then((r) => r.arrayBuffer())
            .then((b) => c.decodeAudioData(b))
            .catch(() => null)
        : Promise.resolve(null);
    buffers.set(clip, p);
  }
  return p;
}

export function preloadSounds() {
  for (const s of Object.values(SOUNDS))
    for (const c of s.clips) if (c !== "overworld_bridge_ambience") void loadClip(c);
}

/** Plays a SoundEffect by its SoundManager field name (e.g. "chess_piece_capture"). */
export function playSound(name: string) {
  const def = SOUNDS[name];
  const c = ensureCtx();
  if (!def || !c || !effects || !ambience || def.clips.length === 0) return;
  const clip = def.clips[Math.floor(Math.random() * def.clips.length)];
  if (!clip) return;
  const bus = AMBIENT.has(name) ? ambience : effects;
  void loadClip(clip).then((buf) => {
    if (!buf || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (def.pitchRange > 0)
      src.playbackRate.value = 1 - def.pitchRange + Math.random() * def.pitchRange * 2;
    const g = ctx.createGain();
    g.gain.value = def.volume;
    src.connect(g).connect(bus);
    if (def.loop) {
      loops.get(name)?.stop();
      src.loop = true;
      loops.set(name, src);
    }
    src.start();
  });
}

export function isLooping(name: string) {
  return loops.has(name);
}

export function stopLoop(name: string) {
  loops.get(name)?.stop();
  loops.delete(name);
}
