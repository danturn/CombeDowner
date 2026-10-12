import { defineTrack } from "../notation";

// Awful Sparks' "Football on TV" as a 90s shooter cover: F# major, 147 bpm.
export default defineTrack({
  name: "Football on TV",
  artist: "Awful Sparks",
  bpm: 147,
  key: 2,
  intro: "intro",
  tone: { lead: "bell", bass: "pick", bright: 1.1 },
  riffs: {
    // the opening A#, A# to G, C#, B and F#, climbing G#, A back to A#
    intro: {
      guitar: [
        "o4 - - - x4 x4 o4 - - - x4 x4 o4 - x4 x4",
        "o4 - - - x4 x4 o4 - o1 - - - x1 x1 o1 -",
        "o7 - - - x7 x7 o7 - - - x7 x7 o5 - - -",
        "o5 - - - x5 x5 o5 - o0 - - - x0 x0 o2 o3",
      ],
      drums: "rock",
    },
    // chugging verse on the same changes, the sung line bouncing A#, F and C#, G#
    verse: {
      guitar: [
        "x4 . x4 x4 x4 . x4 x4 x4 . x4 x4 o4 - - -",
        "x4 . x4 x4 x4 . x4 x4 o1 - x1 x1 x1 . x1 x1",
        "x7 . x7 x7 x7 . x7 x7 x7 . x7 x7 o5 - - -",
        "x5 . x5 x5 x5 . x5 x5 o0 - x0 x0 o5 - o2 o3",
      ],
      lead: [
        "a#5 - f5 - a#5 - . . f5 - - a#5 g#5 - a#5 -",
        "f5 - - - a#5 - g#5 - g5 - - - - - g#5 -",
        "c#6 a#5 g#5 - - - . . c#6 - g#5 - . . f#5 b5",
        "f#5 - . b5 . . b5 . f#5 - . . f#5 - b5 .",
      ],
      drums: "rock", weight: 2,
    },
    // the quieter second half of the verse: A#, G# to G, C#, B to F#, half time
    pre: {
      guitar: [
        "x4 . . x4 x4 . . x4 x4 . . x4 o4 - - -",
        "o2 - - x2 x2 . x2 . o1 - - x1 x1 . x1 .",
        "o7 - - x7 o2 - x2 x2 x2 . x2 . o5 - - -",
        "o5 - - x5 o2 - x2 . o0 - - - x0 x0 o0 -",
      ],
      drums: "half",
    },
    // the big F#, C#, B chorus over double kick, with the F# chant and the C#, F lift
    chorus: {
      guitar: [
        "o0 - - - x0 x0 o0 - - - x0 x0 o0 - x0 x0",
        "o0 - - - x0 x0 o0 - - - x0 x0 o4 - o5 o6",
        "o7 - - - x7 x7 o7 - - - x7 x7 o5 - - -",
        "o5 - - - x5 x5 o5 - x5 x5 x5 x5 o0 - x0 x0",
      ],
      lead: [
        "f#5 - - . f#5 . f#5 - - - - - f#6 - c#6 -",
        "c#6 - g#5 - a#5 - - c#6 f#5 - - - . . . .",
        "g#5 c#6 - . g#5 - c#6 - f6 - - - . . . b5",
        "b5 - f#5 - f#5 - - - b5 - g#5 - f#5 - - -",
      ],
      drums: "double", weight: 3,
    },
    // the middle eight: two bars of A#, two of B, galloping, out through F# and C#
    bridge: {
      guitar: [
        "o4 - - - x4 x4 x4 x4 o4 - - - x4 x4 x4 x4",
        "o4 - - - x4 x4 x4 x4 o4 - x4 x4 o5 - - -",
        "o5 - - - x5 x5 x5 x5 o5 - - - x5 x5 x5 x5",
        "o5 - - - x5 x5 x5 x5 o0 - - - o7 - - -",
      ],
      lead: [
        "f5 a#5 - . a#5 - f5 a#5 - - - . a#5 - - -",
        "a#5 - f5 - - - . a#5 - - f5 - f#5 - - -",
        "f#5 b5 - . b5 - b5 f#5 - - - b5 - - - -",
        "b5 - b5 g#5 f#5 - - - . f#5 - - f5 - - -",
      ],
      drums: "gallop",
    },
    // the fade: A#, D#, G# ringing out, ending on B and G
    outro: {
      guitar: [
        "o4 - - - - - - - o-3 - - - o2 - - -",
        "o-3 - - - o2 - - - o-3 - - - o2 - - -",
        "o2 - - - - - - - o-4 - - - o5 - - -",
        "o5 - - - o1 - - - - - - - x1 x1 x1 x1",
      ],
      drums: "half",
    },
  },
});
