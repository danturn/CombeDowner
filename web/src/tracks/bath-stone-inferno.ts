import { defineTrack } from "./notation";

// Frantic, menacing E minor pedal riffing full of flat seconds and tritones, 160 bpm.
export default defineTrack({
  name: "Bath Stone Inferno",
  bpm: 160,
  intro: "inferno",
  tone: { bright: 1.1, lead: "brass" },
  riffs: {
    // triple-hit low E broken up by tritone and flat-second stabs, then a chromatic fall
    inferno: {
      guitar: [
        "x0 x0 x0 . o6 - x0 x0 x0 . o5 - x0 . o1 -",
        "x0 x0 x0 . o6 - x0 x0 x0 . o7 - - - . .",
        "x0 x0 x0 . o6 - x0 x0 x0 . o5 - x0 . o1 -",
        "x0 x0 x0 . o10 - o9 - o8 - x0 x0 o6 - o1 -",
      ],
      drums: { k: "xxx...xxx...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 5, weight: 3,
    },
    // double-kick pedal against F and Bb, the lead shadowing the chords down
    brimstone: {
      guitar: [
        "x0 x0 x0 x0 o1 - - - x0 x0 x0 x0 o6 - - -",
        "x0 x0 x0 x0 o3 - - - x0 x0 o5 - o6 - o5 -",
        "x0 x0 x0 x0 o1 - - - x0 x0 x0 x0 o6 - - -",
        "x0 x0 x0 x0 o8 - o7 - o6 - o5 - o3 - o1 -",
      ],
      lead: [
        "b5 - - - c6 - - - b5 - - - a#5 - - -",
        "b5 - - - d6 - - - b5 - c6 - a#5 - a5 -",
        "e6 - - - f6 - - - e6 - - - f6 - - -",
        "e6 - - - c6 - b5 - a#5 - a5 - g5 - f5 -",
      ],
      drums: "double", shift: 5, weight: 2,
    },
    // triplet gallop on the pedal, lurching into semitone stabs
    furnace: {
      guitar: [
        "x0 x0 x0 x0 x0 x0 o1 - - x0 x0 x0",
        "x0 x0 x0 x0 x0 x0 o6 - - o5 - -",
        "x0 x0 x0 x0 x0 x0 o1 - - x0 x0 x0",
        "o3 - - o1 - - o6 - - o7 - -",
      ],
      drums: "trip", shift: 7, weight: 2,
    },
    // slow, looming open chords under a wailing chromatic lead
    abyss: {
      guitar: [
        "o0 - - - - - - - o1 - - - - - - -",
        "o0 - - - - - - - o6 - - - o5 - - -",
        "o0 - - - - - - - o1 - - - - - - -",
        "o3 - - - o1 - - - x0 x0 x0 x0 x0 x0 x0 x0",
      ],
      lead: [
        "e6 - - - - - - - f6 - - - e6 - c6 -",
        "b5 - - - - - - - a#5 - - - a5 - - -",
        "e6 - - - - - - - f6 - - - g6 - f6 -",
        "g6 - - - f6 - - - e6 - - - - - - -",
      ],
      drums: "half",
    },
    // stabs into silence answered by a chug, the lead filling the gaps
    stabs: {
      guitar: [
        "o0 . . o1 . . o0 . . o6 - - . . . .",
        "x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 o5 - o6 -",
        "o0 . . o1 . . o0 . . o6 - - . . . .",
        "x0 x0 x0 x0 x0 x0 x0 x0 o10 - o9 - o8 - o7 -",
      ],
      lead: [
        ". . . . . . . . . a#5 - - a5 - g5 -",
        "e5 - - - g5 - - - b5 - - - a5 - a#5 -",
        ". . . . . . . . . f6 - - e6 - d6 -",
        "e6 - - - - - - - d6 - c#6 - c6 - b5 -",
      ],
      drums: { k: "x..x..x..x..xxxx", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      weight: 2,
    },
  },
});
