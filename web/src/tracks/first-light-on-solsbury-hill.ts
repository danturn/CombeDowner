import { defineTrack } from "./notation";

// Dawn: chords left ringing while the sky goes pale, then the birds start up and the sun comes over
// the hill. E minor leaning towards G major, 108 bpm.
export default defineTrack({
  name: "First Light on Solsbury Hill",
  bpm: 108,
  hour: 5.5,
  intro: "glimmer",
  tone: { bright: 0.85, lead: "bell", bass: "sub" },
  riffs: {
    // open chords ringing out one after another, hardly a drum under them
    glimmer: {
      guitar: [
        "o0 - - - - - - - o7 - - - - - o5 -",
        "o3 - - - - - - - o5 - - - - - o7 -",
        "o0 - - - - - - - o7 - - - - - o5 -",
        "o8 - - - - - - - o10 - - - - - - -",
      ],
      drums: "sparse", weight: 2,
    },
    // a slow climb, the tune reaching a little higher each time
    rise: {
      guitar: [
        "o0 - - - . . x0 x0 o3 - - - . . x3 x3",
        "o10 - - - . . x10 x10 o5 - - - . . x5 x5",
        "o0 - - - . . x0 x0 o3 - - - . . x3 x3",
        "o8 - - - - - - - o10 - - - o7 - - -",
      ],
      lead: [
        "b4 - - - e5 - - - g5 - - - - - f#5 -",
        "a5 - - - - - f#5 - e5 - - - - - . .",
        "b4 - - - e5 - - - g5 - - - - - b5 -",
        "c6 - - - b5 - g5 - a5 - - - b5 - - -",
      ],
      drums: "half", weight: 2,
    },
    // the dawn chorus: a steady chug with a lead that trills like a blackbird
    birdsong: {
      guitar: [
        "x0 . x0 . o0 - x0 . x0 . x0 . o7 - o5 -",
        "x3 . x3 . o3 - x3 . x3 . x3 . o10 - o8 -",
        "x0 . x0 . o0 - x0 . x0 . x0 . o7 - o5 -",
        "x8 . x8 . o8 - x8 . o10 - - - o10 - - -",
      ],
      lead: [
        "e6 . e6 d6 e6 . b5 . e6 . e6 d6 e6 - b5 -",
        "g6 . g6 f#6 g6 . d6 . g6 . g6 f#6 g6 - d6 -",
        "e6 . e6 d6 e6 . b5 . e6 . e6 d6 e6 - b5 -",
        "c6 - e6 - g6 - e6 - d6 - f#6 - a5 - - -",
      ],
      drums: "rock", weight: 2,
    },
    // the sun is up: big open chords in G, and the tune out in the clear
    sunup: {
      guitar: [
        "o3 - - o3 - - o3 - o10 - - o10 - - o10 -",
        "o5 - - o5 - - o5 - o0 - - o0 - - o0 -",
        "o3 - - o3 - - o3 - o10 - - o10 - - o10 -",
        "o8 - - o8 - - o8 - o10 - - - - - - -",
      ],
      lead: [
        "d6 - - - b5 - g5 - a5 - - - d6 - - -",
        "e6 - - - c#6 - a5 - b5 - - - - - . .",
        "d6 - - - b5 - g5 - a5 - - - f#6 - - -",
        "e6 - - - - - g6 - f#6 - - - - - - -",
      ],
      drums: "rock", weight: 3,
    },
  },
});
