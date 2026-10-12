import { defineTrack } from "./notation";

// Heroic triplet gallops and twin-guitar style leads: E minor, 132 bpm, all on the triplet grid.
export default defineTrack({
  name: "Tyning Triplets",
  bpm: 132,
  intro: "charge",
  tone: { bright: 1.1, lead: "brass" },
  riffs: {
    // triplet gallop on E answered by G and A, climbing out through C and D
    charge: {
      guitar: [
        "x0 x0 x0 x0 . x0 o3 - - o5 - -",
        "x0 x0 x0 x0 . x0 o7 - - o5 - o3",
        "x0 x0 x0 x0 . x0 o3 - - o5 - -",
        "o8 - - o8 - x8 o10 - - o10 - x10",
      ],
      drums: { k: "xxxx.xx..x..", s: "...x.....x..", h: "x..x..x..x.." },
      shift: 5, weight: 3,
    },
    // galloping Em, C, D and B under a soaring two-bar call and answer
    valour: {
      guitar: [
        "o0 - x0 x0 x0 x0 o0 - x0 x0 x0 x0",
        "o8 - x8 x8 x8 x8 o8 - x8 x8 x8 x8",
        "o10 - x10 x10 x10 x10 o10 - x10 x10 x10 x10",
        "o7 - x7 x7 x7 x7 o5 - - o7 - -",
      ],
      lead: [
        "e5 - - g5 - - b5 - - - a5 b5",
        "c6 - - - - - b5 - a5 g5 - -",
        "a5 - - - - - f#5 - - a5 - d6",
        "f#5 - - g5 - - a5 - - b5 - -",
      ],
      drums: "trip", shift: 2, weight: 3,
    },
    // half-time verse chug with a chromatic sting and a B to A# drop
    ridge: {
      guitar: [
        "o0 - - - - x0 x0 . x0 o1 - -",
        "o0 - - - - x0 x0 . x0 o3 - o2",
        "o0 - - - - x0 x0 . x0 o1 - -",
        "o0 - - x0 x0 x0 o7 - - o6 - -",
      ],
      drums: "heavy12", shift: 5,
    },
    // Em, D, C, B descent with a triplet arpeggio run sequenced down each bar
    skyward: {
      guitar: [
        "x0 x0 x0 x0 x0 x0 x0 x0 x0 o0 - -",
        "x10 x10 x10 x10 x10 x10 x10 x10 x10 o10 - -",
        "x8 x8 x8 x8 x8 x8 x8 x8 x8 o8 - -",
        "x7 x7 x7 x7 x7 x7 o7 - - o7 - -",
      ],
      lead: [
        "e6 d6 b5 g5 a5 b5 g5 f#5 e5 b5 - -",
        "d6 c6 a5 f#5 g5 a5 f#5 e5 d5 a5 - -",
        "c6 b5 g5 e5 f#5 g5 e5 d5 c5 g5 - -",
        "b5 - - - - - f#5 g5 a5 b5 c6 d6",
      ],
      drums: { k: "xxxxxxxxxxxx", s: "...x.....x..", h: "x..x..x..x.." },
      weight: 2,
    },
    // G, D, C, B chorus lift with long ringing chords and held lead notes
    banner: {
      guitar: [
        "o3 - - - - x3 o3 - - x3 x3 x3",
        "o10 - - - - x10 o10 - - x10 x10 x10",
        "o8 - - - - x8 o8 - - x8 x8 x8",
        "o10 - - - - x10 o7 - - o7 - -",
      ],
      lead: [
        "b5 - - - - - - - - d6 c6 b5",
        "a5 - - - - - - - - f#5 g5 a5",
        "g5 - - - - - e5 - - g5 - c6",
        "d6 - - - - - b5 - - - - -",
      ],
      drums: "shuffle", weight: 2,
    },
  },
});
