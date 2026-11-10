import { defineTrack } from "./notation";

// Half past eight and everybody is late: flat-out punk with no time to breathe. A minor, 188 bpm.
export default defineTrack({
  name: "School Run Stampede",
  bpm: 188,
  key: 5,
  hour: 8.5,
  intro: "late",
  tone: { bright: 1.2, lead: "brass", bass: "pick" },
  riffs: {
    // out of the door at a run, stabs getting higher
    late: {
      guitar: [
        "x0 x0 x0 x0 o3 - x0 x0 x0 x0 o5 - x0 x0 o7 -",
        "x0 x0 x0 x0 o3 - x0 x0 o8 - o7 - o5 - o3 -",
        "x0 x0 x0 x0 o3 - x0 x0 x0 x0 o5 - x0 x0 o7 -",
        "o8 - - - o10 - - - o7 - - - - - - -",
      ],
      drums: "punk", weight: 3,
    },
    // four chords and a shout-along tune, over the zebra crossing
    zebra: {
      guitar: [
        "o0 - o0 - o0 - o0 - o8 - o8 - o8 - o8 -",
        "o3 - o3 - o3 - o3 - o10 - o10 - o10 - o10 -",
        "o0 - o0 - o0 - o0 - o8 - o8 - o8 - o8 -",
        "o3 - o3 - o3 - o3 - o7 - o7 - o7 - - -",
      ],
      lead: [
        "e5 - - - a5 - - - c6 - - - a5 - - -",
        "g5 - - - c6 - - - d6 - - - b5 - - -",
        "e5 - - - a5 - - - c6 - - - f6 - - -",
        "e6 - - - d6 - c6 - b5 - - - g#5 - - -",
      ],
      drums: "punk", weight: 3,
    },
    // the bell is going: sixteenths all the way with the lead ringing over the top
    bell: {
      guitar: [
        "x0 x0 x0 x0 x0 x0 x0 x0 x8 x8 x8 x8 x8 x8 x8 x8",
        "x5 x5 x5 x5 x5 x5 x5 x5 x7 x7 x7 x7 x7 x7 x7 x7",
        "x0 x0 x0 x0 x0 x0 x0 x0 x8 x8 x8 x8 x8 x8 x8 x8",
        "x5 x5 x5 x5 x5 x5 x5 x5 o7 - - - o7 - o7 -",
      ],
      lead: [
        "a5 c6 e6 c6 a5 c6 e6 c6 a5 c6 f6 c6 a5 c6 f6 c6",
        "a5 d6 f6 d6 a5 d6 f6 d6 g#5 b5 e6 b5 g#5 b5 e6 b5",
        "a5 c6 e6 c6 a5 c6 e6 c6 a5 c6 f6 c6 a5 c6 f6 c6",
        "a5 d6 f6 d6 a5 d6 f6 d6 e6 - - - e6 - e6 -",
      ],
      drums: "double",
    },
    // held up by the lollipop lady: a heavy stop-start
    lollipop: {
      guitar: [
        "o0 - - - . . x0 x0 . . x0 . o1 - - -",
        "o0 - - - . . x0 x0 . . x0 . o3 - o1 -",
        "o0 - - - . . x0 x0 . . x0 . o1 - - -",
        "o0 - - - . . x0 x0 x0 x0 o12 - o10 - o8 -",
      ],
      drums: "half",
    },
    // the last hundred yards at a gallop
    sprint: {
      guitar: [
        "x0 . x0 x0 x0 . x0 x0 o3 - - - o5 - - -",
        "x0 . x0 x0 x0 . x0 x0 o8 - - - o7 - - -",
        "x0 . x0 x0 x0 . x0 x0 o3 - - - o5 - - -",
        "x10 . x10 x10 x10 . x10 x10 o12 - - - - - - -",
      ],
      lead: [
        "a5 - - - - - e5 - c6 - - - d6 - - -",
        "a5 - - - - - e5 - f6 - - - e6 - - -",
        "a5 - - - - - e5 - c6 - - - d6 - - -",
        "d6 - b5 - g5 - b5 - a5 - - - - - - -",
      ],
      drums: "gallop", shift: 2, weight: 2,
    },
  },
});
