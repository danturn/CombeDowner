import { defineTrack } from "./notation";

// The low sun through the trees on the way home: big, bright and soaring. B minor that spends most
// of its time in D major, 144 bpm.
export default defineTrack({
  name: "Golden Hour, Rainbow Wood",
  bpm: 144,
  key: -5,
  hour: 18.5,
  intro: "glow",
  tone: { bright: 1.1, lead: "brass", bass: "pick" },
  riffs: {
    // four open chords pushed along off the beat
    glow: {
      guitar: [
        "o3 - - o3 - - o3 - o10 - - o10 - - o10 -",
        "o12 - - o12 - - o12 - o8 - - o8 - - o8 -",
        "o3 - - o3 - - o3 - o10 - - o10 - - o10 -",
        "o12 - - o12 - - o12 - o10 - - - - - - -",
      ],
      drums: "rock", weight: 2,
    },
    // the same chords at a chug, and a tune that climbs through the leaves
    canopy: {
      guitar: [
        "x3 . x3 . o3 - x3 . x10 . x10 . o10 - x10 .",
        "x0 . x0 . o0 - x0 . x8 . x8 . o8 - x8 .",
        "x3 . x3 . o3 - x3 . x10 . x10 . o10 - x10 .",
        "x0 . x0 . o0 - x0 . o10 - - - o10 - - -",
      ],
      lead: [
        "f#5 - - - a5 - d6 - c#6 - - - a5 - e5 -",
        "d5 - - - f#5 - b5 - b5 - - - a5 - g5 -",
        "f#5 - - - a5 - d6 - e6 - - - c#6 - a5 -",
        "f#6 - - - - - d6 - e6 - - - - - - -",
      ],
      drums: "rock", weight: 3,
    },
    // long shadows: half speed, long notes
    shadows: {
      guitar: [
        "o0 - - - - - x0 x0 . . x0 . o3 - - -",
        "o8 - - - - - x8 x8 . . x8 . o10 - - -",
        "o0 - - - - - x0 x0 . . x0 . o3 - - -",
        "o5 - - - - - x5 x5 o7 - - - o7 - - -",
      ],
      lead: [
        "b5 - - - - - - - f#5 - - - d6 - - -",
        "d6 - - - - - b5 - c#6 - - - e6 - - -",
        "b5 - - - - - - - f#5 - - - f#6 - - -",
        "e6 - - - - - b5 - c#6 - - - a#5 - - -",
      ],
      drums: "half",
    },
    // heading home before the light goes
    homeward: {
      guitar: [
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o3 - o5 -",
        "x8 . x8 x8 x8 . x8 x8 x8 . x8 x8 o10 - o8 -",
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o3 - o5 -",
        "x5 . x5 x5 x5 . x5 x5 o7 - - - o7 - o7 -",
      ],
      drums: "gallop", shift: 5, weight: 2,
    },
    // swifts over the rooftops: the lead wheeling round in fast arpeggios
    swifts: {
      guitar: [
        "x0 x0 x0 x0 x0 x0 o3 - x0 x0 x0 x0 x0 x0 o10 -",
        "x8 x8 x8 x8 x8 x8 o10 - x8 x8 x8 x8 x8 x8 o7 -",
        "x0 x0 x0 x0 x0 x0 o3 - x0 x0 x0 x0 x0 x0 o10 -",
        "x5 x5 x5 x5 x5 x5 x5 x5 o7 - - - o7 - - -",
      ],
      lead: [
        "b5 d6 f#6 d6 b5 d6 f#6 d6 b5 d6 f#6 d6 a5 c#6 e6 -",
        "b5 d6 g6 d6 b5 d6 g6 d6 b5 d6 g6 d6 a#5 c#6 f#6 -",
        "b5 d6 f#6 d6 b5 d6 f#6 d6 b5 d6 f#6 d6 a5 c#6 e6 -",
        "b5 e6 g6 e6 b5 e6 g6 e6 f#6 - - - c#6 - - -",
      ],
      drums: "double",
    },
  },
});
