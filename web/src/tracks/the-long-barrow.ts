import { defineTrack } from "./notation";

// A slow doom march in D minor, 84 bpm: ringing chords and a bell-toned funeral fanfare.
export default defineTrack({
  name: "The Long Barrow",
  bpm: 84,
  key: -2,
  intro: "procession",
  tone: { bright: 0.8, lead: "bell", bass: "sub" },
  riffs: {
    // the procession: whole-bar chords that climb and sink back to D
    procession: {
      guitar: [
        "o0 - - - - - - - - - - - o3 - o5 -",
        "o8 - - - - - - - - - - - o7 - o5 -",
        "o0 - - - - - - - - - - - o3 - o5 -",
        "o10 - - - - - - - o8 - - - o7 - - -",
      ],
      drums: "half", shift: 5, weight: 2,
    },
    // funeral fanfare over a snare march, ending on a harmonic-minor A
    fanfare: {
      guitar: [
        "o0 - - - - - x0 x0 o0 - - - o3 - - -",
        "o8 - - - - - x8 x8 o8 - - - o5 - - -",
        "o0 - - - - - x0 x0 o0 - - - o10 - - -",
        "o8 - - - - - - - o7 - - - - - - -",
      ],
      lead: [
        "a5 - - - - - a5 - d6 - - - c6 - - -",
        "d6 - - - - - d6 - f6 - - - d6 - - -",
        "a5 - - - - - a5 - d6 - - - e6 - - -",
        "f6 - - - e6 - d6 - c#6 - - - - - - -",
      ],
      drums: "march", shift: 5, weight: 2,
    },
    // crushing triplet doom: one long chord, two hammer blows, a slow answer
    cairn: {
      guitar: [
        "o0 - - - - - x0 x0 . o3 - -",
        "o8 - - - - - x8 x8 . o7 - -",
        "o0 - - - - - x0 x0 . o3 - -",
        "o5 - - - - - o3 - - o7 - -",
      ],
      lead: [
        "f5 - - - - - - - - a5 - -",
        "a#5 - - - - - - - - a5 - -",
        "d6 - - - - - - - - c6 - -",
        "a#5 - - - - - a5 - - c#6 - -",
      ],
      drums: "heavy12", weight: 2,
    },
    // the barrow: dragging palm-mute pulse that opens into long chords
    barrow: {
      guitar: [
        "x0 . . x0 . . x0 . o3 - - - - - - -",
        "x0 . . x0 . . x0 . o5 - - - o3 - - -",
        "x0 . . x0 . . x0 . o3 - - - - - - -",
        "x0 . . x0 . . x0 . o8 - - - o7 - - -",
      ],
      drums: { k: "x..x..x.x.......", s: "........x.......", h: "x...x...x...x..." },
      shift: 7, weight: 2,
    },
    // the lament: a grand slow melody that climbs to the top and falls to the dominant
    lament: {
      guitar: [
        "o0 - - - - - - - o10 - - - - - - -",
        "o8 - - - - - - - o5 - - - - - - -",
        "o3 - - - - - - - o10 - - - - - - -",
        "o8 - - - - - - - o7 - - - x7 x7 x7 x7",
      ],
      lead: [
        "d6 - - - - - - - e6 - - - - - d6 c6",
        "d6 - - - - - f6 - g6 - - - - - f6 e6",
        "f6 - - - - - - - e6 - - - c6 - - -",
        "d6 c6 a#5 a5 a#5 - c6 - c#6 - - - e6 - - -",
      ],
      drums: "half",
    },
  },
});
