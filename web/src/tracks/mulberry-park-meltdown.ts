import { defineTrack } from "./notation";

// Mechanical industrial grind in C phrygian, 132 bpm, with the kick locked to the guitar's accents.
export default defineTrack({
  name: "Mulberry Park Meltdown",
  bpm: 132,
  key: -4,
  intro: "press",
  tone: { bright: 0.9, lead: "brass", bass: "sub" },
  riffs: {
    // syncopated hydraulic-press chug answered by a phrygian D-flat stab
    press: {
      guitar: [
        "x0 x0 . x0 . x0 x0 . x0 . x0 x0 . o1 - .",
        "x0 x0 . x0 . x0 x0 . x0 . x0 x0 . o3 - o1",
        "x0 x0 . x0 . x0 x0 . x0 . x0 x0 . o1 - .",
        "x0 x0 . x0 . x0 x0 . o6 - . o5 - . o1 -",
      ],
      drums: { k: "xx.x.xx.x.xx.x..", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 5, weight: 3,
    },
    // three-and-a-gap piston chug with a robotic brass ostinato
    piston: {
      guitar: [
        "x0 x0 x0 . x0 x0 x0 . x0 x0 x0 . o12 - x0 .",
        "x0 x0 x0 . x0 x0 x0 . x0 x0 x0 . o10 - o8 -",
        "x0 x0 x0 . x0 x0 x0 . x0 x0 x0 . o12 - x0 .",
        "x1 x1 x1 . x1 x1 x1 . x3 x3 x3 . o3 - o1 -",
      ],
      lead: [
        "c5 . c5 . g5 - . c5 . c5 d#5 - . c5 c#5 -",
        "c5 . c5 . g5 - . c5 . c5 d#5 - f5 - d#5 -",
        "g5 . g5 . c6 - . g5 . g5 a#5 - . g5 g#5 -",
        "g#5 - - - f5 - - - g5 - - - d#5 - c#5 -",
      ],
      drums: { k: "xxx.xxx.xxx.x.x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      weight: 2,
    },
    // half-time conveyor: ringing chords, stuttered mutes and a wailing lead
    conveyor: {
      guitar: [
        "o0 - - - - - x0 . x0 . . x0 . x0 x0 .",
        "o1 - - - - - x1 . x1 . . x1 . x1 x1 .",
        "o0 - - - - - x0 . x0 . . x0 . x0 x0 .",
        "o8 - - - - - o7 - - - - - o1 - - -",
      ],
      lead: [
        "g5 - - - - - - - - - - - d#5 - f5 -",
        "g#5 - - - - - - - - - - - f5 - c#5 -",
        "c6 - - - - - - - a#5 - g5 - - - . .",
        "c6 - - - - - b5 - - - - - c#6 - - -",
      ],
      drums: { k: "x.....x.x..x.xx.", s: "........x.......", h: "x...x...x...x..." },
      weight: 2,
    },
    // riveting octave stabs in threes under a sixteenth-note arpeggio shred
    rivet: {
      guitar: [
        "o12 x0 x0 o10 x0 x0 o12 x0 x0 o10 x0 x0 o8 - o7 -",
        "o12 x0 x0 o10 x0 x0 o12 x0 x0 o10 x0 x0 o13 - o12 -",
        "o12 x0 x0 o10 x0 x0 o12 x0 x0 o10 x0 x0 o8 - o7 -",
        "x0 x0 x0 x0 . . . . o6 - . o5 - . o1 -",
      ],
      lead: [
        "c6 g5 d#5 c6 g5 d#5 c6 g5 d#5 d6 a#5 f5 g#5 - g5 -",
        "c6 g5 d#5 c6 g5 d#5 c6 g5 d#5 d6 a#5 f5 c#6 - c6 -",
        "d#6 c6 g5 d#6 c6 g5 d#6 c6 g5 f6 d6 a#5 g#5 - g5 -",
        "g5 f5 d#5 c5 . . . . c#6 - - c6 - - g#5 -",
      ],
      drums: { k: "x..x..x..x..x.x.", s: "....x.......x...", h: "xxxxxxxxxxxxxxxx" },
      weight: 2,
    },
    // the foundry chorus: open C, A-flat and a G that pulls back home
    foundry: {
      guitar: [
        "o0 - - x0 x0 . o0 - - x0 x0 . o3 - x3 .",
        "o8 - - x8 x8 . o8 - - x8 x8 . o7 - x7 .",
        "o0 - - x0 x0 . o0 - - x0 x0 . o3 - x3 .",
        "o5 - - x5 x5 . o6 - - x6 x6 . o7 - - -",
      ],
      lead: [
        "g5 - - - - - d#5 - - - f5 - g5 - - -",
        "g#5 - - - - - c6 - - - a#5 - b5 - - -",
        "c6 - - - - - d#6 - - - f6 - d#6 - - -",
        "f6 - - - c6 - c#6 - - - a#5 - b5 - - -",
      ],
      drums: { k: "x..xx.x..xx.x.x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      weight: 2,
    },
  },
});
