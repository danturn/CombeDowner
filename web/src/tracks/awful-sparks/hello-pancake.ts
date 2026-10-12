import { defineTrack } from "../notation";

// Awful Sparks' "Hello Pancake", Duke-ified: A, 103 bpm, half-time and heavy, sliding down C, Eb and D.
export default defineTrack({
  name: "Hello Pancake",
  artist: "Awful Sparks",
  bpm: 103,
  key: 5,
  intro: "intro",
  tone: { lead: "hollow", bass: "sub", bright: 0.9 },
  riffs: {
    // the intro: A, a G kick-back, then up to C and down through Eb and D
    intro: {
      guitar: [
        "o0 - - - - - - - x0 x0 x0 x0 o0 - - -",
        "o-2 - - - o0 - - - x0 x0 x0 x0 o0 - - -",
        "o0 - - - x0 x0 x0 x0 o3 - - - x3 x3 o3 -",
        "o6 - - - - - x6 x6 o5 - - - o0 - - -",
      ],
      drums: "half",
    },
    // verse: slow A chug with G kicks, then the C, Eb, D turnaround
    verse: {
      guitar: [
        "o0 - - - - - x0 x0 x0 x0 o0 - - - x0 x0",
        "o-2 - - - o0 - x0 x0 x0 x0 o0 - - - x0 x0",
        "o0 - - - - - x0 x0 x0 x0 o0 - o-2 - x-2 x-2",
        "o3 - - x3 o6 - - x6 o5 - - x5 x0 x0 o0 -",
      ],
      lead: [
        "a5 - - - - - - - - - e5 - f#5 e5 - -",
        "g5 - - . e5 - f#5 e5 - - . . f#5 e5 - a5",
        "e5 - f#5 e5 - - . . c#6 e6 - a5 - - g5 -",
        "e5 - - - g5 - - g5 f#5 - - - e5 - - -",
      ],
      drums: "half", weight: 2,
    },
    // double-time lift: sixteenth A chug pushing up into C and Eb
    lift: {
      guitar: [
        "x0 x0 x0 x0 o0 - x0 x0 x0 x0 o0 - x0 x0 o0 -",
        "x0 x0 x0 x0 o0 - x0 x0 x0 x0 o0 - o-2 - - -",
        "x0 x0 x0 x0 o0 - x0 x0 x0 x0 o0 - x0 x0 o0 -",
        "x0 x0 x0 x0 o3 - - - x3 x3 o3 - o6 - - -",
      ],
      drums: "punk",
    },
    // chorus: wide-open A, then A, G, C and the Eb-to-D drop
    chorus: {
      guitar: [
        "o0 - - - - - o0 - - - x0 x0 o0 - - -",
        "o0 - - - - - o0 - - - x0 x0 o0 - x0 x0",
        "o0 - - - - - o0 - o-2 - - - o3 - - -",
        "o3 - - - o6 - - - x6 x6 o6 - o5 - - -",
      ],
      lead: [
        "e5 - - e5 f#5 - e5 - f#5 - e5 - b5 a5 - -",
        "a5 - - - . . f#5 a5 f#5 - g5 a5 - a5 - -",
        "e5 - a5 - c6 a5 - - g5 - - . e5 - - -",
        "c6 - g5 - - - g5 - a#5 - - - a5 - - -",
      ],
      drums: "rock", weight: 3,
    },
    // the outro: A, C, Eb and D left to ring out
    outro: {
      guitar: [
        "o0 - - - - - - - - - - - x0 x0 x0 x0",
        "o0 - - - o3 - - - - - - - o6 - - -",
        "o6 - - - - - - - o5 - - - o0 - - -",
        "o0 - - - - - - - x0 x0 x0 x0 o5 - - -",
      ],
      drums: "sparse",
    },
  },
});
