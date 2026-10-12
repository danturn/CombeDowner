// Procedural soundtrack: chugging metal in the spirit of 90s shooter scores, played on
// 16-bit console instruments (FM synthesis like the Mega Drive's sound chip, and lo-fi drum
// samples) and synthesised with Web Audio so the game still ships no sound files. The riffs are
// written out below; the arrangement picks their order, key and lead parts at random, so it plays
// forever without looping exactly.

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

/** Render a drum hit to a short 8-bit, 22 kHz sample, the way 16-bit consoles stored their drums. */
function drumSample(ctx: BaseAudioContext, len: number, rand: () => number, f: (t: number, noise: number) => number) {
  const sr = 22050;
  const b = ctx.createBuffer(1, Math.floor(len * sr), sr);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.round(Math.max(-1, Math.min(1, f(i / sr, rand() * 2 - 1))) * 127) / 127;
  return b;
}

export type BarInfo = { name: string; i: number; key: number; lead: boolean; drums: boolean };
export const RIFF_NAMES = () => Object.keys(RIFFS);

/** Endless procedural 16-bit metal. Call scheduleUntil(t) often enough to stay ahead of playback. */
export class Soundtrack {
  private ctx: BaseAudioContext;
  private bus: GainNode;
  private gtr: AudioNode[] = [];
  private bass: AudioNode;
  private leadIn: AudioNode;
  private drums: AudioNode;
  private kit: Record<"kick" | "snare" | "hat" | "openHat" | "crash" | "tom", AudioBuffer>;
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
    // a 9-bit output stage, like the Mega Drive's FM chip, for a little grit
    const crush = ctx.createWaveShaper();
    const c = new Float32Array(4097);
    for (let i = 0; i < c.length; i++) c[i] = Math.round((i / 2048 - 1) * 256) / 256;
    crush.curve = c;
    crush.connect(out);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15;
    comp.connect(crush);
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.3;
    this.bus.connect(comp);

    const rand = () => this.rand();
    const hp = () => { let p = 0; return (n: number) => { const y = n - p; p = n; return y; }; };
    const snareHp = hp(), hatHp = hp(), openHp = hp(), crashHp = hp();
    let kickPh = 0, tomPh = 0;
    this.kit = {
      kick: drumSample(ctx, 0.4, rand, (t, n) => {
        kickPh += (2 * Math.PI * (48 + 130 * Math.exp(-t / 0.025))) / 22050;
        return Math.tanh(1.8 * Math.sin(kickPh)) * Math.exp(-t / 0.2) + (t < 0.004 ? n * 0.5 : 0);
      }),
      snare: drumSample(ctx, 0.3, rand, (t, n) =>
        0.75 * snareHp(n) * Math.exp(-t / 0.08) + 0.5 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t / 0.05)),
      hat: drumSample(ctx, 0.08, rand, (t, n) => 0.6 * hatHp(n) * Math.exp(-t / 0.018)),
      openHat: drumSample(ctx, 0.35, rand, (t, n) => 0.5 * openHp(n) * Math.exp(-t / 0.11)),
      crash: drumSample(ctx, 1.8, rand, (t, n) => 0.45 * crashHp(n) * Math.exp(-t / 0.5)),
      tom: drumSample(ctx, 0.5, rand, (t) => {
        tomPh += (2 * Math.PI * 100 * (1 + 0.5 * Math.exp(-t / 0.04))) / 22050;
        return Math.sin(tomPh) * Math.exp(-t / 0.2);
      }),
    };

    // two FM guitars, double-tracked and panned apart, through a crunchy overdrive
    const drive = new Float32Array(2048);
    for (let i = 0; i < drive.length; i++) drive[i] = Math.tanh(2.5 * (i / 1023.5 - 1));
    for (const pan of [-0.6, 0.6]) {
      const pre = ctx.createGain();
      pre.gain.value = 0.6;
      const amp = ctx.createWaveShaper();
      amp.curve = drive;
      amp.oversample = "2x";
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      const g = ctx.createGain();
      g.gain.value = 0.48;
      pre.connect(amp).connect(this.filter("highpass", 90, 0.7)).connect(this.filter("lowpass", 9000, 0.7))
        .connect(p).connect(g).connect(this.bus);
      this.gtr.push(pre);
    }

    const bass = ctx.createGain();
    bass.gain.value = 0.3;
    bass.connect(this.bus);
    this.bass = bass;

    // FM lead with some bite, and the dotted-eighth echo the old soundtracks loved
    const lead = ctx.createGain();
    lead.gain.value = 0.6;
    const lamp = ctx.createWaveShaper();
    lamp.curve = drive;
    const lg = ctx.createGain();
    lg.gain.value = 0.24;
    lead.connect(lamp).connect(lg).connect(this.bus);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.4;
    lg.connect(echo).connect(fb).connect(echo);
    echo.connect(echoOut).connect(this.bus);
    this.leadIn = lead;

    const drums = ctx.createGain();
    drums.gain.value = 0.48;
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

  private filter(type: BiquadFilterType, freq: number, q: number) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  /**
   * A two-operator FM voice: a modulator bends the carrier's pitch at audio rate, and the
   * modulation index (from idx0 falling towards idx1) sets how bright and buzzy it sounds.
   */
  private fm(t: number, end: number, f: number, out: AudioNode, idx0: number, idx1: number, idxTime: number,
    sus: number, susTime: number, ratio = 1) {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * ratio;
    const dev = ctx.createGain();
    dev.gain.setValueAtTime(idx0 * f * ratio, t);
    dev.gain.setTargetAtTime(idx1 * f * ratio, t, idxTime);
    mod.connect(dev).connect(car.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.003);
    env.gain.setTargetAtTime(sus, t + 0.003, susTime);
    env.gain.setTargetAtTime(0, end, 0.015);
    car.connect(env).connect(out);
    car.start(t); mod.start(t);
    car.stop(end + 0.1); mod.stop(end + 0.1);
    release(car, env, dev);
    return { car, mod, dev };
  }

  private chord(t: number, dur: number, root: number, mute: boolean) {
    const notes = mute ? [root, root + 7] : [root, root + 7, root + 12];
    const ring = mute ? Math.min(dur, STEP * 1.5) : dur;
    for (const side of this.gtr) {
      const start = t + this.rand() * 0.006;   // two players are never quite together
      const detune = 2 ** ((this.rand() - 0.5) * 0.06 / 12);
      for (const n of notes) {
        if (mute) this.fm(start, start + ring, hz(n) * detune, side, 2.6, 1.2, 0.03, 0.3, 0.04);
        else this.fm(start, start + ring, hz(n) * detune, side, 6, 3.4, 0.12, 0.8, 0.4);
      }
    }
  }

  private bassNote(t: number, dur: number, midi: number, mute: boolean) {
    // slap bass: a bright pluck that dulls quickly
    const ring = mute ? Math.min(dur, STEP * 1.3) : dur;
    this.fm(t, t + ring, hz(midi), this.bass, 5, 1.1, 0.04, 0.7, 0.2);
  }

  private leadNote(t: number, dur: number, midi: number) {
    const ctx = this.ctx;
    const f = hz(midi);
    const end = t + dur - 0.01;
    const { car, mod } = this.fm(t, end, f, this.leadIn, 6, 3, 0.1, 0.8, 0.3);
    if (dur > STEP * 3) {
      // long notes bend up into pitch, then get vibrato
      for (const o of [car, mod]) {
        o.frequency.setValueAtTime(f * 0.944, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      }
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + 0.2);
      depth.gain.linearRampToValueAtTime(f * 0.02, t + 0.4);
      lfo.connect(depth);
      depth.connect(car.frequency);
      depth.connect(mod.frequency);
      lfo.start(t); lfo.stop(end + 0.1);
      release(lfo, depth);
    }
  }

  private hit(buf: AudioBuffer, t: number, vol: number, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.drums);
    src.start(t);
    release(src, g);
  }

  private kick(t: number, vol: number) { this.hit(this.kit.kick, t, vol); }
  private snare(t: number, vol: number) { this.hit(this.kit.snare, t, vol); }
  private hat(t: number, open: boolean, vol: number) { this.hit(open ? this.kit.openHat : this.kit.hat, t, 0.5 * vol); }
  private crash(t: number) { this.hit(this.kit.crash, t, 0.7); }
  private tom(t: number, f: number) { this.hit(this.kit.tom, t, 0.9, f / 100); }
}
