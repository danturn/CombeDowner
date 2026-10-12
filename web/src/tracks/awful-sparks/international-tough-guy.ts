import { defineTrack } from "../notation";

// Awful Sparks' "International Tough Guy" as a 90s shooter cover: E-major verses into a D-major chorus, 108 bpm.
export default defineTrack({
  name: "International Tough Guy",
  artist: "Awful Sparks",
  bpm: 108,
  key: -2,
  intro: "intro",
  tone: { lead: "brass", bass: "slap", bright: 1.2 },
  riffs: {
    // the opening A, G, then B, G#, E, down to D and the big C hit, climbing G, G# back to A
    intro: {
      guitar: [
        "o7 - - - x7 x7 x7 x7 o7 - - x7 o5 - - -",
        "o9 - - x9 o6 - - x6 o2 - - - x2 x2 x2 x2",
        "o6 - - x6 o2 - - x2 x2 x2 x2 x2 o0 - - -",
        "o0 - - - o-2 - - - - - x-2 x-2 x-2 x-2 o5 o6",
      ],
      drums: "rock",
    },
    // swaggering verse on E, E to D, C to Am, Am back to E, with a chromatic pickup
    verse: {
      guitar: [
        "x2 . x2 x2 o6 - x2 . x2 x2 o6 - x2 . x2 x2",
        "x2 . x2 x2 x2 . x2 x2 o7 - x7 x7 o0 - x0 x0",
        "o10 - x10 x10 x10 . x10 x10 o7 - x7 x7 x7 . x7 x7",
        "o7 - x7 x7 x7 x7 o7 - o6 - - - o2 - o0 o1",
      ],
      lead: [
        "b5 - g#5 - . . g#5 - - - e5 - . . g#5 -",
        "b5 - - - . . e6 - - - - . a5 d6 - a5",
        "g5 - - - - c6 - - a5 - g5 - e5 - - -",
        "e5 - - - - - . . . . . . b5 - g#5 -",
      ],
      drums: { k: "x..x..x...x..x..", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." }, weight: 2,
    },
    // the pre-chorus: D to C, then the G, A#, C stomp, the line rising to a held G
    pre: {
      guitar: [
        "o12 - x12 x12 x12 . x12 x12 o10 - x10 x10 x10 . x10 x10",
        "o10 - x10 x10 x10 . x10 x10 o7 - - - o12 - - -",
        "o5 - - x5 o8 - - x8 o10 - - - x10 x10 x10 x10",
        "x10 x10 x10 x10 o10 - x10 x10 o6 - - - x12 x12 o12 -",
      ],
      lead: [
        ". . . a5 b5 - a5 - c6 - - e6 g6 - - -",
        "g6 - - - c6 - g6 - . . . . d6 - a5 -",
        ". . . . . a#5 - a5 c6 g6 - - - c6 - g6",
        "g6 - - - - c6 g6 - . . . . a5 - - -",
      ],
      drums: "march",
    },
    // the D-major chorus: open D and low B slabs over double kick, the line falling A, F#, D
    chorus: {
      guitar: [
        "o0 - - - x0 x0 o0 - x0 x0 x0 x0 o-3 - - -",
        "o0 - - - x0 x0 o0 - o-3 - - - o0 - x0 x0",
        "o0 - - - o2 - x2 x2 x2 x2 x2 x2 o-3 - - -",
        "o4 - - - x4 x4 o4 - o0 - x0 x0 o7 - - -",
      ],
      lead: [
        "a5 - g5 f#5 - . d6 a5 - d6 a5 - f#5 - - -",
        "a5 d6 a5 . a5 - - - f#5 - . a5 - - - b5",
        "a5 - - f#5 e5 - - - - - - - f#5 - - -",
        "f#5 - - - f#5 - - - . e5 - - - - . a5",
      ],
      drums: "double", weight: 3,
    },
    // the closing run of A, D, E, B and F#, landing on a ringing D
    outro: {
      guitar: [
        "o7 - - x7 o0 - x0 x0 x0 x0 x0 x0 o7 - - -",
        "o0 - - x0 x0 x0 x0 x0 o2 - - x2 x2 x2 x2 x2",
        "o-3 - - x-3 o4 - - x4 o-3 - - x-3 o0 - - -",
        "o0 - - - o7 - - - o12 - - - o0 - - -",
      ],
      drums: "half",
    },
  },
});
