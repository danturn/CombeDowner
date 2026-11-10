import { defineTrack } from "./notation";

// The sun straight overhead and nobody backing down: a spaghetti-western gallop on the scale with
// the flattened second and the major third. E, 160 bpm.
export default defineTrack({
  name: "High Noon on North Road",
  bpm: 160,
  hour: 13,
  intro: "standoff",
  tone: { bright: 1.15, lead: "brass", bass: "pick" },
  riffs: {
    // one chord held across the street, a twitch, and the chord a semitone above it
    standoff: {
      guitar: [
        "o0 - - - - - - - x0 . x0 x0 o1 - - -",
        "o0 - - - - - - - x0 . x0 x0 o4 - - -",
        "o0 - - - - - - - x0 . x0 x0 o1 - - -",
        "o5 - - - o4 - - - o1 - - - o0 - - -",
      ],
      drums: "march", weight: 2,
    },
    // the ride into town
    ride: {
      guitar: [
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o1 - o0 -",
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o4 - o5 -",
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 o1 - o0 -",
        "x5 . x5 x5 x5 . x5 x5 o4 - - - o1 - - -",
      ],
      lead: [
        "e5 - - - - - b5 - - - a5 - g#5 - f5 -",
        "e5 - - - - - - - . . e5 - g#5 - a5 -",
        "b5 - - - - - e6 - - - d6 - c6 - b5 -",
        "a5 - - - c6 - - - g#5 - - - f5 - - -",
      ],
      drums: "gallop", shift: 5, weight: 3,
    },
    // heat coming off the tarmac: sixteenths, and the lead running the scale up and down
    sun: {
      guitar: [
        "x0 x0 x0 x0 x0 x0 o4 - x0 x0 x0 x0 x0 x0 o5 -",
        "x0 x0 x0 x0 x0 x0 o8 - x0 x0 o7 - x0 x0 o5 -",
        "x0 x0 x0 x0 x0 x0 o4 - x0 x0 x0 x0 x0 x0 o5 -",
        "x0 x0 o10 - x0 x0 o8 - x0 x0 o7 - o4 - o1 -",
      ],
      lead: [
        "e5 f5 g#5 a5 b5 a5 g#5 f5 e5 f5 g#5 a5 b5 c6 b5 -",
        "e6 d6 c6 b5 a5 b5 c6 - b5 a5 g#5 - a5 g#5 f5 -",
        "e5 f5 g#5 a5 b5 a5 g#5 f5 e5 f5 g#5 a5 b5 c6 b5 -",
        "d6 - c6 - b5 - a5 - g#5 - f5 - e5 - - -",
      ],
      drums: "double", weight: 2,
    },
    // in the shade of the bus shelter: slow and heavy, one long note hanging over it
    shade: {
      guitar: [
        "o0 - - - - - x0 x0 . . x0 . x0 x0 . .",
        "o1 - - - - - x1 x1 . . x1 . o4 - o1 -",
        "o0 - - - - - x0 x0 . . x0 . x0 x0 . .",
        "o0 - - - - - x0 x0 x0 x0 o8 - o7 - o5 -",
      ],
      lead: [
        "b5 - - - - - - - - - - - - - . .",
        "c6 - - - - - - - b5 - - - g#5 - - -",
        "b5 - - - - - - - - - - - - - . .",
        "e6 - - - d6 - - - c6 - - - b5 - - -",
      ],
      drums: "half",
    },
    // dust kicked up: a pedal chug with stabs round it
    dust: {
      guitar: [
        "x0 . x0 . o7 - x0 . x0 . o8 - x0 . o7 -",
        "x0 . x0 . o5 - x0 . x0 . o4 - o1 - o0 -",
        "x0 . x0 . o7 - x0 . x0 . o8 - x0 . o7 -",
        "x0 . x0 . o1 - x0 . o4 - o5 - o7 - - -",
      ],
      drums: "rock", shift: 5, weight: 2,
    },
  },
});
