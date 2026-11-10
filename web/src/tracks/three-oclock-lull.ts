import { defineTrack } from "./notation";

// The slow middle of the afternoon: a fat, lazy shuffle that can hardly be bothered. D minor,
// 92 bpm, in triplets.
export default defineTrack({
  name: "Three O'Clock Lull",
  bpm: 92,
  key: -2,
  hour: 15.5,
  intro: "doze",
  tone: { bright: 0.75, lead: "hollow", bass: "sub" },
  riffs: {
    // one chord left to hang, and a grunt at the end of the bar
    doze: {
      guitar: [
        "o0 - - - - - x0 - x0 o3 - -",
        "o0 - - - - - x0 - x0 o5 - -",
        "o0 - - - - - x0 - x0 o3 - -",
        "o8 - - - - - o7 - - o5 - -",
      ],
      drums: "heavy12", weight: 2,
    },
    // the shuffle gets going, with a tune that keeps sliding back to where it started
    haze: {
      guitar: [
        "o0 - x0 o0 - x0 o3 - x3 o5 - x5",
        "o0 - x0 o0 - x0 o10 - x10 o8 - x8",
        "o0 - x0 o0 - x0 o3 - x3 o5 - x5",
        "o5 - x5 o3 - x3 o0 - - - - -",
      ],
      lead: [
        "d5 - - f5 - - g5 - a5 g5 - f5",
        "d5 - - f5 - - c6 - - a#5 - a5",
        "d5 - - f5 - - g5 - a5 c6 - a5",
        "g5 - - f5 - d5 d5 - - - - -",
      ],
      drums: "shuffle", weight: 3,
    },
    // half asleep: long chords and a long wailing note
    siesta: {
      guitar: [
        "o0 - - - - - o0 - - . . .",
        "o8 - - - - - o8 - - . . .",
        "o5 - - - - - o5 - - . . .",
        "o7 - - - - - o7 - - o7 - -",
      ],
      lead: [
        "a5 - - - - - - - - d6 - -",
        "f6 - - - - - - - d6 - - -",
        "g5 - - - - - - - - a#5 - -",
        "a5 - - - - - c#6 - - e6 - -",
      ],
      drums: "heavy12", weight: 2,
    },
    // stirring again: a muted triplet chug
    stir: {
      guitar: [
        "x0 . x0 x0 . x0 x0 . x0 o3 - -",
        "x0 . x0 x0 . x0 x0 . x0 o5 - -",
        "x0 . x0 x0 . x0 x0 . x0 o3 - -",
        "x8 . x8 x8 . x8 x7 . x7 o7 - -",
      ],
      drums: "trip", shift: 5, weight: 2,
    },
  },
});
