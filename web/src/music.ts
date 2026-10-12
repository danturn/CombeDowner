// Procedural soundtrack: chugging distorted-guitar metal in the spirit of 90s shooter scores,
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

function curve(drive: number) {
  const c = new Float32Array(2048);
  for (let i = 0; i < c.length; i++) c[i] = Math.tanh(drive * (i / (c.length - 1) * 2 - 1));
  return c;
}

export type BarInfo = { name: string; i: number; key: number; lead: boolean; drums: boolean };
export const RIFF_NAMES = () => Object.keys(RIFFS);

/** Endless procedural metal. Call scheduleUntil(t) often enough to stay ahead of playback. */
export class Soundtrack {
  private ctx: BaseAudioContext;
  private bus: GainNode;
  private gtr: AudioNode[] = [];
  private bass: AudioNode;
  private leadIn: AudioNode;
  private drums: AudioNode;
  private verb: AudioNode;
  private noise: AudioBuffer;
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
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15;
    comp.connect(out);
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.36;
    this.bus.connect(this.filter("highpass", 35, 0.7)).connect(comp);

    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = this.rand() * 2 - 1;
    this.noise = n;

    // room reverb from a decaying noise impulse
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const c = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) c[i] = (this.rand() * 2 - 1) * (1 - i / len) ** 3;
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    conv.connect(wet).connect(this.bus);
    this.verb = conv;

    // two guitars, double-tracked and panned apart, each through its own amp and cabinet
    const dist = curve(2.2);
    for (const pan of [-0.65, 0.65]) {
      const hp = this.filter("highpass", 100, 0.7);
      const pre = ctx.createGain();
      pre.gain.value = 9;
      const amp = ctx.createWaveShaper();
      amp.curve = dist;
      amp.oversample = "2x";
      const scoop = this.filter("peaking", 500, 0.9, -7);
      const bite = this.filter("peaking", 2600, 1, 6);
      const cab = this.filter("lowpass", 5200, 0.9);
      const cab2 = this.filter("lowpass", 8000, 0.7);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      hp.connect(pre).connect(amp).connect(scoop).connect(bite).connect(cab).connect(cab2).connect(p).connect(g).connect(this.bus);
      this.gtr.push(hp);
    }

    const bass = this.filter("lowpass", 520, 1.1);
    const bg = ctx.createGain();
    bg.gain.value = 0.1;
    bass.connect(bg).connect(this.bus);
    this.bass = bass;

    // lead guitar: overdrive, then a dotted-eighth echo and some reverb
    const lpre = ctx.createGain();
    lpre.gain.value = 3;
    const lamp = ctx.createWaveShaper();
    lamp.curve = curve(1.6);
    lamp.oversample = "2x";
    const lcab = this.filter("lowpass", 3400, 1);
    const lg = ctx.createGain();
    lg.gain.value = 0.2;
    lpre.connect(lamp).connect(lcab).connect(lg).connect(this.bus);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const echoTone = this.filter("lowpass", 2200, 0.7);
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.5;
    lg.connect(echo).connect(echoTone).connect(fb).connect(echo);
    echoTone.connect(echoOut).connect(this.bus);
    lg.connect(this.verb);
    this.leadIn = lpre;

    this.drums = ctx.createGain();
    this.drums.connect(this.bus);
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

  private filter(type: BiquadFilterType, freq: number, q: number, gain = 0) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q; f.gain.value = gain;
    return f;
  }

  private chord(t: number, dur: number, root: number, mute: boolean) {
    const ctx = this.ctx;
    const notes = mute ? [root, root + 7] : [root, root + 7, root + 12];
    const ring = mute ? Math.min(dur, STEP * 1.5) : dur;
    for (const side of this.gtr) {
      const start = t + this.rand() * 0.008;   // two players are never quite together
      const tone = this.filter("lowpass", mute ? 900 : 5000, 0.8);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(1, start + 0.003);
      if (mute) env.gain.setTargetAtTime(0.3, start + 0.003, 0.035);
      env.gain.setTargetAtTime(0, start + ring, 0.018);
      env.connect(tone).connect(side);
      let o!: OscillatorNode;
      for (const n of notes) {
        o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(n);
        o.detune.value = (this.rand() - 0.5) * 14;
        o.connect(env);
        o.start(start);
        o.stop(start + ring + 0.15);
      }
      release(o, env, tone);
    }
  }

  private bassNote(t: number, dur: number, midi: number, mute: boolean) {
    const ctx = this.ctx;
    const ring = mute ? Math.min(dur, STEP * 1.3) : dur;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.004);
    env.gain.setTargetAtTime(0, t + ring, 0.02);
    env.connect(this.bass);
    let o!: OscillatorNode;
    for (const type of ["sawtooth", "sine"] as const) {
      o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz(midi);
      o.connect(env);
      o.start(t); o.stop(t + ring + 0.15);
    }
    release(o, env);
  }

  private leadNote(t: number, dur: number, midi: number) {
    const ctx = this.ctx;
    const f = hz(midi);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.008);
    env.gain.setTargetAtTime(0.75, t + 0.01, 0.15);
    env.gain.setTargetAtTime(0, t + dur - 0.01, 0.03);
    env.connect(this.leadIn);
    // vibrato that creeps in on held notes
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.6;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(dur > STEP * 3 ? f * 0.018 : 0, t + Math.min(dur, 0.35));
    lfo.connect(depth);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      // long notes bend up into pitch like a guitarist pushing the string
      if (dur > STEP * 3) {
        o.frequency.setValueAtTime(f * 0.944, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      } else o.frequency.value = f;
      o.detune.value = det;
      depth.connect(o.frequency);
      o.connect(env);
      o.start(t); o.stop(t + dur + 0.2);
    }
    lfo.start(t); lfo.stop(t + dur + 0.2);
    release(lfo, env, depth);
  }

  private noiseHit(t: number, len: number, vol: number, f: BiquadFilterNode, out: AudioNode = this.drums) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t, this.rand() * 1.5, len + 0.05);
    release(src, f, g);
    return g;
  }

  private kick(t: number, vol: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.95 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g).connect(this.drums);
    o.start(t); o.stop(t + 0.33);
    release(o, g);
    this.noiseHit(t, 0.012, 0.25 * vol, this.filter("highpass", 2500, 0.7));
  }

  private snare(t: number, vol: number) {
    const ctx = this.ctx;
    const g = this.noiseHit(t, 0.18, 0.5 * vol, this.filter("highpass", 900, 0.7));
    g.connect(this.verb);
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.45 * vol, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(og).connect(this.drums);
    o.start(t); o.stop(t + 0.12);
    release(o, og);
  }

  private hat(t: number, open: boolean, vol: number) {
    this.noiseHit(t, open ? 0.22 : 0.035, 0.13 * vol, this.filter("highpass", 7500, 0.8));
  }

  private crash(t: number) {
    const g = this.noiseHit(t, 1.7, 0.22, this.filter("highpass", 3800, 0.6));
    g.connect(this.verb);
  }

  private tom(t: number, f: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.drums);
    g.connect(this.verb);
    o.start(t); o.stop(t + 0.36);
    release(o, g);
  }
}
