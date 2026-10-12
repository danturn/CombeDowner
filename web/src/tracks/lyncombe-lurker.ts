import { defineTrack } from "./notation";

// Stalking, creepy dread of stabs, silences, tritones and chromatic crawls: D# phrygian, 104 bpm.
export default defineTrack({
  name: "Lyncombe Lurker",
  bpm: 104,
  key: -1,
  intro: "creep",
  tone: { bright: 0.7, lead: "bell", bass: "sub" },
  riffs: {
    // a ringing root, a long silence, then a tritone stab out of nowhere
    creep: {
      guitar: [
        "o0 - - - . . . . . . o6 - . . . .",
        "o0 - - - . . . . . . o1 - - - . .",
        "o0 - - - . . . . . . o6 - . . o7 -",
        "o5 - - - o6 - - - . . . . x0 . x0 .",
      ],
      drums: "sparse", shift: 5, weight: 2,
    },
    // muted chords crawling up a semitone at a time and sliding back down
    crawl: {
      guitar: [
        "x0 . . x0 . . x1 . . x1 . . x2 . . .",
        "x2 . . x2 . . x3 . . x3 . . o6 - - -",
        "x0 . . x0 . . x1 . . x1 . . x2 . . .",
        "x3 . . x2 . . x1 . . . . . o7 - o6 -",
      ],
      lead: [
        "d#6 - - - - - e6 - - - - - . . . .",
        ". . . . . . f#5 - - - - - a5 - - -",
        "a#5 - - - - - b5 - - - - - . . . .",
        "f#5 - - . . . e5 - - . . . a#5 - a5 -",
      ],
      drums: { k: "x.....x......x..", s: "........x.......", h: "x...x...x...x..." },
      weight: 2,
    },
    // half-time dread on the root and flat second, sinking B, A#, A, E
    stalk: {
      guitar: [
        "o0 - - - - - x0 x0 . . x0 . o1 - - -",
        "o0 - - - - - x0 x0 . . x0 . o6 - - -",
        "o0 - - - - - x0 x0 . . x0 . o1 - - -",
        "o8 - - - o7 - - - o6 - - - o1 - - -",
      ],
      lead: [
        "a#5 - - - - - - - . . . . b5 - - -",
        "a#5 - - - - - - - . . . . a5 - - -",
        "d#6 - - - - - - - . . . . e6 - - -",
        "f#6 - - - f6 - - - e6 - - - b5 - - -",
      ],
      drums: "half", weight: 2,
    },
    // near silence: lone chords decay under a music-box bell line
    seance: {
      guitar: [
        "o0 - - - - - - - . . . . . . . .",
        ". . . . . . . . o1 - - - - - - -",
        "o0 - - - - - - - . . . . . . . .",
        ". . . . o6 - - - . . . . o5 - o6 -",
      ],
      lead: [
        "d#6 . a#5 . f#5 . a#5 . d#6 . e6 . d#6 - - .",
        ". . . . c#6 . b5 . b5 . g#5 . e5 - - -",
        "d#6 . a#5 . f#5 . a#5 . d#6 . e6 . f#6 - - .",
        ". . . . a5 . c#6 . e6 - - - d#6 - e6 -",
      ],
      drums: "sparse",
    },
    // jump-scare double stabs, a tritone hit, then a chromatic slide down from the octave
    lunge: {
      guitar: [
        "x0 x0 . . . . x0 . . . o6 - . . . .",
        "x0 x0 . . . . x0 . . . o5 - o6 - . .",
        "x0 x0 . . . . x0 . . . o6 - . . . .",
        "x0 x0 . . o12 - . . o11 - . . o10 - o9 -",
      ],
      drums: { k: "xx....x...x.....", s: "..........x.....", h: "........x......." },
      shift: 6,
    },
  },
});
