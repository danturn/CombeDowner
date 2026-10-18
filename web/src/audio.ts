// Synthesised sound effects and music (Web Audio), so the game ships no sound files.
// The context can only start after a click, so call unlock() from one.
import { gore } from "./gore";
import { Soundtrack, TRACK_NAMES } from "./music";

let ctx: AudioContext | null = null;
let master: GainNode;
let dip: GainNode;      // sound effects and music, turned down while you're on the radio
let effects: GainNode;  // the sound effects volume
let sfxVolume = 1;
let button: GainNode;   // the radio's talk button, which stays at full volume
let air: GainNode;      // other people's radios: through the same thin, gritty sound as their voices
let carrierHiss: GainNode;   // the faint hiss under a transmission, while anyone is on the radio
let noise: AudioBuffer;
let reverb: ConvolverNode;
let music: GainNode | null = null;
let musicVolume = 0.6;
let voice: GainNode | null = null;
let voiceVolume = 1;
let soundtrack: Soundtrack | null = null;
let analyser: AnalyserNode | null = null;
const trackListeners: ((name: string) => void)[] = [];
let trackStart = 0;
let trackPlayed = 0;   // seconds of this track actually heard: it stands still while the music is muted
const played: string[] = [];   // tracks in the order they started, for "previous track"

/**
 * Glide one of a running sound's settings (an engine's pitch, its volume, which ear it's in) towards
 * v. Engines, the wind and a ride's wheels are set every frame, but most frames nothing has
 * changed: queueing a glide anyway, many thousand times a second across a street full of engines,
 * clogs up the sound's own timeline until it stutters and crackles. So a setting that's as good as
 * where it's already heading is left alone.
 */
const heading = new WeakMap<AudioParam, number>();
export function glide(p: AudioParam, v: number, t: number, ease: number) {
  const was = heading.get(p);
  if (was !== undefined && Math.abs(v - was) <= Math.abs(was) * 0.005 + 1e-4) return;
  heading.set(p, v);
  p.setTargetAtTime(v, t, ease);
}

/** Wake the sound up again if the browser has put it to sleep (a phone call, another app, the tab in the background). */
function wake() {
  if (ctx && ctx.state !== "running" && ctx.state !== "closed") ctx.resume().catch(() => {});
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
  addEventListener("pointerdown", wake, true);
  addEventListener("keydown", wake, true);
}

export function unlock() {
  if (ctx) { wake(); return; }
  // At 48 kHz, the rate voice chat always arrives at, so voices go straight in without being
  // resampled on the way (many Macs run their speakers at 44.1 kHz). Older browsers that can't, use their own.
  // A little more room in each slice of sound than the very least the browser can do ("balanced",
  // not "interactive"), so a busy moment on a slower machine doesn't starve it into crackles.
  try { ctx = new AudioContext({ sampleRate: 48000, latencyHint: "balanced" }); } catch { ctx = new AudioContext(); }
  ctx.onstatechange = wake;
  // everything comes out through one limiter, so the effects, the music and the voices added
  // together never clip into a crunch however busy it gets
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -2; limit.knee.value = 0; limit.ratio.value = 20;
  limit.attack.value = 0.002; limit.release.value = 0.15;
  limit.connect(ctx.destination);
  // sound effects go through a compressor, so a burst of gunfire doesn't clip
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -4; comp.knee.value = 3; comp.ratio.value = 12;
  comp.attack.value = 0.003; comp.release.value = 0.2;
  dip = ctx.createGain();
  dip.connect(limit);
  effects = ctx.createGain();
  effects.gain.value = sfxVolume;
  effects.connect(dip);
  comp.connect(effects);
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(comp);
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  reverb = ctx.createConvolver();
  reverb.buffer = streetEcho(ctx);
  reverb.connect(master);
  button = ctx.createGain();
  button.gain.value = master.gain.value * sfxVolume;
  button.connect(limit);

  music = ctx.createGain();
  music.gain.value = musicVolume;
  music.connect(dip);
  voice = ctx.createGain();
  voice.gain.value = voiceVolume;
  voice.connect(limit);
  air = ctx.createGain();
  const [airIn, airOut] = radioSound(ctx);
  air.connect(airIn);
  airOut.connect(voice);
  const hiss = ctx.createBufferSource();
  hiss.buffer = noise;
  hiss.loop = true;
  carrierHiss = ctx.createGain();
  carrierHiss.gain.value = 0;
  hiss.connect(carrierHiss).connect(air);
  hiss.start();
  // the visualiser listens before the volume control, so it still moves when the music is quiet
  const pre = ctx.createGain();
  pre.connect(music);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.6;
  pre.connect(analyser);
  const st = soundtrack = new Soundtrack(ctx, pre);
  const c = ctx;
  // report a new track when it actually starts playing, not when it is scheduled
  st.onTrack = (name, time) => setTimeout(() => {
    trackStart = time;
    trackPlayed = 0;
    if (played[played.length - 1] !== name) played.push(name);
    for (const f of trackListeners) f(name);
  }, Math.max(0, (time - c.currentTime) * 1000));
  // Schedule a second ahead so frame hitches never leave gaps; hidden tabs run timers late, so more there.
  let lastTick = performance.now();
  const tick = () => {
    const now = performance.now();
    if (musicVolume > 0) { if (trackStart > 0) trackPlayed += (now - lastTick) / 1000; st.scheduleUntil(c.currentTime + (document.hidden ? 2 : 1)); }
    lastTick = now;
  };
  tick();
  setInterval(tick, 100);
}

/**
 * The echo of a street: a few sharp early reflections off the house fronts, then a tail that
 * darkens as it dies away. Made once, as the impulse response for a convolver.
 */
function streetEcho(c: BaseAudioContext): AudioBuffer {
  const sr = c.sampleRate, len = Math.floor(sr * 1.8);
  const ir = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      lp += (Math.random() * 2 - 1 - lp) * (0.15 + 0.7 * Math.exp(-t * 4));
      d[i] = lp * Math.exp(-t * 3.4) * Math.min(1, t / 0.012) * 0.5;
    }
    for (const [at, g] of [[0.029, 0.6], [0.061, 0.42], [0.104, 0.3], [0.163, 0.2], [0.237, 0.12]])
      d[Math.floor((at + ch * 0.006) * sr)] += g * (Math.random() < 0.5 ? -1 : 1);
  }
  return ir;
}

/** How a voice sounds over the radio: thin and a little distorted. Returns [way in, way out]. */
export function radioSound(c: BaseAudioContext): [AudioNode, AudioNode] {
  const hp = c.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 400;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 2800;
  const drive = c.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = (i / 255) * 2 - 1; curve[i] = Math.tanh(v * 3) / Math.tanh(3); }
  drive.curve = curve;
  hp.connect(lp).connect(drive);
  return [hp, drive];
}

/** Skip to another track. */
export function nextTrack() { soundtrack?.nextTrack(); }

/** Go back to the track that played before this one (or the one before it in the list). */
export function previousTrack() {
  if (!soundtrack) return;
  const current = played.pop();
  const n = TRACK_NAMES.length;
  soundtrack.nextTrack(played.pop() ?? TRACK_NAMES[(TRACK_NAMES.indexOf(current ?? "") - 1 + n) % n]);
}

/** Hear about each new track as it starts. */
export function onTrackChange(f: (name: string) => void) { trackListeners.push(f); }

/** Seconds the current track has been playing. */
export const trackTime = () => (ctx && trackStart > 0 ? trackPlayed : 0);
/** The music before the volume control, for a visualiser (null until the music starts). */
export const musicAnalyser = () => analyser;
export const musicMuted = () => musicVolume === 0;

/** Music volume, 0 to 1. */
export function setMusicVolume(v: number) {
  musicVolume = v;
  if (music && ctx) { music.gain.cancelScheduledValues(ctx.currentTime); music.gain.setTargetAtTime(v, ctx.currentTime, 0.05); }
}

/**
 * Turn the sound effects and music down while you talk on the radio, so on speakers they don't
 * come through your mic. Other players' voices and the radio's own clicks stay as they are.
 */
export function dipForRadio(on: boolean) {
  if (!ctx) return;
  dip.gain.setTargetAtTime(on ? 0.15 : 1, ctx.currentTime, on ? 0.03 : 0.25);
}

/** Sound effects volume, 0 to 1: everything but the music and other players' voices. */
export function setSfxVolume(v: number) {
  sfxVolume = v;
  if (!ctx) return;
  effects.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  button.gain.setTargetAtTime(master.gain.value * v, ctx.currentTime, 0.05);
}
/** The sound effects volume, for the naughty boys, the posh lot and your own one-liners spoken out loud. */
export const effectsVolume = () => sfxVolume;

/** The audio context, once unlock() has made it. */
export const context = () => ctx;
/** Where other players' voices go (voice.ts), with its own volume. */
export const voiceOut = () => voice;

/** Voice chat volume, 0 to 1. */
export function setVoiceVolume(v: number) {
  voiceVolume = v;
  if (voice && ctx) voice.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

// ---- building blocks -------------------------------------------------------------------------
// Every sound is put together from a few pieces: bursts of filtered noise, tones that sweep in
// pitch, and small knocks of metal and plastic. Each one starts at an absolute time t on the audio
// clock, so a sound can lay out a little sequence (a reload, a bolt) all at once.

const now = () => ctx!.currentTime + 0.005;
/** A little wobble so no two shots, steps or clicks are quite the same. */
const vary = (by = 0.06) => 1 - by + Math.random() * by * 2;
/** Loudness that falls away with distance: full at 0, half at ref metres. */
const fall = (distance: number, ref: number) => ref / (ref + Math.max(0, distance));

/**
 * Where a sound goes: a gain at vol, muffled with distance (the highs go first), panned left or
 * right, and partly sent to the street reverb (wet). Returns the node to connect the sound to.
 */
function out(vol: number, pan = 0, distance = 0, wet = 0.12): GainNode {
  const c = ctx!;
  const g = c.createGain();
  g.gain.value = vol;
  let last: AudioNode = g;
  if (distance > 15) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.max(450, 20000 * Math.pow(15 / distance, 1.15));
    last = last.connect(lp);
  }
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan)) * 0.8;
  last.connect(p).connect(master);
  if (wet > 0) {
    const w = c.createGain();
    w.gain.value = wet;
    p.connect(w).connect(reverb);
  }
  return g;
}

interface BurstOpts { type?: BiquadFilterType; q?: number; to?: number; attack?: number }

/** Filtered noise with an attack and an exponential fade. to: the filter sweeps there over the burst. */
function burst(dest: AudioNode, t: number, dur: number, vol: number, freq: number, o: BurstOpts = {}) {
  const c = ctx!, attack = o.attack ?? 0.002;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(vol, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.005));
  src.connect(f).connect(env).connect(dest);
  const len = dur + attack + 0.03;
  src.start(t, Math.random() * Math.max(0, noise.duration - len), len);
}

/** A tone that sweeps from f0 to f1 and fades. */
function tone(dest: AudioNode, t: number, dur: number, vol: number, f0: number, f1 = f0, type: OscillatorType = "sine", attack = 0.002) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

/** Small bits of steel knocking together: a tick and a short, bright ring. */
function clink(dest: AudioNode, t: number, vol: number, freq = 3000) {
  burst(dest, t, 0.012, vol, freq, { q: 3 });
  tone(dest, t, 0.06, vol * 0.3, freq, freq * 0.985);
  tone(dest, t, 0.035, vol * 0.18, freq * 2.76, freq * 2.7);
}

/** Steel against polymer: a duller, woodier clack. */
function clack(dest: AudioNode, t: number, vol: number, freq = 1400) {
  burst(dest, t, 0.03, vol, freq, { q: 1.6 });
  tone(dest, t, 0.045, vol * 0.5, freq * 0.24, freq * 0.17, "triangle");
}

/** Metal sliding on metal: a short swish from one pitch to another. */
function slide(dest: AudioNode, t: number, dur: number, vol: number, from: number, to: number) {
  burst(dest, t, dur, vol, from, { q: 2.2, to, attack: dur * 0.45 });
}

/** A spent case bouncing on the ground. */
function casing(dest: AudioNode, t: number, vol: number) {
  const f = 4200 + Math.random() * 1600;
  clink(dest, t, vol, f);
  clink(dest, t + 0.07 + Math.random() * 0.03, vol * 0.5, f * 1.02);
  clink(dest, t + 0.13 + Math.random() * 0.04, vol * 0.25, f * 0.99);
}

/** Webbing, buckles and pouches jostling. */
function kit(dest: AudioNode, t: number, vol: number) {
  burst(dest, t, 0.12, vol, 1100, { type: "lowpass", attack: 0.03 });
  clink(dest, t + 0.01 + Math.random() * 0.03, vol * 0.25, 2200 + Math.random() * 1400);
  clink(dest, t + 0.05 + Math.random() * 0.04, vol * 0.15, 2600 + Math.random() * 1400);
}

/** A stretch of sounds that can be cut short (a reload you abandon by switching weapons). */
export interface Playing { stop(): void }
function sequence(vol: number): [GainNode, Playing] {
  const c = ctx!, g = out(vol, 0, 0, 0.06);
  return [g, { stop: () => g.gain.setTargetAtTime(0, c.currentTime, 0.015) }];
}
const SILENT: Playing = { stop() {} };

// ---- guns ------------------------------------------------------------------------------------

/**
 * Gunshot. distance in metres and pan -1..1 place remote shots; heavy is the sniper's crack.
 * Far shots arrive late (sound travels 343 m a second), duller, and mostly echo off the houses.
 */
export function shot(distance = 0, pan = 0, heavy = false) {
  if (!ctx) return;
  if (!gore()) { paintShot(distance, pan, heavy); return; }
  if (heavy) { sniperShot(distance, pan); return; }
  const near = distance <= 1, j = vary(0.05);
  const t = now() + (near ? 0 : distance / 343);
  const vol = near ? 2.1 : Math.min(0.75, 20 / (distance + 12));
  const wet = near ? 0.3 : Math.min(1, 0.4 + distance / 160);
  const dest = out(vol, pan, distance, wet);
  // the crack of the round going supersonic: sharp, and only up close
  if (distance < 90) burst(dest, t, 0.022, 1.2 * (1 - distance / 90), 3200 * j, { type: "highpass", q: 0.7 });
  // the blast
  burst(dest, t, 0.26 * (near ? 1 : 1.5), 1, 6800 * j, { type: "lowpass", to: 420, q: 0.9 });
  burst(dest, t, 0.06, 0.55, 1700 * j, { q: 1.2 });
  // the thump in your chest
  tone(dest, t, 0.13, 0.8, 150 * j, 44);
  // your own rifle's action cycling
  if (near) clink(dest, t + 0.028, 0.07, 3400 * j);
  if (near && Math.random() < 0.35) casing(out(0.25, 0.3, 0, 0.05), t + 0.32 + Math.random() * 0.2, 0.12);
}

/**
 * The sniper rifle: an enormous, splitting crack you hear from across the village, a bright
 * blast, and the echo rolling back off the hills. Fired yourself, it leaves your ears ringing
 * and the music knocked flat for a moment.
 */
function sniperShot(distance: number, pan: number) {
  const near = distance <= 1, j = vary(0.04);
  const t = now() + (near ? 0 : distance / 343);
  const vol = near ? 3 : Math.min(1.4, 70 / (distance + 20));
  const dest = out(vol, pan, distance * 0.6, near ? 0.8 : Math.min(1.4, 0.7 + distance / 200));
  // the crack: a hard click, then a split second of searing high noise
  const crack = Math.max(0, 1 - distance / 300);
  if (crack > 0) {
    burst(dest, t, 0.006, 2.2 * crack, 6000, { type: "highpass", q: 0.5 });
    burst(dest, t, 0.07, 1.8 * crack, 2600 * j, { type: "highpass", q: 0.6 });
    burst(dest, t, 0.05, 1.2 * crack, 4800 * j, { q: 0.8 });
  }
  // the blast: bright, and loud all the way down
  burst(dest, t, 0.4 * (near ? 1 : 1.4), 1.6, 9500 * j, { type: "lowpass", to: 500, q: 0.7 });
  burst(dest, t, 0.18, 0.9, 1800 * j, { q: 0.8 });
  tone(dest, t, 0.18, 0.7, 130 * j, 40);
  // the echo rolling back off the hills, then a slap off the houses or two
  burst(dest, t + 0.06, 1.8, 0.45, 1400, { type: "lowpass", to: 160, attack: 0.15 });
  for (const [at, v, f] of [[0.33, 0.45, 2200], [0.71, 0.3, 1600], [1.15, 0.18, 1100]])
    burst(dest, t + at * vary(0.08), 0.22, v, f, { q: 0.7, to: f * 0.4, attack: 0.02 });
  if (!near) return;
  // ears ringing
  tone(master, t + 0.05, 1.6, 0.025, 3900 * j, 3700 * j, "sine", 0.1);
  // the music knocked back while your ears recover
  if (music && musicVolume > 0) {
    music.gain.cancelScheduledValues(t);
    music.gain.setValueAtTime(musicVolume * 0.2, t);
    music.gain.setTargetAtTime(musicVolume, t + 0.3, 0.5);
  }
}

/**
 * A paintball marker going off: a hollow pneumatic thwop and a hiss of air, nothing like as loud
 * as a rifle and gone in a few streets. heavy is the long marker, a deeper thump.
 */
function paintShot(distance: number, pan: number, heavy: boolean) {
  if (distance > 220) return;
  const near = distance <= 1, j = vary(0.06);
  const t = now() + (near ? 0 : distance / 343);
  const vol = (near ? 1.3 : Math.min(0.6, 12 / (distance + 10))) * (heavy ? 1.25 : 1);
  const dest = out(vol, pan, distance, near ? 0.12 : Math.min(0.6, 0.2 + distance / 200));
  const f = heavy ? 0.75 : 1;
  // the pop of the air behind the ball
  tone(dest, t, 0.07, 0.9, 330 * j * f, 120 * f, "triangle");
  burst(dest, t, 0.05, 0.8, 900 * j * f, { q: 1.4, to: 500 * f });
  // the hollow body of the marker ringing for a moment
  tone(dest, t + 0.004, 0.05, 0.25, 760 * j * f, 690 * f);
  // the hiss of gas out of the barrel, and the bolt knocking back
  burst(dest, t, heavy ? 0.16 : 0.11, 0.3, 5200 * j, { type: "highpass", q: 0.6, attack: 0.008 });
  if (near) clack(dest, t + 0.02, 0.18, 1800 * j);
}

/** A paintball bursting on something: a wet slap, flatter on the ground, and a smack on a person. */
function splat(dest: AudioNode, t: number, kind: Surface, heavy: boolean) {
  const j = vary(0.12), v = heavy ? 1.2 : 1;
  burst(dest, t, 0.06, 0.9 * v, 1300 * j, { type: "lowpass", q: 0.8 });
  burst(dest, t, 0.035, 0.5 * v, kind === "ground" ? 1800 * j : 2600 * j, { q: 2 });
  burst(dest, t + 0.012, 0.09, 0.25 * v, 3800 * j, { type: "highpass", attack: 0.01 });   // the spray
  if (kind === "body") tone(dest, t, 0.06, 0.45 * v, 180 * j, 110);
}

/** Working the sniper's bolt: up, back (the case flies out), forward, down. */
export function bolt() {
  if (!ctx) return;
  const t = now(), d = out(0.75, 0.15, 0, 0.08);
  clink(d, t + 0.3, 0.3, 2400); clack(d, t + 0.31, 0.25, 1100);           // up
  slide(d, t + 0.42, 0.11, 0.45, 1500, 2600); clink(d, t + 0.53, 0.25, 3200);   // back, against the stop
  casing(out(0.25, 0.4, 0, 0.05), t + 0.95, 0.14);
  slide(d, t + 0.72, 0.1, 0.45, 2700, 1700); clack(d, t + 0.82, 0.35, 1300);    // forward, round chambered
  clink(d, t + 0.95, 0.4, 2800); clack(d, t + 0.96, 0.3, 900);             // down and locked
}

/** The rifle's bolt locking back on the last round. */
export function lastRound() {
  if (!ctx) return;
  const t = now(), d = out(0.6, 0.1, 0, 0.05);
  clink(d, t + 0.035, 0.22, 3900);
  clack(d, t + 0.04, 0.15, 1500);
}

/** Pulling the trigger on an empty chamber: the hammer falls on nothing. */
export function dryFire() {
  if (!ctx) return;
  const t = now(), j = vary(), d = out(3, 0.1, 0, 0.04);
  clink(d, t, 0.12, 3600 * j);           // trigger
  clink(d, t + 0.012, 0.3, 1900 * j);    // hammer
  clack(d, t + 0.014, 0.2, 800 * j);
}

/** Reloading. The rifle swaps its magazine and works the charging handle; the sniper opens its bolt for a fresh magazine. */
export function reload(kind: "rifle" | "sniper" = "rifle"): Playing {
  if (!ctx) return SILENT;
  const t = now();
  const [d, playing] = sequence(0.75);
  if (kind === "rifle") {
    clink(d, t + 0.1, 0.3, 2900);                       // mag release
    slide(d, t + 0.16, 0.12, 0.4, 2000, 1100);          // old mag out
    burst(d, t + 0.3, 0.22, 0.12, 900, { type: "lowpass", attack: 0.06 });   // hand to the pouch
    slide(d, t + 0.82, 0.1, 0.35, 1100, 1900);          // new mag in
    clack(d, t + 0.93, 0.6, 1300); clink(d, t + 0.935, 0.3, 3100);   // seated
    slide(d, t + 1.38, 0.09, 0.4, 1600, 2800);          // charging handle back
    clink(d, t + 1.47, 0.25, 3500);
    clack(d, t + 1.6, 0.7, 1500); clink(d, t + 1.6, 0.4, 2400); tone(d, t + 1.6, 0.06, 0.3, 190, 120);   // bolt slams home
  } else {
    clink(d, t + 0.12, 0.3, 2400); slide(d, t + 0.22, 0.12, 0.45, 1500, 2600);   // bolt up and back
    clink(d, t + 0.34, 0.25, 3200);
    clink(d, t + 0.6, 0.25, 2600); slide(d, t + 0.66, 0.14, 0.4, 1800, 1000);   // mag out
    burst(d, t + 0.85, 0.25, 0.12, 900, { type: "lowpass", attack: 0.07 });
    slide(d, t + 1.4, 0.12, 0.35, 1000, 1700);           // new mag in
    clack(d, t + 1.53, 0.65, 1200); clink(d, t + 1.535, 0.3, 2900);
    slide(d, t + 1.95, 0.11, 0.45, 2700, 1700); clack(d, t + 2.06, 0.4, 1300);   // bolt forward
    clink(d, t + 2.22, 0.45, 2800); clack(d, t + 2.23, 0.35, 900);   // and down
  }
  return playing;
}

/** Bringing a weapon up: a rustle of sleeve, and the gun settling into your hands. */
export function equip(kind: string) {
  if (!ctx) return;
  const t = now(), d = out(1.1, 0.1, 0, 0.04);
  burst(d, t, 0.2, 0.3, 1000, { type: "lowpass", attack: 0.07 });
  if (kind === "fists") { burst(d, t + 0.2, 0.05, 0.6, 700, { type: "lowpass" }); return; }
  clack(d, t + 0.19, 0.4, kind === "sniper" ? 1000 : 1300);
  clink(d, t + 0.23, 0.18, kind === "sniper" ? 2300 : 2900);
}

/** A punch thrown: air pushed aside. */
export function swing() {
  if (!ctx) return;
  const t = now(), d = out(0.8, 0.15, 0, 0.03);
  burst(d, t, 0.15, 0.5, 450 * vary(), { q: 1.1, to: 1500, attack: 0.07 });
}

/** A punch landing: a dull thud and a slap. distance in metres and pan -1..1 place it. */
export function punch(distance = 0, pan = 0) {
  if (!ctx || distance > 60) return;
  const t = now(), j = vary();
  const dest = out(Math.min(1.6, 16 / (distance + 6)), pan, distance, 0.1);
  tone(dest, t, 0.12, 0.9, 120 * j, 50);
  burst(dest, t, 0.05, 0.6, 1800 * j);
  burst(dest, t, 0.09, 0.35, 600 * j, { type: "lowpass" });
}

/** A boot into a rugby ball, or the ball bouncing (quieter): a deep, hollow thump. */
export function kick(distance = 0, pan = 0, vol = 1) {
  if (!ctx || distance > 80 || vol < 0.05) return;
  const t = now(), j = vary();
  const d = out(vol * Math.min(1.4, 14 / (distance + 6)), pan, distance, 0.15);
  tone(d, t, 0.14, 0.9, 150 * j, 70);
  tone(d, t, 0.09, 0.25, 330 * j, 290 * j, "triangle");   // the ring of the bladder
  burst(d, t, 0.04, 0.5, 900 * j, { q: 0.8 });
}

/** A cricket ball let go: a whip of the arm through the air. */
export function bowl(distance = 0, pan = 0) {
  if (!ctx || distance > 50) return;
  const t = now(), d = out(0.6 * fall(distance, 8), pan, distance, 0.08);
  burst(d, t, 0.18, 0.4, 700 * vary(), { q: 1.4, to: 2200, attack: 0.08 });
}

/** Stumps knocked over: wood on leather, then wood on wood as the bails go. */
export function stumps(distance = 0, pan = 0) {
  if (!ctx || distance > 120) return;
  const t = now(), d = out(Math.min(1.3, 20 / (distance + 8)), pan, distance, 0.2);
  clack(d, t, 0.9, 1100);
  tone(d, t, 0.08, 0.4, 260, 180, "triangle");
  for (let i = 0; i < 4; i++) clack(d, t + 0.05 + i * 0.06 + Math.random() * 0.03, 0.5 - i * 0.08, 1500 + Math.random() * 900);
}

/** The ball off a goalpost: a knock and a hollow ring. */
export function post(distance = 0, pan = 0) {
  if (!ctx || distance > 100) return;
  const t = now(), d = out(Math.min(1.2, 20 / (distance + 10)), pan, distance, 0.25);
  clack(d, t, 0.7, 900);
  tone(d, t, 0.7, 0.18, 510, 505);
  tone(d, t, 0.45, 0.08, 1370, 1360);
}

/** The referee's whistle: a pea whistle's warbling blast. */
export function whistle(distance = 0, pan = 0) {
  if (!ctx || distance > 200) return;
  const c = ctx, t = now(), dur = 0.75;
  const d = out(0.35 * fall(distance, 40), pan, distance, 0.25);
  const o = c.createOscillator(), lfo = c.createOscillator(), depth = c.createGain(), g = c.createGain();
  o.frequency.value = 2900;
  lfo.type = "square";
  lfo.frequency.value = 26;
  depth.gain.value = 140;
  lfo.connect(depth).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.02);
  g.gain.setValueAtTime(0.5, t + dur - 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(d);
  burst(d, t, dur, 0.06, 3000, { type: "highpass", attack: 0.02 });   // breath
  o.start(t); lfo.start(t);
  o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
}

type Surface = "building" | "barrier" | "tree" | "ground" | "body";

/** A round arriving: brick chips, a thwack of wood, a puff of dirt or a hit on a body. Sometimes it whines off. A paintball just splats. */
export function impact(kind: Surface, distance: number, pan = 0, heavy = false, paintball = false) {
  if (!ctx || distance > 150) return;
  const t = now() + distance / 343, j = vary(0.1);
  const d = out(Math.min(1, 14 / (distance + 9)) * (heavy ? 1.4 : 1), pan, distance, 0.2);
  if (paintball) splat(d, t, kind, heavy);
  else if (kind === "body") {
    burst(d, t, 0.09, 0.9, 850 * j, { type: "lowpass" });
    tone(d, t, 0.09, 0.7, 115 * j, 60);
    burst(d, t, 0.03, 0.4, 2300 * j);
  } else if (kind === "tree") {
    tone(d, t, 0.08, 0.6, 360 * j, 290, "triangle");
    burst(d, t, 0.06, 0.7, 950 * j, { q: 4 });
    burst(d, t + 0.01, 0.05, 0.25, 3200 * j, { type: "highpass" });
  } else if (kind === "ground") {
    burst(d, t, 0.12, 1.4, 650 * j, { type: "lowpass" });
    burst(d, t, 0.16, 0.35, 3500 * j, { attack: 0.02, q: 0.6 });
  } else {
    burst(d, t, 0.045, 1, 2600 * j, { q: 1.4 });
    burst(d, t + 0.005, 0.11, 0.3, 5200 * j, { type: "highpass" });
    for (let k = 0; k < 2; k++) clink(d, t + 0.05 + Math.random() * 0.18, 0.04, 2500 + Math.random() * 2500);
    if (Math.random() < 0.2) ricochet(d, t + 0.01);
  }
}

/** The whine of a round glancing off. */
function ricochet(dest: AudioNode, t: number) {
  const c = ctx!, f = 2400 + Math.random() * 1800;
  const o = c.createOscillator();
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.38, t + 0.45);
  const wob = c.createOscillator(), wg = c.createGain();
  wob.frequency.value = 28 + Math.random() * 20;
  wg.gain.value = f * 0.03;
  wob.connect(wg).connect(o.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + 0.5); wob.start(t); wob.stop(t + 0.5);
}

/** A round passing close by: a snap and a rush of air. miss is how close it came, in metres. */
export function whiz(miss: number, pan = 0, heavy = false) {
  if (!ctx || miss > 5) return;
  const t = now(), d = out(2.5 * (1 - miss / 6) * (heavy ? 1.3 : 1), pan, 0, 0.1);
  burst(d, t, 0.018, 0.8, 3000, { type: "highpass" });
  burst(d, t, 0.16, 0.45, 2200, { q: 1.1, to: 650, attack: 0.03 });
}

// ---- vehicles --------------------------------------------------------------------------------

/** A running engine and its horn, kept going and changed as it goes. extra: the siren or the chimes, if it has them. */
export interface Engine { set(rpm: number, gas: number, horn: boolean, distance: number, pan: number, extra?: boolean): void; stop(): void }

/**
 * The bus's lumpy diesel, the four-pots, the Robin's thin little 850, and the whine of an electric
 * motor (a milk float, a C5), which is silent standing still. Pitches in Hz, idle to red line.
 */
const ENGINES = {
  diesel: { lo: 26, hi: 80, cut: [320, 1300], vol: 0.55, sub: 0.7, hiss: 0.5, hissAt: 500, horn: [300, 372], wave: "sawtooth", idle: 0.45 },
  petrol: { lo: 30, hi: 190, cut: [600, 3200], vol: 0.38, sub: 0.6, hiss: 0.22, hissAt: 1400, horn: [415, 520], wave: "sawtooth", idle: 0.45 },
  tinny: { lo: 38, hi: 225, cut: [900, 3800], vol: 0.32, sub: 0.25, hiss: 0.25, hissAt: 1800, horn: [640], wave: "sawtooth", idle: 0.45 },
  electric: { lo: 90, hi: 1100, cut: [1500, 4000], vol: 0.16, sub: 0, hiss: 0.15, hissAt: 2500, horn: [880], wave: "triangle", idle: 0 },
  // a narrowboat's old single-cylinder diesel: you can count the beats
  boat: { lo: 7, hi: 16, cut: [160, 520], vol: 0.6, sub: 0.9, hiss: 0.12, hissAt: 300, horn: [330], wave: "sawtooth", idle: 0.45 },
  // an InterCity 125's Paxman Valenta, the whine and all, and its two-note horn
  hst: { lo: 70, hi: 150, cut: [900, 4200], vol: 0.7, sub: 0.5, hiss: 0.8, hissAt: 3000, horn: [311, 370], wave: "sawtooth", idle: 0.45 },
  // a Sprinter's underfloor diesel
  dmu: { lo: 40, hi: 110, cut: [500, 2200], vol: 0.55, sub: 0.6, hiss: 0.4, hissAt: 1400, horn: [349, 440], wave: "sawtooth", idle: 0.45 },
} as const;
export type EngineKind = keyof typeof ENGINES;

/** Greensleeves, as an ice cream van plays it: [semitones above A4, eighths]. */
const GREENSLEEVES = [
  [0, 1], [3, 2], [5, 1], [7, 1.5], [8, 0.5], [7, 1], [5, 2], [2, 1], [-2, 1.5], [0, 0.5], [2, 1], [3, 2], [0, 1], [0, 1.5], [-1, 0.5], [0, 1], [2, 2], [-1, 1], [-5, 2], [0, 1],
  [3, 2], [5, 1], [7, 1.5], [8, 0.5], [7, 1], [5, 2], [2, 1], [-2, 1.5], [0, 0.5], [2, 1], [3, 1.5], [2, 0.5], [0, 1], [-1, 1.5], [-3, 0.5], [-1, 1], [0, 3], [0, 3],
];

/** Start an engine (null before sound is unlocked). Call set() every frame, and stop() when it's done. */
export function engine(kind: EngineKind, extra?: "siren" | "chimes"): Engine | null {
  if (!ctx) return null;
  const c = ctx, E = ENGINES[kind];
  const panner = c.createStereoPanner();
  panner.connect(master);
  const muffle = c.createBiquadFilter();
  muffle.type = "lowpass"; muffle.frequency.value = 20000;
  muffle.connect(panner);
  const vol = c.createGain();
  vol.gain.value = 0;
  vol.connect(muffle);
  const tonef = c.createBiquadFilter();
  tonef.type = "lowpass"; tonef.Q.value = 2;
  tonef.connect(vol);
  // the firing pulses: a buzzy saw, a square an octave down for the rumble, and some mechanical noise
  const saw = c.createOscillator(), sub = c.createOscillator();
  saw.type = E.wave; sub.type = "square";
  const sg = c.createGain();
  sg.gain.value = E.sub;
  saw.connect(tonef); sub.connect(sg).connect(tonef);
  const hiss = c.createBufferSource();
  hiss.buffer = noise; hiss.loop = true;
  const hf = c.createBiquadFilter();
  hf.type = "bandpass"; hf.frequency.value = E.hissAt; hf.Q.value = 0.8;
  const hg = c.createGain();
  hg.gain.value = E.hiss;
  hiss.connect(hf).connect(hg).connect(tonef);
  // the horn: square waves through a little speaker
  const hornG = c.createGain();
  hornG.gain.value = 0;
  const hb = c.createBiquadFilter();
  hb.type = "bandpass"; hb.frequency.value = 1100; hb.Q.value = 0.7;
  hornG.connect(hb).connect(muffle);
  const horns = E.horn.map((f) => { const o = c.createOscillator(); o.type = "square"; o.frequency.value = f; o.connect(hornG); return o; });
  const all: AudioScheduledSourceNode[] = [saw, sub, hiss, ...horns];
  // a police two-tone, nee-naw: a square wave flipping between two notes
  const extraG = c.createGain();
  extraG.gain.value = 0;
  extraG.connect(muffle);
  if (extra === "siren") {
    const o = c.createOscillator(), lfo = c.createOscillator(), depth = c.createGain(), f = c.createBiquadFilter();
    o.type = "square"; o.frequency.value = 544;
    lfo.type = "square"; lfo.frequency.value = 0.9;
    depth.gain.value = 78;
    lfo.connect(depth).connect(o.frequency);
    f.type = "bandpass"; f.frequency.value = 1300; f.Q.value = 0.6;
    o.connect(f).connect(extraG);
    all.push(o, lfo);
  }
  let note = 0, noteAt = 0;   // the chimes: where we are in the tune, and when the next note is due
  all.forEach((o) => o.start());
  let stopped = false;
  return {
    set(rpm, gas, horn, distance, pan, on = false) {
      if (stopped) return;
      const t = c.currentTime, f = E.lo + (E.hi - E.lo) * rpm;
      glide(saw.frequency, f, t, 0.05);
      glide(sub.frequency, f / 2, t, 0.05);
      glide(tonef.frequency, E.cut[0] + (E.cut[1] - E.cut[0]) * (rpm * 0.6 + gas * 0.4), t, 0.05);
      // an electric motor makes no sound standing still
      const run = E.idle ? 0.45 + 0.35 * rpm + 0.2 * gas : Math.max(0, rpm - 0.2) * 1.25 + gas * 0.15;
      // road and canal engines die away fast (a car a street off is a murmur); trains carry
      const away = kind === "hst" || kind === "dmu" ? fall(distance, 8) : 0.7 * fall(distance, 6) ** 2;
      glide(vol.gain, E.vol * run * away, t, 0.05);
      glide(muffle.frequency, distance > 15 ? Math.max(450, 20000 * Math.pow(15 / distance, 1.15)) : 20000, t, 0.1);
      glide(panner.pan, Math.max(-1, Math.min(1, pan)) * 0.8, t, 0.05);
      glide(hornG.gain, horn ? 0.3 * fall(distance, 12) : 0, t, 0.01);
      // sirens and chimes carry: they're meant to be heard streets away
      glide(extraG.gain, on ? (extra === "siren" ? 0.32 : 0.5) * fall(distance, 40) : 0, t, 0.03);
      if (extra === "chimes" && on) {
        if (noteAt < t) noteAt = t + 0.05;
        // a slightly wonky music box: each note a bright triangle with a fifth over it, decaying
        while (noteAt < t + 0.3) {
          const [semi, len] = GREENSLEEVES[note];
          const hz = 440 * Math.pow(2, semi / 12) * (1 + (Math.random() - 0.5) * 0.01), d = len * 0.2;
          tone(extraG, noteAt, d * 0.95, 0.5, hz, hz, "triangle", 0.004);
          tone(extraG, noteAt, d * 0.6, 0.12, hz * 3, hz * 3, "sine", 0.004);
          noteAt += d;
          note = (note + 1) % GREENSLEEVES.length;
        }
      } else noteAt = 0;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = c.currentTime;
      vol.gain.setTargetAtTime(0, t, 0.08);
      hornG.gain.setTargetAtTime(0, t, 0.02);
      extraG.gain.setTargetAtTime(0, t, 0.05);
      all.forEach((o) => o.stop(t + 0.6));
      setTimeout(() => panner.disconnect(), 800);
    },
  };
}

/** Water rushing through a lock's paddles, for as long as it runs. Call set() every frame, and stop() when it's done. */
export function rush(): { set(vol: number, distance: number, pan: number): void; stop(): void } | null {
  if (!ctx) return null;
  const c = ctx, src = c.createBufferSource();
  src.buffer = noise; src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 1400;
  const bp = c.createBiquadFilter();
  bp.type = "peaking"; bp.frequency.value = 380; bp.gain.value = 8;
  const g = c.createGain();
  g.gain.value = 0;
  const p = c.createStereoPanner();
  src.connect(lp).connect(bp).connect(g).connect(p).connect(master);
  src.start();
  let stopped = false;
  return {
    set(vol, distance, pan) {
      if (stopped) return;
      const t = c.currentTime;
      glide(g.gain, 0.5 * vol * fall(distance, 10), t, 0.2);
      glide(lp.frequency, distance > 15 ? Math.max(400, 1400 * Math.pow(15 / distance, 0.8)) : 1400, t, 0.2);
      glide(p.pan, Math.max(-1, Math.min(1, pan)) * 0.8, t, 0.05);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      g.gain.setTargetAtTime(0, c.currentTime, 0.2);
      src.stop(c.currentTime + 1.2);
      setTimeout(() => p.disconnect(), 1500);
    },
  };
}

/**
 * Riding along: the wind past your ears, rising and brightening with speed (0..1), the wheels
 * rumbling on the road (roll 0..1, rough for grass and paths), and the scrape of a grind (0..1).
 * All from one loop of noise. Call set() every frame, and stop() when you get off.
 */
export function rideNoise(): { set(wind: number, roll: number, rough: number, grind: number): void; stop(): void } | null {
  if (!ctx) return null;
  const c = ctx, src = c.createBufferSource();
  src.buffer = noise; src.loop = true;
  const branch = (type: BiquadFilterType, f: number, q: number) => {
    const filter = c.createBiquadFilter();
    filter.type = type; filter.frequency.value = f; filter.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(filter).connect(g).connect(master);
    return [filter, g] as const;
  };
  const [windF, windG] = branch("bandpass", 500, 0.6);
  const [, rollG] = branch("lowpass", 180, 0.7);
  const [grindF, grindG] = branch("bandpass", 2600, 4);
  src.start();
  let stopped = false;
  return {
    set(wind, roll, rough, grind) {
      if (stopped) return;
      const t = c.currentTime;
      glide(windG.gain, 0.32 * wind * wind, t, 0.15);
      glide(windF.frequency, 400 + 1400 * wind, t, 0.2);
      glide(rollG.gain, roll * (0.25 + rough * 0.5), t, 0.08);
      glide(grindG.gain, 0.16 * grind, t, 0.03);
      if (grind > 0.01) glide(grindF.frequency, 2200 + Math.random() * 900, t, 0.02);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      for (const g of [windG, rollG, grindG]) g.gain.setTargetAtTime(0, c.currentTime, 0.1);
      src.stop(c.currentTime + 0.8);
    },
  };
}

/** A crate of milk bottles going over: a dozen bottles smashing. */
export function bottles(distance = 0, pan = 0) {
  if (!ctx || distance > 80) return;
  const t = now(), d = out(Math.min(1.2, 14 / (distance + 8)), pan, distance, 0.25);
  burst(d, t, 0.25, 0.7, 3500, { type: "highpass" });
  for (let k = 0; k < 14; k++) {
    const at = t + Math.random() * 0.45, f = 2500 + Math.random() * 4500;
    clink(d, at, 0.08 + Math.random() * 0.1, f);
    burst(d, at, 0.06, 0.25, f * 1.4, { q: 2 });
  }
}

/** A vehicle hitting something. force 0..1: a thud and a crunch, and bits of trim and glass. */
export function crash(force: number, distance = 0, pan = 0) {
  if (!ctx || distance > 120) return;
  const t = now(), j = vary();
  const d = out(Math.min(1.6, 0.5 + force) * Math.min(1, 14 / (distance + 8)), pan, distance, 0.2);
  tone(d, t, 0.25, 0.9, 90 * j, 40);
  burst(d, t, 0.3, 0.8, 700 * j, { type: "lowpass" });
  burst(d, t, 0.2, 0.5, 2400 * j, { q: 0.8 });
  for (let k = 0; k < 2 + force * 6; k++) clink(d, t + 0.02 + Math.random() * 0.25, 0.04 + 0.08 * force, 1800 + Math.random() * 3200);
}

/** A car going up: a deep thump, a roar that rolls off down the street, and bits coming down after. */
export function boom(distance = 0, pan = 0) {
  if (!ctx || distance > 500) return;
  const t = now(), j = vary();
  const d = out(Math.min(1.8, 30 / (distance + 12)), pan, distance, 0.45);
  tone(d, t, 1.1, 1.2, 70 * j, 26);
  tone(d, t, 0.45, 0.6, 150 * j, 45, "triangle");
  burst(d, t, 1.7, 1.0, 1000 * j, { type: "lowpass", to: 110 });
  burst(d, t, 0.4, 0.7, 2600 * j, { q: 0.6, to: 500 });
  for (let k = 0; k < 9; k++) clink(d, t + 0.45 + Math.random() * 1.2, 0.04 + Math.random() * 0.06, 1400 + Math.random() * 3000);
}

/** A bundle of firewood thrown on the bonfire (bonfire.ts): a hollow wooden clatter. */
export function woodStack(distance = 0, pan = 0) {
  if (!ctx || distance > 60) return;
  const t = now(), d = out(1.1 * fall(distance, 8), pan, distance, 0.15);
  for (let k = 0; k < 6; k++) clack(d, t + k * 0.05 + Math.random() * 0.04, 0.35 - k * 0.04, 500 + Math.random() * 500);
  tone(d, t, 0.15, 0.4, 140, 80);
}

/** The bonfire crackling: a pop or two, and a hiss. */
export function crackle(distance = 0, pan = 0) {
  if (!ctx || distance > 70) return;
  const t = now(), d = out(0.5 * fall(distance, 6), pan, distance, 0.15);
  const n = 1 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k++) burst(d, t + Math.random() * 0.08, 0.02, 0.4 + Math.random() * 0.4, 1500 + Math.random() * 3000, { q: 1.5 });
  if (Math.random() < 0.3) burst(d, t, 0.4, 0.06, 5000, { type: "highpass", attack: 0.1 });
}

/** A rocket going up: a rising whoosh. */
export function rocket(distance = 0, pan = 0) {
  if (!ctx || distance > 600) return;
  const t = now(), d = out(0.7 * Math.min(1, 25 / (distance + 10)), pan, distance, 0.3);
  burst(d, t, 1.4, 0.35, 900, { q: 2, to: 4500, attack: 0.15 });
}

/** A firework bursting: a bang that rolls round the hills, and a crackle after for the long ones. */
export function bang(distance = 0, pan = 0, crackling = false) {
  if (!ctx || distance > 1500) return;
  const t = now(), j = vary();
  const d = out(Math.min(1.4, 45 / (distance + 20)), pan, distance, 0.55);
  tone(d, t, 0.6, 0.9, 85 * j, 30);
  burst(d, t, 1.2, 0.8, 1400 * j, { type: "lowpass", to: 150 });
  burst(d, t, 0.15, 0.5, 3200 * j, { q: 0.7 });
  if (crackling) for (let k = 0; k < 14; k++) burst(d, t + 0.4 + Math.random() * 1.6, 0.02, 0.15, 2500 + Math.random() * 3000, { q: 1.5 });
}

/** A car door shutting. */
export function door(distance = 0, pan = 0) {
  if (!ctx || distance > 40) return;
  const t = now(), d = out(0.9 * fall(distance, 6), pan, distance, 0.1);
  clack(d, t, 0.5, 900);
  tone(d, t, 0.12, 0.6, 110, 70);
  burst(d, t, 0.08, 0.4, 500, { type: "lowpass" });
}

// ---- the mines ---------------------------------------------------------------------------------

/** A hanging bell struck once: n picks the note (0 lowest). */
export function bell(n: number, distance = 0, pan = 0) {
  if (!ctx || distance > 60) return;
  const t = now(), f = [262, 330, 392, 523, 659][n % 5];
  const d = out(0.8 * fall(distance, 10), pan, distance, 0.45);
  // a bell's partials are not quite harmonic, which is what makes it sound like a bell
  for (const [m, v, dur] of [[0.5, 0.25, 3], [1, 0.5, 2.6], [1.19, 0.18, 1.6], [1.56, 0.14, 1.2], [2, 0.12, 1], [2.74, 0.06, 0.6]]) tone(d, t, dur, v, f * m);
  clink(d, t, 0.3, f * 6);
}

let fuzz: Float32Array<ArrayBuffer> | null = null;
/** A note on the heavenly guitar you get with the angel's wings (wings.ts): a screaming, fuzzed-up
 *  lead note at f (Hz), held for dur seconds, bent up bend semitones as it sounds, with vibrato on the
 *  long ones. Someone else's solo is heard distance away, pan left or right. */
export function guitarLead(f: number, dur = 0.22, bend = 0, distance = 0, pan = 0) {
  if (!ctx || distance > 120) return;
  const c = ctx, t = now(), d = out(0.22 * fall(distance, 15), pan, distance, 0.45);
  if (!fuzz) {
    fuzz = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const v = (i / 1023) * 2 - 1; fuzz[i] = Math.tanh(v * 9) / Math.tanh(9); }
  }
  const drive = c.createWaveShaper();
  drive.curve = fuzz;
  drive.oversample = "2x";
  const lp = c.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 3400; lp.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(1, t + 0.008);
  g.gain.setValueAtTime(1, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
  drive.connect(lp).connect(g).connect(d);
  const vib = c.createOscillator(), depth = c.createGain();
  vib.frequency.value = 6.2;
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(dur > 0.4 ? 35 : 0, t + Math.min(dur, 0.35));
  vib.connect(depth);
  for (const [det, type] of [[-6, "sawtooth"], [6, "square"]] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, bend / 12), t + Math.min(0.18, dur * 0.5));
    o.detune.value = det;
    depth.connect(o.detune);
    const pre = c.createGain();
    pre.gain.value = 0.5;
    o.connect(pre).connect(drive);
    o.start(t); o.stop(t + dur + 0.15);
  }
  vib.start(t); vib.stop(t + dur + 0.15);
}

/** A dead clang: a wrong bell, or a lock that won't turn. */
export function clunk(distance = 0, pan = 0) {
  if (!ctx || distance > 40) return;
  const t = now(), d = out(0.9 * fall(distance, 8), pan, distance, 0.3);
  tone(d, t, 0.5, 0.6, 140, 90, "triangle");
  burst(d, t, 0.2, 0.5, 600, { type: "lowpass" });
}

/** Stone grinding over stone: a block pushed, a secret door sinking. */
export function grind(distance = 0, pan = 0, dur = 0.8) {
  if (!ctx || distance > 50) return;
  const t = now(), d = out(fall(distance, 8), pan, distance, 0.3);
  burst(d, t, dur, 0.7, 220, { type: "lowpass", attack: 0.1 });
  burst(d, t, dur, 0.25, 900, { q: 0.7, to: 500, attack: 0.15 });
  for (let k = 0; k < 6; k++) clack(d, t + Math.random() * dur, 0.08, 500 + Math.random() * 500);
}

/** A click of a dial or a pressure plate going down. */
export function tick(distance = 0, pan = 0) {
  if (!ctx || distance > 30) return;
  const t = now(), d = out(0.7 * fall(distance, 5), pan, distance, 0.1);
  clink(d, t, 0.4, 2400);
  clack(d, t + 0.03, 0.3, 700);
}

/** The indicator's relay behind the dash, ticking as the lamps blink on and off. */
export function relay(on: boolean) {
  if (!ctx) return;
  // tick as they come on, a deeper tock as they go off: loud enough to hear over the engine
  const t = now(), d = out(1.0, 0, 0, 0.03);
  if (on) { clink(d, t, 0.55, 3400); clack(d, t + 0.004, 0.7, 1900); }
  else clack(d, t, 0.6, 1050);
}

/** The bell on a bus: someone wants the next stop. Ding ding. */
export function busBell() {
  if (!ctx) return;
  const t = now(), d = out(0.5, 0, 0, 0.15);
  for (const at of [0, 0.32]) {
    for (const [m, v, dur] of [[1, 0.5, 0.9], [2.76, 0.16, 0.4], [5.4, 0.06, 0.2]]) tone(d, t + at, dur, v, 1320 * m);
    clink(d, t + at, 0.25, 4000);
  }
}

/** The ticket machine by the driver: a fare, and the ticket torn off. */
export function ticket() {
  if (!ctx) return;
  const t = now(), d = out(0.5, 0, 0, 0.08);
  for (let k = 0; k < 4; k++) clack(d, t + k * 0.05, 0.22, 1800);
  burst(d, t + 0.24, 0.12, 0.25, 3200, { q: 0.8 });
}

/** The doors on a bus, folding open or shut with a hiss of air. */
export function busDoors() {
  if (!ctx) return;
  const t = now(), d = out(0.45, 0, 0, 0.12);
  burst(d, t, 0.5, 0.3, 2400, { q: 0.5 });
  clack(d, t + 0.45, 0.4, 600);
}

/** A stroke of the pump: a creak and a gush of water. */
export function pump(distance = 0, pan = 0) {
  if (!ctx || distance > 40) return;
  const t = now(), d = out(0.8 * fall(distance, 8), pan, distance, 0.3);
  tone(d, t, 0.25, 0.15, 300 * vary(), 220, "sawtooth", 0.05);
  burst(d, t + 0.15, 0.5, 0.5, 900, { type: "lowpass", attack: 0.08, to: 400 });
}

/** A gazer's or a wisp's bolt going off. */
export function zap(distance = 0, pan = 0) {
  if (!ctx || distance > 50) return;
  const t = now(), d = out(0.7 * fall(distance, 8), pan, distance, 0.25);
  tone(d, t, 0.35, 0.35, 1400, 180, "sawtooth");
  burst(d, t, 0.3, 0.3, 3000, { q: 2, to: 600 });
}

// ---- Bendy (bendy.ts) ------------------------------------------------------------------------

/** Bendy's voice: very low, out of a very long throat. */
const BENDY: Pipes = { pitch: 0.42, size: 1.7 };

/** Bendy has seen you: a screech that bends up and up, heard a long way off. */
export function screech(distance = 0, pan = 0) {
  if (!ctx || distance > 300) return;
  const t = now(), d = out(Math.min(0.45, 14 / (distance + 22)), pan, distance, 0.6);
  tone(d, t, 1.2, 0.22, 480, 1900, "sawtooth", 0.08);
  tone(d, t + 0.06, 1.1, 0.14, 730, 2700, "square", 0.12);
  burst(d, t, 1.1, 0.3, 2600, { q: 5, to: 5400, attack: 0.2 });
  say(d, t + 0.9, 0.7, ["a", "a", "o"], [170, 120, 80], 0.8, BENDY, 0.4);
}

/** Bendy sinking into the ground (out), or popping up out of it: a rubbery suck and a thump. */
export function blink(sinking: boolean, distance = 0, pan = 0) {
  if (!ctx || distance > 120) return;
  const t = now(), d = out(0.9 * fall(distance, 10), pan, distance, 0.35);
  if (sinking) {
    burst(d, t, 0.3, 0.7, 3600, { type: "lowpass", to: 200, attack: 0.04 });
    tone(d, t, 0.32, 0.45, 260, 40, "sine", 0.02);
  } else {
    burst(d, t, 0.28, 0.7, 200, { type: "lowpass", to: 4200, attack: 0.18 });
    tone(d, t + 0.2, 0.25, 0.7, 70, 32);
    tone(d, t, 0.22, 0.12, 300, 1600, "triangle", 0.15);
  }
}

/** Bendy's arm cracking like a whip. */
export function lash(distance = 0, pan = 0) {
  if (!ctx || distance > 80) return;
  const t = now(), d = out(0.9 * fall(distance, 8), pan, distance, 0.2);
  burst(d, t, 0.2, 0.5, 900, { q: 1.5, to: 4200, attack: 0.15 });
  burst(d, t + 0.19, 0.03, 1, 5200, { type: "highpass", q: 0.7 });
  tone(d, t + 0.19, 0.08, 0.3, 900, 300, "triangle");
}

/** Bendy hit: a deep grunt (pain), or his long dying wail. */
export function bellow(dying: boolean, distance = 0, pan = 0) {
  if (!ctx || distance > (dying ? 300 : 120)) return;
  const d = out(Math.min(0.4, 7 / (distance + 12)), pan, distance, 0.45), t = now() + 0.02;
  if (dying) {
    say(d, t, 1.6, ["a", "o", "oo", "oo"], [190, 150, 90, 45], 1, BENDY, 0.5);   // the noise behind a voice lasts 2 s
    tone(d, t, 2.4, 0.15, 900, 120, "sawtooth", 0.3);
  } else say(d, t, 0.2 + Math.random() * 0.1, ["u", "a"], [130, 90].map((x) => x * vary()), 1, BENDY, 0.4);
}

/** A puzzle solved: a low rumble and a rising chime. */
export function solved() {
  if (!ctx) return;
  const t = now(), d = out(0.7, 0, 0, 0.4);
  burst(d, t, 1.2, 0.6, 120, { type: "lowpass", attack: 0.2 });
  [392, 494, 587, 784].forEach((f, k) => tone(d, t + 0.15 + k * 0.12, 1.2, 0.18, f, f, "triangle"));
}

// ---- moving about ----------------------------------------------------------------------------

/** A footstep: a heel on tarmac and paving (hard), or a soft fall on grass. distance and pan place other people's. */
export function step(hard: boolean, vol: number, distance = 0, pan = 0) {
  if (!ctx || distance > 40) return;
  const t = now(), j = vary(0.12);
  const d = out(vol * 2.5 * fall(distance, 6), pan, distance, 0.04);
  if (hard) {
    burst(d, t, 0.035, 0.7, 1500 * j, { q: 1.3 });
    tone(d, t, 0.05, 0.45, 95 * j, 60);
    burst(d, t + 0.01, 0.07, 0.2, 4500 * j, { type: "highpass", attack: 0.012 });
  } else {
    burst(d, t, 0.1, 0.6, 1000 * j, { type: "lowpass", attack: 0.012 });
    burst(d, t, 0.13, 0.22, 3000 * j, { q: 0.7, attack: 0.03 });
    tone(d, t, 0.06, 0.4, 75 * j, 55);
  }
}

/** Pushing off for a jump: a scuff, a breath and your kit rattling. */
export function jump(hard: boolean) {
  if (!ctx) return;
  const t = now(), d = out(1.2, 0, 0, 0.04);
  step(hard, 0.3);
  kit(d, t + 0.02, 0.2);
  burst(d, t, 0.13, 0.1, 900, { q: 1.2, attack: 0.03 });   // the breath
}

/** Landing. force 0..1 is how hard: a thud, your kit, and a grunt if it was a long way down. */
/** A ladder running up a wall: its catches ratcheting past, quicker and quicker, and a clunk at the top. */
export function ladderUp(distance = 0, pan = 0) {
  if (!ctx || distance > 120) return;
  const t = now(), d = out(0.5 * fall(distance, 20), pan, distance, 0.15);
  for (let i = 0, at = 0; i < 12; i++, at += 0.11 - i * 0.006) clack(d, t + at, 0.35, 1500 + i * 60);
  clack(d, t + 1.05, 0.8, 800); clink(d, t + 1.07, 0.3, 1700);
}

/** A foot on an aluminium rung, climbing. */
export function rung() {
  if (!ctx) return;
  const d = out(0.35, 0, 0, 0.05);
  clink(d, now(), 0.25, 1600 + Math.random() * 300);
}

export function land(hard: boolean, force: number) {
  if (!ctx) return;
  const t = now(), d = out(0.6, 0, 0, 0.05);
  step(hard, 0.3 + force * 0.2);
  tone(d, t, 0.13, 0.4 + force * 0.3, 85, 40);
  burst(d, t, 0.14, 0.3 + force * 0.3, 420, { type: "lowpass" });
  kit(d, t + 0.015, 0.2 + force * 0.15);
  if (force > 0.65) say(out(0.3, 0, 0, 0.04), t + 0.02, 0.13, ["u", "u"], [120, 95], 1, YOU, 0.4);
}

// ---- voices ----------------------------------------------------------------------------------
// Shouts and grunts are a buzz (the vocal cords) and a hiss (breath) shaped by three resonances
// (formants) that glide from vowel to vowel, the way a mouth does.

type Vowel = keyof typeof VOWELS;
const VOWELS = {
  a: [730, 1090, 2440], u: [640, 1190, 2390], o: [570, 840, 2410], i: [390, 1990, 2550],
  e: [530, 1840, 2480], r: [490, 1350, 1690], w: [300, 610, 2200], y: [280, 2250, 2900], oo: [310, 870, 2250],
};
/** A voice: how high it is and how big the head it comes out of. */
interface Pipes { pitch: number; size: number }
const YOU: Pipes = { pitch: 0.9, size: 1 };
/** Every naughty boy (and player) gets a voice of their own from a number. */
function pipes(seed: number): Pipes {
  const r = (k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  return { pitch: 0.82 + r(1) * 0.4, size: 0.92 + r(2) * 0.16 };
}

/**
 * One syllable: vowels it glides through, a pitch contour, a loudness, and how breathy it is.
 * h: seconds of breath alone before the voice comes in (an h sound).
 */
function say(dest: AudioNode, t: number, dur: number, vowels: Vowel[], pitch: number[], vol: number, v: Pipes, breath = 0.12, h = 0) {
  const c = ctx!, start = t + h, end = start + dur;
  const at = (k: number, n: number) => start + (dur * 0.85 * k) / Math.max(1, n - 1);
  const mix = c.createGain();
  // the vocal cords: a buzz with a natural wobble
  const o = c.createOscillator();
  o.type = "sawtooth";
  pitch.forEach((p, k) => (k ? o.frequency.linearRampToValueAtTime(p * v.pitch, at(k, pitch.length)) : o.frequency.setValueAtTime(p * v.pitch, t)));
  const wob = c.createOscillator(), wg = c.createGain();
  wob.frequency.value = 5 + Math.random() * 2.5;
  wg.gain.value = pitch[0] * v.pitch * 0.025;
  wob.connect(wg).connect(o.frequency);
  const vg = c.createGain();
  vg.gain.setValueAtTime(0, t);
  vg.gain.setValueAtTime(0, start);
  vg.gain.linearRampToValueAtTime(1, start + 0.025);
  vg.gain.setValueAtTime(1, end - dur * 0.35);
  vg.gain.linearRampToValueAtTime(0, end);
  o.connect(vg).connect(mix);
  // breath: on its own for an h, then under the voice
  const n = c.createBufferSource();
  n.buffer = noise;
  const ng = c.createGain();
  ng.gain.setValueAtTime(h ? 0.7 : breath, t);
  ng.gain.linearRampToValueAtTime(breath, start + 0.03);
  ng.gain.setValueAtTime(breath, end - dur * 0.35);
  ng.gain.linearRampToValueAtTime(0, end);
  n.connect(ng).connect(mix);
  // the mouth
  const sum = c.createGain();
  sum.gain.value = vol * 3;
  [1, 0.55, 0.28].forEach((amp, f) => {
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = [5, 9, 12][f];
    vowels.forEach((w, k) => {
      const hz = VOWELS[w][f] * v.size;
      if (k) bp.frequency.linearRampToValueAtTime(hz, at(k, vowels.length)); else bp.frequency.setValueAtTime(hz, t);
    });
    const g = c.createGain();
    g.gain.value = amp;
    mix.connect(bp).connect(g).connect(sum);
  });
  sum.connect(dest);
  o.start(t); o.stop(end + 0.05); wob.start(t); wob.stop(end + 0.05);
  n.start(t, Math.random() * (noise.duration - h - dur - 0.1), h + dur + 0.05);
}

/** What naughty boys shout when they spot you: [vowels, pitch contour, seconds, h, gap before the next]. */
const SHOUTS: [Vowel[], number[], number, number, number][][] = [
  [[["o", "o", "i"], [175, 215, 165], 0.3, 0, 0]],                                       // Oi!
  [[["o", "i"], [165, 190, 150], 0.19, 0, 0.07], [["o", "o", "i"], [190, 230, 165], 0.3, 0, 0]],   // Oi oi!
  [[["e", "e", "r"], [205, 215, 150], 0.32, 0.07, 0]],                                   // 'Ere!
  [[["o", "i"], [175, 205, 160], 0.22, 0, 0.12], [["e", "r"], [215, 160], 0.3, 0.06, 0]],          // Oi, 'ere!
  [[["w", "o", "o"], [190, 205, 150], 0.24, 0, 0]],                                      // Wot?!
  [[["o", "i"], [175, 205, 165], 0.2, 0, 0.08], [["y", "oo", "oo"], [200, 225, 160], 0.3, 0, 0]],   // Oi, you!
  [[["o", "o", "i", "i"], [170, 215, 235, 170], 0.65, 0, 0]],                           // Oiiiii!
  [[["o", "i"], [165, 185, 150], 0.16, 0, 0.05], [["o", "i"], [175, 200, 155], 0.16, 0, 0.05], [["o", "o", "i"], [195, 240, 165], 0.28, 0, 0]],   // Oi oi oi!
];
let shouting: number[] = [];   // when recent shouts started, so a gang doesn't all yell at once

/** A naughty boy has spotted someone: "Oi!" seed picks his voice. */
export function shout(distance: number, pan: number, seed: number) {
  if (!ctx || distance > 70) return;
  const c = ctx;
  shouting = shouting.filter((s) => s > c.currentTime - 0.8);
  if (shouting.length >= 3) return;
  const t = now() + shouting.length * (0.12 + Math.random() * 0.2);
  shouting.push(t);
  const v = pipes(seed), d = out(Math.min(0.3, 5 / (distance + 10)), pan, distance, 0.3);
  let at = t;
  for (const [vw, p, dur, h, gap] of SHOUTS[Math.floor(Math.random() * SHOUTS.length)]) {
    say(d, at, dur, vw, p.map((x) => x * vary(0.04)), 1, v, 0.15, h);
    at += h + dur + gap;
  }
}

/** Someone hit: "uh!" seed picks the voice (0 for you). */
export function grunt(distance: number, pan: number, seed: number) {
  if (!ctx || distance > 60) return;
  const v = seed ? pipes(seed) : YOU;
  const d = out(Math.min(0.3, 4 / (distance + 8)), pan, distance, 0.12);
  say(d, now() + 0.03, 0.12 + Math.random() * 0.06, Math.random() < 0.5 ? ["u", "u"] : ["a", "u"], [165, 125].map((x) => x * vary()), 1, v, 0.35);
}

/** Someone going down: a long falling groan. */
export function groan(distance: number, pan: number, seed: number) {
  if (!ctx || distance > 80) return;
  const d = out(Math.min(0.3, 4.5 / (distance + 10)), pan, distance, 0.25);
  say(d, now() + 0.05, 0.6 + Math.random() * 0.2, ["a", "a", "o", "u"], [190, 175, 130, 85].map((x) => x * vary()), 1, pipes(seed), 0.3);
}

/** The breath behind a naughty boy's punch. */
export function effort(distance: number, pan: number, seed: number) {
  if (!ctx || distance > 25) return;
  const d = out(Math.min(0.25, 2 / (distance + 6)), pan, distance, 0.05);
  say(d, now(), 0.1, ["u", "u"], [140, 110], 0.6, pipes(seed), 0.6, 0.05);
}

/** A cat's voice: high, out of a small head. */
function kitty(seed: number): Pipes {
  const v = pipes(seed);
  return { pitch: v.pitch * 3.4, size: 1.55 + (v.size - 0.92) * 2 };
}

/** A cat minding its own business: "miaow", or a chirpy "mrrp". */
export function meow(distance: number, pan: number, seed: number) {
  if (!ctx || distance > 30) return;
  const d = out(Math.min(0.22, 2.2 / (distance + 6)), pan, distance, 0.15), t = now();
  if (Math.random() < 0.7) say(d, t, 0.38 + Math.random() * 0.25, ["i", "e", "a", "o", "oo"], [190, 230, 215, 160].map((x) => x * vary(0.08)), 0.8, kitty(seed), 0.1);
  else say(d, t, 0.14, ["r", "e"], [170, 230].map((x) => x * vary(0.08)), 0.6, kitty(seed), 0.25);
}

/** A furious cat: a spitting hiss, then a yowl. */
export function hiss(distance: number, pan: number, seed: number) {
  if (!ctx || distance > 60) return;
  const d = out(Math.min(0.3, 4 / (distance + 8)), pan, distance, 0.2), t = now();
  burst(d, t, 0.45 + Math.random() * 0.3, 0.55, 5200, { type: "highpass", attack: 0.03 });
  if (Math.random() < 0.6) say(d, t + 0.25, 0.5 + Math.random() * 0.5, ["w", "a", "o", "w"], [150, 240, 260, 170].map((x) => x * vary(0.1)), 1, kitty(seed), 0.35);
}

/** Claws: a swipe and a screech. */
export function claw(distance: number, pan: number, seed: number) {
  if (!ctx || distance > 30) return;
  const d = out(Math.min(0.3, 3 / (distance + 6)), pan, distance, 0.08), t = now();
  burst(d, t, 0.09, 0.6, 3200, { type: "bandpass", q: 2, to: 1400 });
  burst(d, t + 0.07, 0.07, 0.4, 3600, { type: "bandpass", q: 2, to: 1600 });
  if (Math.random() < 0.4) say(d, t, 0.22, ["a", "e"], [260, 300, 220].map((x) => x * vary(0.1)), 1, kitty(seed), 0.4);
}

/** A cat hit (pain is false: down for good). */
export function yelp(distance: number, pan: number, seed: number, dying: boolean) {
  if (!ctx || distance > 60) return;
  const d = out(Math.min(0.3, 3.5 / (distance + 8)), pan, distance, 0.2), t = now();
  if (dying) say(d, t + 0.03, 0.7, ["e", "a", "o", "oo"], [280, 250, 170, 110].map((x) => x * vary()), 1, kitty(seed), 0.3);
  else say(d, t + 0.02, 0.16, ["e", "a"], [300, 230].map((x) => x * vary()), 1, kitty(seed), 0.35);
}

// ---- you and the screen ----------------------------------------------------------------------

/** Taking a hit: a thud in the body and a grunt. */
export function hurt() {
  if (!ctx) return;
  const t = now(), d = out(0.75, 0, 0, 0.05);
  tone(d, t, 0.16, 0.7, 105, 50);
  burst(d, t, 0.09, 0.5, 650, { type: "lowpass" });
  grunt(0, 0, 0);
}

/** Picking something up. */
export function pickup(kind: string) {
  if (!ctx) return;
  const t = now(), d = out(1.4, 0, 0, 0.05);
  if (kind === "pint" || kind === "fizz" || kind === "boost") {
    // glugs
    for (let i = 0; i < (kind === "pint" ? 3 : 5); i++) tone(d, t + i * 0.13, 0.08, 0.2, 220 + i * 30, 260 + i * 30);
    if (kind !== "pint") burst(d, t + 0.1, 0.5, 0.15, 6000, { type: "highpass", attack: 0.05 });
  } else if (["bike", "bmx", "blades", "board", "scooter", "pogo", "trolley"].includes(kind)) {
    // a bicycle bell, or the rattle of a trolley
    if (kind === "trolley") for (let i = 0; i < 8; i++) clink(d, t + i * 0.03, 0.25, 1800 + Math.random() * 900);
    else { tone(d, t, 0.5, 0.25, 2100, 2100); tone(d, t + 0.18, 0.6, 0.25, 2100, 2100); }
  } else if (kind === "smoke") {
    // a lighter's flint, the flame catching, a long drag, and out it comes
    clink(d, t, 0.35, 4200); burst(d, t + 0.01, 0.05, 0.25, 3000, { type: "highpass" });
    burst(d, t + 0.08, 0.35, 0.12, 900, { type: "lowpass", attack: 0.03 });
    burst(d, t + 0.5, 0.9, 0.14, 1600, { type: "bandpass", attack: 0.4 });
    burst(d, t + 1.5, 1.1, 0.12, 700, { type: "lowpass", attack: 0.05 });
  } else if (kind === "wood") {
    // sticks knocking together as you gather them up
    for (let i = 0; i < 4; i++) clack(d, t + i * 0.06 + Math.random() * 0.03, 0.4, 600 + Math.random() * 400);
  } else if (kind === "ladder") {
    // a hollow aluminium clank as it goes up on your shoulder
    clack(d, t, 0.7, 900); clink(d, t + 0.02, 0.35, 1900); clink(d, t + 0.16, 0.2, 2300);
  } else if (kind === "sniper") {
    burst(d, t, 0.2, 0.2, 1000, { type: "lowpass", attack: 0.06 });
    clack(d, t + 0.18, 0.45, 1000); clink(d, t + 0.3, 0.25, 2400); slide(d, t + 0.36, 0.1, 0.3, 1500, 2600);
  } else {
    // a tin or box of rounds: rattling brass
    clack(d, t, 0.8, 1200);
    for (let i = 0; i < 6; i++) clink(d, t + 0.03 + Math.random() * 0.22, 0.3, 3200 + Math.random() * 2400);
  }
}

function beep(freq: number, dur: number, vol: number, type: OscillatorType = "sine", delay = 0, dest: AudioNode = master) {
  if (!ctx) return;
  tone(dest, ctx.currentTime + delay, dur, vol, freq, freq, type);
}

/** Your shot landed: a crisp tick, brighter for a headshot. */
export function hitMarker(head: boolean) {
  if (!ctx) return;
  const t = now();
  burst(master, t, 0.012, 0.4, 6000, { type: "highpass" });
  tone(master, t, 0.06, 0.5, head ? 1700 : 1150, head ? 1700 : 1150, "triangle");
  if (head) tone(master, t + 0.035, 0.12, 0.3, 2550, 2550, "triangle");
}
export const kill = () => { beep(880, 0.12, 0.25, "triangle"); beep(1320, 0.18, 0.25, "triangle", 0.08); };

/** A warning blip: naughty boys have seen you. */
export const alarm = () => { beep(520, 0.12, 0.2, "square"); beep(390, 0.2, 0.2, "square", 0.13); };

// ---- the radio -------------------------------------------------------------------------------
// Like a real handset: the talk button is just a mechanical click, and the beeps are steady sine
// tones (what a radio actually sends), not game bleeps. Everyone else hears your radio over the
// air, as thin and gritty as a voice: a faint hiss while you're on, the squelch opening as you key
// up, and when you let go your roger beep and the "kssht" of the squelch tail as your carrier drops.

/** The talk button: a hard plastic click as it goes down and its latch, higher coming back up. */
function pttClick(t: number, down: boolean) {
  burst(button, t, 0.004, 2.2, down ? 2900 : 3600, { q: 4, attack: 0.0005 });
  burst(button, t + 0.011, 0.003, 1.1, down ? 2300 : 3000, { q: 4, attack: 0.0005 });
}

/** A steady sine tone with just enough of a ramp not to click: a radio's beep, not a chime. */
function sineBeep(dest: AudioNode, t: number, dur: number, vol: number, freq: number) {
  const c = ctx!, o = c.createOscillator(), g = c.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.setValueAtTime(vol, t + dur - 0.004);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.01);
}

/** The roger beep: one short, clean tone, the same for you and for everyone who hears it. */
const ROGER_VOL = 0.09;
const roger = (dest: AudioNode, t: number, vol: number) => sineBeep(dest, t, 0.11, vol, 1400);

/**
 * Squelch noise: flat static that starts and stops dead (no fade), rising a little as the
 * carrier goes. What you hear as a receiver opens or closes.
 */
function squelch(t: number, dur: number, vol: number) {
  const c = ctx!, src = c.createBufferSource(), g = c.createGain();
  src.buffer = noise;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol * 0.6, t + 0.003);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.04, dur * 0.4));
  g.gain.setValueAtTime(vol, t + dur - 0.003);
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(g).connect(air);
  src.start(t, Math.random() * (noise.duration - dur - 0.05), dur + 0.02);
}

/** You pressed talk: just the button. */
export function pttDown() {
  if (!ctx) return;
  pttClick(now(), true);
}

/** You let go of talk: the button, and your roger beep going out, just as everyone else hears it. */
export function pttUp() {
  if (!ctx) return;
  const t = now();
  pttClick(t, false);
  roger(air, t + 0.03, ROGER_VOL);
}

/** Someone else keyed up: the squelch opens with a short rush of static as their carrier comes in. */
export function radioIn() {
  if (!ctx) return;
  squelch(now(), 0.035, 0.22);
}

/** Someone else let go: their roger beep, then the squelch tail as their carrier drops. */
export function radioOut() {
  if (!ctx) return;
  const t = now() + 0.08;   // their voice reaches us a little behind their key-up message
  roger(air, t, ROGER_VOL);
  squelch(t + 0.13, 0.17, 0.18);
}

/** Someone is on the radio (on), or nobody is: a faint hiss under what they say. */
export function carrier(on: boolean) {
  if (!ctx) return;
  // going off waits for the roger beep and squelch tail (radioOut) to finish
  carrierHiss.gain.cancelScheduledValues(ctx.currentTime);
  carrierHiss.gain.setTargetAtTime(on ? 0.015 : 0, ctx.currentTime + (on ? 0 : 0.37), 0.005);
}

// ---- jobs (quests.ts) ------------------------------------------------------------------------

/** Taking a job: a sheet torn off a noticeboard, and a drawing pin flicked away. */
export function jobTaken() {
  if (!ctx) return;
  const t = now(), d = out(0.9, 0, 0, 0.06);
  burst(d, t, 0.18, 0.5, 3200, { q: 0.7, to: 1800, attack: 0.04 });
  clink(d, t + 0.2, 0.25, 5200);
  [523, 659].forEach((f, k) => tone(d, t + 0.25 + k * 0.09, 0.25, 0.12, f, f, "triangle"));
}

/** A step of a job done (a clue found, a checkpoint passed). */
export function jobStep() {
  if (!ctx) return;
  const t = now(), d = out(0.8, 0, 0, 0.2);
  [784, 988, 1175].forEach((f, k) => tone(d, t + k * 0.07, 0.35, 0.16, f, f, "triangle"));
}

/** A job done: a brass-band flourish. Or failed (won false): two flat notes going down. */
export function jobDone(won: boolean) {
  if (!ctx) return;
  const t = now(), d = out(0.9, 0, 0, 0.3);
  if (!won) { [392, 294].forEach((f, k) => tone(d, t + k * 0.28, 0.5, 0.2, f, f * 0.97, "sawtooth")); return; }
  const notes: [number, number, number][] = [[523, 0, 0.14], [523, 0.15, 0.14], [523, 0.3, 0.14], [659, 0.45, 0.45], [587, 0.95, 0.14], [659, 1.1, 0.14], [784, 1.25, 0.9]];
  for (const [f, at, dur] of notes) { tone(d, t + at, dur, 0.13, f, f, "sawtooth", 0.02); tone(d, t + at, dur, 0.1, f * 2, f * 2, "triangle", 0.02); }
  burst(d, t + 1.25, 0.9, 0.12, 7000, { type: "highpass", attack: 0.02 });
}

/** Warmer (a soft rising chime, brighter when the search circle shrinks) or colder (falling). */
export function warmer(up: boolean, shrink = false) {
  if (!ctx) return;
  const t = now(), d = out(0.6, 0, 0, 0.25);
  const notes = up ? (shrink ? [659, 880, 1047] : [659, 880]) : [523, 392];
  notes.forEach((f, k) => tone(d, t + k * 0.11, 0.4, 0.1, f, f, up ? "sine" : "triangle", 0.01));
}

/** Digging up the chest: a few spadefuls, then the lid creaking open. */
export function dig() {
  if (!ctx) return;
  const t = now(), d = out(0.8, 0, 0, 0.08);
  for (let k = 0; k < 3; k++) burst(d, t + k * 0.28, 0.16, 0.45, 900, { q: 0.8, to: 400, attack: 0.01 });
  tone(d, t + 0.9, 0.5, 0.06, 180, 260, "sawtooth", 0.05);
}

/** The chest open: a jingle and a shower of coins. */
export function chest() {
  if (!ctx) return;
  const t = now(), d = out(0.9, 0, 0, 0.25);
  [784, 988, 1175, 1568].forEach((f, k) => tone(d, t + k * 0.09, 0.5, 0.12, f, f, "triangle", 0.01));
  for (let k = 0; k < 14; k++) clink(d, t + 0.35 + k * 0.06 + Math.random() * 0.04, 0.12, 3800 + Math.random() * 2600);
}

/** A countdown pip; go: the long one on GO. */
export function pip(go = false) {
  if (!ctx) return;
  const t = now(), d = out(0.8, 0, 0, 0.05);
  tone(d, t, go ? 0.6 : 0.15, 0.3, go ? 1320 : 660, go ? 1320 : 660, "square");
}

/** An old phone ringing in your pocket: two bursts of the bell. */
export function phone() {
  if (!ctx) return;
  const t = now(), d = out(0.7, 0, 0, 0.05);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 14; k++) {
    const at = t + r * 0.6 + k * 0.028;
    tone(d, at, 0.03, 0.12, 1250, 1250, "square");
    tone(d, at + 0.014, 0.03, 0.1, 1560, 1560, "square");
  }
}

/** A flag torn off a lamp post: a short rip of cloth, distance metres away. */
export function tear(distance = 0, pan = 0) {
  if (!ctx) return;
  const t = now(), d = out(0.8, pan, distance, 0.1);
  for (let k = 0; k < 5; k++) burst(d, t + k * 0.022 + Math.random() * 0.01, 0.03, 0.3, 2400 + Math.random() * 1600, { q: 2.5 });
  burst(d, t, 0.16, 0.22, 5200, { type: "highpass", to: 1800 });
}

/** A flag on a lamp post flapping in the breeze: two or three soft snaps of cloth, quiet, from its side. */
export function flagFlap(distance = 0, pan = 0) {
  if (!ctx) return;
  const t = now(), d = out(0.35 * fall(distance, 10), pan, distance, 0.08);
  for (let k = 0, n = 2 + Math.floor(Math.random() * 2); k < n; k++) {
    const at = t + k * (0.11 + Math.random() * 0.05);
    burst(d, at, 0.07, 0.25 * vary(0.2), 700 + Math.random() * 400, { q: 1.4, to: 350, attack: 0.008 });
  }
}

/** The flags-down counter going up: a soft tick. */
export function counterTick() {
  if (!ctx) return;
  const t = now(), d = out(0.5, 0, 0, 0);
  tone(d, t, 0.05, 0.12, 1900, 2300, "triangle");
}

/** A megaphone squawk: the Chair heckling. */
export function megaphone(distance = 0, pan = 0) {
  if (!ctx) return;
  const t = now(), d = out(0.7, pan, distance, 0.15);
  for (let k = 0; k < 3; k++) tone(d, t + k * 0.13, 0.11, 0.1, 420 + k * 40, 380 + k * 40, "square");
  burst(d, t, 0.4, 0.06, 1600, { q: 4 });
}

// ---- seagulls (gulls.ts) ----------------------------------------------------------------------

/** A herring gull's cry: a falling "kyow", then a laughing "ha-ha-ha". big: Big Lad, an octave and a half down and far louder. */
export function gullCry(distance = 0, pan = 0, big = false) {
  if (!ctx || distance > (big ? 400 : 120)) return;
  const t = now(), d = out(big ? Math.min(1.1, 40 / (distance + 30)) : Math.min(0.45, 6 / (distance + 10)), pan, distance, 0.25);
  const k = (big ? 0.35 : 1) * vary(0.08);
  tone(d, t, 0.32, 0.28, 1650 * k, 900 * k, "sawtooth", 0.03);
  tone(d, t, 0.32, 0.12, 3300 * k, 1800 * k, "triangle", 0.03);
  for (let i = 0; i < 3; i++) {
    const at = t + 0.36 + i * 0.13;
    tone(d, at, 0.1, 0.2, 1350 * k, 1050 * k, "sawtooth", 0.01);
    burst(d, at, 0.06, 0.05, 2400 * k, { q: 4 });
  }
}

/** Wings beating as a gull takes off or is sent packing: soft whumps of air. */
export function flap(distance = 0, pan = 0, big = false) {
  if (!ctx || distance > 60) return;
  const t = now(), d = out(big ? 0.9 : Math.min(0.35, 4 / (distance + 6)), pan, distance, 0.1);
  for (let i = 0; i < 4; i++) burst(d, t + i * (big ? 0.32 : 0.11), big ? 0.25 : 0.08, 0.4, big ? 260 : 700, { type: "lowpass", attack: 0.02 });
}

/** Seagull muck landing. big: one of Big Lad's poo bombs. */
export function gullMuck(distance = 0, pan = 0, big = false) {
  if (!ctx || distance > 80) return;
  const t = now(), d = out(Math.min(big ? 0.9 : 0.5, 8 / (distance + 6)), pan, distance, 0.1);
  burst(d, t, big ? 0.3 : 0.14, 0.6, big ? 500 : 900, { type: "lowpass", to: 200 });
  tone(d, t, big ? 0.2 : 0.1, 0.3, big ? 160 : 260, 70);
  for (let i = 0; i < 3; i++) burst(d, t + 0.04 + Math.random() * 0.08, 0.03, 0.15, 1500 + Math.random() * 1500, { q: 2 });
}
