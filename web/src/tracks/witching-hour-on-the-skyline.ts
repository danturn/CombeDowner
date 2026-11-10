import { defineTrack } from "./notation";

// Midnight up on the Skyline walk, with something in the trees: long silences, the chord a
// tritone away, and then a run for it. F, on the darkest scale going, 100 bpm.
export default defineTrack({
  name: "Witching Hour on the Skyline",
  bpm: 100,
  key: 1,
  hour: 0.5,
  intro: "owl",
  tone: { bright: 0.7, lead: "bell", bass: "sub" },
  riffs: {
    // a chord dying away into the dark, and an answer from somewhere it shouldn't be
    owl: {
      guitar: [
        "o0 - - - - - - - . . . . o6 - - -",
        "o0 - - - - - - - . . . . o1 - - -",
        "o0 - - - - - - - . . . . o6 - - -",
        "o8 - - - - - - - o7 - - - - - - -",
      ],
      drums: "sparse", weight: 2,
    },
    // mist in the valley: slow, with a cold little tune over it
    mist: {
      guitar: [
        "o0 - - - . . x0 . x0 . . . o1 - - -",
        "o0 - - - . . x0 . x0 . . . o3 - - -",
        "o0 - - - . . x0 . x0 . . . o1 - - -",
        "o8 - - - . . x8 . o7 - - - o6 - - -",
      ],
      lead: [
        "c6 - - - - - - - c#6 - - - c6 - - -",
        "g#5 - - - - - - - c6 - - - d#6 - - -",
        "c6 - - - - - - - c#6 - - - f6 - - -",
        "f6 - - - - - c#6 - e6 - - - d#6 - - -",
      ],
      drums: "half", weight: 3,
    },
    // footsteps behind you, a semitone nearer each time
    footsteps: {
      guitar: [
        "x0 . . x0 . . x1 . . x1 . . x3 . . .",
        "x3 . . x3 . . x4 . . x4 . . o6 - - -",
        "x0 . . x0 . . x1 . . x1 . . x3 . . .",
        "x6 . . x4 . . x3 . . x1 . . o0 - - -",
      ],
      drums: "march", shift: 5, weight: 2,
    },
    // run
    chase: {
      guitar: [
        "x0 x0 x0 x0 x0 x0 o6 - x0 x0 x0 x0 x0 x0 o1 -",
        "x0 x0 x0 x0 x0 x0 o8 - x0 x0 o7 - x0 x0 o6 -",
        "x0 x0 x0 x0 x0 x0 o6 - x0 x0 x0 x0 x0 x0 o1 -",
        "x0 x0 o3 - x0 x0 o1 - x0 x0 o6 - o1 - o0 -",
      ],
      lead: [
        "f5 . f5 g#5 f5 . f5 b5 f5 . f5 c6 b5 g#5 f#5 -",
        "f5 . f5 g#5 f5 . f5 c#6 c6 - b5 - g#5 - f#5 -",
        "f5 . f5 g#5 f5 . f5 b5 f5 . f5 c6 b5 g#5 f#5 -",
        "f6 - d#6 - c#6 - c6 - b5 - g#5 - f5 - - -",
      ],
      drums: "double",
    },
  },
});
