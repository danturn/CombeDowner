import { defineTrack } from "../notation";

// Chicken Jerk: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order.
export default defineTrack({
  name: "Chicken Jerk",
  artist: "Awful Sparks",
  bpm: 144,
  key: 5,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["s1", "s2", "s2", "s3", "s4", "s2", "s3", "s3", "s5", "s5", "s5", "s5", "s6", "s7", "s8"],
  riffs: {
    // 4 bars, heard 1x; roots per beat: E E F# F# | A A A A | E E F# F# | B B B B
    s1: {
      guitar: [
        "o-5 - - - - - - - o-3 - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o-5 - - - - - - - o-3 - - - - - - -",
        "o2 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n-5 - - - - - - - n-3 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
        "n-5 - - - - - - - n-3 - - - - - - -",
        "n2 - - - - - - - n2 - - - - - - -",
      ],
      drums: [
        { k: "x...x.x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 3x; roots per beat: A A A A | B B B B | E E B B | A A A A
    s2: {
      guitar: [
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "o7 . x7 . x7 . x7 . o2 . x2 . x2 . x2 .",
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n7 - n7 - n7 - n7 - n2 - n2 - n2 - n2 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 3x; roots per beat: A A A A | B B B B | B B B B | A A A A
    s3: {
      guitar: [
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "x2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.x.....x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.....x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.....x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.....x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: E E F# F# | A A A A | E E F# F# | A A A A
    s4: {
      guitar: [
        "o-5 . x-5 . x-5 . x-5 . o-3 . x-3 . x-3 . x-3 .",
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o-5 . x-5 . x-5 . x-5 . o-3 . x-3 . x-3 . x-3 .",
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n-5 - n-5 - n-5 - n-5 - n-3 - n-3 - n-3 - n-3 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n-5 - n-5 - n-5 - n-5 - n-3 - n-3 - n-3 - n-3 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x...x.x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 4x; roots per beat: B B D D | A# A# A A | A A G G | B B D D
    s5: {
      guitar: [
        "o2 - - . x2 . x2 . o5 - - . x5 . x5 .",
        "o1 - - . x1 . x1 . o0 - - . x0 . x0 .",
        "x0 . x0 . x0 . x0 . o-2 - - . x-2 . x-2 .",
        "o2 - - . x2 . x2 . o5 - - . x5 . x5 .",
      ],
      bass: [
        "n2 - n2 - n2 - n2 - n5 - n5 - n5 - n5 -",
        "n1 - n1 - n1 - n1 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n-2 - n-2 - n-2 - n-2 -",
        "n2 - n2 - n2 - n2 - n5 - n5 - n5 - n5 -",
      ],
      drums: [
        { k: "x.x.x.x.x.x...x.", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x.x.x.x.x...x.", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x.x.x.x.x...x.", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x.x.x.x.x...x.", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A# A# A# A# | A# A# D D | A A G G | B B B B
    s6: {
      guitar: [
        "o1 . x1 . x1 . x1 . x1 . x1 . x1 . x1 .",
        "x1 . x1 . x1 . x1 . o5 . x5 . x5 . x5 .",
        "o0 . x0 . x0 . x0 . o-2 . x-2 . x-2 . x-2 .",
        "o2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
      ],
      bass: [
        "n1 - n1 - n1 - n1 - n1 - n1 - n1 - n1 -",
        "n1 - n1 - n1 - n1 - n5 - n5 - n5 - n5 -",
        "n0 - n0 - n0 - n0 - n-2 - n-2 - n-2 - n-2 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.....x.x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: B B D D | B B B B | A A G G | B B B B
    s7: {
      guitar: [
        "o2 - - . x2 . x2 . o5 - - . x5 . x5 .",
        "o2 - - . x2 . x2 . x2 . x2 . x2 . x2 .",
        "o0 - - . x0 . x0 . o-2 - - . x-2 . x-2 .",
        "o2 - - . x2 . x2 . x2 . x2 . x2 . x2 .",
      ],
      bass: [
        "n2 - n2 - n2 - n2 - n5 - n5 - n5 - n5 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n0 - n0 - n0 - n0 - n-2 - n-2 - n-2 - n-2 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.x...x.x.x...x.", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C# C# G G | A A A A | A A A A | A A A A
    s8: {
      guitar: [
        "o4 - - - - - - - o10 - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n4 - - - - - - - n10 - - - - - - -",
        "n12 - - - - - - - n12 - - - - - - -",
        "n12 - - - - - - - n12 - - - - - - -",
        "n12 - - - - - - - n12 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
  },
});
