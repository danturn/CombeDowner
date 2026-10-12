import { defineTrack } from "../notation";

// Awful Sparks' "Girls And The Expanding Universe" as a 90s shooter cover: A major, 162 bpm, ending in B-flat.
export default defineTrack({
  name: "Girls And The Expanding Universe",
  artist: "Awful Sparks",
  bpm: 162,
  key: 5,
  intro: "intro",
  tone: { bright: 1.2, lead: "bell", bass: "slap" },
  riffs: {
    // bars 1-4: the A F# E | E | G E D | D hook as gapped open stabs
    intro: {
      guitar: [
        "o0 - - . . . o0 - o9 - - . o7 - - -",
        "o7 - - . x7 x7 o7 - - . x7 x7 o7 - - -",
        "o10 - - . o10 - - . o7 - - . o5 - - -",
        "o5 - - . x5 x5 o5 - x5 x5 x5 x5 o4 - o2 -",
      ],
      drums: "rock",
    },
    // bars 17-20: the loud A F# E | E | G E D | D hook, full open chords
    chorus: {
      guitar: [
        "o0 - - x0 x0 x0 o0 - o9 - - x9 o7 - x7 x7",
        "o7 - - - x7 x7 x7 x7 o7 - - . x7 x7 x7 x7",
        "o10 - - . o10 - x10 x10 o7 - - x7 o5 - - -",
        "o5 - - . o5 - x5 x5 x5 x5 o4 - o2 - o2 -",
      ],
      lead: [
        "a5 - - . . . a5 g#5 f#5 - - e5 - - - -",
        "e5 - - f#5 e5 - - . . . e5 - . . . g5",
        "g5 - - - . g5 - e5 - - - f#5 d6 - - .",
        "d6 - - - - - - - . . e5 - f#5 - g#5 -",
      ],
      drums: "punk", weight: 3,
    },
    // bars 25-28: the quiet drop to D G | G | Bm | F#m, half time
    drift: {
      guitar: [
        "o5 - - - - - x5 x5 o10 - - - - - x10 x10",
        "o10 - - - - - x10 x10 . . x10 . x10 x10 . .",
        "o2 - - - - - x2 x2 . . x2 . x2 x2 . .",
        "o9 - - - - - x9 x9 . . x9 . o9 - o10 -",
      ],
      drums: "half",
    },
    // bars 29-40: muted G D E chugs into Bm and F#m under the chanted vocal
    verse: {
      guitar: [
        "x10 . x10 x10 x5 . x5 x5 x7 . x7 x7 o10 - - -",
        "x10 . x10 x10 x5 . x5 x5 x7 . x7 x7 o5 - - -",
        "x2 x2 x2 x2 o2 - x2 x2 x2 x2 o2 - x2 . x2 x2",
        "x9 x9 x9 x9 o9 - x9 x9 x9 . x9 . o9 - - -",
      ],
      lead: [
        "g5 - - - . . d5 e5 - - - . g5 - - .",
        "g5 - - - . . d5 - e5 - - - d5 - - -",
        "b5 - . . b5 - b5 - b5 - - . b5 - b5 f#5",
        "f#5 - . . f#5 - . f#5 - . . . f#5 - a5 -",
      ],
      drums: "rock", weight: 2,
    },
    // bars 79-97: the B-flat / F climax, flat out
    outro: {
      guitar: [
        "o1 - - - - - x1 x1 o1 - - - x1 x1 x1 x1",
        "o8 - - - - - x8 x8 o8 - - - x8 x8 x8 x8",
        "o1 - - - - - x1 x1 o1 - - - x1 x1 o13 -",
        "o8 - - - - - x8 x8 o8 - - . o10 - o12 -",
      ],
      lead: [
        "a#5 - - - - - - - . a#5 - . . . a#5 f5",
        "f5 - - - - - - - - - - - - - - a#5",
        "a#5 - - - . a#5 - - . a#5 - . . . a#5 f5",
        "f5 - - - - - - - - - . f5 - - g5 a5",
      ],
      drums: "double", weight: 2,
    },
  },
});
