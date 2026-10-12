import { defineTrack } from "../notation";

// Awful Sparks' "When I Get Home" as a 90s shooter cover: D major, 147 bpm, E-major chant chorus.
export default defineTrack({
  name: "When I Get Home",
  artist: "Awful Sparks",
  bpm: 147,
  key: -2,
  intro: "intro",
  tone: { lead: "reed", bass: "pick", bright: 1.15 },
  riffs: {
    // the opening walk up D, F#, G, B, then the C#, B, F#, E drop and the G kick back home
    intro: {
      guitar: [
        "o0 - - x0 o4 - - x4 o5 - - x5 o9 - - -",
        "o7 - - x7 o0 - x0 . x0 x0 . x0 o4 - - -",
        "o11 - - x11 o9 - - x9 o4 - - x4 o2 - - -",
        "o11 - x11 x11 x11 x11 o11 - x11 x11 x11 . o5 - - -",
      ],
      drums: "rock",
    },
    // chugging verse on the walking chords, with the sung line climbing F#, G, B
    verse: {
      guitar: [
        "x0 . x0 x0 x4 . x4 x4 x5 . x5 x5 o9 - - -",
        "x7 . x7 x7 x0 . x0 x0 x0 . x0 x0 o4 - - -",
        "x0 . x0 x0 x4 . x4 x4 x5 . x5 x5 o9 - x9 x9",
        "x7 . x7 x7 x0 . x0 x0 x4 x4 o4 - o5 - o7 -",
      ],
      lead: [
        ". . . . f#5 - - - g5 - - - b5 - a5 -",
        "a5 - - . f#5 a5 - f#6 - - - . f#5 - - -",
        ". . e5 - f#5 - - - g5 - - a5 b5 - - -",
        "a5 - g5 - f#5 g5 a5 - - - - - . . . .",
      ],
      drums: "rock", weight: 2,
    },
    // the C#, B, F#, E turn and the D-to-E lift into the chorus
    turn: {
      guitar: [
        "o11 - - x11 o9 - - x9 o4 - - x4 o2 - - -",
        "o11 - x11 x11 x11 x11 o11 - x11 x11 x11 . o5 - - -",
        "o0 - x0 x0 o4 - x4 x4 o5 - x5 x5 o9 - x9 x9",
        "o0 - x0 . o7 - x7 . o0 - x0 . o2 - - -",
      ],
      lead: [
        "g#5 - - - f#5 b5 - - f#5 - - - e5 - - g#5",
        "c#6 - g#5 - g#5 - - - - - - - g5 - f#5 -",
        "a5 - - . f#5 - - - g5 - - - b5 - - -",
        "a5 - - . a5 - - - . . a5 - g#5 - e5 -",
      ],
      drums: "rock",
    },
    // the loud E chorus: open E slabs with a D stab, double kick, the E, G#, E chant on top
    chorus: {
      guitar: [
        "o2 - - - x2 x2 o2 - - - x2 x2 o14 - o12 -",
        "o2 - - - x2 x2 o2 - o-1 - - - o2 - x2 x2",
        "o2 - - - x2 x2 o2 - - - x2 x2 o14 - o12 -",
        "o2 - - - x2 x2 o2 - x2 x2 x2 x2 o6 - x6 x6",
      ],
      lead: [
        "e5 - - - g#5 e5 - - - - - g#5 - f#5 e5 -",
        "e5 - - - g#5 - e5 - - - g#5 a5 - . f#5 e5",
        "e5 - - - g#5 - e5 - e5 - - - g#5 - e5 -",
        "e5 - e5 - g#5 e5 - - - - - - g#5 - - -",
      ],
      drums: "double", weight: 3,
    },
    // the long D section with the C at the end of each bar, walking down D, C, B, A to turn round
    rave: {
      guitar: [
        "o0 - x0 x0 x0 x0 o0 - x0 x0 x0 x0 o-2 - - -",
        "o0 - x0 x0 x0 x0 o0 - x0 x0 x0 x0 o-2 - x-2 x-2",
        "o0 - x0 x0 x0 x0 o0 - x0 x0 x0 x0 o-2 - - -",
        "o0 - x0 x0 x0 x0 o0 - o12 - o10 - o9 - o7 -",
      ],
      lead: [
        ". . a5 - . . a5 - d6 - f#6 - . . c6 -",
        ". . a5 - d6 - a5 - . . a5 - c6 - - -",
        ". . a5 - . . a5 - d6 - f#6 - . . c6 -",
        ". . a5 - - - a5 - d6 - - - . . . .",
      ],
      drums: "rock", weight: 2,
    },
    // the closing walk up and the final B-flat, with A pulling back to D
    outro: {
      guitar: [
        "o0 - - x0 o4 - - x4 o5 - - x5 o9 - - -",
        "o7 - - x7 o0 - x0 x0 o0 - - - o4 - - -",
        "o0 - - x0 o4 - - x4 o5 - - x5 o9 - - -",
        "o8 - - - - - - - - - - - x7 x7 o7 -",
      ],
      drums: "half",
    },
  },
});
