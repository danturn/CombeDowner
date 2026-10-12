import { defineTrack } from "./notation";

// The original theme: E minor, 152 bpm.
export default defineTrack({
  name: "Hadley Arms",
  bpm: 152,
  intro: "gate",
  riffs: {
    // pedal-tone chug with stabs climbing and falling around it
    gate: {
      guitar: [
        "x0 . x0 . o12 - x0 . x0 . o10 - x0 . o7 -",
        "x0 . x0 . o8 - x0 . x0 . o7 - o6 - o5 -",
        "x0 . x0 . o12 - x0 . x0 . o10 - x0 . o7 -",
        "x0 . x0 . o3 - x0 . o5 - o6 - o7 - - -",
      ],
      drums: "rock", shift: 5, weight: 3,
    },
    // swaggering blues-minor groove
    swagger: {
      guitar: [
        "o0 - - . o0 . o3 - . o5 - . o6 - o5 -",
        "x0 x0 x0 x0 o3 - . o0 - - . x0 x0 . o10 -",
        "o0 - - . o0 . o3 - . o5 - . o6 - o5 -",
        "x0 x0 x0 x0 o7 - . o5 - . o3 - o2 - o1 -",
      ],
      lead: [
        "e5 - - . g5 - a5 - a#5 - a5 - g5 - e5 -",
        "d5 - e5 - - - - - . . b4 - d5 - e5 -",
        "g5 - - . g5 - a5 - b5 - - - a5 - g5 -",
        "a5 - g5 - e5 - d5 - e5 - - - - - . .",
      ],
      drums: "swing", weight: 3,
    },
    // galloping march through E, C, D and B
    gallop: {
      guitar: [
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o0 - - -",
        "x8 . x8 x8 x8 . x8 x8 x8 . x8 x8 o8 - - -",
        "x10 . x10 x10 x10 . x10 x10 x10 . x10 x10 o10 - - -",
        "x7 . x7 x7 x7 . x7 x7 o7 - - - o6 - - -",
      ],
      lead: [
        "b4 - - - e5 - - - g5 - - - f#5 - e5 -",
        "g5 - - - - - - - e5 - g5 - c6 - - -",
        "a5 - - - - - f#5 - d5 - - - a5 - - -",
        "b5 - - - a5 - g5 - f#5 - - - d#5 - - -",
      ],
      drums: "gallop", shift: 5, weight: 2,
    },
    // slow, heavy breakdown with a wailing lead
    crusher: {
      guitar: [
        "o0 - - - - - x0 x0 . . x0 . x0 x0 . .",
        "o1 - - - - - x0 x0 . . x0 . o3 - o2 -",
        "o0 - - - - - x0 x0 . . x0 . x0 x0 . .",
        "o0 - - - - - x0 x0 x0 x0 o12 - o10 - o7 -",
      ],
      lead: [
        "b5 - - - - - - - - - - - - - . .",
        "c6 - - - - - - - b5 - - - a#5 - - -",
        "b5 - - - - - - - - - - - - - . .",
        "g5 - - - f#5 - - - f5 - - - e5 - - -",
      ],
      drums: "half",
    },
    // flat-out sixteenth chug under a shred line
    drive: {
      guitar: [
        "x0 x0 x0 x0 x0 x0 o3 - x0 x0 x0 x0 x0 x0 o5 -",
        "x0 x0 x0 x0 x0 x0 o7 - x0 x0 o6 - x0 x0 o5 -",
        "x0 x0 x0 x0 x0 x0 o3 - x0 x0 x0 x0 x0 x0 o5 -",
        "x0 x0 o10 - x0 x0 o8 - x0 x0 o7 - o5 - o3 -",
      ],
      lead: [
        "e5 . e5 g5 e5 . e5 a5 e5 . e5 b5 a5 g5 a5 -",
        "e5 . e5 g5 e5 . e5 b5 c6 - b5 - a5 - g5 -",
        "e5 . e5 g5 e5 . e5 a5 e5 . e5 b5 a5 g5 a5 -",
        "d6 - c6 - b5 - a5 - g5 - f#5 - e5 - - -",
      ],
      drums: "double", shift: 5, weight: 2,
    },
  },
});
