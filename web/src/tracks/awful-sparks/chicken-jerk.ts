import { defineTrack } from "../notation";

// Awful Sparks' "Chicken Jerk", Duke-ified: A, 144 bpm, chromatic Bb kick-ups and a strutting B-A-G bridge.
export default defineTrack({
  name: "Chicken Jerk",
  artist: "Awful Sparks",
  bpm: 144,
  key: 5,
  intro: "intro",
  tone: { lead: "reed", bass: "slap", bright: 1.2 },
  riffs: {
    // the intro: Bb and F# ringing out quietly, then building through A, B, E and F#
    intro: {
      guitar: [
        "o1 - - - - - x1 x1 o1 - - - o-3 - - -",
        "o0 - - - o1 - - - - - x1 x1 o-3 - - -",
        "x0 x0 x0 x0 x0 x0 x0 x0 o2 - x2 x2 o2 - x2 x2",
        "o0 - - - o-5 - - - x-5 x-5 o-5 - o-3 - x-3 x-3",
      ],
      drums: "sparse",
    },
    // verse: A to B, A to E and F#, chugged, with the vocal's A-B-E hook
    verse: {
      guitar: [
        "x0 x0 x0 x0 x0 x0 o2 - x2 x2 o2 - x2 x2 o2 -",
        "x0 x0 x0 o-5 - - x-5 x-5 x-5 x-5 o-5 - o-3 - x-3 x-3",
        "x0 x0 x0 x0 x0 x0 o2 - x2 x2 o2 - x2 x2 o2 -",
        "o-5 - - - o0 - x0 x0 x0 x0 o-3 - o-1 - - -",
      ],
      lead: [
        "a5 - - a5 e5 - - - f#5 - - - . . a5 -",
        "a5 - b5 e5 - - - - . e5 - b5 - - a5 -",
        "a5 - - e5 - - d6 - - - b5 - . . a5 -",
        "f#5 e5 - f#5 a5 - - - - - - - . . g#5 -",
      ],
      drums: "rock", weight: 2,
    },
    // chorus: Bb slams up into A, then Bb up into B, big and open
    chorus: {
      guitar: [
        "o1 - - - o0 - - - x0 x0 o0 - x0 x0 o0 -",
        "o0 - - - x0 x0 o0 - x0 x0 x0 x0 o0 - - -",
        "o1 - - - o2 - - - x2 x2 o2 - x2 x2 o2 -",
        "o2 - - - x2 x2 o2 - x2 x2 x2 x2 o2 - o1 -",
      ],
      lead: [
        "f5 - - - a5 - - - g#5 a5 - - - - - g#5",
        "a5 - a5 - . . c#6 - - - . . a5 - - -",
        ". a#5 - - . . b5 - b5 - . f#5 - - - .",
        "f#5 - - . f#5 - - g#5 a5 e5 - . f#5 - . .",
      ],
      drums: { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "o.x.o.x.o.x.o.x." },
      weight: 3,
    },
    // the bridge: B dropping to A over and over, then A to G and a chromatic climb back
    bridge: {
      guitar: [
        "o2 - - - x2 x2 x2 x2 o0 - - - x0 x0 x0 x0",
        "o2 - - - o0 - - - x0 x0 o0 - x0 x0 o0 -",
        "o2 - - - o0 - - - x0 x0 o0 - x0 x0 o0 -",
        "o0 - - - x0 x0 o0 - o-2 - x-2 x-2 o0 - o1 -",
      ],
      lead: [
        "b5 - . b5 c#6 - - b5 - . . a5 - - - .",
        "f#5 - - f#5 . g#5 - b5 - . . a5 - . . .",
        "f#5 - - . e5 - g#5 - b5 - e5 - a5 - - -",
        "e5 - - - - . f#5 e5 - - . . d5 - - .",
      ],
      drums: "rock",
    },
    // the outro's climb: G, A, B, C#, F#, then G, G# and home to A
    outro: {
      guitar: [
        "o-2 - - - o0 - - - o2 - x2 x2 x2 x2 o2 -",
        "x2 x2 x2 x2 o2 - x2 x2 o4 - - - o-3 - - -",
        "o-2 - - - o-1 - x-1 x-1 x-1 x-1 o-1 - o0 - - -",
        "o0 - - - - - x0 x0 o5 - - - o1 - - -",
      ],
      drums: "gallop",
    },
  },
});
