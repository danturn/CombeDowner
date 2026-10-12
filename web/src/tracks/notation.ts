// The notation the soundtrack's tracks are written in, and the checks that keep them playable.
//
// A track is a set of riffs. Each riff is four bars, and every bar is 16 steps (sixteenth notes)
// or 12 steps (triplet eighths, for shuffles and triplet gallops); all bars in a riff use the same
// grid. Steps are separated by spaces.
//
// Guitar: xN = palm-muted power chord, oN = open power chord, N semitones above the track's
//   tonic (0 = tonic, 12 = an octave up; -5 to 24). - holds the previous chord, . is a rest.
//   The bass doubles the guitar an octave down.
// Lead: note names such as e5, f#4 or a#5 (sharps only, octaves 4 to 6), - to hold, . to rest.
//   Leads are written at concert pitch and are not moved by the track's key.
// Drums: a preset name, or a groove with one character per step:
//   k (kick) and s (snare): x = hit; h (hats): x = closed, o = open, . = nothing.

export type Hit = { step: number; len: number; off: number; mute: boolean };
export type Note = { step: number; len: number; midi: number };
export type Groove = { k: string; s: string; h: string };

export type RiffSource = {
  guitar: string[];
  lead?: string[];
  drums: DrumPreset | Groove;
  /** Semitones this riff may be moved up for variety (0 or missing = never). */
  shift?: number;
  /** How often the arrangement picks this riff, relative to the others. Default 1. */
  weight?: number;
};

export type Tone = {
  /** Guitar brightness: 0.6 is dark and woolly, 1 is the default, 1.4 is fizzy. */
  bright?: number;
  /** Lead patch: brass (bright, biting), hollow (square-ish, woody), bell (glassy, decaying), reed (nasal). */
  lead?: "brass" | "hollow" | "bell" | "reed";
  /** Bass patch: slap (plucky), pick (steady and growly), sub (deep and round). */
  bass?: "slap" | "pick" | "sub";
};

export type TrackSource = {
  name: string;
  /** Who wrote it, when it's a cover of a real song. */
  artist?: string;
  bpm: number;
  /** Tonic, in semitones from E (-5 = B below up to 7 = B above). Default 0. */
  key?: number;
  /** The riff the track opens with; it plays once on its own before the drums come in. */
  intro: string;
  tone?: Tone;
  riffs: Record<string, RiffSource>;
};

export type Riff = { len: 12 | 16; guitar: Hit[][]; lead?: Note[][]; drums: Groove; shift: number; weight: number };
export type Track = { name: string; artist?: string; bpm: number; key: number; intro: string; tone: Required<Tone>; riffs: Record<string, Riff> };

export const DRUMS = {
  rock:    { k: "x.x.....x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
  swing:   { k: "x..x..x...x..x..", s: "....x.......x..x", h: "x.xox.x.x.xox.x." },
  gallop:  { k: "x.xxx.xxx.xxx.xx", s: "....x.......x...", h: "x...x...x...x..." },
  half:    { k: "x.....xx..x.....", s: "........x.......", h: "x...x...x...x..." },
  double:  { k: "xxxxxxxxxxxxxxxx", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
  punk:    { k: "x...x...x...x...", s: "..x...x...x...x.", h: "x.x.x.x.x.x.x.x." },
  blast:   { k: "x.x.x.x.x.x.x.x.", s: ".x.x.x.x.x.x.x.x", h: "x.x.x.x.x.x.x.x." },
  march:   { k: "x.......x.......", s: "....x..x....x.xx", h: "x.x.x.x.x.x.x.x." },
  sparse:  { k: "x.........x.....", s: "........x.......", h: "x.......x......." },
  // 12-step (triplet) grooves
  shuffle: { k: "x.....x..x..", s: "...x.....x..", h: "x.xx.xx.xx.x" },
  trip:    { k: "x.xx.xx.xx.x", s: "...x.....x..", h: "x..x..x..x.." },
  heavy12: { k: "x.....xx....", s: "......x.....", h: "x.....x....." },
};
export type DrumPreset = keyof typeof DRUMS;

const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function steps(bar: string, where: string) {
  const t = bar.trim().split(/\s+/);
  if (t.length !== 16 && t.length !== 12) throw new Error(`${where}: a bar needs 16 or 12 steps, not ${t.length}: "${bar}"`);
  return t;
}

function parseGuitar(bar: string, where: string): Hit[] {
  const hits: Hit[] = [];
  steps(bar, where).forEach((t, i) => {
    const last = hits[hits.length - 1];
    if (t === "-") { if (last && last.step + last.len === i) last.len++; return; }
    if (t === ".") return;
    const m = /^([xo])(-?\d+)$/.exec(t);
    if (!m) throw new Error(`${where}: "${t}" is not a guitar step (xN, oN, - or .)`);
    const off = Number(m[2]);
    if (off < -5 || off > 24) throw new Error(`${where}: ${t} is out of range (-5 to 24)`);
    hits.push({ step: i, len: 1, off, mute: m[1] === "x" });
  });
  return hits;
}

function parseLead(bar: string, where: string): Note[] {
  const notes: Note[] = [];
  steps(bar, where).forEach((t, i) => {
    const last = notes[notes.length - 1];
    if (t === "-") { if (last && last.step + last.len === i) last.len++; return; }
    if (t === ".") return;
    const m = /^([a-g])(#?)([4-6])$/.exec(t);
    if (!m) throw new Error(`${where}: "${t}" is not a lead note (like e5 or f#4, octaves 4 to 6)`);
    notes.push({ step: i, len: 1, midi: 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] ? 1 : 0) });
  });
  return notes;
}

/** Parse and check a track, so a mistake in the notation fails loudly when the game loads. */
export function defineTrack(src: TrackSource): Track {
  const key = src.key ?? 0;
  if (key < -5 || key > 7) throw new Error(`${src.name}: key must be -5 to 7`);
  if (src.bpm < 70 || src.bpm > 220) throw new Error(`${src.name}: bpm must be 70 to 220`);
  if (!(src.intro in src.riffs)) throw new Error(`${src.name}: intro riff "${src.intro}" doesn't exist`);
  const riffs: Record<string, Riff> = {};
  for (const [name, r] of Object.entries(src.riffs)) {
    const where = `${src.name} / ${name}`;
    if (r.guitar.length !== 4) throw new Error(`${where}: guitar needs 4 bars`);
    if (r.lead && r.lead.length !== 4) throw new Error(`${where}: lead needs 4 bars`);
    const len = steps(r.guitar[0], where).length as 12 | 16;
    for (const bar of [...r.guitar, ...(r.lead ?? [])]) {
      if (steps(bar, where).length !== len) throw new Error(`${where}: all bars must have ${len} steps: "${bar}"`);
    }
    const drums = typeof r.drums === "string" ? DRUMS[r.drums] : r.drums;
    if (!drums) throw new Error(`${where}: unknown drum preset "${r.drums}"`);
    for (const part of [drums.k, drums.s, drums.h]) {
      if (part.length !== len) throw new Error(`${where}: drum pattern "${part}" must have ${len} steps`);
    }
    riffs[name] = {
      len,
      guitar: r.guitar.map((b, i) => parseGuitar(b, `${where} bar ${i + 1}`)),
      lead: r.lead?.map((b, i) => parseLead(b, `${where} lead bar ${i + 1}`)),
      drums, shift: r.shift ?? 0, weight: r.weight ?? 1,
    };
  }
  return {
    name: src.name, artist: src.artist, bpm: src.bpm, key, intro: src.intro, riffs,
    tone: { bright: 1, lead: "brass", bass: "slap", ...src.tone },
  };
}
