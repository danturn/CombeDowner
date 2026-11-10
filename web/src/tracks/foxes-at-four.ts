import { defineTrack } from "./notation";

// Four in the morning, nobody about but the foxes: a light, sneaking trot from bin to bin under
// the street lamps. G# minor, 132 bpm.
const TROT = { k: "x.....x.x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." };

export default defineTrack({
  name: "Foxes at Four",
  bpm: 132,
  key: 4,
  hour: 3.5,
  intro: "trot",
  tone: { bright: 0.85, lead: "hollow", bass: "pick" },
  riffs: {
    // paws on the pavement: every note short and quiet
    trot: {
      guitar: [
        "x0 . x0 . x3 . x0 . x5 . x0 . x3 . x2 .",
        "x0 . x0 . x3 . x0 . x7 . x5 . x3 . x2 .",
        "x0 . x0 . x3 . x0 . x5 . x0 . x3 . x2 .",
        "x0 . x0 . x3 . x5 . o7 - - - o6 - - -",
      ],
      drums: TROT, weight: 3,
    },
    // nose in the bins, with a sly tune
    bins: {
      guitar: [
        "o0 - - . o0 . o3 - . o5 - . o6 - o5 -",
        "x0 x0 . x0 o3 - . o0 - - . x0 x0 . o10 -",
        "o0 - - . o0 . o3 - . o5 - . o6 - o5 -",
        "x0 x0 . x0 o8 - . o7 - . o5 - o3 - o2 -",
      ],
      lead: [
        "g#5 - - . b5 - c#6 - d6 - c#6 - b5 - g#5 -",
        "f#5 - g#5 - - - - - . . d#5 - f#5 - g#5 -",
        "b5 - - . b5 - c#6 - d#6 - - - c#6 - b5 -",
        "e6 - d#6 - b5 - a#5 - g#5 - - - - - . .",
      ],
      drums: "swing", weight: 2,
    },
    // stock still under a street lamp, looking straight at you
    streetlamp: {
      guitar: [
        "o0 - - - - - - - o8 - - - - - - -",
        "o3 - - - - - - - o10 - - - - - - -",
        "o0 - - - - - - - o8 - - - - - - -",
        "o5 - - - - - - - o7 - - - o7 . o7 .",
      ],
      lead: [
        "d#6 - - - - - b5 - e6 - - - - - b5 -",
        "d#6 - - - - - b5 - f#6 - - - - - d#6 -",
        "d#6 - - - - - b5 - e6 - - - - - c#6 -",
        "e6 - - - - - c#6 - d#6 - - - a#5 - - -",
      ],
      drums: "half", weight: 2,
    },
    // and gone, over the wall
    dash: {
      guitar: [
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o3 - o2 -",
        "x8 . x8 x8 x8 . x8 x8 x8 . x8 x8 o10 - o8 -",
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o3 - o2 -",
        "x5 . x5 x5 x5 . x5 x5 o7 - - - o6 - - -",
      ],
      drums: "gallop", shift: 5, weight: 2,
    },
  },
});
