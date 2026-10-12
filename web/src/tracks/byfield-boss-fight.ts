import { defineTrack } from "./notation";

// The boss theme: cocky A mixolydian swagger with blue C naturals, 136 bpm.
export default defineTrack({
  name: "Byfield Boss Fight",
  bpm: 136,
  key: 5,
  intro: "stomp",
  tone: { bright: 1.2, lead: "reed", bass: "slap" },
  riffs: {
    // the boss walks in: a ringing A, a stomp, octave and flat-seven answers
    stomp: {
      guitar: [
        "o0 - - . x0 x0 . x0 o12 - - . o10 - - .",
        "o0 - - . x0 x0 . x0 o7 - - . o5 - o3 -",
        "o0 - - . x0 x0 . x0 o12 - - . o10 - - .",
        "o5 - - . x5 x5 . x5 o3 - o4 - o7 - - -",
      ],
      drums: { k: "x...xx.xx...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 5, weight: 3,
    },
    // swung strut with a blue C sliding up to C sharp
    strut: {
      guitar: [
        "o0 - . o0 - . o10 - . o0 - . o3 - o4 -",
        "o5 - . o5 - . o3 - . o5 - . o7 - - -",
        "o0 - . o0 - . o10 - . o0 - . o3 - o5 -",
        "o10 - . o10 - . o7 - . o5 - . o3 - o2 -",
      ],
      lead: [
        "a5 - . a5 - . g5 - . e5 - . c6 - c#6 -",
        "d6 - . a5 - . g5 - . f#5 - . e5 - - -",
        "a5 - . c#6 - . d6 - . e6 - . g6 - f#6 -",
        "g5 - . b5 - . b5 - . a5 - . g5 - f#5 -",
      ],
      drums: "swing", weight: 2,
    },
    // palm-muted grind on the A pedal with flat-seven and octave hits
    grind: {
      guitar: [
        "x0 . x0 x0 . x0 o10 - - . x0 . x0 x0 o12 -",
        "x0 . x0 x0 . x0 o7 - - . x0 . x0 x0 o5 -",
        "x0 . x0 x0 . x0 o10 - - . x0 . x0 x0 o12 -",
        "x0 . x0 x0 . x0 o3 - - . o4 - - . o7 -",
      ],
      drums: "rock", shift: 5,
    },
    // the throne: triumphant A-G-D-E chorus with a menacing blue C in the turnaround
    throne: {
      guitar: [
        "o0 - - - - - x0 x0 o10 - - - - - x10 x10",
        "o5 - - - - - x5 x5 o7 - - - - - x7 x7",
        "o0 - - - - - x0 x0 o10 - - - - - x10 x10",
        "o3 - - - - - o5 - - - - - o7 - - -",
      ],
      lead: [
        "a5 - - - - - c#6 - d6 - - - b5 - - -",
        "a5 - - - - - f#5 - g#5 - - - b5 - - -",
        "c#6 - - - - - e6 - g6 - - - - - d6 -",
        "c6 - - - e6 - d6 - - - f#6 - e6 - - -",
      ],
      drums: { k: "x...x.x.x...x.x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      weight: 2,
    },
    // the lair: half-time breakdown with cocky blues runs between the hits
    lair: {
      guitar: [
        "o0 - - - - - - - x0 . x0 x0 . x0 o3 -",
        "o0 - - - - - - - x0 . x0 x0 . x0 o10 -",
        "o0 - - - - - - - x0 . x0 x0 . x0 o3 -",
        "o5 - - - - - - - o3 - - - o7 - - -",
      ],
      lead: [
        "a5 - - - - - - - c6 a5 c6 c#6 e6 c#6 e6 -",
        "a5 - - - - - - - c6 a5 c6 c#6 e6 d6 b5 -",
        "e6 - - - - - - - g6 e6 c#6 e6 c6 a5 g5 -",
        "f#6 - - - - - - - e6 - c6 - g#5 - b5 -",
      ],
      drums: { k: "x.......x.xx.x..", s: "........x.......", h: "x...x...x...x..." },
      shift: 5,
    },
  },
});
