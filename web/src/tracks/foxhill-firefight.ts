import { defineTrack } from "./notation";

// Flat-out F# minor firefight, 176 bpm: gallops, tremolo bursts and harmonic-minor runs.
export default defineTrack({
  name: "Foxhill Firefight",
  bpm: 176,
  key: 2,
  intro: "charge",
  tone: { lead: "brass", bass: "pick" },
  riffs: {
    // the charge: a tonic gallop broken by falling open stabs
    charge: {
      guitar: [
        "x0 . x0 x0 x0 . x0 x0 o3 - . o2 - . x0 x0",
        "x0 . x0 x0 x0 . x0 x0 o8 - . o7 - . x0 x0",
        "x0 . x0 x0 x0 . x0 x0 o3 - . o2 - . x0 x0",
        "o5 . x5 x5 o7 . x7 x7 o8 . x8 x8 o8 - o7 -",
      ],
      drums: "gallop", shift: 5, weight: 3,
    },
    // tremolo-picked bursts that cut out dead, with a screaming lead on top
    tremor: {
      guitar: [
        "o0 o0 o0 o0 o0 o0 o0 o0 o0 o0 o0 o0 . . x0 x0",
        "o8 o8 o8 o8 o8 o8 o8 o8 o7 o7 o7 o7 . . x0 x0",
        "o0 o0 o0 o0 o0 o0 o0 o0 o0 o0 o0 o0 . . x0 x0",
        "o3 o3 o3 o3 o5 o5 o5 o5 o7 - - . o7 . o7 .",
      ],
      lead: [
        "c#6 - - - - - - - b5 a5 g#5 a5 f#5 - . .",
        "d6 - - - - - - - c#6 - - - f5 - . .",
        "f#6 - - - - - - - e6 d6 c#6 d6 c#6 - . .",
        "e5 a5 c#6 e6 d6 b5 f#5 b5 c#6 - - . g#5 . f5 .",
      ],
      drums: "double", weight: 2,
    },
    // clipped reverse-gallop verse with short lead answers in the gaps
    volley: {
      guitar: [
        "x0 x0 x0 . x0 x0 x0 . x0 x0 x0 . o0 - o3 -",
        "x0 x0 x0 . x0 x0 x0 . x0 x0 x0 . o5 - o3 -",
        "x0 x0 x0 . x0 x0 x0 . x0 x0 x0 . o0 - o3 -",
        "x8 x8 x8 . x8 x8 x8 . x7 x7 x7 . o7 - - -",
      ],
      lead: [
        ". . . . . . . . . . . . f#5 - a5 -",
        ". . . . . . . . . . . . b5 - a5 -",
        ". . . . . . . . . . . . c#6 - e6 -",
        "d6 . d6 c#6 a5 . a5 f#5 g#5 . g#5 f5 c#6 - - -",
      ],
      drums: { k: "xxx.xxx.xxx.x.x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
    },
    // double-kick barrage under a harmonic-minor shred
    barrage: {
      guitar: [
        "x0 x0 x0 x0 o8 - x0 x0 x0 x0 o7 - x0 x0 o5 -",
        "x0 x0 x0 x0 o8 - x0 x0 x0 x0 o7 - o3 - o2 -",
        "x0 x0 x0 x0 o8 - x0 x0 x0 x0 o7 - x0 x0 o5 -",
        "x8 x8 x8 x8 o8 - - - x7 x7 x7 x7 o7 - - -",
      ],
      lead: [
        "f#5 g#5 a5 c#6 d6 - c#6 a5 f5 f#5 g#5 - f#5 f5 f#5 -",
        "a5 b5 c#6 e6 f#6 - e6 d6 c#6 a5 g#5 - a5 - g#5 -",
        "f#6 - c#6 a5 d6 - a5 f#5 f#5 f5 g#5 - a5 c#6 f#6 -",
        "d6 - - - a5 - f#5 - f6 - - - - - - -",
      ],
      drums: "double", weight: 2,
    },
    // the breach: half-time ringing chords with a kick flurry into each bar
    breach: {
      guitar: [
        "o0 - - - - - o0 - - - o3 - - - x3 x3",
        "o8 - - - - - o8 - - - o7 - - - x7 x7",
        "o0 - - - - - o0 - - - o3 - - - x3 x3",
        "o5 - - - - - o7 - - - - - x7 x7 x7 x7",
      ],
      drums: { k: "x.....x...x...xx", s: "........x.......", h: "x...x...x...x..." },
      shift: 7,
    },
  },
});
