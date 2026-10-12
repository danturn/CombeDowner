import { defineTrack } from "./notation";

// The old Bath-stone mines under Combe Down: a D phrygian doom crawl, 96 bpm.
export default defineTrack({
  name: "Quarry Tunnels",
  bpm: 96,
  key: -2,
  intro: "seam",
  tone: { bright: 0.8, lead: "bell", bass: "sub" },
  riffs: {
    // long ringing D leaning on the flat second, sliding down through the tritone
    seam: {
      guitar: [
        "o0 - - - - - - - - - . . o1 - - -",
        "o0 - - - - - - . x0 . x0 . o3 - o1 -",
        "o0 - - - - - - - - - . . o1 - - -",
        "o8 - - - - - o7 - - - o6 - - - o1 -",
      ],
      drums: "sparse", shift: 5, weight: 3,
    },
    // slow chord walk under a glassy, echoing bell melody
    lantern: {
      guitar: [
        "o0 - - - - - - - o3 - - - - - - -",
        "o1 - - - - - - - - - - - x0 . x0 .",
        "o0 - - - - - - - o5 - - - - - - -",
        "o8 - - - - - - - o7 - - - o6 - o1 -",
      ],
      lead: [
        "a5 - - - - - - - a5 - c6 - - - . .",
        "a#5 - - - - - - - g5 - - - d#5 - - -",
        "a5 - - - - - - - d6 - - - a#5 - - -",
        "a#5 - - - f5 - d5 - e5 - - - d#5 - - -",
      ],
      drums: "half", weight: 2,
    },
    // muted pedal with a chord creeping up a semitone at a time
    creep: {
      guitar: [
        "x0 . . x0 . . x0 . o1 - - - x0 . . .",
        "x0 . . x0 . . x0 . o2 - - - o1 - - -",
        "x0 . . x0 . . x0 . o3 - - - x0 . . .",
        "x0 . . x0 . . x0 . o6 - - - o5 - o1 -",
      ],
      drums: { k: "x..x..x.....x...", s: "........x.......", h: "x...x...x...x..." },
      shift: 5, weight: 2,
    },
    // triplet cave-in with a bell line sinking chromatically
    cavein: {
      guitar: [
        "o0 - - - - - x0 x0 . x0 . .",
        "o1 - - - - - x0 x0 . o3 - -",
        "o0 - - - - - x0 x0 . x0 . .",
        "o8 - - o7 - - o6 - - o1 - -",
      ],
      lead: [
        "d6 - - - - - - - - c6 a#5 a5",
        "a#5 - - - - - g5 - - a5 - -",
        "d6 - - - - - - - - d#6 d6 c6",
        "a#5 - - a5 - - g#5 - - g5 - -",
      ],
      drums: "heavy12", weight: 2,
    },
    // funeral chords through the tritone, the melody dripping down by semitones
    dirge: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o6 - - - - - - - o5 - - - - - - -",
        "o0 - - - - - - - o10 - - - o8 - - -",
        "o1 - - - - - - - o3 - - - o1 - - -",
      ],
      lead: [
        "f5 - - - - - - - e5 - d#5 - d5 - - -",
        "d#5 - - - - - - - d5 - - - a#4 - - -",
        "a5 - - - - - - - g5 - - - f5 - - -",
        "g5 - - - a#5 - - - a5 - c6 - d#5 - - -",
      ],
      drums: "sparse", shift: 7,
    },
    // the roof gives way: muted bursts and tritone stabs on a backbeat
    collapse: {
      guitar: [
        "x0 x0 x0 x0 o6 - - - x0 x0 x0 x0 o5 - - -",
        "x0 x0 x0 x0 o1 - - - - - - - . . . .",
        "x0 x0 x0 x0 o6 - - - x0 x0 x0 x0 o8 - - -",
        "o7 - - - o6 - - - o5 - - - o1 - x0 x0",
      ],
      drums: { k: "xxxx....xxxx....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
    },
  },
});
