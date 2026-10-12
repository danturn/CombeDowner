import { defineTrack } from "./notation";

// Creeping through the bunker: C# minor with a flat second and flat fifth, 120 bpm, all stabs and silences.
export default defineTrack({
  name: "Bloomfield Bunker",
  bpm: 120,
  key: -3,
  intro: "lockdown",
  tone: { bright: 0.9, lead: "bell", bass: "sub" },
  riffs: {
    // lone stabs in the dark that suddenly snap into a burst of chugs
    lockdown: {
      guitar: [
        "o0 . . . . . . . o0 . o1 - . . . .",
        "o0 . . . . . . . o6 - - - . . . .",
        "o0 . . . . . . . o0 . o1 - . . o3 -",
        "o1 - . . o0 - . . x0 x0 x0 x0 x0 x0 o6 -",
      ],
      drums: { k: "x.......x.x.....", s: "............x...", h: "..x...x...x...x." },
    },
    // the door gives way: full-on chug that slams to a dead stop
    breach: {
      guitar: [
        "x0 x0 x0 x0 o1 - x0 x0 x0 x0 o3 - x0 x0 o6 -",
        "x0 x0 x0 x0 o1 - x0 x0 x0 x0 o3 - o2 - o1 -",
        "x0 x0 x0 x0 o1 - x0 x0 x0 x0 o3 - x0 x0 o6 -",
        "x0 x0 o8 - x0 x0 o7 - x0 x0 o6 - . . . .",
      ],
      lead: [
        "c#6 - - - d6 - - - . . e6 - - - g6 -",
        "c#6 - - - d6 - - - . . e6 - d#6 - d6 -",
        "c#6 - c#6 - d6 - - - . . e6 - f#6 - g6 -",
        "c#6 - a5 - - - g#5 - - - g5 - . . . .",
      ],
      drums: { k: "xxxx..xxxx..xx..", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 5, weight: 2,
    },
    // two muted stabs, then a glassy bell line answers in the silence
    corridor: {
      guitar: [
        "x0 . x0 . . . . . . . . . x0 . o1 -",
        "x0 . x0 . . . . . . . . . o6 - - -",
        "x0 . x0 . . . . . . . . . x0 . o1 -",
        "x0 . x0 . . . . . o3 - o2 - o1 - - -",
      ],
      lead: [
        ". . . . e5 - g#5 - c#6 - - - . . . .",
        ". . . . d6 - c#6 - g#5 - - - g5 - - -",
        ". . . . e5 - g#5 - b5 - c#6 - e6 - d6 -",
        ". . . . g5 - f#5 - e5 - d#5 - d5 - c#5 -",
      ],
      drums: { k: "x.x.........x.x.", s: "........x.......", h: "x...x...x...x..." },
      weight: 2,
    },
    // lurching three-step bursts broken up by gaps
    alarm: {
      guitar: [
        "x0 x0 x0 . . . x0 x0 x0 . . . o6 - - .",
        "x0 x0 x0 . . . x0 x0 x0 . . . o1 - - .",
        "x0 x0 x0 . . . x0 x0 x0 . . . o6 - o7 -",
        "o8 - - . o7 - - . o6 - - . o1 - - -",
      ],
      drums: { k: "xxx...xxx...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 5,
    },
    // everything at once: ringing chords and a chiming melody over double kick, then silence
    meltdown: {
      guitar: [
        "o0 - - - - - - - o8 - - - - - - -",
        "o3 - - - - - - - o1 - - - - - x1 x1",
        "o0 - - - - - - - o8 - - - - - - -",
        "o6 - - - - - o7 - - - - - . . . .",
      ],
      lead: [
        "g#5 - - - - - - - e5 f#5 g#5 a5 c#6 - - -",
        "b5 - - - - - g#5 - a5 - - - - - . .",
        "g#5 - - - - - - - e6 - d#6 - c#6 - - -",
        "d6 - - - - - d#6 - - - - - . . . .",
      ],
      drums: "double",
    },
  },
});
