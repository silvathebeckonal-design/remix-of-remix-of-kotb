// Port of SoundManager.LoadSoundEffect using the original AudioClips and SoundEffect settings.
// Mixer (sharedassets0 "Mixer"): Master -> PlayerMaster -> Effects (+ Dialog, UI) / Ambience. The
// settings drive Master/Effects/Ambience through CalculateVolume (dB); Master also carries an SFX
// Reverb whose dry level is -4.36 dB and whose wet send (Room -62 dB) is inaudible, so only the
// dry level is kept.
import { SOUNDS, type SoundDef } from "./data";
import { CLIP_SECONDS, CLIP_URLS } from "./audioClips";
import { calculateVolume, dbToGain, getSettings, subscribeSettings } from "./settings";

/** SFX Reverb "Dry Level" on the Master group (-436 mB). */
export const MASTER_DRY_DB = -4.36;
/** A tap that unlocks audio may itself ask for a sound; keep requests this recent (ms). */
const UNLOCK_GRACE_MS = 350;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let effects: GainNode | null = null;
let ambience: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const loops = new Map<string, AudioBufferSourceNode>();
/** Latest loop request per sound, so a stopLoop before the clip finished loading still wins. */
const loopRequests = new Map<string, object>();
const waiting: { name: string; at: number }[] = [];
let muted = false;

/** Sounds routed through SoundManager.ambientSource (Ambience mixer group). */
const AMBIENT = new Set(["overworld_bridge_ambience"]);

/** Random.Range(1 - pitchRange, 1 + pitchRange) when doRandomizePitch, else 1. */
export function pickPitch(def: Pick<SoundDef, "pitchRange">, rnd: number = Math.random()): number {
  if (!(def.pitchRange > 0)) return 1;
  return 1 - def.pitchRange + rnd * def.pitchRange * 2;
}

/** Frames to keep from a decoded clip: the AudioClip length, never more than was decoded. */
export function trimmedFrames(decodedFrames: number, sampleRate: number, seconds: number | undefined): number {
  if (!seconds || seconds <= 0) return decodedFrames;
  return Math.max(1, Math.min(decodedFrames, Math.round(seconds * sampleRate)));
}

function applyVolumes() {
  if (!master || !effects || !ambience) return;
  const s = getSettings();
  master.gain.value = muted ? 0 : dbToGain(calculateVolume(s.master) + MASTER_DRY_DB);
  effects.gain.value = dbToGain(calculateVolume(s.effects));
  ambience.gain.value = dbToGain(calculateVolume(s.ambience));
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    const c = ctx;
    c.addEventListener("statechange", () => {
      if (c.state !== "running") return;
      const now = performance.now();
      for (const w of waiting.splice(0)) if (now - w.at <= UNLOCK_GRACE_MS) start(w.name);
    });
  }
  return ctx;
}

/** Must be called from a user gesture once (browsers block audio until then). */
export function unlockAudio() {
  const c = ensureCtx();
  if (c && c.state !== "running") void c.resume().catch(() => {});
}

export function setMuted(m: boolean) {
  muted = m;
  applyVolumes();
}
export const isMuted = () => muted;

function trim(c: AudioContext, buf: AudioBuffer, clip: string): AudioBuffer {
  const frames = trimmedFrames(buf.length, buf.sampleRate, CLIP_SECONDS[clip]);
  if (frames >= buf.length) return buf;
  const out = c.createBuffer(buf.numberOfChannels, frames, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(0, frames), ch);
  return out;
}

function loadClip(clip: string): Promise<AudioBuffer | null> {
  let p = buffers.get(clip);
  if (!p) {
    const url = CLIP_URLS[clip];
    const c = ensureCtx();
    p =
      url && c
        ? fetch(url)
            .then((r) => {
              if (!r.ok) throw new Error(String(r.status));
              return r.arrayBuffer();
            })
            .then((b) => c.decodeAudioData(b))
            .then((b) => trim(c, b, clip))
            .catch(() => {
              buffers.delete(clip); // retry on the next request instead of staying silent
              return null;
            })
        : Promise.resolve(null);
    buffers.set(clip, p);
  }
  return p;
}

export function preloadSounds() {
  for (const s of Object.values(SOUNDS))
    for (const c of s.clips) if (c !== "overworld_bridge_ambience") void loadClip(c);
}

function start(name: string) {
  const def = SOUNDS[name];
  if (!def || !ctx || !effects || !ambience || def.clips.length === 0) return;
  const clip = def.clips[Math.floor(Math.random() * def.clips.length)];
  if (!clip) return;
  const bus = AMBIENT.has(name) ? ambience : effects;
  const pitch = pickPitch(def);
  const requested = performance.now();
  const token = {};
  if (def.loop) loopRequests.set(name, token);
  void loadClip(clip).then((buf) => {
    if (!buf || !ctx) return;
    if (def.loop && loopRequests.get(name) !== token) return;
    // A one-shot that only finished loading long after its moment would sound out of place.
    if (!def.loop && performance.now() - requested > 1500) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    const g = ctx.createGain();
    g.gain.value = def.volume;
    src.connect(g).connect(bus);
    if (def.loop) {
      // AudioSource.clip + loop + Play(): replaces whatever this source was looping
      loops.get(name)?.stop();
      src.loop = true;
      loops.set(name, src);
    } else {
      src.onended = () => g.disconnect();
    }
    src.start();
  });
}

/** Plays a SoundEffect by its SoundManager field name (e.g. "chess_piece_capture"). */
export function playSound(name: string) {
  const def = SOUNDS[name];
  const c = ensureCtx();
  if (!def || !c) return;
  // Loops start whenever audio unlocks; one-shots only if the unlocking tap asked for them,
  // otherwise they would all fire at once on the first tap.
  if (c.state !== "running" && !def.loop) {
    waiting.push({ name, at: performance.now() });
    if (waiting.length > 16) waiting.shift();
    return;
  }
  start(name);
}

export function isLooping(name: string) {
  return loops.has(name);
}

export function stopLoop(name: string) {
  loopRequests.delete(name);
  loops.get(name)?.stop();
  loops.delete(name);
}
