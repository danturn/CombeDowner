import { defineTrack } from "../notation";

// Ancient Geography: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order.
export default defineTrack({
  name: "Ancient Geography",
  artist: "Awful Sparks",
  bpm: 136,
  key: -2,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["~s1", "s1", "s1", "s2", "s3", "s3", "s4", "s5", "s5", "s6", "s3", "s7", "s8", "s9", "s10", "s11", "s12", "s13"],
  riffs: {
    // 4 bars, heard 3x; roots per beat: D D D D | D D D D | E E A A | E E D D
    s1: {
      guitar: [
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o2 - - . x2 . x2 . o7 - - . x7 . x7 .",
        "o2 - - . x2 . x2 . o0 - - . x0 . x0 .",
      ],
      lead: [
        "d5 - - - f#5 - - - a5 - - - b5 - c6 -",
        "d6 - - - - - a5 - f#5 - - - - - . .",
        "e5 - - - g5 - b5 - a5 - - - e6 - - -",
        "b5 - - - a5 - g5 - f#5 - - - d5 - - -",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n2 - n2 - n2 - n2 - n7 - n7 - n7 - n7 -",
        "n2 - n2 - n2 - n2 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D D D | D D D D | E E D D | F# F# D D
    s2: {
      guitar: [
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o2 . x2 . x2 . x2 . o0 . x0 . x0 . x0 .",
        "o4 . x4 . x4 . x4 . o0 . x0 . x0 . x0 .",
      ],
      lead: [
        "a5 - - - - - - - f#5 - - - e5 - d5 -",
        "d5 - - - - - - - . . . . a5 - b5 -",
        "b5 - - - - - a5 - f#5 - - - - - e5 -",
        "c#6 - - - - - b5 - a5 - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n2 - n2 - n2 - n2 - n0 - n0 - n0 - n0 -",
        "n4 - n4 - n4 - n4 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 3x; roots per beat: F# F# A A | D D D D | F F F# F# | D D D D
    s3: {
      guitar: [
        "o4 . x4 . x4 . x4 . o7 . x7 . x7 . x7 .",
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o3 . x3 . x3 . x3 . o4 . x4 . x4 . x4 .",
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "f#5 - - - c#6 - - - a5 - - - e5 - - -",
        "f#5 - - - - - e5 - d5 - - - - - . .",
        "f5 - - - a5 - c6 - c#6 - - - - - a5 -",
        "d6 - - - - - a5 - f#5 - - - - - . .",
      ],
      bass: [
        "n4 - n4 - n4 - n4 - n7 - n7 - n7 - n7 -",
        "n12 - n12 - n12 - n12 - n12 - n12 - n12 - n12 -",
        "n3 - n3 - n3 - n3 - n4 - n4 - n4 - n4 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: E E E E | E E E E | F# F# E E | G# G# E E
    s4: {
      guitar: [
        "o2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "x2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "o4 . x4 . x4 . x4 . o2 . x2 . x2 . x2 .",
        "o6 . x6 . x6 . x6 . o2 . x2 . x2 . x2 .",
      ],
      lead: [
        "e5 - - - - - - - b5 - - - - - . .",
        "b5 - - - a5 - g#5 - e5 - - - - - . .",
        "f#5 - - - - - c#6 - b5 - - - - - . .",
        "g#5 - - - - - f#5 - e5 - - - - - . .",
      ],
      bass: [
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n4 - n4 - n4 - n4 - n2 - n2 - n2 - n2 -",
        "n6 - n6 - n6 - n6 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 2x; roots per beat: E E E E | E E E E | F# F# E E | G# G# E E
    s5: {
      guitar: [
        "o2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "x2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "o4 . x4 . x4 . x4 . o2 . x2 . x2 . x2 .",
        "o6 . x6 . x6 . x6 . o2 . x2 . x2 . x2 .",
      ],
      lead: [
        "b5 - - - - - - - e6 - - - - - d6 -",
        "e6 - - - b5 - - - g#5 - - - b5 - - -",
        "c#6 - - - f#6 - - - e6 - - - - - . .",
        "d#6 - - - c#6 - - - b5 - - - - - . .",
      ],
      bass: [
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n4 - n4 - n4 - n4 - n2 - n2 - n2 - n2 -",
        "n6 - n6 - n6 - n6 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: E E E E | E E E E | G# G# E E | G# G# D D
    s6: {
      guitar: [
        "o2 - - - - - - - - - - - - - - -",
        "o2 - - - - - - - - - - - - - - -",
        "o6 - - - - - - - o2 - - - - - - -",
        "o6 - - - - - - - o0 - - - - - - -",
      ],
      bass: [
        "n2 - - - - - - - n2 - - - - - - -",
        "n2 - - - - - - - n2 - - - - - - -",
        "n6 - - - - - - - n2 - - - - - - -",
        "n6 - - - - - - - n0 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: F F F# F# | D D D D | F F F# F# | D D A A
    s7: {
      guitar: [
        "o3 . x3 . x3 . x3 . o4 . x4 . x4 . x4 .",
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o3 . x3 . x3 . x3 . o4 . x4 . x4 . x4 .",
        "o0 . x0 . x0 . x0 . o7 . x7 . x7 . x7 .",
      ],
      lead: [
        "c6 - - - - - a5 - c#6 - - - - - . .",
        "d6 - - - - - a5 - f#5 - - - a5 - - -",
        "f5 - - - - - a5 - f#5 - - - - - c#6 -",
        "d6 - - - - - - - e6 - - - - - . .",
      ],
      bass: [
        "n3 - n3 - n3 - n3 - n4 - n4 - n4 - n4 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n3 - n3 - n3 - n3 - n4 - n4 - n4 - n4 -",
        "n0 - n0 - n0 - n0 - n7 - n7 - n7 - n7 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C# C# E E | F F A A | C# C# E E | F# F# A A
    s8: {
      guitar: [
        "o-1 . x-1 . x-1 . x-1 . o2 . x2 . x2 . x2 .",
        "o3 . x3 . x3 . x3 . o7 . x7 . x7 . x7 .",
        "o11 . x11 . x11 . x11 . o2 . x2 . x2 . x2 .",
        "o4 . x4 . x4 . x4 . o7 . x7 . x7 . x7 .",
      ],
      lead: [
        "c#6 - - - - - - - b5 - - - g#5 - - -",
        "a5 - - - - - c6 - e6 - - - - - . .",
        "g#5 - - - - - - - b5 - - - e6 - - -",
        "f#6 - - - - - - - e6 - - - - - . .",
      ],
      bass: [
        "n-1 - n-1 - n-1 - n-1 - n2 - n2 - n2 - n2 -",
        "n3 - n3 - n3 - n3 - n7 - n7 - n7 - n7 -",
        "n11 - n11 - n11 - n11 - n2 - n2 - n2 - n2 -",
        "n4 - n4 - n4 - n4 - n7 - n7 - n7 - n7 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C# C# E E | F# F# A A | C# C# F# F# | F# F# F# F#
    s9: {
      guitar: [
        "o-1 . x-1 . x-1 . x-1 . o2 . x2 . x2 . x2 .",
        "o4 . x4 . x4 . x4 . o7 . x7 . x7 . x7 .",
        "o11 . x11 . x11 . x11 . o4 . x4 . x4 . x4 .",
        "x4 . x4 . x4 . x4 . x4 . x4 . x4 . x4 .",
      ],
      lead: [
        "c#6 - - - - - - - e6 - - - - - . .",
        "f#6 - - - - - - - e6 - - - c#6 - - -",
        "g#5 - - - - - - - c#6 - - - - - a5 -",
        "f#5 - - - - - - - - - - - - - . .",
      ],
      bass: [
        "n-1 - n-1 - n-1 - n-1 - n2 - n2 - n2 - n2 -",
        "n4 - n4 - n4 - n4 - n7 - n7 - n7 - n7 -",
        "n11 - n11 - n11 - n11 - n4 - n4 - n4 - n4 -",
        "n4 - n4 - n4 - n4 - n4 - n4 - n4 - n4 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C# C# D D | F# F# D# D# | C# C# E E | F F D D
    s10: {
      guitar: [
        "o-1 - - - - - - - o0 - - - - - - -",
        "o4 - - - - - - - o1 - - - - - - -",
        "o-1 - - - - - - - o2 - - - - - - -",
        "o3 - - - - - - - o0 - - - - - - -",
      ],
      bass: [
        "n-1 - - - - - - - n0 - - - - - - -",
        "n4 - - - - - - - n1 - - - - - - -",
        "n-1 - - - - - - - n2 - - - - - - -",
        "n3 - - - - - - - n0 - - - - - - -",
      ],
      drums: [
        { k: "x.......x...x...", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C# C# E E | F# F# F# F# | C# C# E E | E E E E
    s11: {
      guitar: [
        "o-1 - - - - - - - o2 - - - - - - -",
        "o4 - - - - - - - - - - - - - - -",
        "o-1 - - - - - - - o2 - - - - - - -",
        "o2 - - - - - - - - - - - - - - -",
      ],
      lead: [
        "c#6 - - - - - - - b5 - - - - - - -",
        "a5 - - - - - - - f#5 - - - - - . .",
        "g#5 - - - - - - - b5 - - - - - - -",
        "e5 - - - - - - - - - - - . . . .",
      ],
      bass: [
        "n-1 - - - - - - - n2 - - - - - - -",
        "n4 - - - - - - - n4 - - - - - - -",
        "n-1 - - - - - - - n2 - - - - - - -",
        "n2 - - - - - - - n2 - - - - - - -",
      ],
      drums: [
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: F# F# F# F# | A A D D | D D F# F# | A A D D
    s12: {
      guitar: [
        "o4 - - . x4 . x4 . x4 . x4 . x4 . x4 .",
        "o7 - - . x7 . x7 . o0 - - . x0 . x0 .",
        "x0 . x0 . x0 . x0 . o4 - - . x4 . x4 .",
        "o7 - - . x7 . x7 . o0 - - . x0 . x0 .",
      ],
      lead: [
        "f#5 - - - a5 - - - c#6 - - - - - a5 -",
        "e6 - - - - - - - d6 - - - - - . .",
        "a5 - - - f#5 - a5 - c#6 - - - - - - -",
        "e6 - - - - - g6 - f#6 - - - - - - -",
      ],
      bass: [
        "n4 - n4 - n4 - n4 - n4 - n4 - n4 - n4 -",
        "n7 - n7 - n7 - n7 - n12 - n12 - n12 - n12 -",
        "n12 - n12 - n12 - n12 - n4 - n4 - n4 - n4 -",
        "n7 - n7 - n7 - n7 - n12 - n12 - n12 - n12 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D F F | F# F# D D | D D F F | F# F# D D
    s13: {
      guitar: [
        "o0 - - . x0 . x0 . o3 - - . x3 . x3 .",
        "o4 - - . x4 . x4 . o0 - - . x0 . x0 .",
        "x0 . x0 . x0 . x0 . o3 - - . x3 . x3 .",
        "o4 - - . x4 . x4 . o0 - - . x0 . x0 .",
      ],
      lead: [
        "d6 - - - - - - - c6 - - - a5 - - -",
        "c#6 - - - - - - - d6 - - - - - - -",
        "f#5 - - - a5 - - - c6 - - - a5 - - -",
        "c#6 - - - - - - - d6 - - - - - - -",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n3 - n3 - n3 - n3 -",
        "n4 - n4 - n4 - n4 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n3 - n3 - n3 - n3 -",
        "n4 - n4 - n4 - n4 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
  },
});
