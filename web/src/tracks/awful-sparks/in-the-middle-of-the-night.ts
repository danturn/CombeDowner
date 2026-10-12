import { defineTrack } from "../notation";

// In The Middle Of The Night: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order.
export default defineTrack({
  name: "In The Middle Of The Night",
  artist: "Awful Sparks",
  bpm: 133,
  key: -4,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["~s1", "s1", "s2", "s2", "s3", "s4", "s2", "s5", "s6", "s5", "s7", "s8", "s9", "s10", "s11", "s12", "s5", "s2", "s13", "s14"],
  riffs: {
    // 4 bars, heard 2x; roots per beat: C C G G | C C G G | C C G G | C C G G
    s1: {
      guitar: [
        "o0 . x0 . x0 . x0 . o7 . x7 . x7 . x7 .",
        "o0 . x0 . x0 . x0 . o7 . x7 . x7 . x7 .",
        "o0 . x0 . x0 . x0 . o7 . x7 . x7 . x7 .",
        "o0 . x0 . x0 . x0 . o7 . x7 . x7 . x7 .",
      ],
      lead: [
        "e5 - - - - - . . d5 - - - - - . .",
        "c5 - - - d5 - e5 - g5 - - - - - . .",
        "g5 - - - e5 - - - d5 - - - b4 - - -",
        "c5 - - - - - . . d5 - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n7 - n7 - n7 - n7 -",
        "n12 - n12 - n12 - n12 - n7 - n7 - n7 - n7 -",
        "n12 - n12 - n12 - n12 - n7 - n7 - n7 - n7 -",
        "n12 - n12 - n12 - n12 - n7 - n7 - n7 - n7 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 4x; roots per beat: D D E E | D D E E | C C D D | C C D D
    s2: {
      guitar: [
        "o2 - - . x2 . x2 . o4 - - . x4 . x4 .",
        "o2 - - . x2 . x2 . o4 - - . x4 . x4 .",
        "o0 - - . x0 . x0 . o2 - - . x2 . x2 .",
        "o0 - - . x0 . x0 . o2 - - . x2 . x2 .",
      ],
      lead: [
        "a5 - - - - - d6 - e6 - - - - - d6 -",
        "a5 - - - - - . . b5 - - - - - . .",
        "g5 - - - e5 - g5 - a5 - - - - - . .",
        "e6 - - - - - c6 - d6 - - - - - - -",
      ],
      bass: [
        "n2 - n2 - n2 - n2 - n4 - n4 - n4 - n4 -",
        "n2 - n2 - n2 - n2 - n4 - n4 - n4 - n4 -",
        "n0 - n0 - n0 - n0 - n2 - n2 - n2 - n2 -",
        "n0 - n0 - n0 - n0 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.......x.....x.", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.....x.", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.....x.", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.....x.", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C C C | C C F F | C C F# F# | C C F# F#
    s3: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - o5 - - - - - - -",
        "o0 - - - - - - - o6 - - - - - - -",
        "o0 - - - - - - - o6 - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n5 - - - - - - -",
        "n0 - - - - - - - n6 - - - - - - -",
        "n0 - - - - - - - n6 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C G G | C C A A | C C A A | C C G G
    s4: {
      guitar: [
        "o0 - - - - - - - o7 - - - - - - -",
        "o0 - - - - - - - o9 - - - - - - -",
        "o0 - - - - - - - o9 - - - - - - -",
        "o0 - - - - - - - o7 - - - - - - -",
      ],
      lead: [
        ". . . . c5 - - - d5 - - - - - . .",
        "e5 - - - g5 - - - a5 - - - - - . .",
        "g5 - - - e5 - - - e5 - - - c5 - - -",
        "c5 - - - - - . . d5 - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n7 - - - - - - -",
        "n12 - - - - - - - n9 - - - - - - -",
        "n12 - - - - - - - n9 - - - - - - -",
        "n12 - - - - - - - n7 - - - - - - -",
      ],
      drums: [
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 3x; roots per beat: D D E E | D D E E | C C D D | C C D D
    s5: {
      guitar: [
        "o2 - - . x2 . x2 . o4 - - . x4 . x4 .",
        "o2 - - . x2 . x2 . o4 - - . x4 . x4 .",
        "o0 - - . x0 . x0 . o2 - - . x2 . x2 .",
        "o0 - - . x0 . x0 . o2 - - . x2 . x2 .",
      ],
      lead: [
        "a5 - - - - - d6 - e6 - - - - - d6 -",
        "d6 - - - a5 - - - b5 - - - e6 - - -",
        "g5 - - - c6 - - - d6 - - - a5 - - -",
        "e6 - - - d6 - c6 - d6 - - - - - . .",
      ],
      bass: [
        "n2 - n2 - n2 - n2 - n4 - n4 - n4 - n4 -",
        "n2 - n2 - n2 - n2 - n4 - n4 - n4 - n4 -",
        "n0 - n0 - n0 - n0 - n2 - n2 - n2 - n2 -",
        "n0 - n0 - n0 - n0 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D D D | D D D D | F F C# C# | C C C C
    s6: {
      guitar: [
        "o2 - - . x2 . x2 . x2 . x2 . x2 . x2 .",
        "x2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "o5 - - . x5 . x5 . o1 - - . x1 . x1 .",
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "a5 - - - - - d6 - - - - - e6 - - -",
        "d6 - - - - - a5 - d6 - - - - - . .",
        "c6 - - - a5 - - - g#5 - - - - - . .",
        "g5 - - - - - c6 - - - - - - - . .",
      ],
      bass: [
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n5 - n5 - n5 - n5 - n1 - n1 - n1 - n1 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.x...x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C C C | G G C C | C C C C | C C C C
    s7: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o7 - - - - - - - o0 - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n7 - - - - - - - n12 - - - - - - -",
        "n12 - - - - - - - n12 - - - - - - -",
        "n12 - - - - - - - n12 - - - - - - -",
      ],
      drums: [
        { k: "x...x...x...x...", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: F F F F | A A E E | A A C C | C C C C
    s8: {
      guitar: [
        "o5 - - - - - - - - - - - - - - -",
        "o9 - - - - - - - o4 - - - - - - -",
        "o9 - - - - - - - o0 - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
      ],
      lead: [
        "c5 - - - - - - - a4 - - - - - . .",
        "e5 - - - - - . . b4 - - - - - . .",
        "a4 - - - c5 - - - e5 - - - - - . .",
        "c5 - - - - - . . g4 - - - - - . .",
      ],
      bass: [
        "n5 - - - - - - - n5 - - - - - - -",
        "n9 - - - - - - - n4 - - - - - - -",
        "n9 - - - - - - - n12 - - - - - - -",
        "n12 - - - - - - - n12 - - - - - - -",
      ],
      drums: [
        { k: "x...x...x...x...", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D D D | D D D D | D D C C | C C C C
    s9: {
      guitar: [
        "o2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "x2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "x2 . x2 . x2 . x2 . o0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "d5 - - - - - . . a5 - - - - - . .",
        "a5 - - - g5 - e5 - d5 - - - - - . .",
        "a5 - - - - - . . g5 - - - - - e5 -",
        "e5 - - - d5 - - - c5 - - - - - . .",
      ],
      bass: [
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n2 - n2 - n2 - n2 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.x.x...x...x...", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.x...x...x...", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.x...x...x...", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.x...x...x...", s: "..x.x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: G# G# G# G# | G# G# G# G# | G# G# C C | C C C C
    s10: {
      guitar: [
        "o8 . x8 . x8 . x8 . x8 . x8 . x8 . x8 .",
        "x8 . x8 . x8 . x8 . x8 . x8 . x8 . x8 .",
        "x8 . x8 . x8 . x8 . o0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "c6 - - - - - - - d#6 - - - - - . .",
        "g#5 - - - - - c6 - d#6 - - - c6 - - -",
        "g#5 - - - c6 - - - g5 - - - - - e5 -",
        "c6 - - - - - - - g5 - - - - - . .",
      ],
      bass: [
        "n8 - n8 - n8 - n8 - n8 - n8 - n8 - n8 -",
        "n8 - n8 - n8 - n8 - n8 - n8 - n8 - n8 -",
        "n8 - n8 - n8 - n8 - n12 - n12 - n12 - n12 -",
        "n12 - n12 - n12 - n12 - n12 - n12 - n12 - n12 -",
      ],
      drums: [
        { k: "x.x.x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C C C | F F A A | G G C C | G G C C
    s11: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o5 - - - - - - - o9 - - - - - - -",
        "o7 - - - - - - - o0 - - - - - - -",
        "o7 - - - - - - - o0 - - - - - - -",
      ],
      lead: [
        "e5 - - - - - - - g5 - - - - - . .",
        "f5 - - - a5 - - - e5 - - - - - . .",
        "d5 - - - - - g5 - e5 - - - - - . .",
        "d5 - - - b4 - - - c5 - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n5 - - - - - - - n9 - - - - - - -",
        "n7 - - - - - - - n12 - - - - - - -",
        "n7 - - - - - - - n12 - - - - - - -",
      ],
      drums: [
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: G G D D | A A F F | B B C C | A A C C
    s12: {
      guitar: [
        "o7 - - - - - - - o2 - - - - - - -",
        "o9 - - - - - - - o5 - - - - - - -",
        "o11 - - - - - - - o0 - - - - - - -",
        "o9 - - - - - - - o0 - - - - - - -",
      ],
      lead: [
        "g5 - - - - - b5 - a5 - - - - - d6 -",
        "e6 - - - - - d6 - c6 - - - a5 - - -",
        "b5 - - - - - . . c6 - - - g5 - - -",
        "a5 - - - e5 - - - g5 - - - - - . .",
      ],
      bass: [
        "n7 - - - - - - - n2 - - - - - - -",
        "n9 - - - - - - - n5 - - - - - - -",
        "n11 - - - - - - - n12 - - - - - - -",
        "n9 - - - - - - - n12 - - - - - - -",
      ],
      drums: [
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: B B D D | D D A A | C C A A | C C D D
    s13: {
      guitar: [
        "o-1 - - . x-1 . x-1 . o2 - - . x2 . x2 .",
        "x2 . x2 . x2 . x2 . o9 - - . x9 . x9 .",
        "o0 - - . x0 . x0 . o9 - - . x9 . x9 .",
        "o0 - - . x0 . x0 . o2 - - . x2 . x2 .",
      ],
      lead: [
        "f#5 - - - b5 - - - a5 - - - d6 - - -",
        "d6 - - - - - a5 - e6 - - - - - . .",
        "e6 - - - - - g6 - e6 - - - - - c6 -",
        "c6 - - - g5 - - - a5 - - - d6 - - -",
      ],
      bass: [
        "n-1 - n-1 - n-1 - n-1 - n2 - n2 - n2 - n2 -",
        "n2 - n2 - n2 - n2 - n9 - n9 - n9 - n9 -",
        "n12 - n12 - n12 - n12 - n9 - n9 - n9 - n9 -",
        "n12 - n12 - n12 - n12 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.x...x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D A A | A A A A | A A C C | C C C C
    s14: {
      guitar: [
        "o2 - - . x2 . x2 . o9 - - . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "x9 . x9 . x9 . x9 . o0 - - . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "d6 - - - - - a5 - e6 - - - - - - -",
        "a5 - - - c6 - - - e6 - - - - - . .",
        "e6 - - - - - . . g6 - - - - - e6 -",
        "c6 - - - - - - - - - - - - - . .",
      ],
      bass: [
        "n2 - n2 - n2 - n2 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n12 - n12 - n12 - n12 -",
        "n12 - n12 - n12 - n12 - n12 - n12 - n12 - n12 -",
      ],
      drums: [
        { k: "x.x...x.x.x...x.", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
      ],
    },
  },
});
