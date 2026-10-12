import { defineTrack } from "../notation";

// Awful Sparks' "Sport In This Country" as a 16-bit metal cover: C major, 136 bpm, with the G-A-B walk-up chorus.
export default defineTrack({
  name: "Sport In This Country",
  artist: "Awful Sparks",
  bpm: 136,
  key: -4,
  intro: "intro",
  tone: { bright: 1.15, lead: "reed", bass: "pick" },
  riffs: {
    // the opening C-G figure with its A-C-B-C wiggle and flat-seven, flat-three stabs
    intro: {
      guitar: [
        "o0 - - . x0 x0 o0 - o7 - - . x7 x7 o7 -",
        "o9 - - . o12 - - . o11 - - . o12 - x12 x12",
        "o10 - - . o7 - x7 x7 x7 . x7 x7 o3 - - -",
        "x7 x7 o7 - x7 x7 o7 - o2 - - . o7 - o11 -",
      ],
      drums: "rock",
    },
    // two bars of ringing C, then the G-A-B walk-up hammered on every beat, twice
    chorus: {
      guitar: [
        "o0 - - - - - x0 x0 o0 - - . x0 x0 o0 -",
        "o0 - - . x0 x0 o0 - x0 x0 o0 - x0 x0 x0 x0",
        "o0 - - . o7 - - . o9 - - . o11 - - .",
        "o2 - - . o7 - - . o9 - x9 x9 o11 - o11 -",
      ],
      lead: [
        "e5 - - . . . . c6 - g5 c6 - - e5 - -",
        "e5 - . e5 - - - - - - - - . . . g5",
        "c6 - d6 e6 g5 - - . a5 - - . b5 - - .",
        ". d6 - b5 d6 - g5 - a5 - - . b5 - c6 -",
      ],
      drums: { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "o.x.x.x.o.x.x.x." }, weight: 3,
    },
    // the C-C-G-G hook that follows each chorus, chromatic Bb-B pickup back to C
    hook: {
      guitar: [
        "x0 x0 o0 - x0 x0 o0 - x0 x0 o0 - x0 x0 x0 x0",
        "x0 x0 o0 - x0 x0 o0 - x0 x0 o0 - x0 x0 o7 -",
        "o7 - - . x7 x7 o7 - x7 x7 o7 - o2 - - .",
        "o7 - - . x7 x7 o7 - x7 x7 o10 - o11 - - -",
      ],
      lead: [
        "c6 - - - d6 - . a5 - - - . f5 e5 c6 -",
        "c6 - - - d6 - b5 - c6 - - . f5 e5 - .",
        "g5 - - - e5 - - - . . . . e5 - - -",
        "g5 - - - a5 - f#5 - - - - . e5 - - c6",
      ],
      drums: "punk",
    },
    // chugging F-Am, C-Am, G-B-E verse cycle
    verse: {
      guitar: [
        "o5 - x5 x5 x5 . x5 x5 o9 - x9 x9 x9 . x9 x9",
        "o0 - x0 x0 x0 . x0 x0 o9 - x9 x9 x9 . x9 x9",
        "o7 - x7 x7 x7 . x7 x7 o11 - x11 x11 o4 - x4 x4",
        "o7 - x7 x7 x7 . x7 x7 o11 - - . o4 - - -",
      ],
      lead: [
        "a5 - - - c6 a#5 a5 - - . a5 - c6 - - .",
        "g5 - c6 - - - . e6 c6 e6 - - a5 - g5 .",
        ". . . g5 - g#5 . b5 - . e5 - - - - .",
        ". . g5 - g5 g#5 - b5 - . . e5 - - - .",
      ],
      drums: "rock", weight: 2,
    },
    // the late-song turn: A minor, C-A-G, then G-E-G and G-E-F in half time
    bridge: {
      guitar: [
        "o9 - - - - - x9 x9 o9 - - . o12 - - -",
        "o12 - - . o9 - - . x9 x9 o9 - o7 - - .",
        "o7 - - - - - x7 x7 o4 - - . o7 - - .",
        "o7 - - - - - x7 x7 o4 - - . o5 - - -",
      ],
      lead: [
        ". a5 - - - - - - - - c6 - - - c6 -",
        "c6 - - e6 - - - a5 - - . . . a5 g5 -",
        "g5 - - - g5 - e5 - - - e5 - - . g5 -",
        "g5 - - - - - . . e5 - f#5 a5 - - - -",
      ],
      drums: "half",
    },
    // the closing A minor to C run-out, crawling up G-G# back to A
    outro: {
      guitar: [
        "o9 - - - x9 x9 o9 - x9 x9 o9 - o12 - - -",
        "o12 - - - x12 x12 o12 - o7 - - - x7 x7 o7 -",
        "o7 - - - o12 - - - x12 x12 o12 - x12 x12 x12 x12",
        "o0 - - - - - - - x0 x0 o0 - o7 - o8 -",
      ],
      lead: [
        "a5 - - . c6 a5 - - . c6 - a5 - - . .",
        "c6 - . e6 c6 e6 - - d6 - - . . . . g5",
        "g5 - . c6 - - . . . c6 - e5 c6 - - .",
        "c6 - - . c6 - - - - . c6 - - - - -",
      ],
      drums: "double",
    },
  },
});
