import { defineTrack } from "./notation";

// Flat-out E minor thrash with chromatic runs and punky bursts, 186 bpm.
export default defineTrack({
  name: "Firs Field Frenzy",
  bpm: 186,
  intro: "frenzy",
  tone: { bright: 1.2, lead: "brass", bass: "pick" },
  riffs: {
    // clipped tremolo bursts kicked along by half-step stabs, then a chromatic slide home
    frenzy: {
      guitar: [
        "x0 x0 x0 . x0 x0 o5 o6 x0 x0 x0 . x0 x0 o3 o1",
        "x0 x0 x0 . x0 x0 o5 o6 x0 x0 o7 - o6 - o5 -",
        "x0 x0 x0 . x0 x0 o5 o6 x0 x0 x0 . x0 x0 o3 o1",
        "x0 x0 o12 - o11 - o10 - o9 - o8 - o7 - o6 o7",
      ],
      drums: "double", shift: 5, weight: 3,
    },
    // punky open-chord bursts with a shouted brass hook
    thrasher: {
      guitar: [
        "o0 - o0 - . . o0 - o3 - o3 - . . o5 -",
        "o6 - o5 - . . o3 - o0 - - - x0 x0 x0 x0",
        "o0 - o0 - . . o0 - o3 - o3 - . . o5 -",
        "o8 - o8 - . . o7 - o7 - . . o10 - o7 -",
      ],
      lead: [
        "b5 - - . b5 - g5 - d6 - b5 - . . e6 -",
        "f6 - e6 - . . d6 - b5 - - - . . . .",
        "e6 - - . d6 - b5 - b5 - d6 - . . c6 -",
        "c6 - g5 - . . b5 - f#5 - . . a5 - b5 -",
      ],
      drums: "punk", weight: 2,
    },
    // blast-beat tremolo on grinding semitones under screaming held notes
    grinder: {
      guitar: [
        "x0 x0 x0 x0 x0 x0 x0 x0 x1 x1 x1 x1 x1 x1 x1 x1",
        "x0 x0 x0 x0 x0 x0 x0 x0 x3 x3 x3 x3 x2 x2 x2 x2",
        "x0 x0 x0 x0 x0 x0 x0 x0 x1 x1 x1 x1 x1 x1 x1 x1",
        "x6 x6 x6 x6 x5 x5 x5 x5 x3 x3 x3 x3 o1 - - -",
      ],
      lead: [
        "b5 - - - - - - - c6 - - - - - - -",
        "b5 - - - - - - - d6 - - - c#6 - - -",
        "e6 - - - - - - - f6 - - - - - - -",
        "f6 - e6 - d#6 - e6 - d6 - c#6 - c6 - b5 -",
      ],
      drums: "blast", shift: 5, weight: 2,
    },
    // stop-start mosh part, the kick hammering every hit
    mosh: {
      guitar: [
        "o0 - - . . . x0 x0 o0 - - . . . x0 x0",
        "o1 - - . . . x1 x1 o3 - - . o1 - x0 x0",
        "o0 - - . . . x0 x0 o0 - - . . . x0 x0",
        "o6 - - . o5 - - . o3 - - . o1 - - .",
      ],
      drums: { k: "x.....xxx.....xx", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
    },
    // non-stop sixteenth chug under a shredding scale run
    sprint: {
      guitar: [
        "x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 o10 - o12 -",
        "x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 o8 - o7 -",
        "x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 o10 - o12 -",
        "x5 x5 x5 x5 x5 x5 x5 x5 x6 x6 x6 x6 o7 - - -",
      ],
      lead: [
        "e5 f#5 g5 e5 f#5 g5 a5 f#5 g5 a5 b5 g5 d6 - e6 -",
        "e6 d6 b5 e6 d6 b5 a5 b5 g5 a5 f#5 g5 e6 - b5 -",
        "e5 f#5 g5 e5 f#5 g5 a5 f#5 g5 a5 b5 g5 d6 - e6 -",
        "a5 b5 c6 a5 b5 c6 d6 b5 a#5 b5 a#5 a5 b5 - - -",
      ],
      drums: "double", shift: 7, weight: 2,
    },
  },
});
