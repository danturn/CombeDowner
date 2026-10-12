// Synthesised sound effects and music (Web Audio), so the game ships no sound files.
// The context can only start after a click, so call unlock() from one.
import { Soundtrack } from "./music";

let ctx: AudioContext | null = null;
let master: GainNode;
let noise: AudioBuffer;
let music: GainNode | null = null;
let musicVolume = 0.6;
let voice: GainNode | null = null;
let voiceVolume = 1;

export function unlock() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  music = ctx.createGain();
  music.gain.value = musicVolume;
  music.connect(ctx.destination);
  voice = ctx.createGain();
  voice.gain.value = voiceVolume;
  voice.connect(ctx.destination);
  const track = new Soundtrack(ctx, music);
  const c = ctx;
  // Schedule a second ahead so frame hitches never leave gaps; hidden tabs run timers late, so more there.
  const tick = () => { if (musicVolume > 0) track.scheduleUntil(c.currentTime + (document.hidden ? 2 : 1)); };
  tick();
  setInterval(tick, 100);
}

/** Music volume, 0 to 1. */
export function setMusicVolume(v: number) {
  musicVolume = v;
  if (music && ctx) music.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

/** The audio context, once unlock() has made it. */
export const context = () => ctx;
/** Where other players' voices go (voice.ts), with its own volume. */
export const voiceOut = () => voice;

/** Voice chat volume, 0 to 1. */
export function setVoiceVolume(v: number) {
  voiceVolume = v;
  if (voice && ctx) voice.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

function out(vol: number, pan: number): AudioNode {
  const g = ctx!.createGain();
  g.gain.value = vol;
  const p = ctx!.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p).connect(master);
  return g;
}

/** Gunshot. distance in metres and pan -1..1 place remote shots. */
export function shot(distance = 0, pan = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const vol = distance <= 1 ? 0.9 : Math.min(0.7, 18 / (distance + 10));
  const dest = out(vol, pan);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(distance > 60 ? 1400 : 5200, t);
  lp.frequency.exponentialRampToValueAtTime(400, t + 0.18);
  const env = ctx.createGain();
  env.gain.setValueAtTime(1, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + (distance > 60 ? 0.5 : 0.28));
  src.connect(lp).connect(env).connect(dest);
  src.start(t, Math.random() * 0.5, 0.6);
  // low thump
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.8, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(og).connect(dest);
  o.start(t); o.stop(t + 0.15);
}

function beep(freq: number, dur: number, vol: number, type: OscillatorType = "sine", delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur);
}

export const hitMarker = (head: boolean) => beep(head ? 1700 : 1150, 0.07, 0.25, "triangle");
export const kill = () => { beep(880, 0.12, 0.25, "triangle"); beep(1320, 0.18, 0.25, "triangle", 0.08); };
export const hurt = () => beep(160, 0.18, 0.4, "sawtooth");
export const dryFire = () => beep(2400, 0.03, 0.15, "square");
export function reload() {
  beep(600, 0.05, 0.2, "square", 0.15);
  beep(420, 0.06, 0.2, "square", 1.2);
  beep(900, 0.05, 0.2, "square", 1.6);
}

/** A punch landing: a dull thud and a slap. distance in metres and pan -1..1 place it. */
export function punch(distance = 0, pan = 0) {
  if (!ctx || distance > 60) return;
  const t = ctx.currentTime;
  const dest = out(Math.min(0.8, 8 / (distance + 6)), pan);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.1);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.9, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(og).connect(dest);
  o.start(t); o.stop(t + 0.13);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.6, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(bp).connect(env).connect(dest);
  src.start(t, Math.random() * 0.5, 0.06);
}

/** A warning blip: chavs have seen you. */
export const alarm = () => { beep(520, 0.12, 0.2, "square"); beep(390, 0.2, 0.2, "square", 0.13); };

/** Walkie-talkie squelch: a burst of hiss when someone keys or releases the radio. */
export function radioClick() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400;
  bp.Q.value = 0.8;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.22, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  src.connect(bp).connect(env).connect(master);
  src.start(t, Math.random() * 0.5, 0.13);
}

/** Letting go of the radio: squelch, then the two-tone "over" beep. */
export function radioOver() {
  if (!ctx) return;
  radioClick();
  beep(1250, 0.07, 0.16, "square", 0.04);
  beep(950, 0.11, 0.16, "square", 0.12);
}
