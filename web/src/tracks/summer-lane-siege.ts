import { defineTrack } from "./notation";

// Groove metal for holding the line: D minor blues, 120 bpm, stomping syncopation and bent notes.
export default defineTrack({
  name: "Summer Lane Siege",
  bpm: 120,
  key: -2,
  intro: "stomp",
  tone: { bright: 1.1, lead: "brass", bass: "slap" },
  riffs: {
    // dotted stomp on D with blues-scale stabs dropping in between
    stomp: {
      guitar: [
        "o0 - . x0 . . x0 . o3 - . x0 . . o5 -",
        "o0 - . x0 . . x0 . o6 - o5 - o3 - . .",
        "o0 - . x0 . . x0 . o3 - . x0 . . o5 -",
        "o10 - . o10 . . o7 - . . o6 - o5 - o3 -",
      ],
      drums: { k: "x..x..x.x..x..x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 5, weight: 3,
    },
    // bouncing muted sixteenths with octave pops and a bluesy answer
    bounce: {
      guitar: [
        "x0 . x0 x0 . . x0 . . x0 . . o12 - . .",
        "x0 . x0 x0 . . x0 . . x0 . . o10 - o7 .",
        "x0 . x0 x0 . . x0 . . x0 . . o12 - . .",
        "x0 . x0 x0 . . o6 - - . o5 - - . o3 -",
      ],
      lead: [
        "a5 - - - - - - - g5 a5 c6 - d6 - - -",
        "f6 - - - d6 - c6 - a5 - - - c6 - a5 -",
        "a5 - - - - - g#5 g5 f5 - g5 - d6 - - -",
        "d5 f5 g5 a5 c6 . g#5 - - - g5 - - - f5 -",
      ],
      drums: { k: "x.xx..x..x......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      weight: 2,
    },
    // half-time sludge with long bent notes over the flat fifth
    sludge: {
      guitar: [
        "o0 - - - - - - - . x0 x0 . o6 - o5 -",
        "o3 - - - - - - - . x3 x3 . o5 - o3 -",
        "o0 - - - - - - - . x0 x0 . o6 - o5 -",
        "o10 - - - - - - - o7 - - - o6 - o5 -",
      ],
      lead: [
        "d6 - - - - - - - c6 - a5 - g#5 - g5 -",
        "f5 - - - - - - - a5 - c6 - d6 - c6 -",
        "d6 - - - - - - - f6 - d6 - c6 - - -",
        "c6 - - - - - - - a5 - - - g#5 - g5 -",
      ],
      drums: "half",
    },
    // jackhammer chugs answered by octave and fifth stabs
    siege: {
      guitar: [
        "x0 x0 . o12 . x0 x0 . o10 . x0 x0 . o7 . .",
        "x0 x0 . o12 . x0 x0 . o10 . x0 x0 . o6 o5 .",
        "x0 x0 . o12 . x0 x0 . o10 . x0 x0 . o7 . .",
        "x0 x0 . o3 - - . o5 - - . o6 - o7 - -",
      ],
      drums: { k: "xx.x.xx.x.xx.x..", s: "....x.......x...", h: "x...x...x...x..." },
      shift: 7, weight: 2,
    },
    // swung shuffle lurch with a call-and-answer blues lick
    lurch: {
      guitar: [
        "o0 - x0 . x0 x0 o3 - x0 . o5 -",
        "o0 - x0 . x0 x0 o6 - o5 . o3 -",
        "o0 - x0 . x0 x0 o3 - x0 . o5 -",
        "o10 - - o7 - - o6 - - o5 - -",
      ],
      lead: [
        "d6 - - . c6 a5 c6 - - . d6 -",
        "f6 - - . d6 c6 g#5 - g5 . f5 -",
        "d6 - - . c6 a5 c6 - d6 - f6 -",
        "c6 - - a5 - - g#5 - - g5 - -",
      ],
      drums: "heavy12",
    },
  },
});
