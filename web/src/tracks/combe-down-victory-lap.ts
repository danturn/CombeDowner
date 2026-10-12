import { defineTrack } from "./notation";

// The triumphant lap of honour: G major and mixolydian, 160 bpm, galloping and soaring.
export default defineTrack({
  name: "Combe Down Victory Lap",
  bpm: 160,
  key: 3,
  intro: "lap",
  tone: { bright: 1.1, lead: "brass" },
  riffs: {
    // driving G with a flat-seventh lift through F and C, pushing home through D
    lap: {
      guitar: [
        "o0 - x0 x0 o0 - x0 x0 o10 - x10 x10 o5 - x5 x5",
        "o0 - x0 x0 o0 - x0 x0 o7 - - - o5 - o7 -",
        "o0 - x0 x0 o0 - x0 x0 o10 - x10 x10 o5 - x5 x5",
        "o9 - x9 x9 o5 - x5 x5 o7 - - - - - o5 o7",
      ],
      drums: "rock", shift: 2, weight: 2,
    },
    // gallop through G, D, E minor and C under a rising call to arms
    charge: {
      guitar: [
        "o0 . x0 x0 x0 . x0 x0 o7 . x7 x7 x7 . x7 x7",
        "o9 . x9 x9 x9 . x9 x9 o5 . x5 x5 o7 - - -",
        "o0 . x0 x0 x0 . x0 x0 o7 . x7 x7 x7 . x7 x7",
        "o5 . x5 x5 x5 . x5 x5 o7 . x7 x7 o10 - - -",
      ],
      lead: [
        "d5 - - - g5 - - - a5 - - - f#5 - d5 -",
        "g5 - - - b5 - - - c6 - - - d6 - - -",
        "d6 - - - - - b5 c6 d6 - c6 b5 a5 - - -",
        "c6 - - - e6 - - - d6 - - - c6 - - -",
      ],
      drums: "gallop", shift: 2, weight: 3,
    },
    // big open-chord chorus with a singalong melody climbing to the top G
    anthem: {
      guitar: [
        "o0 - - - - - - - o7 - - - - - x7 x7",
        "o9 - - - - - - - o5 - - - - - x5 x5",
        "o0 - - - - - - - o10 - - - - - x10 x10",
        "o5 - - - - - - - o7 - - - x7 x7 x7 x7",
      ],
      lead: [
        "b5 - - - - - c6 b5 a5 - - - - - . .",
        "g5 - - - - - a5 g5 e5 - - - g5 - - -",
        "b5 - - - - - c6 d6 c6 - - - - - a5 -",
        "e6 - - - g6 - e6 - d6 - - - - - - -",
      ],
      drums: "rock", weight: 2,
    },
    // strutting mixolydian hook bouncing between G, F and the octave
    parade: {
      guitar: [
        "x0 . x0 . o10 - o12 - x0 . x0 . o10 - o7 -",
        "x0 . x0 . o10 - o12 - x0 . x0 . o5 - o7 -",
        "x0 . x0 . o10 - o12 - x0 . x0 . o10 - o7 -",
        "o5 - - x5 o7 - - x7 o9 - - x9 o10 - o12 -",
      ],
      drums: { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 7,
    },
    // triplet gallop to the finish line with a melody that keeps climbing
    homestretch: {
      guitar: [
        "o0 x0 x0 o0 x0 x0 o5 x5 x5 o7 x7 x7",
        "o0 x0 x0 o0 x0 x0 o10 x10 x10 o5 x5 x5",
        "o0 x0 x0 o0 x0 x0 o5 x5 x5 o7 x7 x7",
        "o9 x9 x9 o5 x5 x5 o7 - - - - -",
      ],
      lead: [
        "g5 - a5 b5 - d6 c6 - - a5 - -",
        "b5 - - d6 - b5 c6 - a5 g5 - -",
        "g5 - a5 b5 - d6 e6 - - f#6 - -",
        "g6 - - e6 - - d6 - - - - -",
      ],
      drums: { k: "xx.xx.xx.xx.", s: "...x.....x..", h: "x..x..x..x.." },
    },
  },
});
