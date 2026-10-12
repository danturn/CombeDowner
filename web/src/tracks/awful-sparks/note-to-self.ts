import { defineTrack } from "../notation";

// Awful Sparks' "Note To Self" as a 16-bit metal cover: B major, 152 bpm, B pedal verses and an E-G#-A-B chorus.
export default defineTrack({
  name: "Note To Self",
  artist: "Awful Sparks",
  bpm: 152,
  key: -5,
  intro: "intro",
  tone: { bright: 1.1, lead: "brass", bass: "pick" },
  riffs: {
    // the opening B pedal, stabbed in the vocal's push rhythm, with the F# kick at the end of bar 2
    intro: {
      guitar: [
        "o0 - - - . . o0 - - . o0 - . o0 - -",
        "x0 . x0 . . . o0 - x0 x0 x0 x0 o7 - - -",
        "o0 - - - . . o0 - - . o0 - . o0 - -",
        "x0 . x0 . . . o0 - x0 x0 x0 x0 o5 - o7 -",
      ],
      drums: "rock",
    },
    // palm-muted B chug under the reciting-tone verse, F# on the last beat
    verse: {
      guitar: [
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o0 - - -",
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o12 - . .",
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o0 - - -",
        "x0 x0 . x0 x0 . x0 x0 x0 x0 x0 x0 o7 - o7 -",
      ],
      lead: [
        "f#5 - b5 f#5 . . f#5 - f#5 . f#5 . . . d#6 -",
        "f#5 . . . . d#6 f#5 - . . f#5 . f#5 - - .",
        "b5 - b5 . f#5 . . f#5 - b5 - . . f#5 - d#6",
        "b5 - f#5 - - - d#6 . f#5 - g#5 - f#5 - - .",
      ],
      drums: "rock", weight: 2,
    },
    // big open E, G#-A push, B, then the B-A-G# step down back to E
    chorus: {
      guitar: [
        "o5 - - - - - x5 x5 o5 - - . x5 x5 x5 x5",
        "o9 - - . x9 x9 o9 - o10 - - . x10 x10 o10 -",
        "o12 - - - - - x0 x0 o12 - - . x0 x0 x0 x0",
        "o12 - - . x12 x12 o12 - o10 - - - o9 - - -",
      ],
      lead: [
        "e5 - - - . e5 - - - - - - . g#5 e5 -",
        "d#6 - b5 g#5 - - - - a5 e5 f#5 g#5 - - b5 -",
        "b5 - . b5 - . b5 - . b5 - . f#5 - - .",
        ". b5 - . b5 . . . a5 - - . g#5 - e5 -",
      ],
      drums: { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "o.x.x.x.o.x.x.x." }, weight: 3,
    },
    // half-time swing between B and F#, climbing chromatically out of the last bar
    bridge: {
      guitar: [
        "o0 - - - o5 - - - x5 x5 o5 - o0 - - -",
        "o7 - - - - - x7 x7 x7 . x7 x7 o7 - - -",
        "o0 - - - - - x0 x0 x0 . x0 x0 o0 - - -",
        "o7 - - - - - x7 x7 o9 - o10 - o11 - - -",
      ],
      lead: [
        ". f#5 - g#5 . e5 - g#5 . f#5 - . . f#5 - .",
        "f#5 - - - - - - - - - - - - - - -",
        ". . . . . f#5 - - - - - . . f#5 d#6 -",
        "f#5 - - - - - - - - - - - c#6 - - -",
      ],
      drums: "half",
    },
    // the loudest bars: sixteenth-chugged B with octave stabs and the d#-f# hook wailing on top
    outro: {
      guitar: [
        "o0 - - - x0 x0 x0 x0 o12 - - - x0 x0 x0 x0",
        "o0 - - - x0 x0 x0 x0 o12 - - - x0 x0 o7 -",
        "o0 - - - x0 x0 x0 x0 o12 - - - x0 x0 x0 x0",
        "o0 - - - - - - - x0 x0 x0 x0 o12 - o12 -",
      ],
      lead: [
        ". . d#6 - f#5 d#6 - - - f#5 d#6 - f#5 d#6 - f#5",
        "d#6 - - b5 f#5 d#6 - - - - - . d#6 - f#5 -",
        "f#5 - - . b5 - - - - - - - - - - -",
        "b5 f#5 - - - - - - - - - - - - . .",
      ],
      drums: "double",
    },
  },
});
