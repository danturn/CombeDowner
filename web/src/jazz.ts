// The record on the folding table up on Little Solsbury Hill (recordplayer.ts): "Up the Hill", an
// ode to the song Peter Gabriel wrote about climbing this hill, played as a jazz combo off a
// General MIDI sound card. It borrows the song's feel, not its tune: B major at about 102 beats a
// minute, seven beats to the bar (felt 2 + 2 + 3) with a bar of four at the end of each chorus, a
// bright strummed guitar that starts it off on its own, and plain folk chords over a held B. The
// melody and the guitar's strumming are our own. Vibes play the tune, with an electric piano, an
// upright bass and brushes, all synthesised with Web Audio like the rest of the game's sound, then
// squeezed through a portable record player's little speaker, with crackle.
//
// The record goes: the guitar on its own, the band coming in, a verse and a chorus, another verse
// and chorus, a verse where the vibes make it up (the same every time you play it, as a record is),
// a last chorus, a held chord, and then the needle sits in the run-out groove, click, click, until
// the arm goes back and it starts again.
//
// Who decides what: nothing goes over the network. Where the record has got to comes from the clock
// (the time since 1970, which every computer and phone agrees on), so everyone up on the hill hears
// the same bar at the same moment.

const BPM = 102;
const BEAT = 60 / BPM;
/** The eighths are only lightly swung: the second of each pair comes this far through the beat. */
const SWING = 0.58;
/** The needle going round the run-out groove, four turns at 33⅓ before it starts again. */
const GAP = 7.2;

// ---- the tune ----------------------------------------------------------------------------------
// A bar's chords are one for the whole bar or two, the first for four beats and the second for
// three. A bar is seven beats unless its chord says :4. A chord over another bass note is written
// E6/B, and the bass holds that note. Each bar of the tune is a swung eighth per step, fourteen to a
// bar of seven: a note name (b is B, bb is B flat, f# F sharp) starts a note, - holds it, . is a rest.

const VERSE_CHORDS = ["B6", "E6/B", "B6", "F#7sus/B", "B6", "E6/B", "G#m7", "F#7sus"];
const VERSE = [
  ". . f#5 - g#5 - b5 - - - g#5 - f#5 -",
  "e5 - - - g#5 - - - c#6 - b5 - g#5 -",
  "f#5 - - - d#5 - - - . . b4 - d#5 -",
  "c#5 - - - - - - - . . e5 - f#5 -",
  ". . b5 - c#6 - d#6 - - - c#6 - b5 -",
  "g#5 - - - e5 - - - c#6 - - - b5 -",
  "d#5 - f#5 - g#5 - - - f#5 - d#5 - b4 -",
  "c#5 - - - - - - - - - . . . .",
];
const CHORUS_CHORDS = ["Emaj7", "B6", "Emaj7", "B6", "G#m7", "Emaj7", "F#7sus", "F#7", "F#7sus:4"];
const CHORUS = [
  "b5 - - - - - g#5 - b5 - - - d#6 -",
  "d#6 - - - c#6 - b5 - - - g#5 - - -",
  "b5 - - - - - g#5 - b5 - - - e6 -",
  "d#6 - - - - - - - . . b5 - c#6 -",
  "d#6 - - - b5 - - - f#5 - - - g#5 -",
  "e5 - - - - - g#5 - b5 - - - c#6 -",
  "b5 - - - - - - - . . c#6 - e6 -",
  "c#6 - - - a#5 - - - f#5 - - - - -",
  ". . . . . . . .",
];

type Chord = { root: number; tones: number[]; beats: number; pedal?: number };
type Bar = {
  chords: Chord[]; beats: number; tune?: string; solo?: boolean; last?: boolean;
  guitar: boolean; piano: boolean; bass: boolean; drums: boolean;
};

const QUALITY: Record<string, number[]> = {
  maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], "7sus": [0, 5, 7, 10], "6": [0, 4, 7, 9], dim7: [0, 3, 6, 9],
};
const LETTER: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const pc = (letter: string, acc?: string) => (LETTER[letter.toLowerCase()] + (acc === "b" ? -1 : acc === "#" ? 1 : 0) + 12) % 12;

function chords(spec: string): Chord[] {
  const names = spec.split(" ");
  return names.map((n, i) => {
    const m = /^([A-G])(b|#)?(maj7|m7|7sus|7|6|dim7)(?:\/([A-G])(b|#)?)?(?::(\d))?$/.exec(n)!;
    const beats = m[6] ? Number(m[6]) : names.length === 1 ? 7 : i === 0 ? 4 : 3;
    return { root: pc(m[1], m[2]), tones: QUALITY[m[3]], beats, pedal: m[4] ? pc(m[4], m[5]) : undefined };
  });
}

function midi(name: string): number {
  const m = /^([a-g])(#|b)?(\d)$/.exec(name)!;
  return 12 * (Number(m[3]) + 1) + LETTER[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}

/** The notes of a bar of the tune, as [eighth it starts on, eighths it lasts, MIDI note]. */
function notes(bar: string): [number, number, number][] {
  const out: [number, number, number][] = [];
  let held: [number, number, number] | null = null;
  bar.split(" ").forEach((s, k) => {
    if (s === "-") { if (held) held[1]++; return; }
    held = null;
    if (s !== ".") out.push((held = [k, 1, midi(s)]));
  });
  return out;
}

type Parts = Partial<Pick<Bar, "guitar" | "piano" | "bass" | "drums" | "solo">>;
const ALL = { guitar: true, piano: false, bass: true, drums: true };
function section(cs: string[], tune: string[] | null, parts: Parts = {}): Bar[] {
  return cs.map((c, i) => {
    const ch = chords(c);
    return { ...ALL, ...parts, chords: ch, beats: ch.reduce((n, x) => n + x.beats, 0), tune: tune?.[i] };
  });
}

const BARS: Bar[] = [
  // the guitar on its own, then the bass and the brushes come in under it
  ...section(["B6", "E6/B"], null, { bass: false, drums: false }),
  ...section(["B6", "E6/B"], null),
  ...section(VERSE_CHORDS, VERSE),
  ...section(CHORUS_CHORDS, CHORUS, { piano: true }),
  ...section(VERSE_CHORDS, VERSE),
  ...section(CHORUS_CHORDS, CHORUS, { piano: true }),
  ...section(VERSE_CHORDS, null, { solo: true, piano: true }),
  ...section(CHORUS_CHORDS, CHORUS, { piano: true }),
  { ...section(["B6"], ["b5 - - - - - - - - - - - - -"], { piano: true, drums: false })[0], last: true },
];
/** When each bar starts, from the top of the record, and how long the record plays and then sits in the run-out groove. */
const STARTS: number[] = [];
let SONG = 0;
for (const b of BARS) { STARTS.push(SONG); SONG += b.beats * BEAT; }
const CYCLE = SONG + GAP;

/** Where eighth k of a bar falls, in beats from the bar's start (swung). */
const eighth = (k: number) => Math.floor(k / 2) + (k % 2) * SWING;
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** A little seeded random-number maker, so the made-up parts come out the same every time. */
function seeded(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return (s >>> 8) / 16777216;
  };
}

// rootless voicings for the piano's left hand: the third and seventh with a ninth or thirteenth
const VOICING: Record<string, number[]> = {
  "0,4,7,11": [4, 7, 11, 14], "0,3,7,10": [3, 7, 10, 14], "0,4,7,10": [4, 9, 10, 14], "0,3,6,9": [3, 6, 9, 12],
  "0,5,7,10": [5, 7, 10, 14], "0,4,7,9": [4, 7, 9, 14],
};
// where the piano comps in a chord's four or three beats: [eighth it starts on, eighths it lasts]
const COMP4 = [[[0, 3], [3, 3]], [[1, 2], [5, 3]], [[0, 2], [4, 1], [5, 3]], [[0, 1], [3, 4]]];
const COMP3 = [[[0, 2], [3, 3]], [[1, 4]], [[0, 1], [2, 4]], [[0, 3], [5, 1]]];
// the vibes' rhythms when they make it up: 1 starts a note, 0 rests or holds
const LICK4 = ["11011010", "10110111", "01111010", "11110000", "01101101", "10101110"];
const LICK3 = ["110110", "011011", "101110", "111000", "011110"];
// the guitar's strumming, an eighth a step: D a full strum down (an accent), d down, u up, . miss one
const STRUM7 = "D u . u D u d u D u . u d u";
const STRUM4 = "D u . u D u d u";
/** The bass under a held note, a step per beat: up an octave and to the fifth now and then. */
const PEDAL = [0, 0, 12, 0, 0, 7, 12];

/** The record player's band: give it the audio clock to play up to, and it lays the music out ahead. */
export class Band {
  private noise: AudioBuffer;
  private bus: GainNode;
  private vibes: GainNode;
  private crackle: AudioBufferSourceNode;
  private trem: OscillatorNode;
  private nodes: AudioNode[];
  private next = -1;       // the bar to lay out next (BARS.length: the run-out groove)
  private at = 0;          // when it starts, on the audio clock
  private from = 0;        // nothing is laid out to start before this (the first bar, joined part way)
  private soloNote = 79;   // where the vibes' made-up line has got to

  constructor(private c: BaseAudioContext, out: AudioNode) {
    const sr = c.sampleRate;
    this.noise = c.createBuffer(1, sr, sr);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // the little speaker in the lid: no real bass, no top, a bit of honk in the middle
    const hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), honk = c.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 130;
    lp.type = "lowpass"; lp.frequency.value = 5200; lp.Q.value = 0.8;
    honk.type = "peaking"; honk.frequency.value = 1700; honk.gain.value = 4; honk.Q.value = 0.9;
    this.bus = c.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(hp).connect(lp).connect(honk).connect(out);
    // the vibes' motor, turning their sound up and down a few times a second
    this.vibes = c.createGain();
    this.vibes.gain.value = 0.75;
    this.trem = c.createOscillator();
    this.trem.frequency.value = 5.4;
    const depth = c.createGain();
    depth.gain.value = 0.25;
    this.trem.connect(depth).connect(this.vibes.gain);
    this.trem.start();
    this.vibes.connect(this.bus);
    // the crackle and hiss of an old record, round and round
    const len = sr * 4, cb = c.createBuffer(1, len, sr), cd = cb.getChannelData(0);
    for (let i = 0; i < len; i++) cd[i] = (Math.random() * 2 - 1) * 0.012;
    for (let n = 0; n < 4 * 26; n++) {
      const at = Math.floor(Math.random() * (len - 200)), big = Math.random() < 0.15 ? 0.5 : 0.18;
      for (let j = 0; j < 40; j++) cd[at + j] += (Math.random() * 2 - 1) * big * Math.exp(-j / 6);
    }
    this.crackle = c.createBufferSource();
    this.crackle.buffer = cb;
    this.crackle.loop = true;
    const cg = c.createGain();
    cg.gain.value = 0.6;
    this.crackle.connect(cg).connect(this.bus);
    this.crackle.start();
    this.nodes = [hp, lp, honk, this.bus, this.vibes, depth, cg];
  }

  /** Lay out everything due to start before t, on the audio clock. */
  play(t: number) {
    if (this.next < 0) this.cue();
    while (this.at < t) {
      if (this.next >= BARS.length) { this.runOut(this.at); this.at += GAP; this.next = 0; continue; }
      this.bar(this.next, this.at);
      this.at += BARS[this.next].beats * BEAT;
      this.next++;
    }
  }

  /** Lift the needle: fade out and let go of everything. */
  stop() {
    const t = this.c.currentTime;
    this.bus.gain.setTargetAtTime(0, t, 0.08);
    this.crackle.stop(t + 0.6);
    this.trem.stop(t + 0.6);
    setTimeout(() => { for (const n of this.nodes) n.disconnect(); }, 900);
  }

  /** Find where the record has got to by the clock, and pick it up from there. */
  private cue() {
    const now = this.c.currentTime, pos = (((Date.now() / 1000) % CYCLE) + CYCLE) % CYCLE;
    this.from = now + 0.05;
    if (pos >= SONG) { this.next = BARS.length; this.at = now - (pos - SONG); return; }
    this.next = 0;
    while (this.next + 1 < BARS.length && STARTS[this.next + 1] <= pos) this.next++;
    this.at = now - (pos - STARTS[this.next]);
  }

  private bar(i: number, t0: number) {
    const bar = BARS[i], rand = seeded(i + 1), whole = bar.beats * BEAT;
    const at = (k: number) => t0 + eighth(k) * BEAT;
    const len = (k: number, n: number) => (eighth(k + n) - eighth(k)) * BEAT;
    let beat = 0;
    bar.chords.forEach((ch, ci) => {
      const following = bar.chords[ci + 1] ?? BARS[(i + 1) % BARS.length].chords[0];
      const k0 = beat * 2;
      // the bass: held on the note under the chord, or walking (the root on the chord's first beat,
      // chord notes after, and a step into the next chord on its last)
      const lowOf = (p: number) => { const n = 38 + ((p - 2 + 12) % 12); return n > 47 ? n - 12 : n; };
      const low = lowOf(ch.pedal ?? ch.root);
      const walk = [ch.tones[1], ch.tones[2], ch.tones[3], 12, 7, 2].map((s) => low + s);
      if (bar.bass) for (let b = 0; b < ch.beats; b++) {
        if (bar.last) { if (b === 0) this.bass(t0, whole * 0.9, low); continue; }
        const n = ch.pedal !== undefined ? low + PEDAL[(beat + b) % 7]
          : b === 0 ? low : b === ch.beats - 1 ? lowOf(following.pedal ?? following.root) + (rand() < 0.5 ? 1 : -1) : walk[Math.floor(rand() * walk.length)];
        this.bass(t0 + (beat + b) * BEAT, BEAT * 0.92, n);
      }
      // the guitar strums the chord in its open shape, low strings first on the way down
      if (bar.guitar) {
        const g0 = 40 + ((ch.root - 4 + 12) % 12);
        const shape = [0, 7, 12, 12 + ch.tones[1], 12 + ch.tones[3]].map((s) => g0 + s);
        const steps = (bar.last ? "D" : ch.beats === 3 ? STRUM7.split(" ").slice(8).join(" ") : ch.beats === 4 ? STRUM4 : STRUM7).split(" ");
        steps.forEach((st, k) => {
          if (st === ".") return;
          let n = 1;
          while (k + n < steps.length && steps[k + n] === ".") n++;
          const end = bar.last ? whole : len(k0 + k, n);
          this.strum(at(k0 + k), end, shape, st !== "u", st === "D" ? 1 : 0.7);
        });
      }
      // the electric piano comps on the chord
      if (bar.piano) {
        const v = VOICING[ch.tones.join(",")];
        let base = ch.root + v[0];
        while (base < 52) base += 12;
        while (base >= 64) base -= 12;
        const chord = v.map((s) => base - v[0] + s);
        if (bar.last) this.piano(at(k0), whole * 0.95, chord, 0.9);
        else {
          const pick = (a: number[][][]) => a[Math.floor(rand() * a.length)];
          const pat = ch.beats === 4 ? pick(COMP4) : ch.beats === 3 ? pick(COMP3) : [...pick(COMP4), ...pick(COMP3).map(([k, n]) => [k + 8, n])];
          for (const [k, n] of pat) this.piano(at(k0 + k), len(k0 + k, n) * 0.9, chord, k === 0 ? 0.7 : 0.55 + rand() * 0.2);
        }
      }
      // and when it's the vibes' turn, they make up a line over it
      if (bar.solo) {
        const scale: number[] = [];
        for (let m = 62; m <= 88; m++) if ([...ch.tones, 2].some((s) => (m - ch.root - s + 120) % 12 === 0)) scale.push(m);
        const licks = ch.beats === 3 ? [LICK3] : ch.beats === 4 ? [LICK4] : [LICK4, LICK3];
        let off = 0;
        for (const set of licks) {
          const lick = set[Math.floor(rand() * set.length)];
          for (let k = 0; k < lick.length; k++) {
            if (lick[k] !== "1") continue;
            let n = 1;
            while (k + n < lick.length && lick[k + n] === "0" && rand() < 0.5) n++;
            let idx = scale.findIndex((m) => m >= this.soloNote);
            if (idx < 0) idx = scale.length - 1;
            idx = Math.max(0, Math.min(scale.length - 1, idx + Math.floor(rand() * 5) - 2 + (this.soloNote > 82 ? -1 : this.soloNote < 68 ? 1 : 0)));
            this.soloNote = scale[idx];
            this.vibe(at(k0 + off + k), len(k0 + off + k, n), this.soloNote, 0.75 + rand() * 0.25);
          }
          off += lick.length;
        }
      }
      beat += ch.beats;
    });
    // the tune itself
    if (bar.tune) for (const [k, n, m] of notes(bar.tune)) this.vibe(at(k), bar.last ? whole : len(k, n), m, 1);
    // the brushes: ride on every beat with the skip before each pair, the hi-hat's foot, a soft kick
    if (bar.last) { this.ride(t0, 1.6); return; }
    if (!bar.drums) return;
    for (let b = 0; b < bar.beats; b++) {
      const t = t0 + b * BEAT, lead = b === 0 || b === 2 || b === 4;
      this.ride(t, lead ? 1 : 0.75);
      if (b === 1 || b === 3 || b === 5) this.ride(t + SWING * BEAT, 0.55);
      if (b === 1 || b === 3 || b === 6) this.chick(t);
      if (lead) this.kick(t, b === 0 ? 1 : 0.6);
      this.swish(t, lead ? 1 : 0.7);
    }
    if (rand() < 0.35) this.snare(t0 + (bar.beats - 1 + SWING) * BEAT, 0.7);
  }

  /** The needle round the run-out groove, a soft click every turn, then the arm comes back and drops it in again. */
  private runOut(t0: number) {
    for (let t = t0 + 0.4; t < t0 + GAP - 1.2; t += 1.8) { this.hit(t, 0.025, 0.25, 1800, "bandpass"); this.thud(t, 0.2, 70); }
    this.thud(t0 + GAP - 0.7, 0.5, 55);
    this.hit(t0 + GAP - 0.7, 0.06, 0.3, 900, "lowpass");
  }

  // ---- the instruments ----------------------------------------------------------------------

  /** A vibraphone bar: its note, the bright fourth partial that dies away first, through the motor. */
  private vibe(t: number, dur: number, m: number, vel: number) {
    if (t < this.from) return;
    const c = this.c, f = hz(m), ring = Math.max(dur + 0.25, 0.6);
    for (const [ratio, vol, decay] of [[1, 0.2, 1.4], [4, 0.05, 0.25], [10, 0.012, 0.06]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f * ratio;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * vel, t + 0.004);
      g.gain.setTargetAtTime(0, t + 0.004, decay);
      g.gain.setTargetAtTime(0, t + ring - 0.1, 0.05);
      o.connect(g).connect(this.vibes);
      o.start(t); o.stop(t + ring + 0.3);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    }
  }

  /** A strum on a bright steel-string guitar: each string a plucked sawtooth that rings and dulls,
   *  a few milliseconds apart (low to high going down, high to low coming up, and only the top three
   *  strings on the way up), stopped by the next strum. */
  private strum(t: number, dur: number, shape: number[], down: boolean, vel: number) {
    if (t < this.from) return;
    const c = this.c, strings = down ? shape : shape.slice(2).reverse();
    strings.forEach((m, j) => {
      const ts = t + j * (down ? 0.012 : 0.008), o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      o.type = "sawtooth"; o.frequency.value = hz(m) * (1 + (j - 2) * 0.0008);
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(4200, ts);
      lp.frequency.setTargetAtTime(1100, ts, 0.09);
      g.gain.setValueAtTime(0.0001, ts);
      g.gain.linearRampToValueAtTime(0.05 * vel, ts + 0.003);
      g.gain.setTargetAtTime(0, ts + 0.003, 0.35);
      g.gain.setTargetAtTime(0, t + dur, 0.02);
      o.connect(lp).connect(g).connect(this.bus);
      o.start(ts); o.stop(t + dur + 0.15);
      o.onended = () => { o.disconnect(); lp.disconnect(); g.disconnect(); };
    });
  }

  /** An electric piano chord: each note a sine pushed by another at the same pitch, the push fading
   *  quickly into the round tone, the way the old sound cards made their tine pianos. */
  private piano(t: number, dur: number, chord: number[], vel: number) {
    if (t < this.from) return;
    const c = this.c;
    for (const m of chord) {
      const f = hz(m), car = c.createOscillator(), mod = c.createOscillator(), idx = c.createGain(), g = c.createGain();
      car.frequency.value = f; mod.frequency.value = f;
      idx.gain.setValueAtTime(f * 1.6, t);
      idx.gain.setTargetAtTime(f * 0.25, t, 0.12);
      mod.connect(idx).connect(car.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.055 * vel, t + 0.006);
      g.gain.setTargetAtTime(0.024 * vel, t + 0.006, 0.4);
      g.gain.setTargetAtTime(0, t + dur, 0.06);
      car.connect(g).connect(this.bus);
      for (const o of [car, mod]) { o.start(t); o.stop(t + dur + 0.4); }
      car.onended = () => { car.disconnect(); mod.disconnect(); idx.disconnect(); g.disconnect(); };
    }
  }

  /** An upright bass note: a round pluck that thumps and then sings on a little. (Through that speaker
   *  it's mostly the overtones you hear, so it's a triangle wave, kept well under the vibes.) */
  private bass(t: number, dur: number, m: number) {
    if (t < this.from) return;
    const c = this.c, f = hz(m), o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = "triangle"; o.frequency.value = f;
    lp.type = "lowpass"; lp.Q.value = 2;
    lp.frequency.setValueAtTime(1500, t);
    lp.frequency.setTargetAtTime(420, t, 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.008);
    g.gain.setTargetAtTime(0.08, t + 0.008, 0.12);
    g.gain.setTargetAtTime(0, t + dur, 0.04);
    o.connect(lp).connect(g).connect(this.bus);
    o.start(t); o.stop(t + dur + 0.3);
    o.onended = () => { o.disconnect(); lp.disconnect(); g.disconnect(); };
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

  /** A low sine that drops in pitch: the kick, and the needle landing. */
  private thud(t: number, vol: number, f: number) {
    if (t < this.from) return;
    const c = this.c, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.25);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  private ride(t: number, v: number) { this.hit(t, 0.32 * Math.min(v, 1.3), 0.07 * v, 7200, "bandpass", 1.4); this.hit(t, 0.05, 0.04 * v, 4100, "bandpass", 6); }
  private chick(t: number) { this.hit(t, 0.035, 0.05, 6500, "highpass", 0.7); }
  private swish(t: number, v: number) { this.hit(t, BEAT * 0.5, 0.022 * v, 2600, "bandpass", 0.6, BEAT * 0.25); }
  private snare(t: number, v: number) { this.hit(t, 0.09, 0.09 * v, 2200, "bandpass", 0.8); }
  private kick(t: number, v: number) { this.thud(t, 0.22 * v, 52); }
}
