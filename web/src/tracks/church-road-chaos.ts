import { defineTrack } from "./notation";

// Jittery, off-kilter E with chromatic stabs, 150 bpm, built on 3+3+2 and 3+3+3+3+4 accents.
export default defineTrack({
  name: "Church Road Chaos",
  bpm: 150,
  key: 0,
  intro: "twitch",
  tone: { lead: "brass" },
  riffs: {
    // 3+3+2 chromatic stabs that slam to a stop, then a crooked climb
    twitch: {
      guitar: [
        "o0 . x0 o1 . x0 o3 . o0 . x0 o1 . x0 o6 .",
        "o0 . x0 o1 . x0 o3 . o0 . x0 o1 . . . .",
        "o0 . x0 o1 . x0 o3 . o0 . x0 o1 . x0 o6 .",
        "o5 . x5 o6 . x6 o7 . o8 . o7 . o6 . o1 -",
      ],
      drums: { k: "x..x....x..x....", s: "......x.......x.", h: "x.xx.xx.x.xx.xx." },
      shift: 5, weight: 3,
    },
    // pairs of mutes in groups of three, with a lead that slides down chromatically
    stagger: {
      guitar: [
        "x0 x0 . x0 x0 . x0 x0 . x0 x0 . o1 - - -",
        "x0 x0 . x0 x0 . x0 x0 . x0 x0 . o3 - o2 -",
        "x0 x0 . x0 x0 . x0 x0 . x0 x0 . o1 - - -",
        "x0 x0 . x0 x0 . o6 - . o5 - . o4 - o3 -",
      ],
      lead: [
        "e5 g5 . e5 a5 . e5 a#5 . b5 - . f5 - c6 -",
        "e5 g5 . e5 a5 . e5 a#5 . b5 - . g5 - c#6 -",
        "b5 d6 . b5 e6 . b5 f6 . e6 - . f6 - c6 -",
        "e6 d6 . b5 a#5 . a#5 - . a5 - . g#5 - g5 -",
      ],
      drums: { k: "xx.xx.xx.xx.....", s: "......x.....x...", h: "x..x..x..x..x.x." },
      weight: 2,
    },
    // stop-start: two ringing hits, silence filled by the lead, then a chug burst
    lurch: {
      guitar: [
        "o0 - - . . . o1 - - . . . x0 x0 x0 x0",
        "o0 - - . . . o6 - - . . . x0 x0 x0 x0",
        "o0 - - . . . o1 - - . . . x0 x0 x0 x0",
        "o8 - - . . . o7 - - . . . o6 - o5 -",
      ],
      lead: [
        ". . . b5 a#5 b5 . . . c6 b5 f5 . . . .",
        ". . . b5 a#5 b5 . . . e6 d6 a#5 . . . .",
        ". . . e6 d#6 e6 . . . f6 e6 c6 . . . .",
        ". . . e6 d6 c6 . . . d#6 c#6 b5 a#5 - a5 -",
      ],
      drums: { k: "x.....x.....xxxx", s: "x.....x.........", h: "...x.x...x.x...." },
      weight: 2,
    },
    // 3+3+3+3+4 open accents wandering chromatically over a muted pedal
    spasm: {
      guitar: [
        "o0 x0 x0 o3 x0 x0 o6 x0 x0 o3 x0 x0 o1 - - .",
        "o0 x0 x0 o3 x0 x0 o6 x0 x0 o3 x0 x0 o8 - o7 .",
        "o0 x0 x0 o3 x0 x0 o6 x0 x0 o3 x0 x0 o1 - - .",
        "o12 x0 x0 o11 x0 x0 o10 x0 x0 o9 x0 x0 o8 . o7 .",
      ],
      drums: { k: "x..x..x..x..x...", s: "......x.....x...", h: "xxxxxxxxxxxxxxxx" },
      shift: 7,
    },
    // frantic 3+3+2 chug under a chromatic shred with double-kick bursts
    frenzy: {
      guitar: [
        "o0 x0 x0 o0 x0 x0 o1 - o0 x0 x0 o0 x0 x0 o3 -",
        "o0 x0 x0 o0 x0 x0 o1 - o0 x0 x0 o0 x0 x0 o6 -",
        "o5 x5 x5 o5 x5 x5 o6 - o5 x5 x5 o5 x5 x5 o8 -",
        "o7 x7 x7 o7 x7 x7 o8 - o7 x7 x7 o6 - o5 - -",
      ],
      lead: [
        "e5 f5 g5 e5 f5 g5 f5 - b5 c6 d6 b5 c6 d6 g5 -",
        "e6 d6 b5 e6 d6 b5 c6 - b5 a#5 g5 b5 a#5 g5 a#5 -",
        "a5 b5 c6 a5 b5 c6 a#5 - e6 d6 c6 e6 d6 c6 g5 -",
        "b5 - d#6 f#6 - b5 c6 - f#6 d#6 b5 a#5 - a5 - -",
      ],
      drums: { k: "xxxxxx.xxxxxxx.x", s: "......x.......x.", h: "x..x..x.x..x..x." },
      weight: 2,
    },
  },
});
