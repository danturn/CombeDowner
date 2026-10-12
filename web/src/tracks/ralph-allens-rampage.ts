import { defineTrack } from "./notation";

// Cocky A minor blues-rock swagger, 128 bpm.
export default defineTrack({
  name: "Ralph Allen's Rampage",
  bpm: 128,
  key: 5,
  intro: "strut",
  tone: { lead: "reed", bass: "slap" },
  riffs: {
    // stop-start strut: low double hits answered by high stabs, pushing through the blue note
    strut: {
      guitar: [
        "x0 x0 . o12 - . x0 x0 . o10 - . o7 - . .",
        "x0 x0 . o12 - . x0 x0 . o10 - o9 - o7 - .",
        "x0 x0 . o12 - . x0 x0 . o10 - . o7 - . .",
        "o5 - . o5 - . o6 - . o6 - . o7 - x0 x0",
      ],
      drums: { k: "xx....xx....x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 5, weight: 3,
    },
    // lazy shuffle boogie with a smirking blues lick
    boots: {
      guitar: [
        "o0 - x0 o0 - x0 . . x0 o3 - o5",
        "o0 - x0 o0 - x0 . . x0 o6 - o7",
        "o0 - x0 o0 - x0 . . x0 o3 - o5",
        "o10 - x10 o7 - x7 o5 - o6 o7 - .",
      ],
      lead: [
        "e5 - - . . . a5 - c6 - - .",
        "e6 - - d6 - c6 a5 - . . . .",
        "e5 - - . . . a5 - c6 - d6 d#6",
        "d6 - - b5 - - a5 - - b5 - -",
      ],
      drums: "shuffle", weight: 3,
    },
    // syncopated open-chord chorus with a big sing-along line
    hotrod: {
      guitar: [
        "o0 - - o0 - - o10 - - - o7 - - - o5 -",
        "o3 - - o3 - - o5 - - - . . x0 x0 x0 x0",
        "o0 - - o0 - - o10 - - - o7 - - - o5 -",
        "o3 - - o3 - - o2 - - - o7 - - - - -",
      ],
      lead: [
        "e6 - - e6 - - d6 - - - b5 - - - a5 -",
        "g5 - - g5 - - f#5 - - - a5 - . . . .",
        "e6 - - e6 - - g6 - - - e6 - - - d6 -",
        "e6 - - c6 - - f#6 - - - e6 - - - - -",
      ],
      drums: "rock", shift: 5, weight: 2,
    },
    // half-time lean-back with the blue note grinding into the fifth
    cigar: {
      guitar: [
        "o0 - - - . . x0 . x0 . o6 - o7 - . .",
        "o0 - - - . . x0 . x0 . o10 - o9 - . .",
        "o0 - - - . . x0 . x0 . o6 - o7 - . .",
        "o3 - . o3 - . o5 - . o5 - . o6 - o7 -",
      ],
      drums: { k: "x.....x.x.......", s: "....x.......x...", h: "x.xox.x.x.xox.x." },
    },
    // dorian solo over A and D, with a blue-note flick before the turnaround
    kingpin: {
      guitar: [
        "o0 - - - - - x0 x0 o0 - - - x0 x0 o0 -",
        "o5 - - - - - x5 x5 o5 - - - x5 x5 o5 -",
        "o0 - - - - - x0 x0 o0 - - - x0 x0 o0 -",
        "o10 - - - - - x10 x10 o7 - - - o6 - o7 -",
      ],
      lead: [
        "a5 - c6 - d6 - e6 - - - - - d6 c6 a5 -",
        "f#5 - a5 - - - f#5 - d5 - e5 - f#5 - a5 -",
        "a5 - c6 - d6 - e6 - g6 - e6 - d#6 - e6 -",
        "d6 - b5 - g5 - b5 - b5 - - - - - . .",
      ],
      drums: "swing", shift: 5, weight: 2,
    },
  },
});
