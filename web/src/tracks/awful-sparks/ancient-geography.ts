import { defineTrack } from "../notation";

// Awful Sparks' "Ancient Geography" as a 90s shooter cover: D major with a Lydian E, 136 bpm.
export default defineTrack({
  name: "Ancient Geography",
  artist: "Awful Sparks",
  bpm: 136,
  key: -2,
  intro: "intro",
  tone: { bright: 1.1, lead: "brass", bass: "pick" },
  riffs: {
    // bars 1-4: D, then the F# E B A / F# E A D tumble as open stabs
    intro: {
      guitar: [
        "o0 - - . o0 - . . o0 - - . x0 x0 o12 -",
        "x0 x0 x0 x0 x0 x0 o0 - x0 x0 x0 x0 o7 - - -",
        "o4 - - . o2 - - . o9 - - . o7 - - .",
        "o4 - . o4 o2 - . o2 o7 - . o7 x0 x0 o12 -",
      ],
      drums: "rock",
    },
    // bars 5-16: chugging D under the vocal, then the descending F# E B A changes
    verse: {
      guitar: [
        "x0 . x0 x0 o0 - x0 . x0 x0 x0 . o12 - x0 x0",
        "x0 . x0 x0 o0 - x0 . x0 x0 x0 . o7 - - -",
        "o4 - x4 x4 o2 - x2 x2 o9 - x9 x9 o7 - x7 x7",
        "o4 - x4 x4 o2 - x2 . o7 - x7 . o0 - o12 -",
      ],
      lead: [
        "d6 - - - c6 d6 - - c6 . . . d6 . d6 -",
        ". . . . . d6 a5 - . d6 - a5 - e5 f5 f#5",
        "f#5 - . f#5 g#5 - b5 - . . . . e6 - - .",
        ". f#5 . f#5 - b5 e6 - . . b5 - d6 - - -",
      ],
      drums: "rock", weight: 2,
    },
    // bars 17-24: the F-to-F# grind against big open D, with the f/f# hook on top
    chorus: {
      guitar: [
        "o3 - - o4 - - - - x4 x4 o4 - x4 x4 o7 -",
        "o0 - - - - - x0 x0 o0 - - . o12 - x0 x0",
        "o3 - - o4 - - - - x4 x4 o4 - x4 x4 o7 -",
        "o0 - - . o0 - . o0 x0 x0 o5 - o4 - o3 -",
      ],
      lead: [
        "f5 f#5 f5 f#5 - - - f#5 - - - f#5 - - a5 -",
        ". . d6 - - - f#6 - - - - - a5 - - .",
        "f5 f#5 f5 f#5 a5 - - - . . . f#5 - - . .",
        "a5 c6 d6 - - - d6 . d6 . . a5 - - - -",
      ],
      drums: { k: "x..x..x.x..x..x.", s: "....x.......x...", h: "o.x.o.x.o.x.o.x." },
      weight: 3,
    },
    // bars 25-40: the half-time detour into E, G#m F#m and C#m
    eastward: {
      guitar: [
        "x2 x2 x2 x2 o2 - x2 x2 x2 x2 o2 - x2 x2 x2 x2",
        "x2 x2 x2 x2 o2 - x2 x2 x2 . o2 - o9 - - -",
        "o6 - - x6 o4 - - x4 o2 - - x2 o9 - x9 x9",
        "o6 - - x6 o11 - - x11 o2 - - - x2 x2 o9 -",
      ],
      lead: [
        "e5 - . e5 . e5 . e5 - - f#5 e5 - - - .",
        "e5 - f#5 e5 - - . e5 - - - - - - f#5 g#5",
        "g#5 - . g#5 - f#5 - c#6 e5 - . e5 - - f#5 g#5",
        "g#5 - a5 g#5 - . f#5 g#5 e5 - . . e5 - - -",
      ],
      drums: "half",
    },
    // bars 49-56: galloping A C# D E climb and the E F# G A walk-up
    bridge: {
      guitar: [
        "o7 - x7 x7 o11 - x11 x11 o12 - x12 x12 o14 - x14 x14",
        "o2 - x2 x2 o4 - x4 x4 o5 - x5 x5 o7 - x7 x7",
        "o7 - x7 x7 o11 - x11 x11 o14 - - - - - x14 x14",
        "o0 - x0 x0 o4 - x4 x4 o7 - - . x5 . x6 .",
      ],
      lead: [
        "e5 - - - . . . . f#5 - - e5 - - . .",
        ". . . . e5 f#5 - g5 f#5 - g5 a5 - - e5 -",
        ". . . . . . . e5 - - g#5 . e5 - f#5 -",
        "e5 d5 e5 . e5 f#5 - g5 f#5 - . . a5 e5 - -",
      ],
      drums: "gallop",
    },
    // bars 57-64: muted D C# D E / D-over-F# rocking before the last chorus
    comedown: {
      guitar: [
        "x0 x0 x0 x0 x-1 x-1 x-1 x-1 x0 x0 x0 x0 o2 - - -",
        "o4 - x4 x4 x0 x0 x0 x0 o4 - x4 x4 x0 x0 x0 x0",
        "x0 x0 . x0 x-1 x-1 . x-1 x0 x0 . x0 o2 - - -",
        "o4 - x4 x4 x0 x0 x0 x0 o4 - - - o0 - o12 -",
      ],
      drums: "sparse",
    },
  },
});
