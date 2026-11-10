import { defineTrack } from "./notation";

// Mid-morning with a coffee: an easy, strutting groove in a sunny key. G with a flattened
// seventh, 126 bpm.
export default defineTrack({
  name: "Elevenses at the Deli",
  bpm: 126,
  key: 3,
  hour: 11,
  intro: "counter",
  tone: { bright: 1.05, lead: "reed", bass: "slap" },
  riffs: {
    // a strut up to the counter and back
    counter: {
      guitar: [
        "o0 - - . o0 . o4 - o5 - . o5 . o7 - .",
        "o0 - - . o0 . o4 - o5 - . o10 - o9 - .",
        "o0 - - . o0 . o4 - o5 - . o5 . o7 - .",
        "o5 - - . o5 . o4 - o2 - . o0 - - - -",
      ],
      drums: "swing", weight: 3,
    },
    // chug and answer, with a whistled sort of tune
    flatwhite: {
      guitar: [
        "x0 . o0 - x0 . o10 - x0 . o0 - x5 . o5 -",
        "x0 . o0 - x0 . o10 - x7 . o7 - x5 . o5 -",
        "x0 . o0 - x0 . o10 - x0 . o0 - x5 . o5 -",
        "x5 . o5 - x4 . o4 - x2 . o2 - o7 - - -",
      ],
      lead: [
        "d5 - g5 - b5 - - - a5 - g5 - e5 - g5 -",
        "d5 - g5 - b5 - - - d6 - - - c6 - b5 -",
        "d5 - g5 - b5 - - - a5 - g5 - e5 - g5 -",
        "c6 - - - b5 - - - a5 - - - d6 - - -",
      ],
      drums: "rock", weight: 2,
    },
    // shuffling along the queue
    queue: {
      guitar: [
        "o0 - x0 o0 - x0 o5 - x5 o5 - x5",
        "o0 - x0 o0 - x0 o7 - x7 o5 - x5",
        "o0 - x0 o0 - x0 o5 - x5 o5 - x5",
        "o10 - x10 o9 - x9 o7 - - - - -",
      ],
      lead: [
        "g5 - b5 d6 - b5 c6 - e6 c6 - a5",
        "g5 - b5 d6 - b5 d6 - f#6 e6 - c6",
        "g5 - b5 d6 - b5 c6 - e6 c6 - a5",
        "f6 - d6 e6 - c6 d6 - - - - -",
      ],
      drums: "shuffle", weight: 2,
    },
    // something heavy and slow, like the sourdough
    sourdough: {
      guitar: [
        "o0 - - - - - x0 x0 . . x0 . o3 - o4 -",
        "o5 - - - - - x5 x5 . . x5 . o8 - o9 -",
        "o0 - - - - - x0 x0 . . x0 . o3 - o4 -",
        "o7 - - - - - x7 x7 o5 - - - o4 - o2 -",
      ],
      drums: "half",
    },
  },
});
