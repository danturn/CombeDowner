import { defineTrack } from "../notation";

// Hot Thoughts: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order.
export default defineTrack({
  name: "Hot Thoughts",
  artist: "Awful Sparks",
  bpm: 157,
  key: -4,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["s1", "s1", "s2", "s3", "s2", "s4", "s3", "s2", "s3", "s2", "s3", "s2", "s1", "s3", "s5", "s6", "s7", "s6", "s8", "s9", "s8", "s10", "s11", "s12", "s11", "s12", "s11", "s13", "s14", "s15", "s16", "s2", "s17", "s2", "s17", "s2", "s17", "s2", "s18", "s2", "s18", "s2", "s18", "s9", "s19"],
  riffs: {
    // 4 bars, heard 3x; roots per beat: F F A A | F F C C | C C C C | C C C C
    s1: {
      guitar: [
        "o5 - - . x5 . x5 . o9 - - . x9 . x9 .",
        "o5 - - . x5 . x5 . o0 - - . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n5 - n5 - n5 - n5 - n9 - n9 - n9 - n9 -",
        "n5 - n5 - n5 - n5 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 11x; roots per beat: C C C C | C C C C | C C C C | C C C C
    s2: {
      guitar: [
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 5x; roots per beat: F F A A | F F C C | C C C C | C C C C
    s3: {
      guitar: [
        "o5 - - . x5 . x5 . o9 - - . x9 . x9 .",
        "o5 - - . x5 . x5 . o0 - - . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n5 - n5 - n5 - n5 - n9 - n9 - n9 - n9 -",
        "n5 - n5 - n5 - n5 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: F F A A | F F C C | C C C C | C C C C
    s4: {
      guitar: [
        "o5 . x5 . x5 . x5 . o9 . x9 . x9 . x9 .",
        "o5 . x5 . x5 . x5 . o0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n5 - n5 - n5 - n5 - n9 - n9 - n9 - n9 -",
        "n5 - n5 - n5 - n5 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C B B | G G G G | A# A# C# C# | C# C# C C
    s5: {
      guitar: [
        "o0 - - - - - - - o-1 - - - - - - -",
        "o7 - - - - - - - - - - - - - - -",
        "o10 - - - - - - - o1 - - - - - - -",
        "o1 - - - - - - - o0 - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n-1 - - - - - - -",
        "n7 - - - - - - - n7 - - - - - - -",
        "n10 - - - - - - - n1 - - - - - - -",
        "n1 - - - - - - - n0 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 2x; roots per beat: C C C C | G# G# C C | C C C C | G# G# G# G#
    s6: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o8 - - - - - - - o0 - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o8 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n8 - - - - - - - n12 - - - - - - -",
        "n12 - - - - - - - n12 - - - - - - -",
        "n8 - - - - - - - n8 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C C C | C C C C | C C C# C# | C# C# A# A#
    s7: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - o1 - - - - - - -",
        "o1 - - - - - - - o10 - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n1 - - - - - - -",
        "n1 - - - - - - - n10 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 2x; roots per beat: C C C C | C C G G | A# A# C# C# | A# A# C C
    s8: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - o7 - - - - - - -",
        "o10 - - - - - - - o1 - - - - - - -",
        "o10 - - - - - - - o0 - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n7 - - - - - - -",
        "n10 - - - - - - - n1 - - - - - - -",
        "n10 - - - - - - - n12 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 2x; roots per beat: C C C C | C C C C | C C C C | C C C C
    s9: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
      ],
      drums: [
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C B B | B B E E | A A C C | A A E E
    s10: {
      guitar: [
        "o0 - - - - - - - o-1 - - - - - - -",
        "o-1 - - - - - - - o4 - - - - - - -",
        "o9 - - - - - - - o0 - - - - - - -",
        "o9 - - - - - - - o4 - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n-1 - - - - - - -",
        "n-1 - - - - - - - n4 - - - - - - -",
        "n9 - - - - - - - n12 - - - - - - -",
        "n9 - - - - - - - n4 - - - - - - -",
      ],
      drums: [
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 3x; roots per beat: G G C C | C C D D | C C G G | G G D D
    s11: {
      guitar: [
        "o7 . x7 . x7 . x7 . o0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . o2 . x2 . x2 . x2 .",
        "o0 . x0 . x0 . x0 . o7 . x7 . x7 . x7 .",
        "x7 . x7 . x7 . x7 . o2 . x2 . x2 . x2 .",
      ],
      bass: [
        "n7 - n7 - n7 - n7 - n12 - n12 - n12 - n12 -",
        "n12 - n12 - n12 - n12 - n2 - n2 - n2 - n2 -",
        "n0 - n0 - n0 - n0 - n7 - n7 - n7 - n7 -",
        "n7 - n7 - n7 - n7 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 2x; roots per beat: C C G G | G G E E | A A C C | A A E E
    s12: {
      guitar: [
        "o0 - - . x0 . x0 . o7 - - . x7 . x7 .",
        "x7 . x7 . x7 . x7 . o4 - - . x4 . x4 .",
        "o9 - - . x9 . x9 . o0 - - . x0 . x0 .",
        "o9 - - . x9 . x9 . o4 - - . x4 . x4 .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n7 - n7 - n7 - n7 -",
        "n7 - n7 - n7 - n7 - n4 - n4 - n4 - n4 -",
        "n9 - n9 - n9 - n9 - n12 - n12 - n12 - n12 -",
        "n9 - n9 - n9 - n9 - n4 - n4 - n4 - n4 -",
      ],
      drums: [
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C G G | G G D D | C C G G | G G C C
    s13: {
      guitar: [
        "o0 . x0 . x0 . x0 . o7 . x7 . x7 . x7 .",
        "x7 . x7 . x7 . x7 . o2 . x2 . x2 . x2 .",
        "o0 . x0 . x0 . x0 . o7 . x7 . x7 . x7 .",
        "x7 . x7 . x7 . x7 . o0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n7 - n7 - n7 - n7 -",
        "n7 - n7 - n7 - n7 - n2 - n2 - n2 - n2 -",
        "n0 - n0 - n0 - n0 - n7 - n7 - n7 - n7 -",
        "n7 - n7 - n7 - n7 - n12 - n12 - n12 - n12 -",
      ],
      drums: [
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: B B A A | A A C C | B B A A | A A D D
    s14: {
      guitar: [
        "o-1 - - . x-1 . x-1 . o9 - - . x9 . x9 .",
        "x9 . x9 . x9 . x9 . o0 - - . x0 . x0 .",
        "o-1 - - . x-1 . x-1 . o9 - - . x9 . x9 .",
        "x9 . x9 . x9 . x9 . o2 - - . x2 . x2 .",
      ],
      bass: [
        "n-1 - n-1 - n-1 - n-1 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n12 - n12 - n12 - n12 -",
        "n11 - n11 - n11 - n11 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C G G | G G D D | C C G G | G G G G
    s15: {
      guitar: [
        "o0 . x0 . x0 . x0 . o7 . x7 . x7 . x7 .",
        "x7 . x7 . x7 . x7 . o2 . x2 . x2 . x2 .",
        "o0 . x0 . x0 . x0 . o7 . x7 . x7 . x7 .",
        "x7 . x7 . x7 . x7 . x7 . x7 . x7 . x7 .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n7 - n7 - n7 - n7 -",
        "n7 - n7 - n7 - n7 - n2 - n2 - n2 - n2 -",
        "n0 - n0 - n0 - n0 - n7 - n7 - n7 - n7 -",
        "n7 - n7 - n7 - n7 - n7 - n7 - n7 - n7 -",
      ],
      drums: [
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: G G C C | C C C C | C C C C | C C C C
    s16: {
      guitar: [
        "o7 - - - - - - - o0 - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n7 - - - - - - - n12 - - - - - - -",
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
    // 4 bars, heard 3x; roots per beat: C C A# A# | A# A# A# A# | A# A# C C | C C C C
    s17: {
      guitar: [
        "o0 - - . x0 . x0 . o10 - - . x10 . x10 .",
        "x10 . x10 . x10 . x10 . x10 . x10 . x10 . x10 .",
        "x10 . x10 . x10 . x10 . o0 - - . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n10 - n10 - n10 - n10 -",
        "n10 - n10 - n10 - n10 - n10 - n10 - n10 - n10 -",
        "n10 - n10 - n10 - n10 - n12 - n12 - n12 - n12 -",
        "n12 - n12 - n12 - n12 - n12 - n12 - n12 - n12 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 3x; roots per beat: C C A# A# | A# A# C# C# | C# C# C C | C C C C
    s18: {
      guitar: [
        "o0 - - - - - - - o10 - - - - - - -",
        "o10 - - - - - - - o1 - - - - - - -",
        "o1 - - - - - - - o0 - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n10 - - - - - - -",
        "n10 - - - - - - - n1 - - - - - - -",
        "n1 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C C C | A# A# C# C# | C# C# C# C# | C# C# C# C#
    s19: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o10 - - - - - - - o1 - - - - - - -",
        "o1 - - - - - - - - - - - - - - -",
        "o1 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n10 - - - - - - - n1 - - - - - - -",
        "n1 - - - - - - - n1 - - - - - - -",
        "n1 - - - - - - - n1 - - - - - - -",
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
