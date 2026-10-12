// Synthesised sound effects and music (Web Audio), so the game ships no sound files.
// The context can only start after a click, so call unlock() from one.
import { Soundtrack } from "./music";

let ctx: AudioContext | null = null;
let master: GainNode;
let noise: AudioBuffer;
let music: GainNode | null = null;
let musicVolume = 0.6;
let soundtrack: Soundtrack | null = null;
let trackListener: ((name: string) => void) | null = null;

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
  const st = soundtrack = new Soundtrack(ctx, music);
  const c = ctx;
  // report a new track when it actually starts playing, not when it is scheduled
  st.onTrack = (name, time) => setTimeout(() => trackListener?.(name), Math.max(0, (time - c.currentTime) * 1000));
  // Schedule a second ahead so frame hitches never leave gaps; hidden tabs run timers late, so more there.
  const tick = () => { if (musicVolume > 0) st.scheduleUntil(c.currentTime + (document.hidden ? 2 : 1)); };
  tick();
  setInterval(tick, 100);
}

/** Skip to another track. */
export function nextTrack() { soundtrack?.nextTrack(); }

/** Hear about each new track as it starts. */
export function onTrackChange(f: (name: string) => void) { trackListener = f; }

/** Music volume, 0 to 1. */
export function setMusicVolume(v: number) {
  musicVolume = v;
  if (music && ctx) music.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

function out(vol: number, pan: number): AudioNode {
  const g = ctx!.createGain();
  g.gain.value = vol;
  const p = ctx!.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p).connect(master);
  return g;
}

/** Gunshot. distance in metres and pan -1..1 place remote shots; heavy is the sniper's crack. */
export function shot(distance = 0, pan = 0, heavy = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const vol = (distance <= 1 ? 0.9 : Math.min(0.7, (heavy ? 40 : 18) / (distance + 10))) * (heavy ? 1.15 : 1);
  const dest = out(vol, pan);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(distance > 60 ? 1400 : 5200, t);
  lp.frequency.exponentialRampToValueAtTime(400, t + 0.18);
  const env = ctx.createGain();
  env.gain.setValueAtTime(1, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + (distance > 60 ? 0.5 : 0.28) * (heavy ? 2.6 : 1));
  src.connect(lp).connect(env).connect(dest);
  src.start(t, Math.random() * 0.2, heavy ? 0.9 : 0.6);
  // low thump
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(heavy ? 110 : 140, t);
  o.frequency.exponentialRampToValueAtTime(heavy ? 30 : 45, t + (heavy ? 0.3 : 0.12));
  const og = ctx.createGain();
  og.gain.setValueAtTime(heavy ? 1 : 0.8, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.35 : 0.14));
  o.connect(og).connect(dest);
  o.start(t); o.stop(t + (heavy ? 0.36 : 0.15));
}

/** A short burst of filtered noise. */
function hiss(freq: number, dur: number, vol: number, delay = 0, type: BiquadFilterType = "bandpass") {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(vol, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(env).connect(master);
  src.start(t, Math.random() * 0.5, dur + 0.02);
}

/** Working the sniper's bolt: up, back, forward, down. */
export function bolt() {
  hiss(3200, 0.04, 0.35, 0.3);
  hiss(1800, 0.09, 0.3, 0.45);
  hiss(2200, 0.07, 0.3, 0.75);
  hiss(3600, 0.04, 0.35, 0.95);
}

/** A punch thrown. */
export const swing = () => hiss(700, 0.12, 0.25, 0, "lowpass");

/** Picking something up. */
export function pickup(kind: string) {
  if (kind === "pint" || kind === "fizz") {
    // glugs
    for (let i = 0; i < (kind === "fizz" ? 5 : 3); i++) beep(220 + i * 30, 0.08, 0.3, "sine", i * 0.13);
    if (kind === "fizz") hiss(6000, 0.5, 0.15, 0.1, "highpass");
  } else if (kind === "sniper") {
    hiss(2600, 0.05, 0.3); hiss(1400, 0.08, 0.3, 0.12); beep(660, 0.1, 0.2, "triangle", 0.25);
  } else {
    hiss(2400, 0.05, 0.3); beep(520, 0.06, 0.2, "square", 0.08);
  }
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
