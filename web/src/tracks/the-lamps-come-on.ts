import { defineTrack } from "./notation";

// Dusk: the street lamps flickering on one by one, and the day's tune turning minor. C# minor,
// 120 bpm.
export default defineTrack({
  name: "The Lamps Come On",
  bpm: 120,
  key: -3,
  hour: 20,
  intro: "flicker",
  tone: { bright: 0.9, lead: "bell", bass: "sub" },
  riffs: {
    // a chord, a gap, the chord again: a lamp deciding whether to light
    flicker: {
      guitar: [
        "o0 - - - . . o0 - . . . . o7 - - -",
        "o0 - - - . . o0 - . . . . o8 - - -",
        "o0 - - - . . o0 - . . . . o7 - - -",
        "o5 - - - . . o5 - . . o3 - o2 - - -",
      ],
      drums: "sparse", weight: 2,
    },
    // all lit: a steady pulse, and a tune like a bell down the street
    amber: {
      guitar: [
        "x0 . x0 x0 . x0 x0 . o8 - - - o7 - - -",
        "x0 . x0 x0 . x0 x0 . o3 - - - o5 - - -",
        "x0 . x0 x0 . x0 x0 . o8 - - - o7 - - -",
        "x8 . x8 x8 . x8 x8 . o10 - - - o7 - - -",
      ],
      lead: [
        "g#5 - - - c#6 - - - e6 - - - d#6 - - -",
        "g#5 - - - c#6 - - - b5 - - - a5 - - -",
        "e6 - - - c#6 - - - a5 - - - c6 - - -",
        "c#6 - - - e6 - - - d#6 - b5 - g#5 - - -",
      ],
      drums: "rock", weight: 3,
    },
    // moths round the lamp: a loose, swung groove
    moths: {
      guitar: [
        "o0 - - . o0 . o3 - . o5 - . o7 - o5 -",
        "x0 x0 x0 x0 o3 - . o0 - - . x0 x0 . o10 -",
        "o0 - - . o0 . o3 - . o5 - . o7 - o5 -",
        "x0 x0 x0 x0 o8 - . o7 - . o5 - o3 - o2 -",
      ],
      lead: [
        "c#5 - - . e5 - f#5 - g#5 - f#5 - e5 - c#5 -",
        "b4 - c#5 - - - - - . . g#5 - b5 - c#6 -",
        "e6 - - . e6 - d#6 - c#6 - - - b5 - g#5 -",
        "a5 - g#5 - e5 - d#5 - c#5 - - - - - . .",
      ],
      drums: "swing", weight: 2,
    },
    // and then it's dark
    nightfall: {
      guitar: [
        "o0 - - - - - x0 x0 . . x0 . o1 - - -",
        "o0 - - - - - x0 x0 . . x0 . o6 - o5 -",
        "o0 - - - - - x0 x0 . . x0 . o1 - - -",
        "o0 - - - - - x0 x0 x0 x0 o8 - o7 - o3 -",
      ],
      drums: "half", shift: 5,
    },
  },
});
