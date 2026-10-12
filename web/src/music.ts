// Procedural soundtrack: chugging metal in the spirit of 90s shooter scores, played on the
// instruments of an 8-bit sound chip (pulse waves, a stepped triangle, shift-register noise) and
// synthesised with Web Audio so the game still ships no sound files. The riffs are written out
// below; the arrangement picks their order, key and lead parts at random, so it plays forever
// without looping exactly.

const BPM = 152;
const STEP = 60 / BPM / 4;   // one sixteenth note, in seconds
const BAR = STEP * 16;
const E2 = 40;               // MIDI number of the low E string

type Hit = { step: number; len: number; off: number; mute: boolean };
type Note = { step: number; len: number; midi: number };
type DrumStyle = keyof typeof DRUMS;
type Riff = { guitar: Hit[][]; lead?: Note[][]; drums: DrumStyle; shift: boolean; weight: number };
type Bar = { name: string; riff: Riff; i: number; key: number; lead: boolean; drums: boolean; fill: boolean; crash: boolean };

// Guitar bars: 16 sixteenths each. xN = palm-muted power chord N semitones above low E,
// oN = open power chord, - = hold, . = rest.
function guitar(...bars: string[]): Hit[][] {
  return bars.map((bar) => {
    const hits: Hit[] = [];
    steps(bar).forEach((t, i) => {
      const last = hits[hits.length - 1];
      if (t === "-") { if (last && last.step + last.len === i) last.len++; }
      else if (t !== ".") hits.push({ step: i, len: 1, off: Number(t.slice(1)), mute: t[0] === "x" });
    });
    return hits;
  });
}

// Lead bars: note names like e5 or a#4, with - to hold and . to rest.
function lead(...bars: string[]): Note[][] {
  const pc: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  return bars.map((bar) => {
    const notes: Note[] = [];
    steps(bar).forEach((t, i) => {
      const last = notes[notes.length - 1];
      if (t === "-") { if (last && last.step + last.len === i) last.len++; return; }
      const m = /^([a-g])(#?)(\d)$/.exec(t);
      if (m) notes.push({ step: i, len: 1, midi: 12 * (Number(m[3]) + 1) + pc[m[1]] + (m[2] ? 1 : 0) });
    });
    return notes;
  });
}

function steps(bar: string) {
  const t = bar.trim().split(/\s+/);
  if (t.length !== 16) throw new Error(`a bar needs 16 steps: ${bar}`);
  return t;
}

// Drum grooves, one character per sixteenth. Hats: x closed, o open.
const DRUMS = {
  rock:   { k: "x.x.....x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
  swing:  { k: "x..x..x...x..x..", s: "....x.......x..x", h: "x.xox.x.x.xox.x." },
  gallop: { k: "x.xxx.xxx.xxx.xx", s: "....x.......x...", h: "x...x...x...x..." },
  half:   { k: "x.....xx..x.....", s: "........x.......", h: "x...x...x...x..." },
  double: { k: "xxxxxxxxxxxxxxxx", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
};
// Fills for the last bar of a phrase: k kick, s snare, h/m/l toms.
const FILLS = ["k...s.k.sshhmmll", "k...s...ssssssss", "k.s.k.s.hhmmllss", "k...s.ksk.hhk.ll"];

const RIFFS: Record<string, Riff> = {
  // pedal-tone chug with stabs climbing and falling around it
  gate: {
    guitar: guitar(
      "x0 . x0 . o12 - x0 . x0 . o10 - x0 . o7 -",
      "x0 . x0 . o8 - x0 . x0 . o7 - o6 - o5 -",
      "x0 . x0 . o12 - x0 . x0 . o10 - x0 . o7 -",
      "x0 . x0 . o3 - x0 . o5 - o6 - o7 - - -",
    ),
    drums: "rock", shift: true, weight: 3,
  },
  // swaggering blues-minor groove
  swagger: {
    guitar: guitar(
      "o0 - - . o0 . o3 - . o5 - . o6 - o5 -",
      "x0 x0 x0 x0 o3 - . o0 - - . x0 x0 . o10 -",
      "o0 - - . o0 . o3 - . o5 - . o6 - o5 -",
      "x0 x0 x0 x0 o7 - . o5 - . o3 - o2 - o1 -",
    ),
    lead: lead(
      "e5 - - . g5 - a5 - a#5 - a5 - g5 - e5 -",
      "d5 - e5 - - - - - . . b4 - d5 - e5 -",
      "g5 - - . g5 - a5 - b5 - - - a5 - g5 -",
      "a5 - g5 - e5 - d5 - e5 - - - - - . .",
    ),
    drums: "swing", shift: false, weight: 3,
  },
  // galloping march through E, C, D and B
  gallop: {
    guitar: guitar(
      "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o0 - - -",
      "x8 . x8 x8 x8 . x8 x8 x8 . x8 x8 o8 - - -",
      "x10 . x10 x10 x10 . x10 x10 x10 . x10 x10 o10 - - -",
      "x7 . x7 x7 x7 . x7 x7 o7 - - - o6 - - -",
    ),
    lead: lead(
      "b4 - - - e5 - - - g5 - - - f#5 - e5 -",
      "g5 - - - - - - - e5 - g5 - c6 - - -",
      "a5 - - - - - f#5 - d5 - - - a5 - - -",
      "b5 - - - a5 - g5 - f#5 - - - d#5 - - -",
    ),
    drums: "gallop", shift: true, weight: 2,
  },
  // slow, heavy breakdown with a wailing lead
  crusher: {
    guitar: guitar(
      "o0 - - - - - x0 x0 . . x0 . x0 x0 . .",
      "o1 - - - - - x0 x0 . . x0 . o3 - o2 -",
      "o0 - - - - - x0 x0 . . x0 . x0 x0 . .",
      "o0 - - - - - x0 x0 x0 x0 o12 - o10 - o7 -",
    ),
    lead: lead(
      "b5 - - - - - - - - - - - - - . .",
      "c6 - - - - - - - b5 - - - a#5 - - -",
      "b5 - - - - - - - - - - - - - . .",
      "g5 - - - f#5 - - - f5 - - - e5 - - -",
    ),
    drums: "half", shift: false, weight: 1,
  },
  // flat-out sixteenth chug under a shred line
  drive: {
    guitar: guitar(
      "x0 x0 x0 x0 x0 x0 o3 - x0 x0 x0 x0 x0 x0 o5 -",
      "x0 x0 x0 x0 x0 x0 o7 - x0 x0 o6 - x0 x0 o5 -",
      "x0 x0 x0 x0 x0 x0 o3 - x0 x0 x0 x0 x0 x0 o5 -",
      "x0 x0 o10 - x0 x0 o8 - x0 x0 o7 - o5 - o3 -",
    ),
    lead: lead(
      "e5 . e5 g5 e5 . e5 a5 e5 . e5 b5 a5 g5 a5 -",
      "e5 . e5 g5 e5 . e5 b5 c6 - b5 - a5 - g5 -",
      "e5 . e5 g5 e5 . e5 a5 e5 . e5 b5 a5 g5 a5 -",
      "d6 - c6 - b5 - a5 - g5 - f#5 - e5 - - -",
    ),
    drums: "double", shift: true, weight: 2,
  },
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Unhook a note's nodes once its sound has stopped, so the graph doesn't keep processing them. */
function release(src: AudioScheduledSourceNode, ...nodes: AudioNode[]) {
  src.onended = () => { for (const n of nodes) n.disconnect(); };
}

const FRAME = 1 / 60;   // the old consoles updated their sound chips once per video frame

/**
 * An oscillator wave from one cycle of a stepped shape, like the waveforms of an 8-bit sound chip.
 * The Fourier series of each flat step is exact, so this is cheap.
 */
function chipWave(ctx: BaseAudioContext, levels: number[], harmonics = 160) {
  const real = new Float32Array(harmonics + 1), imag = new Float32Array(harmonics + 1);
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  levels.forEach((v, i) => {
    const x0 = i / levels.length, x1 = (i + 1) / levels.length;
    for (let n = 1; n <= harmonics; n++) {
      const w = 2 * Math.PI * n;
      real[n] += ((v - mean) * (Math.sin(w * x1) - Math.sin(w * x0))) / w;
      imag[n] -= ((v - mean) * (Math.cos(w * x1) - Math.cos(w * x0))) / w;
    }
  });
  return ctx.createPeriodicWave(real, imag);
}

/** One second of the NES noise channel: a 15-bit shift register, each bit held for `hold` samples. */
function chipNoise(ctx: BaseAudioContext, hold: number) {
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  let r = 1;
  for (let i = 0; i < d.length; i++) {
    if (i % hold === 0) r = (r >> 1) | (((r ^ (r >> 1)) & 1) << 14);
    d[i] = r & 1 ? -1 : 1;
  }
  return b;
}

/**
 * Step a volume frame by frame through `levels`, quantised to the 16 volume levels of the
 * old chips, holding the last level until `end`.
 */
function stepEnv(p: AudioParam, t: number, levels: number[], end: number, scale = 1) {
  p.value = 0;
  for (let i = 0; t + i * FRAME < end; i++) {
    p.setValueAtTime((Math.round(levels[Math.min(i, levels.length - 1)] * 15) / 15) * scale, t + i * FRAME);
  }
  p.setValueAtTime(0, end);
}

/** Step a frequency frame by frame. */
function stepPitch(p: AudioParam, t: number, end: number, f: (frame: number) => number) {
  for (let i = 0; t + i * FRAME < end; i++) p.setValueAtTime(f(i), t + i * FRAME);
}

export type BarInfo = { name: string; i: number; key: number; lead: boolean; drums: boolean };
export const RIFF_NAMES = () => Object.keys(RIFFS);

/** Endless procedural 8-bit metal. Call scheduleUntil(t) often enough to stay ahead of playback. */
export class Soundtrack {
  private ctx: BaseAudioContext;
  private bus: GainNode;
  private gtr: AudioNode[] = [];
  private bass: AudioNode;
  private leadIn: AudioNode;
  private drums: AudioNode;
  private wave: Record<"pulse12" | "pulse25" | "pulse50" | "tri", PeriodicWave>;
  private noiseHi: AudioBuffer;
  private noiseLo: AudioBuffer;
  private next = 0;          // start time of the next bar to schedule
  private queue: Bar[] = [];
  /** Called as each bar is scheduled, with the time it will start playing. */
  onBar?: (bar: BarInfo, time: number) => void;
  private last = "";
  private started = false;
  private seed: number;

  constructor(ctx: BaseAudioContext, out: AudioNode, seed = (Math.random() * 2 ** 32) >>> 0) {
    this.ctx = ctx;
    this.seed = seed;
    // a light bit-crush over the whole mix for some 8-bit grit
    const crush = ctx.createWaveShaper();
    const c = new Float32Array(4097);
    for (let i = 0; i < c.length; i++) c[i] = Math.round((i / 2048 - 1) * 40) / 40;
    crush.curve = c;
    crush.connect(out);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15;
    comp.connect(crush);
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.3;
    this.bus.connect(comp);

    this.wave = {
      pulse12: chipWave(ctx, [1, 0, 0, 0, 0, 0, 0, 0]),
      pulse25: chipWave(ctx, [1, 1, 0, 0, 0, 0, 0, 0]),
      pulse50: chipWave(ctx, [1, 1, 1, 1, 0, 0, 0, 0]),
      // the NES triangle: 32 coarse steps up and down
      tri: chipWave(ctx, Array.from({ length: 32 }, (_, i) => (i < 16 ? 15 - i : i - 16))),
    };
    this.noiseHi = chipNoise(ctx, 1);
    this.noiseLo = chipNoise(ctx, 4);

    // two pulse channels for the rhythm guitar, a little apart
    for (const pan of [-0.35, 0.35]) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      const g = ctx.createGain();
      g.gain.value = 0.7;
      g.connect(p).connect(this.bus);
      this.gtr.push(g);
    }

    const bass = ctx.createGain();
    bass.gain.value = 0.28;
    bass.connect(this.bus);
    this.bass = bass;

    // lead: a pulse channel with the classic chiptune echo (a quieter copy a dotted eighth later)
    const lead = ctx.createGain();
    lead.gain.value = 0.35;
    lead.connect(this.bus);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.4;
    lead.connect(echo).connect(fb).connect(echo);
    echo.connect(echoOut).connect(this.bus);
    this.leadIn = lead;

    const drums = ctx.createGain();
    drums.gain.value = 0.55;
    drums.connect(this.bus);
    this.drums = drums;
  }

  /** Schedule every bar that starts before time t. */
  scheduleUntil(t: number) {
    const now = this.ctx.currentTime;
    // the scheduler fell behind (a stalled tab): pick up again from now
    if (this.next < now) this.next = now + 0.05;
    while (this.next < t) {
      if (!this.queue.length) this.arrange();
      const bar = this.queue.shift()!;
      this.playBar(bar, this.next);
      this.onBar?.({ name: bar.name, i: bar.i, key: bar.key, lead: bar.lead, drums: bar.drums }, this.next);
      this.next += BAR;
    }
  }

  /** Drop the rest of the current section and move on, to the named riff if given. */
  skip(name?: string) {
    this.queue = [];
    this.started = true;
    this.arrange(name);
  }

  // --- arrangement ---------------------------------------------------------

  private rand() {
    // mulberry32, so a preview render is repeatable from its seed
    let x = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
  }

  private phrase(name: string, o: Partial<Bar>) {
    for (let i = 0; i < 4; i++) {
      this.queue.push({
        name, riff: RIFFS[name], i, key: o.key ?? 0, lead: !!o.lead, drums: o.drums ?? true,
        fill: i === 3 && !!o.fill, crash: i === 0 && (o.crash ?? true),
      });
    }
  }

  private arrange(pick?: string) {
    if (!this.started) {
      // open with the main riff alone, then the band comes in
      this.started = true;
      this.last = "gate";
      this.phrase("gate", { drums: false, crash: false, fill: true });
      this.phrase("gate", { fill: true });
      return;
    }
    const names = Object.keys(RIFFS).filter((n) => n !== this.last);
    let r = this.rand() * names.reduce((s, n) => s + RIFFS[n].weight, 0);
    let name = names[0];
    for (const n of names) { r -= RIFFS[n].weight; if (r < 0) { name = n; break; } }
    if (pick && pick in RIFFS) name = pick;
    this.last = name;
    const riff = RIFFS[name];
    // up a fourth now and then, the way old shooter tracks move a riff around
    const key = riff.shift && this.rand() < 0.3 ? 5 : 0;
    this.phrase(name, { key, fill: this.rand() < 0.5 });
    this.phrase(name, { key, lead: !!riff.lead, fill: true });
  }

  private playBar(bar: Bar, t0: number) {
    const { riff, key } = bar;
    for (const h of riff.guitar[bar.i]) {
      const t = t0 + h.step * STEP;
      this.chord(t, h.len * STEP, E2 + key + h.off, h.mute);
      this.bassNote(t, h.len * STEP, E2 - 12 + key + h.off, h.mute);
    }
    if (bar.lead && riff.lead) {
      // keep the lead in the same register when the riff moves up a fourth
      const shift = key ? key - 12 : 0;
      for (const n of riff.lead[bar.i]) this.leadNote(t0 + n.step * STEP, n.len * STEP, n.midi + shift);
    }
    if (bar.crash) this.crash(t0);
    if (!bar.drums) {
      if (bar.fill) for (let i = 8; i < 16; i++) this.snare(t0 + i * STEP, 0.25 + i / 24);
      return;
    }
    const groove = DRUMS[riff.drums];
    const fill = bar.fill ? FILLS[Math.floor(this.rand() * FILLS.length)] : "";
    const toms: Record<string, number> = { h: 190, m: 140, l: 100 };
    for (let i = 0; i < 16; i++) {
      const t = t0 + i * STEP;
      const accent = i % 4 === 0 ? 1 : 0.75;
      if (fill && i >= 8) {
        const c = fill[i];
        if (c === "k") this.kick(t, 1);
        else if (c === "s") this.snare(t, 0.6 + (i - 8) / 20);
        else if (c in toms) this.tom(t, toms[c]);
        continue;
      }
      if (groove.k[i] === "x") this.kick(t, accent);
      if (groove.s[i] === "x") this.snare(t, i % 4 === 0 ? 1 : 0.55);
      if (groove.h[i] !== "." && !(bar.crash && i === 0)) this.hat(t, groove.h[i] === "o", accent);
    }
  }

  // --- instruments ---------------------------------------------------------

  private osc(wave: PeriodicWave, t: number, end: number, out: AudioNode, levels: number[], scale = 1) {
    const o = this.ctx.createOscillator();
    o.setPeriodicWave(wave);
    const g = this.ctx.createGain();
    stepEnv(g.gain, t, levels, end, scale);
    o.connect(g).connect(out);
    o.start(t); o.stop(end + 0.02);
    release(o, g);
    return o;
  }

  private chord(t: number, dur: number, root: number, mute: boolean) {
    const ring = mute ? Math.min(dur, STEP * 1.5) : dur;
    const env = mute ? [1, 0.75, 0.55, 0.45, 0.35] : [1, 0.9, 0.85, 0.8];
    // one channel holds the root; the other plays the fifth, or arpeggiates the chord a note a frame
    const low = this.osc(this.wave.pulse25, t, t + ring, this.gtr[0], env);
    low.frequency.value = hz(root);
    const high = this.osc(this.wave.pulse12, t, t + ring, this.gtr[1], env);
    const arp = [root, root + 7, root + 12];
    if (mute) high.frequency.value = hz(root + 7);
    else stepPitch(high.frequency, t, t + ring, (i) => hz(arp[i % 3]));
  }

  private bassNote(t: number, dur: number, midi: number, mute: boolean) {
    // the triangle channel has no volume control: it is simply on or off
    const ring = mute ? Math.min(dur, STEP * 1.3) : dur;
    this.osc(this.wave.tri, t, t + ring, this.bass, [1]).frequency.value = hz(midi);
  }

  private leadNote(t: number, dur: number, midi: number) {
    const f = hz(midi);
    const long = dur > STEP * 3;
    const o = this.osc(this.wave.pulse25, t, t + dur - FRAME, this.leadIn, [1, 0.95, 0.9, 0.85, 0.8, 0.75]);
    // long notes slide up into pitch, then get a stepped vibrato
    stepPitch(o.frequency, t, t + dur, (i) =>
      !long ? f : i < 3 ? f * 2 ** ((i - 3) / 12) : i < 12 ? f : f * 2 ** ((0.35 * Math.sin(i * FRAME * 5.5 * 2 * Math.PI)) / 12));
  }

  private noiseHit(t: number, buf: AudioBuffer, levels: number[], vol: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    const end = t + levels.length * FRAME;
    stepEnv(g.gain, t, levels, end, vol);
    src.connect(g).connect(this.drums);
    src.start(t, this.rand() * 0.9);
    src.stop(end + 0.02);
    release(src, g);
  }

  private kick(t: number, vol: number) {
    const sweep = [220, 150, 100, 72, 58, 50, 46];
    const o = this.osc(this.wave.tri, t, t + sweep.length * FRAME, this.drums, [1, 1, 0.9, 0.8, 0.6, 0.4, 0.2], vol);
    stepPitch(o.frequency, t, t + sweep.length * FRAME, (i) => sweep[i]);
    this.noiseHit(t, this.noiseHi, [0.5, 0.15], vol);
  }

  private snare(t: number, vol: number) {
    this.noiseHit(t, this.noiseLo, [1, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25, 0.18, 0.12, 0.06], 0.6 * vol);
    const o = this.osc(this.wave.tri, t, t + 2 * FRAME, this.drums, [1, 0.6], 0.6 * vol);
    stepPitch(o.frequency, t, t + 2 * FRAME, (i) => (i ? 180 : 220));
  }

  private hat(t: number, open: boolean, vol: number) {
    const levels = open ? [0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05] : [0.6, 0.3];
    this.noiseHit(t, this.noiseHi, levels, 0.3 * vol);
  }

  private crash(t: number) {
    this.noiseHit(t, this.noiseHi, Array.from({ length: 70 }, (_, i) => (1 - i / 70) ** 1.6), 0.4);
  }

  private tom(t: number, f: number) {
    const end = t + 11 * FRAME;
    const o = this.osc(this.wave.tri, t, end, this.drums, [1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]);
    stepPitch(o.frequency, t, end, (i) => f * (1 + 0.6 * Math.max(0, 1 - i / 5)));
  }
}
