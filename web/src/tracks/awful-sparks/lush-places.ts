import { defineTrack } from "../notation";

// Awful Sparks' "Lush Places" as a 90s shooter cover: A minor, 148 bpm, D-minor hook chorus.
export default defineTrack({
  name: "Lush Places",
  artist: "Awful Sparks",
  bpm: 148,
  key: 5,
  intro: "intro",
  tone: { lead: "hollow", bass: "sub", bright: 0.9 },
  riffs: {
    // the opening F, C, Am, D stabs and the E, D, A answer
    intro: {
      guitar: [
        "o8 - - x8 o3 - - x3 o0 - - x0 o5 - - -",
        "o8 - x8 x8 o3 - x3 x3 o0 - x0 x0 o5 - x5 x5",
        "o7 - - x7 o5 - x5 x5 x5 x5 x5 . o0 - - -",
        "o7 - - x7 o5 - x5 x5 x5 x5 x5 . o-1 - o0 -",
      ],
      drums: "rock",
    },
    // chugging verse on the same changes, the sung line falling F, C, A then E, D
    verse: {
      guitar: [
        "x8 . x8 x8 x3 . x3 x3 x0 . x0 x0 o5 - - -",
        "x8 . x8 x8 x3 . x3 x3 x0 . x0 x0 o5 - x5 x5",
        "o7 - x7 x7 x5 . x5 x5 x5 . x5 x5 o0 - - -",
        "o7 - x7 x7 x5 . x5 x5 x5 . x5 . o0 - o3 -",
      ],
      lead: [
        "f5 - a5 c6 - - - - a5 - - - . d6 - -",
        "f5 - e5 - c6 - - - - - a5 - d6 - - e5",
        "e5 - - - - . . c6 d6 - a5 - a5 - e6 -",
        "e5 - - - - . . . d6 - - - . b5 - -",
      ],
      drums: "rock", weight: 2,
    },
    // the build: F pedal, the F, C, G, D# slide, then E, D, A marching into the hook
    pre: {
      guitar: [
        "x8 . x8 x8 x8 . x8 x8 x8 . x8 x8 o5 - - -",
        "o8 - - x8 o3 - - x3 o10 - - x10 o6 - - -",
        "o7 - x7 x7 o5 - x5 x5 x5 . x5 x5 o0 - - -",
        "o7 - x7 x7 o5 - x5 x5 x5 x5 x5 . o8 - x8 o8",
      ],
      drums: "march",
    },
    // the hook: big D and F slabs under the falling C, B, A line, walking F, E back to D
    chorus: {
      guitar: [
        "o5 - - - x5 x5 o5 - - - x5 x5 o5 - x5 x5",
        "o5 - - - x5 x5 o5 - - - x5 x5 o3 - o5 -",
        "o8 - - - x8 x8 o8 - - - x8 x8 o8 - x8 x8",
        "o8 - - - x8 x8 o8 - o0 - - - o8 - o7 -",
      ],
      lead: [
        "a5 - - . . a5 - . . . a5 - - - a#5 -",
        "c6 - - b5 - . a5 - b5 - a5 - c5 - e5 -",
        "f5 - - - c6 b5 c6 - - - c6 - a5 - - -",
        "f5 c6 - - . . c6 - - - - - f5 - e5 -",
      ],
      drums: "double", weight: 3,
    },
    // the D-minor break with its climbing A#, C#, D figure, galloping through D, A, C, G and F
    break: {
      guitar: [
        "x5 . x5 x5 x5 . x5 x5 x5 . x5 x5 o0 - - -",
        "o5 - x5 x5 o0 - x0 x0 o3 - x3 x3 o-2 - - -",
        "o8 - x8 x8 o3 - x3 x3 o8 - x8 x8 x8 . x8 x8",
        "o8 - x8 x8 o0 - x0 x0 x0 . x0 x0 o5 - - -",
      ],
      lead: [
        "a5 - e5 - . . . . a5 - a#5 - c#6 - d6 -",
        "d6 c#6 - a#5 a5 - - - c6 - - - b5 - - -",
        "f5 - - - c6 - d6 - c6 - - - a5 - - -",
        "f5 - e5 - a5 - c6 - a5 - - e5 d6 - - -",
      ],
      drums: "gallop",
    },
    // the middle eight: two bars of C, two of D, a G# to push back round
    bridge: {
      guitar: [
        "o3 - - x3 x3 x3 o3 - - x3 x3 x3 o3 - x3 x3",
        "o3 - - x3 x3 x3 o3 - - x3 x3 x3 o10 - o3 -",
        "o5 - - x5 x5 x5 o5 - - x5 x5 x5 o5 - x5 x5",
        "o5 - - x5 x5 x5 o5 - x5 x5 x5 . o-1 - - -",
      ],
      lead: [
        "c6 - c6 . e6 - g6 - - - e6 - c6 - - -",
        "c6 - g5 - c6 - - - . b5 g5 - - - a5 -",
        "d6 a5 - - - - - . a5 - . c6 b5 a5 d6 -",
        "d6 - - a5 - - d6 - . a5 - a5 . . b5 -",
      ],
      drums: "half",
    },
  },
});
