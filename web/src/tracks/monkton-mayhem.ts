import { defineTrack } from "./notation";

// Punk open-chord bashing with gang-chant hooks and Eb/F major flashes: G minor, 176 bpm.
export default defineTrack({
  name: "Monkton Mayhem",
  bpm: 176,
  key: 3,
  intro: "riot",
  tone: { bright: 1.3, lead: "hollow", bass: "pick" },
  riffs: {
    // eighth-note open chords, G to Bb to C, answered by F and Eb, kicked back with stabs
    riot: {
      guitar: [
        "o0 - o0 - o0 - o0 - o3 - o3 - o5 - - -",
        "o0 - o0 - o0 - o0 - o10 - o10 - o8 - - -",
        "o0 - o0 - o0 - o0 - o3 - o3 - o5 - - -",
        "o8 - - - o10 - - - o12 - - . o12 . o12 -",
      ],
      drums: "punk", shift: 5, weight: 3,
    },
    // stop-start stabs leaving gaps for the crowd, chant line climbing Eb, F, G
    chant: {
      guitar: [
        "o0 . . . o0 . . . o3 - o5 - o0 . . .",
        "o0 . . . o0 . . . o10 - o8 - o10 . . .",
        "o0 . . . o0 . . . o3 - o5 - o0 . . .",
        "o8 - - - o10 - - - o0 . o0 . o0 o0 o0 -",
      ],
      lead: [
        "g5 . . . g5 . . . a#5 - c6 - d6 - . .",
        "d6 . . . d6 . . . c6 - a#5 - c6 - . .",
        "g5 . . . g5 . . . a#5 - c6 - d6 - - -",
        "d#6 - - - f6 - - - g6 - . . g5 . . .",
      ],
      drums: { k: "x...x...x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      weight: 2,
    },
    // 3-3-2 pushed chords, G to Eb then F to C, under a singalong melody
    pogo: {
      guitar: [
        "o0 - - o0 - - o0 - o8 - - o8 - - o8 -",
        "o10 - - o10 - - o10 - o5 - - o5 - - o3 -",
        "o0 - - o0 - - o0 - o8 - - o8 - - o8 -",
        "o10 - - o10 - - o10 - x0 x0 . x0 o5 - o10 -",
      ],
      lead: [
        "d6 - - d6 - - a#5 - g5 - - g5 - - a#5 -",
        "a5 - - c6 - - a5 - g5 - - g5 - - f5 -",
        "d6 - - d6 - - a#5 - g5 - - a#5 - - d#6 -",
        "f6 - - f6 - - c6 - d6 - . d6 c6 - a5 -",
      ],
      drums: "punk", shift: 2, weight: 2,
    },
    // big half-bar Eb and F chords swinging back to G minor for the terrace anthem
    anthem: {
      guitar: [
        "o8 - - - - - o8 - o10 - - - - - o10 -",
        "o0 - - - - - o0 - o0 - o3 - o5 - o3 -",
        "o8 - - - - - o8 - o10 - - - - - o10 -",
        "o5 - - - - - o5 - o10 - - - - - . .",
      ],
      lead: [
        "g5 - - - - - a#5 - a5 - - - - - c6 -",
        "a#5 - - - - - - - g5 - a#5 - c6 - a#5 -",
        "g5 - - - - - a#5 - c6 - - - - - d6 -",
        "d#6 - - - d6 - - - c6 - - - - - . .",
      ],
      drums: "rock", weight: 2,
    },
    // palm-muted verse chug with open-chord pops, the kick hitting with the pops
    skank: {
      guitar: [
        "x0 x0 x0 x0 o0 - x0 x0 x0 x0 o3 - x0 x0 o5 -",
        "x0 x0 x0 x0 o0 - x0 x0 x0 x0 o10 - o8 - o5 -",
        "x0 x0 x0 x0 o0 - x0 x0 x0 x0 o3 - x0 x0 o5 -",
        "x0 x0 o3 - x0 x0 o5 - o8 - o8 - o10 - o10 -",
      ],
      drums: { k: "x...x.x...x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 5,
    },
  },
});
