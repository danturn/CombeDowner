import { defineTrack } from "./notation";

// Driving straight-eighth F# minor road anthem, 168 bpm.
export default defineTrack({
  name: "Midford Road Run",
  bpm: 168,
  key: 2,
  intro: "road",
  tone: { lead: "hollow", bass: "pick" },
  riffs: {
    // eighth-note drive climbing to C#, then a VI-VII-i lift back home
    road: {
      guitar: [
        "x0 . x0 . o3 - x0 . x0 . o5 - x0 . o7 -",
        "x0 . x0 . o8 - - - o7 - - - o5 - o3 -",
        "x0 . x0 . o3 - x0 . x0 . o5 - x0 . o7 -",
        "o8 - - - o10 - - - o12 - - - x0 . x0 .",
      ],
      drums: "rock", shift: 5, weight: 3,
    },
    // wide-open anthem chords under a soaring chorus melody
    highway: {
      guitar: [
        "o0 - - - - - o0 - o8 - - - - - o8 -",
        "o10 - - - - - o10 - o7 - - - - - o7 -",
        "o0 - - - - - o0 - o8 - - - - - o8 -",
        "o3 - - - - - o3 - o10 - - - o7 - - -",
      ],
      lead: [
        "c#6 - - - - - a5 - a5 - - - f#5 - - -",
        "b5 - - - - - g#5 - g#5 - - - - - . .",
        "c#6 - - - - - e6 - f#6 - - - - - e6 -",
        "e6 - - - c#6 - - - b5 - - - c#6 - - -",
      ],
      drums: "punk", shift: 5, weight: 2,
    },
    // muted verse chug with a singing hollow-lead hook
    pistons: {
      guitar: [
        "x0 . x0 . x0 . o7 - x0 . x0 . o5 - . .",
        "x0 . x0 . x0 . o7 - x0 . x0 . o8 - o7 -",
        "x0 . x0 . x0 . o7 - x0 . x0 . o5 - . .",
        "x8 . x8 . o8 - . . x10 . x10 . o10 - - -",
      ],
      lead: [
        "f#5 - - - a5 - c#6 - - - - - b5 - a5 -",
        "f#5 - - - a5 - c#6 - - - - - d6 - c#6 -",
        "f#6 - - - e6 - c#6 - - - - - b5 - - -",
        "a5 - - - - - . . b5 - - - - - c#6 -",
      ],
      drums: { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      weight: 2,
    },
    // foot-down eighth-note open chords, punk style
    overtake: {
      guitar: [
        "o0 - o0 - o0 - o0 - o3 - o3 - o3 - o3 -",
        "o8 - o8 - o8 - o8 - o10 - o10 - o7 - - -",
        "o0 - o0 - o0 - o0 - o3 - o3 - o3 - o3 -",
        "o5 - o5 - o5 - o5 - o8 - - - o10 - - -",
      ],
      drums: "punk", shift: 2, weight: 2,
    },
    // half-time bridge: ringing chords, clipped answers, a long held melody
    milestone: {
      guitar: [
        "o0 - - - - - - - x0 x0 . x0 . x0 x0 .",
        "o8 - - - - - - - x8 x8 . x8 . o7 - -",
        "o0 - - - - - - - x0 x0 . x0 . x0 x0 .",
        "o3 - - - - - - - o5 - - - o7 - - -",
      ],
      lead: [
        "f#6 - - - - - - - e6 - c#6 - - - . .",
        "d6 - - - - - - - a5 - - - - g#5 - -",
        "c#6 - - - - - - - e6 - c#6 - b5 - a5 -",
        "c#6 - - - - - - - b5 - - - c#6 - - -",
      ],
      drums: "half",
    },
  },
});
