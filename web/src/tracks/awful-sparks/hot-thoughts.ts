import { defineTrack } from "../notation";

// Awful Sparks' "Hot Thoughts" (demo), Duke-ified: C, 152 bpm, a creeping chromatic slide into a pounding C vamp.
export default defineTrack({
  name: "Hot Thoughts",
  artist: "Awful Sparks",
  bpm: 152,
  key: -4,
  intro: "slide",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  riffs: {
    // the opening slide: F, E, A, G#, then down onto C and back round the chromatic turnaround
    slide: {
      guitar: [
        "o5 - - o4 - - . o9 - - . o8 - - x0 x0",
        "o5 - - o4 - - . o0 - x0 x0 . x0 x0 x0 x0",
        "x0 x0 . x0 x0 . o12 - x0 x0 . x0 o10 - o12 -",
        "o12 - - . o11 - - . o9 - - . o8 - x8 o8",
      ],
      drums: "rock",
    },
    // verse: the same slide chugged under the vocal, which follows the falling bass line
    verse: {
      guitar: [
        "x5 x5 x5 o4 - - x4 o9 - - x9 o8 - - x8 x8",
        "x5 x5 x5 o4 - - x4 x4 o0 - x0 x0 x0 x0 x0 x0",
        "x0 x0 x0 x0 o7 - x0 x0 x0 x0 o10 - x0 x0 o7 -",
        "x0 x0 x0 x0 x0 x0 o11 - o9 - - o8 - - x8 x8",
      ],
      lead: [
        "f5 - - e5 - - - a5 - - - g#5 - - - f5",
        "f5 - e5 - - - - - c6 - - . g5 c6 g6 -",
        "c6 - - - - - g6 - c6 - . . g5 - c6 -",
        "c6 g5 c6 . g5 . b5 - a5 - - g#5 - - - f5",
      ],
      drums: "rock", weight: 2,
    },
    // chorus: big open C stabs with a Bb kick-back, the chant bouncing between C and G
    chorus: {
      guitar: [
        "o0 - - x0 x0 x0 o0 - x0 x0 o10 - o12 - x0 x0",
        "o0 - - x0 x0 x0 o0 - x0 x0 o7 - o10 - x0 x0",
        "o0 - - x0 x0 x0 o0 - x0 x0 o10 - o12 - x0 x0",
        "o0 - - - x0 x0 x0 x0 o10 - - - o9 - x9 x9",
      ],
      lead: [
        "g6 - g5 - g5 - - c6 - a#5 - c6 g5 - c6 -",
        "g6 c6 - . g5 g6 - g6 a#5 g5 . . g6 e6 c6 -",
        "c6 g6 - . c6 - g6 - . . c6 g5 g6 - c6 -",
        "c6 - g5 - c6 - - . a#5 - - - a5 - - -",
      ],
      drums: { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "o.x.o.x.o.x.o.x." },
      weight: 3,
    },
    // half-time grind down C, B, Bb and A from the quiet middle of the song
    grind: {
      guitar: [
        "o12 - - - - - x11 x11 o11 - - - o10 - x10 x10",
        "o9 - - - x9 x9 o10 - - - - - x10 x10 x10 x10",
        "o10 - - - - - x10 x10 o10 - - - o9 - - -",
        "o12 - - - - - x12 x12 x12 x12 o12 - o11 - x11 x11",
      ],
      drums: "half",
    },
    // the middle eight: C, Am, D to C, G, ringing open with a climb back up to C
    bridge: {
      guitar: [
        "o12 - - - x12 x12 o12 - - - x12 x12 o12 - - -",
        "o9 - - - x9 x9 o9 - - - x9 x9 o9 - - -",
        "o14 - - - x14 x14 o14 - o12 - - - x12 x12 o12 -",
        "o7 - - - x7 x7 o7 - x7 x7 o9 - o11 - - -",
      ],
      lead: [
        "c6 - - - e5 - - . g5 - f5 - - - e5 -",
        "e5 - - a5 - - - . e5 - - - . . a5 -",
        "d6 - - c6 a5 - - . g5 - - - - - . .",
        "b5 - - g5 - - g6 - - . b5 - - - . .",
      ],
      drums: "rock",
    },
    // the long closing jam: sixteenth-note C chug, a Bb lurch and a C# jab
    jam: {
      guitar: [
        "x0 x0 x0 x0 o0 - x0 x0 x0 x0 o12 - x0 x0 o0 -",
        "x0 x0 x0 x0 o0 - x0 x0 x0 x0 o12 - o10 - o12 -",
        "o10 - - - x10 x10 x10 x10 o10 - - - x10 x10 x10 x10",
        "o1 - - - o10 - x10 x10 x10 x10 x10 x10 o1 - - -",
      ],
      lead: [
        "g5 c6 g5 . g5 . . c6 - . c6 - . c6 - .",
        ". . g5 e6 - . e6 b5 - . c6 - g5 - - .",
        "f5 - - . . a#5 - . . . f5 - . . f5 -",
        "f5 - - . . . . a#5 - - - - . . . .",
      ],
      drums: "double",
    },
  },
});
