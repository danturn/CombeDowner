import { defineTrack } from "./notation";

// Swaggering blues-metal shuffle with a nasal reed lead: D minor blues, 112 bpm.
export default defineTrack({
  name: "Prior Park Shuffle",
  bpm: 112,
  key: -2,
  intro: "strut",
  tone: { lead: "reed", bass: "slap" },
  riffs: {
    // long-short shuffle hook on D, F and G, the second bar bending through the blue note
    strut: {
      guitar: [
        "o0 - . x0 . x0 o3 - . o5 - x0",
        "o0 - . x0 . x0 o6 - o5 o3 - x0",
        "o0 - . x0 . x0 o3 - . o5 - x0",
        "o10 - x10 o7 - x7 o6 - o5 o3 - -",
      ],
      drums: { k: "x....xx....x", s: "...x.....x..", h: "x.xx.xx.xx.x" },
      shift: 5, weight: 3,
    },
    // palm-muted boogie moving to G, licks trading with the riff, chromatic walk home
    boogie: {
      guitar: [
        "x0 . x0 x0 . x0 x0 . x0 o3 - x3",
        "x0 . x0 x0 . x0 x0 . x0 o5 - o6",
        "x5 . x5 x5 . x5 x5 . x5 o6 - o5",
        "x7 . x7 x6 . x6 x5 . x5 o3 - -",
      ],
      lead: [
        "d5 - f5 - . g5 - g#5 a5 - - -",
        "c6 - a5 c6 - a5 g5 - f5 d5 - -",
        "d6 - c6 - . a5 c6 - d6 - - .",
        "a5 - . g#5 - . g5 - . f5 - -",
      ],
      drums: "shuffle", shift: 5, weight: 2,
    },
    // slow, heavy drag with the kick on the chugs and a wailing bent lead
    kingpin: {
      guitar: [
        "o0 - - - - - x0 x0 . o3 - -",
        "o0 - - - - - x0 x0 . o6 - o5",
        "o0 - - - - - x0 x0 . o3 - -",
        "o10 - - - - - o7 - - o6 - -",
      ],
      lead: [
        "a5 - - - - - - - . c6 - -",
        "d6 - - - - - c6 - a5 g#5 - g5",
        "f6 - - - - - - - d6 c6 - -",
        "c6 - - d6 - c6 a5 - - g#5 - -",
      ],
      drums: "heavy12",
    },
    // strummed chorus, Dm to C to F and G, hanging on A before it comes round
    brawl: {
      guitar: [
        "o0 - x0 o0 - x0 o0 - x0 o0 - -",
        "o10 - x10 o10 - x10 o10 - x10 o10 - -",
        "o3 - x3 o3 - x3 o5 - x5 o5 - -",
        "o7 - - - - - o7 - x7 o7 - x7",
      ],
      lead: [
        "a5 - - a5 - g5 a5 - c6 d6 - -",
        "c6 - - - - a5 g5 - - g5 - -",
        "a5 - - c6 - - d6 - - d6 - c6",
        "a5 - - - - - c6 - a5 g#5 g5 f5",
      ],
      drums: { k: "x.....x..x.x", s: "...x.....x..", h: "o.xo.xo.xo.x" },
      weight: 2,
    },
    // stop-time: one chord and silence, the lead fills every gap
    cellar: {
      guitar: [
        "o0 - . . . . . . . . . .",
        "o3 - . . . . . . . . . .",
        "o5 - . . . . o6 - . . . .",
        "o7 - x7 o7 - x7 o6 - x6 o5 - x5",
      ],
      lead: [
        ". . . d5 f5 g5 a5 - - c6 - a5",
        ". . . a5 c6 a5 f5 - - g5 - g#5",
        ". . . d6 c6 a5 g#5 - - g5 - f5",
        "a5 - - . . . . . . . . .",
      ],
      drums: { k: "x.....x.....", s: "............", h: "x.xx.xx.xx.x" },
    },
  },
});
