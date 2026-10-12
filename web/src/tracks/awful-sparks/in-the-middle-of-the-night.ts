import { defineTrack } from "../notation";

// Awful Sparks' "In The Middle Of The Night" as a 16-bit metal cover: C major, 136 bpm, C-Am-G verses and a D-A / C-D chorus.
export default defineTrack({
  name: "In The Middle Of The Night",
  artist: "Awful Sparks",
  bpm: 136,
  key: -4,
  intro: "intro",
  tone: { bright: 0.95, lead: "hollow", bass: "sub" },
  riffs: {
    // the opening C-A-G walk-down with its a-e-g hook, dropping to F# at the end
    intro: {
      guitar: [
        "o12 - - . x12 x12 o12 - o9 - x9 x9 o7 - x7 x7",
        "o12 - - . x12 x12 o12 - o9 - x9 x9 o7 - x7 x7",
        "o12 - - . x12 x12 o12 - o9 - x9 x9 o7 - x7 x7",
        "o12 - - . x12 x12 o12 - o9 - x9 x9 o6 - - -",
      ],
      lead: [
        ". . . . e5 - e5 - a5 - e6 g5 - - f#5 g5",
        ". . g5 - . b5 g5 - a5 - e6 g5 - - f#5 g5",
        "e5 - - - . c6 - - a5 - - g5 - - f#5 g5",
        "g5 . g5 . . e6 c6 . a5 - - . . . f#5 -",
      ],
      drums: "rock",
    },
    // the same changes as a low palm-muted chug under the quiet verse
    verse: {
      guitar: [
        "x0 x0 x0 x0 x0 . x0 x0 o9 - - . o7 - - .",
        "x0 . x0 x0 x0 . x0 x0 o9 - x9 x9 o7 - x7 x7",
        "x0 x0 x0 x0 x0 . x0 x0 o9 - - . o7 - - .",
        "x0 . x0 x0 x0 . x0 x0 o9 - x9 x9 o6 - - -",
      ],
      lead: [
        ". . . . f5 e5 - - a5 - - . g5 e5 - .",
        "e5 - g5 - - - . . a5 - - - g5 - - .",
        ". . . e5 . g5 . e6 a5 - e6 g5 - f#5 . g5",
        "g5 . g5 . . . . a5 - e6 - a5 f#5 - - .",
      ],
      drums: { k: "x.....x...x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." }, weight: 2,
    },
    // loud D minor with A pushes, then C with a D kick, C-G-D turnaround
    chorus: {
      guitar: [
        "o2 - - . x2 x2 o2 - o9 - - . o2 - x2 x2",
        "o2 - - . x2 x2 o2 - o9 - - . o4 - - -",
        "o0 - - . x0 x0 o0 - o2 - - . o0 - x0 x0",
        "o0 - - . x0 x0 o0 - o7 - - . o2 - o2 o2",
      ],
      lead: [
        "c6 - - . d6 - - - . . e6 - - - d6 f6",
        "f6 - d6 - - - . . . . e6 - - . c6 -",
        ". c6 - - - - . c6 - c6 d6 - . . c6 -",
        "c6 - - c6 - - - c6 - - . c6 d6 c6 - .",
      ],
      drums: { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "o.x.x.x.o.x.x.x." }, weight: 3,
    },
    // the hushed breakdown: C into F and A minor, E into C, G into C
    bridge: {
      guitar: [
        "o0 - - - o5 - - - - - - - o9 - - -",
        "o9 - - - o5 - - - x5 x5 x5 x5 o5 - - -",
        "o4 - - - o0 - - - - - - - x0 x0 x0 x0",
        "o7 - - - o0 - - - x0 x0 o0 - o2 - o4 -",
      ],
      drums: "sparse",
    },
    // galloping D minor to C build with the arpeggiated d-f-a-c line on top
    climb: {
      guitar: [
        "x2 . x2 x2 o2 - x2 x2 x2 . x2 x2 o2 - - -",
        "o9 - - . x2 x2 o2 - x2 x2 o2 - o9 - - -",
        "o9 - - . x0 x0 o0 - x0 x0 o0 - x0 x0 x0 x0",
        "o7 - - . x0 x0 o0 - x0 x0 o0 - o2 - - -",
      ],
      lead: [
        "d6 - - . c6 - - . d6 - d6 d6 - d6 - f6",
        "f6 - a5 f6 - - . d6 - a5 d6 a5 a5 - - -",
        "a5 - - b5 - c6 - - c6 - e6 - c6 - - -",
        "c6 - g5 - c6 - - - - - - c6 - - g5 -",
      ],
      drums: "gallop",
    },
    // the final chorus run-out: D-A, E-D-A, E-G-C-G, landing on C
    outro: {
      guitar: [
        "o2 - - . o9 - x9 x9 o2 - - . o9 - x9 x9",
        "o4 - - . o2 - x2 x2 o2 - - . o9 - - -",
        "o4 - - . o7 - - . o12 - - . o7 - - .",
        "o2 - - . o0 - - - - - x0 x0 o0 - o2 -",
      ],
      lead: [
        "d6 - - . . c6 - - d6 - - - - . . .",
        "e6 - - f6 d6 f6 - . . . d6 - - . . .",
        "e6 - - . . . . . c6 - . c6 c6 - . c6",
        "d6 - . . c6 - - - - - - - - - . .",
      ],
      drums: "double",
    },
  },
});
