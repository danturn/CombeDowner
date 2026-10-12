import { defineTrack } from "../notation";

// Awful Sparks' "La Nuit, C'est Paradis" as a half-time 90s shooter crusher: low B major, 96 bpm.
export default defineTrack({
  name: "La Nuit, C'est Paradis",
  artist: "Awful Sparks",
  bpm: 96,
  key: -5,
  intro: "intro",
  tone: { bright: 0.8, lead: "hollow", bass: "sub" },
  riffs: {
    // bars 1-4: B F# B | E B F# swaying, as slow crushing stabs
    intro: {
      guitar: [
        "o0 - - - - - - - o7 - - - o0 - x0 x0",
        "o5 - - - o0 - - - - - x0 x0 o7 - - -",
        "o0 - - - o5 - - - o7 - - - o0 - x0 x0",
        "o5 - - - o0 - x0 x0 x0 x0 x0 x0 o7 - - -",
      ],
      drums: "half",
    },
    // bars 15-18: sixteenth chugs through B E F# B | E B E F#, climbing back to B
    verse: {
      guitar: [
        "x0 x0 x0 x0 o5 - x5 x5 o7 - x7 x7 o0 - x0 x0",
        "o5 - x5 x5 x0 x0 x0 x0 o5 - x5 x5 o7 - x7 x7",
        "x0 x0 x0 x0 o5 - x5 x5 x0 x0 x0 x0 o0 - x0 x0",
        "o7 - x7 x7 x0 x0 x0 x0 x0 x0 o0 - o7 - o9 o11",
      ],
      lead: [
        "d#6 - - c#6 b5 - g#5 - f#5 - a#5 - b5 - - .",
        ". e5 f#5 - . g#5 - f#5 - - . e5 - f#5 - b5",
        "b5 - - - . . g#5 f#5 d#6 - - . c#6 - b5 -",
        "e5 f#5 - g#5 - f#5 - . . . e5 - f#5 g#5 a#5 -",
      ],
      drums: "half", weight: 2,
    },
    // bars 9-12: B | G#m B | D#m G# F# | B G#m, backbeat and open chords
    chorus: {
      guitar: [
        "o0 - - - - - x0 x0 o0 - - - o9 - - -",
        "o9 - - - o0 - - - x0 x0 o0 - x0 x0 o0 -",
        "o4 - - - - - x4 x4 o9 - - - o7 - - -",
        "o0 - - - - - x0 x0 o9 - x9 x9 o7 - o11 -",
      ],
      lead: [
        "d#5 - - - . f#5 g#5 - g#5 - f#5 - . g#5 - -",
        ". . . g#5 - g#5 f#5 d#5 - - - - c#5 - d#5 -",
        ". . . . f#5 - g#5 - - d#5 - c#5 - . f#5 a#5",
        "b5 - - - f#5 - - - g#5 - - - d#5 - c#5 -",
      ],
      drums: "rock", weight: 3,
    },
    // bars 19-22: the loudest pass, B | B G#m | B D# G# | G# F# B over double kick
    lift: {
      guitar: [
        "o0 - - - x0 x0 o0 - x0 x0 o12 - x0 x0 o0 -",
        "o0 - - - x0 x0 o9 - - - x9 x9 o9 - x9 x9",
        "o0 - - - x0 x0 o0 - o4 - - - o9 - - -",
        "o9 - - - o7 - - - o0 - - - x0 x0 o12 -",
      ],
      drums: "double",
    },
    // bars 27-30: the D# G# A | A C# G# side-step home to a ringing B
    outro: {
      guitar: [
        "o4 - - - o9 - - - x9 x9 o9 - o10 - - -",
        "o10 - - - o2 - - - x2 x2 o2 - o9 - - -",
        "o0 - - - - - - - x0 x0 x0 x0 o0 - - -",
        "o0 - - - - - - - x0 x0 x0 x0 o2 - o3 -",
      ],
      lead: [
        "d#5 - - - . g#5 - d#5 - - . . c#5 - e5 -",
        "e5 - c#5 e5 . c#5 - - - - - g#5 - c#5 d#5 -",
        "d#5 - - b4 - - . . c#5 - d#5 - b4 - - -",
        "b4 - - - - - - - . c#5 - - . . . .",
      ],
      drums: "sparse",
    },
  },
});
