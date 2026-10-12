import { defineTrack } from "./notation";

// A frantic chase down the hill: E phrygian dominant, 190 bpm, double kick all the way.
export default defineTrack({
  name: "Entry Hill Escape",
  bpm: 190,
  intro: "chase",
  tone: { lead: "hollow", bass: "pick" },
  riffs: {
    // chug-chug-stab on the flat second, then a climb that falls back onto E
    chase: {
      guitar: [
        "x0 x0 o1 - x0 x0 o0 - x0 x0 o4 - o1 - x0 x0",
        "x0 x0 o1 - x0 x0 o0 - x0 . o8 - o7 - o5 -",
        "x0 x0 o1 - x0 x0 o0 - x0 x0 o4 - o1 - x0 x0",
        "x0 x0 o1 - x0 x0 o4 - o5 - o4 - o1 - - -",
      ],
      drums: "double", shift: 5, weight: 3,
    },
    // tremolo pedal under a snaking phrygian shred line
    sprint: {
      guitar: [
        "x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 o1 - o0 -",
        "x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 x0 o4 - o5 -",
        "x8 x8 x8 x8 x8 x8 x8 x8 x5 x5 x5 x5 x5 x5 x5 x5",
        "x1 x1 x1 x1 x1 x1 x1 x1 o1 - - - o4 - o1 -",
      ],
      lead: [
        "e5 f5 g#5 a5 b5 - a5 g#5 b5 - - - c6 - b5 -",
        "e6 - d6 c6 b5 . c6 b5 g#5 - - - g#5 - a5 -",
        "c6 - - - b5 c6 d6 c6 a5 - - - e5 f5 g#5 a5",
        "a5 - - - - - g#5 f5 c6 - - - g#5 - f5 -",
      ],
      drums: "blast", weight: 2,
    },
    // stop-start verse chug, kick locked to the guitar
    hairpin: {
      guitar: [
        "x0 . x0 x0 . x0 x0 . o1 - . x0 . x0 o4 -",
        "x0 . x0 x0 . x0 x0 . o1 - . x0 . o5 o4 o1",
        "x0 . x0 x0 . x0 x0 . o1 - . x0 . x0 o4 -",
        "x0 . x0 x0 . o8 - - o7 - - o5 - - o4 -",
      ],
      drums: { k: "x.xx.xx.x..x.xx.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 7, weight: 2,
    },
    // ringing E and F under a wailing snake-charmer melody, kick never letting up
    souk: {
      guitar: [
        "o0 - - - - - - - o1 - - - - - x1 x1",
        "o0 - - - - - - - o10 - - - o8 - - -",
        "o0 - - - - - - - o1 - - - - - x1 x1",
        "o5 - - - o4 - - - o1 - - - - - - -",
      ],
      lead: [
        "b5 - - - - - c6 b5 a5 - - - - - . .",
        "g#5 - a5 g#5 f5 - e5 - d5 - - - e5 - - -",
        "b5 - - - - - d6 e6 f6 - - - e6 - c6 -",
        "e6 - d6 c6 b5 - a5 g#5 f5 - - - - - - -",
      ],
      drums: { k: "xxxxxxxxxxxxxxxx", s: "........x.......", h: "x...x...x...x..." },
    },
    // triplet scramble with runs that tumble down the scale in thirds
    switchback: {
      guitar: [
        "x0 x0 x0 o1 - x0 x0 x0 x0 o5 - o4",
        "x0 x0 x0 o1 - x0 x0 x0 x0 o8 - o7",
        "x0 x0 x0 o1 - x0 x0 x0 x0 o5 - o4",
        "o10 - o8 - o7 - o5 - o4 - o1 -",
      ],
      lead: [
        "e5 f5 g#5 a5 - g#5 b5 - - c6 - b5",
        "e6 - d6 c6 - b5 a5 g#5 - c6 - b5",
        "e5 f5 g#5 a5 - g#5 b5 - - c6 d6 e6",
        "f6 - e6 - d6 - c6 - b5 - a5 -",
      ],
      drums: { k: "xxxxxxxxxxxx", s: "...x.....x..", h: "x..x..x..x.." },
      shift: 2,
    },
  },
});
