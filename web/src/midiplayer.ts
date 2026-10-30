// The records for the record player on Solsbury Hill (recordplayer.ts): whatever MIDI files are in
// the "Record player" folder (web/Record player/), read here and played one after another, round
// and round, on instruments synthesised with Web Audio like the rest of the game's sound. Each
// instrument in a file is played by the nearest of a few voices: a plucked string (pianos, guitars,
// harps, bells), a soft held pad (organs, strings, choirs, synth pads), a round bass, a breathy pipe
// (flutes, reeds, brass, synth leads) and a kit of drums, through the little speaker in the lid, with
// the crackle of an old record.
//
// Who decides what: nothing goes over the network. Every copy of the game has the same files, and
// where the record has got to comes from the clock (the time since 1970, which every computer and
// phone agrees on), so everyone up on the hill hears the same bit at the same moment.

/** A note: when it starts and how long it lasts (seconds from the top of its file), its MIDI
 *  note, how loud (0 to 1), and which voice plays it. */
type Note = { t: number; d: number; n: number; v: number; voice: Voice };
type Voice = "pluck" | "pad" | "bass" | "pipe" | "drum";
export type Song = { name: string; notes: Note[]; length: number };

/** The needle round the run-out groove between records, before the arm drops it in again. */
const GAP = 6;

/** The voice for a General MIDI instrument, by its family of eight. */
function voiceOf(prog: number): Voice | null {
  const fam = prog >> 3;
  if (fam === 4) return "bass";
  if (fam === 2 || fam === 5 || fam === 6 || fam === 11 || fam === 12) return "pad";
  if (fam >= 7 && fam <= 10) return "pipe";
  if (fam === 15) return null;   // sound effects: birds, phones, helicopters
  return "pluck";
}

/** Read a MIDI file into its notes, or null if it isn't one. */
export function readMidi(buf: ArrayBuffer, name: string): Song | null {
  const b = new Uint8Array(buf);
  let p = 0;
  const u32 = () => ((b[p++] << 24) | (b[p++] << 16) | (b[p++] << 8) | b[p++]) >>> 0;
  const u16 = () => (b[p++] << 8) | b[p++];
  const vlq = () => { let x = 0, c; do { c = b[p++]; x = (x << 7) | (c & 0x7f); } while (c & 0x80 && p < b.length); return x; };
  const tag = () => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
  if (b.length < 14 || tag() !== "MThd") return null;
  p += 4;
  const hlen = u32(), hstart = p;
  u16();
  const tracks = u16(), division = u16();
  p = hstart + hlen;
  // everything that matters, from every track, by the tick it happens on
  type Ev = { tick: number; k: number; ch: number; a: number; c: number; seq: number };
  const evs: Ev[] = [], tempos: [number, number][] = [];
  let seq = 0;
  for (let tr = 0; tr < tracks && p + 8 <= b.length; tr++) {
    const isTrack = tag() === "MTrk";
    p += 4;
    const len = u32(), end = Math.min(b.length, p + len);
    if (!isTrack) { p = end; continue; }
    let tick = 0, status = 0;
    while (p < end) {
      tick += vlq();
      let s = b[p];
      if (s & 0x80) p++; else s = status;    // running status: the last one's again
      if (s === 0xff) {
        const type = b[p++], l = vlq();
        if (type === 0x51 && l === 3) tempos.push([tick, (b[p] << 16) | (b[p + 1] << 8) | b[p + 2]]);
        p += l;
        continue;
      }
      if (s === 0xf0 || s === 0xf7) { const l = vlq(); p += l; continue; }
      if (!(s & 0x80)) break;                 // lost the thread: give up on this track
      status = s;
      const k = s & 0xf0, ch = s & 0x0f, a = b[p++], c = k === 0xc0 || k === 0xd0 ? 0 : b[p++];
      if (k === 0x80 || k === 0x90 || k === 0xb0 || k === 0xc0) evs.push({ tick, k: k === 0x90 && c === 0 ? 0x80 : k, ch, a, c, seq: seq++ });
    }
    p = end;
  }
  // ticks to seconds, through the tempo changes
  const smpte = division & 0x8000;
  const perQ = division || 96;
  tempos.sort((x, y) => x[0] - y[0]);
  const marks: [number, number, number][] = [[0, 0, 500000]];   // [tick, seconds, microseconds a beat from then]
  for (const [tick, us] of tempos) {
    const [t0, s0, u0] = marks[marks.length - 1];
    marks.push([tick, s0 + ((tick - t0) * u0) / perQ / 1e6, us]);
  }
  const secs = (tick: number) => {
    if (smpte) return tick / ((256 - (division >> 8)) * (division & 0xff));
    let i = marks.length - 1;
    while (i > 0 && marks[i][0] > tick) i--;
    const [t0, s0, u0] = marks[i];
    return s0 + ((tick - t0) * u0) / perQ / 1e6;
  };
  evs.sort((x, y) => x.tick - y.tick || (x.k === 0x80 ? 0 : 1) - (y.k === 0x80 ? 0 : 1) || x.seq - y.seq);
  const prog = new Array(16).fill(0), vol = new Array(16).fill(100), expr = new Array(16).fill(127);
  const open = new Map<number, { t: number; v: number; voice: Voice }[]>();
  const notes: Note[] = [], chOf: number[] = [], top = new Array(16).fill(0);
  for (const e of evs) {
    if (e.k === 0xc0) { prog[e.ch] = e.a; continue; }
    if (e.k === 0xb0) { if (e.a === 7) vol[e.ch] = e.c; else if (e.a === 11) expr[e.ch] = e.c; continue; }
    const key = e.ch * 128 + e.a, t = secs(e.tick);
    if (e.k === 0x90) {
      const voice = e.ch === 9 ? "drum" : voiceOf(prog[e.ch]);
      if (!voice) continue;
      const v = (e.c / 127) * (vol[e.ch] / 127) * (expr[e.ch] / 127);
      (open.get(key) ?? open.set(key, []).get(key)!).push({ t, v, voice });
    } else {
      const on = open.get(key)?.shift();
      if (on) { notes.push({ t: on.t, d: Math.max(0.03, t - on.t), n: e.a, v: on.v, voice: on.voice }); chOf.push(e.ch); top[e.ch] = Math.max(top[e.ch], e.a); }
    }
  }
  // a part that never goes above the G below middle C is a bass line, whatever it was set to play
  notes.forEach((x, i) => { if (x.voice !== "drum" && top[chOf[i]] < 55) x.voice = "bass"; });
  const last = evs.length ? secs(evs[evs.length - 1].tick) : 0;
  for (const [key, ons] of open) for (const on of ons) notes.push({ t: on.t, d: Math.max(0.1, last - on.t), n: key % 128, v: on.v, voice: on.voice });
  if (!notes.length) return null;
  notes.sort((x, y) => x.t - y.t);
  return { name, notes, length: Math.max(...notes.map((x) => x.t + Math.min(x.d, 4))) + 1 };
}

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** The record player playing its records: give it the audio clock to play up to, and it lays the music out ahead. */
export class Records {
  private noise: AudioBuffer;
  private bus: GainNode;
  private crackle: AudioBufferSourceNode;
  private nodes: AudioNode[];
  private cycle: number;
  private song = -1;       // the record on now (-1: not cued yet)
  private at = 0;          // when it started, on the audio clock
  private next = 0;        // its next note to lay out
  private from = 0;        // nothing is laid out to start before this

  constructor(private c: BaseAudioContext, out: AudioNode, private songs: Song[]) {
    const sr = c.sampleRate;
    this.cycle = songs.reduce((n, s) => n + s.length + GAP, 0);
    this.noise = c.createBuffer(1, sr, sr);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // the little speaker in the lid, and something to stop a busy record overloading it
    const hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), squash = c.createDynamicsCompressor();
    hp.type = "highpass"; hp.frequency.value = 90;
    lp.type = "lowpass"; lp.frequency.value = 7000; lp.Q.value = 0.7;
    squash.threshold.value = -18; squash.ratio.value = 4;
    this.bus = c.createGain();
    this.bus.gain.value = 0.8;
    this.bus.connect(hp).connect(lp).connect(squash).connect(out);
    // the crackle and hiss of an old record, round and round
    const len = sr * 4, cb = c.createBuffer(1, len, sr), cd = cb.getChannelData(0);
    for (let i = 0; i < len; i++) cd[i] = (Math.random() * 2 - 1) * 0.008;
    for (let n = 0; n < 4 * 20; n++) {
      const at = Math.floor(Math.random() * (len - 200)), big = Math.random() < 0.15 ? 0.4 : 0.14;
      for (let j = 0; j < 40; j++) cd[at + j] += (Math.random() * 2 - 1) * big * Math.exp(-j / 6);
    }
    this.crackle = c.createBufferSource();
    this.crackle.buffer = cb;
    this.crackle.loop = true;
    const cg = c.createGain();
    cg.gain.value = 0.5;
    this.crackle.connect(cg).connect(this.bus);
    this.crackle.start();
    this.nodes = [hp, lp, squash, this.bus, cg];
  }

  /** Lay out everything due to start before t, on the audio clock. */
  play(t: number) {
    if (!this.songs.length) return;
    if (this.song < 0) this.cue();
    for (let guard = 0; guard < this.songs.length * 2 + 2; guard++) {
      const s = this.songs[this.song];
      while (this.next < s.notes.length && this.at + s.notes[this.next].t < t) this.note(this.at, s.notes[this.next++]);
      if (this.next < s.notes.length || this.at + s.length >= t) return;
      this.runOut(this.at + s.length);
      this.at += s.length + GAP;
      this.song = (this.song + 1) % this.songs.length;
      this.next = 0;
    }
  }

  /** Lift the needle: fade out and let go of everything. */
  stop() {
    const t = this.c.currentTime;
    this.bus.gain.setTargetAtTime(0, t, 0.08);
    this.crackle.stop(t + 0.6);
    setTimeout(() => { for (const n of this.nodes) n.disconnect(); }, 900);
  }

  /** Find where the records have got to by the clock, and pick it up from there. */
  private cue() {
    const now = this.c.currentTime;
    let pos = (((Date.now() / 1000) % this.cycle) + this.cycle) % this.cycle;
    this.from = now + 0.05;
    this.song = 0;
    while (pos >= this.songs[this.song].length + GAP) { pos -= this.songs[this.song].length + GAP; this.song++; }
    this.at = now - pos;
    const notes = this.songs[this.song].notes;
    this.next = 0;
    while (this.next < notes.length && notes[this.next].t < pos) this.next++;
  }

  /** The needle round the run-out groove, a soft click every turn, then the arm drops it in again. */
  private runOut(t0: number) {
    for (let t = t0 + 0.4; t < t0 + GAP - 1.2; t += 1.8) { this.hit(t, 0.025, 0.25, 1800, "bandpass"); this.thud(t, 0.2, 70); }
    this.thud(t0 + GAP - 0.7, 0.5, 55);
  }

  private note(at: number, x: Note) {
    const t = at + x.t;
    if (t < this.from) return;
    const dur = Math.min(x.d, 8), v = x.v;
    if (x.voice === "pluck") this.pluck(t, dur, x.n, v);
    else if (x.voice === "pad") this.pad(t, dur, x.n, v);
    else if (x.voice === "bass") this.bass(t, dur, x.n, v);
    else if (x.voice === "pipe") this.pipe(t, dur, x.n, v);
    else this.drum(t, x.n, v);
  }

  // ---- the voices ---------------------------------------------------------------------------

  /** A plucked string or a struck note: bright at first, dulling as it rings. */
  private pluck(t: number, dur: number, m: number, v: number) {
    const c = this.c, f = hz(m), o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    const ring = Math.min(dur, 3) + 0.15, decay = m < 55 ? 0.7 : m < 70 ? 0.5 : 0.35;
    o.type = "triangle"; o.frequency.value = f;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(Math.min(9000, f * 8), t);
    lp.frequency.setTargetAtTime(Math.max(500, f * 2), t, 0.15);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * v, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, decay);
    g.gain.setTargetAtTime(0, t + ring - 0.08, 0.03);
    o.connect(lp).connect(g).connect(this.bus);
    o.start(t); o.stop(t + ring + 0.2);
    o.onended = () => { o.disconnect(); lp.disconnect(); g.disconnect(); };
  }

  /** A soft held pad: two sawtooths a hair apart, through a mellow filter, swelling in and out. */
  private pad(t: number, dur: number, m: number, v: number) {
    const c = this.c, f = hz(m), lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = "lowpass"; lp.frequency.value = Math.min(3200, 600 + f * 3); lp.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045 * v, t + Math.min(0.25, dur * 0.5));
    g.gain.setTargetAtTime(0, t + dur, 0.25);
    lp.connect(g).connect(this.bus);
    const os = [0.9965, 1.0035].map((r) => {
      const o = c.createOscillator();
      o.type = "sawtooth"; o.frequency.value = f * r;
      o.connect(lp); o.start(t); o.stop(t + dur + 1.2);
      return o;
    });
    os[0].onended = () => { for (const o of os) o.disconnect(); lp.disconnect(); g.disconnect(); };
  }

  /** A round bass note. */
  private bass(t: number, dur: number, m: number, v: number) {
    const c = this.c, f = hz(m), o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = "triangle"; o.frequency.value = f;
    lp.type = "lowpass"; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.setTargetAtTime(500, t, 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.24 * v, t + 0.01);
    g.gain.setTargetAtTime(0.14 * v, t + 0.01, 0.2);
    g.gain.setTargetAtTime(0, t + dur, 0.05);
    o.connect(lp).connect(g).connect(this.bus);
    o.start(t); o.stop(t + dur + 0.3);
    o.onended = () => { o.disconnect(); lp.disconnect(); g.disconnect(); };
  }

  /** A breathy pipe: a pure tone with a little of its octave, a puff of air at the start, and a
   *  slow vibrato on the longer notes. */
  private pipe(t: number, dur: number, m: number, v: number) {
    const c = this.c, f = hz(m), o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
    const wob = c.createOscillator(), depth = c.createGain();
    o.frequency.value = f; o2.frequency.value = f * 2;
    g2.gain.value = 0.2;
    wob.frequency.value = 5;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.6, dur));
    wob.connect(depth); depth.connect(o.frequency); depth.connect(o2.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13 * v, t + 0.05);
    g.gain.setTargetAtTime(0.1 * v, t + 0.05, 0.2);
    g.gain.setTargetAtTime(0, t + dur, 0.07);
    o.connect(g); o2.connect(g2).connect(g); g.connect(this.bus);
    for (const x of [o, o2, wob]) { x.start(t); x.stop(t + dur + 0.4); }
    o.onended = () => { for (const x of [o, o2, wob, depth, g, g2]) x.disconnect(); };
    this.hit(t, 0.07, 0.03 * v, Math.min(9000, f * 3), "bandpass", 2, 0.01);
  }

  /** The kit, by General MIDI drum number. */
  private drum(t: number, n: number, v: number) {
    if (n === 35 || n === 36) this.thud(t, 0.32 * v, 52);
    else if (n === 38 || n === 40 || n === 37 || n === 39) { this.hit(t, n === 37 ? 0.03 : 0.12, (n === 37 ? 0.12 : 0.2) * v, 2000, "bandpass", 0.8); this.thud(t, 0.08 * v, 180); }
    else if (n === 42 || n === 44) this.hit(t, 0.04, 0.07 * v, 7000, "highpass", 0.7);
    else if (n === 46) this.hit(t, 0.2, 0.07 * v, 6500, "highpass", 0.7);
    else if (n === 49 || n === 51 || n === 52 || n === 53 || n === 55 || n === 57 || n === 59) this.hit(t, n === 51 || n === 59 ? 0.3 : 1.2, 0.06 * v, 6000, "highpass", 0.6);
    else if (n >= 41 && n <= 50) this.thud(t, 0.2 * v, 70 + (n - 41) * 14);
    else this.hit(t, 0.05, 0.08 * v, 3500, "bandpass", 2);
  }

  /** A burst of filtered noise: the bones of every drum here. */
  private hit(t: number, dur: number, vol: number, freq: number, type: BiquadFilterType, q = 1, attack = 0.002) {
    if (t < this.from) return;
    const c = this.c, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5); src.stop(t + attack + dur + 0.02);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }

  /** A low sine that drops in pitch: the kick, the toms, and the needle landing. */
  private thud(t: number, vol: number, f: number) {
    if (t < this.from) return;
    const c = this.c, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.3);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
}
