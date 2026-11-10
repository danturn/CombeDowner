import { defineTrack } from "./notation";

// Closing time at the pub: a rowdy boogie that everyone knows the words to. C, 168 bpm, in
// triplets.
export default defineTrack({
  name: "Last Orders",
  bpm: 168,
  key: -4,
  hour: 22.5,
  intro: "boogie",
  tone: { bright: 1.2, lead: "brass", bass: "slap" },
  riffs: {
    // the boogie everybody's had one too many to play straight
    boogie: {
      guitar: [
        "o0 - x0 o0 - x0 o0 - x0 o3 - o4",
        "o0 - x0 o0 - x0 o0 - x0 o10 - o11",
        "o5 - x5 o5 - x5 o5 - x5 o3 - o4",
        "o7 - x7 o5 - x5 o0 - - o7 - -",
      ],
      drums: "shuffle", weight: 3,
    },
    // leaning on the bar, with a bluesy tune sliding about
    bar: {
      guitar: [
        "x0 . x0 x0 . x0 o3 - x0 o5 - x0",
        "x0 . x0 x0 . x0 o6 - x0 o5 - o3",
        "x5 . x5 x5 . x5 o8 - x5 o10 - x5",
        "x7 . x7 x7 . x7 o5 - - o7 - -",
      ],
      lead: [
        "c5 - d#5 e5 - g5 a5 - g5 c6 - -",
        "c6 - a#5 a5 - g5 f#5 - f5 d#5 - c5",
        "f5 - g#5 a5 - c6 d6 - c6 f6 - -",
        "g5 - b5 d6 - f6 e6 - - d6 - -",
      ],
      drums: "trip", weight: 2,
    },
    // the whole pub joins in
    singalong: {
      guitar: [
        "o0 - - o0 - - o5 - - o5 - -",
        "o0 - - o0 - - o7 - - o7 - -",
        "o0 - - o0 - - o5 - - o5 - -",
        "o7 - - o5 - - o0 - - - - -",
      ],
      lead: [
        "e5 - - g5 - - a5 - - c6 - -",
        "e6 - - c6 - - d6 - - b5 - -",
        "e5 - - g5 - - a5 - - c6 - -",
        "d6 - - c6 - a5 c6 - - - - -",
      ],
      drums: "shuffle", weight: 3,
    },
    // "time, gentlemen, please": the bell, and a sour chord to go with it
    time: {
      guitar: [
        "o0 - - - - - x0 x0 . o6 - -",
        "o0 - - - - - x0 x0 . o3 - -",
        "o0 - - - - - x0 x0 . o6 - -",
        "o5 - - - - - o6 - - o7 - -",
      ],
      drums: "heavy12",
    },
    // out of the door and off down the road, not in a straight line
    stagger: {
      guitar: [
        "x0 x0 x0 o0 - - x0 x0 x0 o3 - -",
        "x0 x0 x0 o0 - - x0 x0 x0 o5 - -",
        "x0 x0 x0 o0 - - x0 x0 x0 o3 - -",
        "x10 x10 x10 o10 - - x7 x7 x7 o7 - -",
      ],
      drums: "trip", shift: 5, weight: 2,
    },
  },
});
