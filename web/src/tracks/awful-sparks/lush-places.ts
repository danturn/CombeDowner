import { defineTrack } from "../notation";

// Lush Places: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order.
export default defineTrack({
  name: "Lush Places",
  artist: "Awful Sparks",
  bpm: 148,
  key: 5,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["~s1", "s1", "s2", "s3", "s4", "s4", "s5", "s6", "s7", "s8", "s8", "~s3", "s4", "s4", "s9", "s4", "s10", "s11", "s12", "s13", "s14", "s15", "s16", "s4", "s4", "~s4", "s4"],
  riffs: {
    // 4 bars, heard 2x; roots per beat: E E A A | E E D D | E E D D | F F D D
    s1: {
      guitar: [
        "o-5 . x-5 . x-5 . x-5 . o0 . x0 . x0 . x0 .",
        "o-5 . x-5 . x-5 . x-5 . o5 . x5 . x5 . x5 .",
        "o7 . x7 . x7 . x7 . o5 . x5 . x5 . x5 .",
        "o8 . x8 . x8 . x8 . o5 . x5 . x5 . x5 .",
      ],
      lead: [
        "e5 - - - - - . . a4 - - - c5 - - -",
        "b4 - - - - - . . a4 - - - - - . .",
        "e5 - - - g5 - - - f5 - - - e5 - d5 -",
        "c5 - - - - - a4 - d5 - - - - - . .",
      ],
      bass: [
        "n-5 - n-5 - n-5 - n-5 - n0 - n0 - n0 - n0 -",
        "n-5 - n-5 - n-5 - n-5 - n5 - n5 - n5 - n5 -",
        "n7 - n7 - n7 - n7 - n5 - n5 - n5 - n5 -",
        "n8 - n8 - n8 - n8 - n5 - n5 - n5 - n5 -",
      ],
      drums: [
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C A A | A A E E | A A D D | F F C C
    s2: {
      guitar: [
        "o3 - - . x3 . x3 . o0 - - . x0 . x0 .",
        "x0 . x0 . x0 . x0 . o-5 - - . x-5 . x-5 .",
        "o0 - - . x0 . x0 . o5 - - . x5 . x5 .",
        "o8 - - . x8 . x8 . o3 - - . x3 . x3 .",
      ],
      lead: [
        "g5 - - - - - e5 - a5 - - - c6 - - -",
        "a5 - - - - - c6 - b5 - - - - - . .",
        "c6 - - - b5 - - - a5 - - - f5 - - -",
        "a5 - - - f5 - a5 - g5 - - - - - . .",
      ],
      bass: [
        "n3 - n3 - n3 - n3 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n-5 - n-5 - n-5 - n-5 -",
        "n0 - n0 - n0 - n0 - n5 - n5 - n5 - n5 -",
        "n8 - n8 - n8 - n8 - n3 - n3 - n3 - n3 -",
      ],
      drums: [
        { k: "x.x...x.x.x...x.", s: "....x.x...x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.x...x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.x...x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.x...x.x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 2x; roots per beat: C C C C | E E D D | A A D D | D D D D
    s3: {
      guitar: [
        "o3 . x3 . x3 . x3 . x3 . x3 . x3 . x3 .",
        "o7 . x7 . x7 . x7 . o5 . x5 . x5 . x5 .",
        "o0 . x0 . x0 . x0 . o5 . x5 . x5 . x5 .",
        "x5 . x5 . x5 . x5 . x5 . x5 . x5 . x5 .",
      ],
      lead: [
        "e5 - - - - - g5 - c6 - - - g5 - - -",
        "b5 - - - - - g5 - a5 - - - f5 - - -",
        "e5 - - - - - c5 - d5 - - - f5 - - -",
        "a5 - - - - - - - f5 - - - e5 - - -",
      ],
      bass: [
        "n3 - n3 - n3 - n3 - n3 - n3 - n3 - n3 -",
        "n7 - n7 - n7 - n7 - n5 - n5 - n5 - n5 -",
        "n0 - n0 - n0 - n0 - n5 - n5 - n5 - n5 -",
        "n5 - n5 - n5 - n5 - n5 - n5 - n5 - n5 -",
      ],
      drums: [
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 9x; roots per beat: D D D D | F F F F | F F F F | D D D D
    s4: {
      guitar: [
        "o5 . x5 . x5 . x5 . x5 . x5 . x5 . x5 .",
        "o8 . x8 . x8 . x8 . x8 . x8 . x8 . x8 .",
        "x8 . x8 . x8 . x8 . x8 . x8 . x8 . x8 .",
        "o5 . x5 . x5 . x5 . x5 . x5 . x5 . x5 .",
      ],
      lead: [
        "a5 - - - - - f5 - d5 - - - f5 - a5 -",
        "c6 - - - - - - - a5 - - - - - . .",
        "c6 - - - d6 - c6 - a5 - - - g5 - f5 -",
        "f5 - - - e5 - - - d5 - - - - - . .",
      ],
      bass: [
        "n5 - n5 - n5 - n5 - n5 - n5 - n5 - n5 -",
        "n8 - n8 - n8 - n8 - n8 - n8 - n8 - n8 -",
        "n8 - n8 - n8 - n8 - n8 - n8 - n8 - n8 -",
        "n5 - n5 - n5 - n5 - n5 - n5 - n5 - n5 -",
      ],
      drums: [
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D C C | F F D D | F F A A | D D D D
    s5: {
      guitar: [
        "o5 . x5 . x5 . x5 . o3 . x3 . x3 . x3 .",
        "o8 . x8 . x8 . x8 . o5 . x5 . x5 . x5 .",
        "o8 . x8 . x8 . x8 . o0 . x0 . x0 . x0 .",
        "o5 . x5 . x5 . x5 . x5 . x5 . x5 . x5 .",
      ],
      bass: [
        "n5 - n5 - n5 - n5 - n3 - n3 - n3 - n3 -",
        "n8 - n8 - n8 - n8 - n5 - n5 - n5 - n5 -",
        "n8 - n8 - n8 - n8 - n12 - n12 - n12 - n12 -",
        "n5 - n5 - n5 - n5 - n5 - n5 - n5 - n5 -",
      ],
      drums: [
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D C C | F F D D | D D E E | E E E E
    s6: {
      guitar: [
        "o5 . x5 . x5 . x5 . o3 . x3 . x3 . x3 .",
        "o8 . x8 . x8 . x8 . o5 . x5 . x5 . x5 .",
        "x5 . x5 . x5 . x5 . o7 . x7 . x7 . x7 .",
        "x7 . x7 . x7 . x7 . x7 . x7 . x7 . x7 .",
      ],
      lead: [
        "d5 - - - - - f5 - e5 - - - g5 - - -",
        "a5 - - - - - f5 - a5 - - - - - . .",
        "f5 - - - a5 - - - b5 - - - - - - -",
        "e6 - - - - - d6 - b5 - - - - - . .",
      ],
      bass: [
        "n5 - n5 - n5 - n5 - n3 - n3 - n3 - n3 -",
        "n8 - n8 - n8 - n8 - n5 - n5 - n5 - n5 -",
        "n5 - n5 - n5 - n5 - n7 - n7 - n7 - n7 -",
        "n7 - n7 - n7 - n7 - n7 - n7 - n7 - n7 -",
      ],
      drums: [
        { k: "x.....x.x.......", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.......", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.......", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.......", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: E E C C | E E D D | D D D D | E E E E
    s7: {
      guitar: [
        "o-5 - - - - - - - o3 - - - - - - -",
        "o7 - - - - - - - o5 - - - - - - -",
        "o5 - - - - - - - - - - - - - - -",
        "o7 - - - - - - - - - - - - - - -",
      ],
      lead: [
        "b4 - - - - - - - c5 - - - - - . .",
        "e5 - - - - - - - d5 - - - - - . .",
        ". . . . f5 - - - a5 - - - - - - -",
        "e5 - - - g5 - - - b5 - - - - - . .",
      ],
      bass: [
        "n-5 - - - - - - - n3 - - - - - - -",
        "n7 - - - - - - - n5 - - - - - - -",
        "n5 - - - - - - - n5 - - - - - - -",
        "n7 - - - - - - - n7 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 2x; roots per beat: E E E E | E E D D | E E D D | E E E E
    s8: {
      guitar: [
        "o-5 . x-5 . x-5 . x-5 . x-5 . x-5 . x-5 . x-5 .",
        "x-5 . x-5 . x-5 . x-5 . o5 . x5 . x5 . x5 .",
        "o7 . x7 . x7 . x7 . o5 . x5 . x5 . x5 .",
        "o7 . x7 . x7 . x7 . x7 . x7 . x7 . x7 .",
      ],
      lead: [
        "e5 - - - - - g5 - b5 - - - a5 - g5 -",
        "e5 - - - - - - - f5 - - - a5 - - -",
        "b5 - - - - - g5 - a5 - - - f5 - - -",
        "g5 - - - - - d5 - e5 - - - - - . .",
      ],
      bass: [
        "n-5 - n-5 - n-5 - n-5 - n-5 - n-5 - n-5 - n-5 -",
        "n-5 - n-5 - n-5 - n-5 - n5 - n5 - n5 - n5 -",
        "n7 - n7 - n7 - n7 - n5 - n5 - n5 - n5 -",
        "n7 - n7 - n7 - n7 - n7 - n7 - n7 - n7 -",
      ],
      drums: [
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D C C | F F D D | F F D D | D D D D
    s9: {
      guitar: [
        "o5 . x5 . x5 . x5 . o3 . x3 . x3 . x3 .",
        "o8 . x8 . x8 . x8 . o5 . x5 . x5 . x5 .",
        "o8 . x8 . x8 . x8 . o5 . x5 . x5 . x5 .",
        "x5 . x5 . x5 . x5 . x5 . x5 . x5 . x5 .",
      ],
      bass: [
        "n5 - n5 - n5 - n5 - n3 - n3 - n3 - n3 -",
        "n8 - n8 - n8 - n8 - n5 - n5 - n5 - n5 -",
        "n8 - n8 - n8 - n8 - n5 - n5 - n5 - n5 -",
        "n5 - n5 - n5 - n5 - n5 - n5 - n5 - n5 -",
      ],
      drums: [
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D D D | D D D D | A A A A | A A A A
    s10: {
      guitar: [
        "o5 - - - - - - - - - - - - - - -",
        "o5 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n5 - - - - - - - n5 - - - - - - -",
        "n5 - - - - - - - n5 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: G G G G | D D A A | B B A A | A A A A
    s11: {
      guitar: [
        "o-2 - - - - - - - - - - - - - - -",
        "o5 - - - - - - - o0 - - - - - - -",
        "o2 - - - - - - - o0 - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
      ],
      lead: [
        "d5 - - - g5 - - - b5 - - - d6 - - -",
        "d6 - - - - - a5 - c6 - - - - - - -",
        "b5 - - - - - - - a5 - - - - - c6 -",
        "e6 - - - - - - - - - - - . . . .",
      ],
      bass: [
        "n-2 - - - - - - - n-2 - - - - - - -",
        "n5 - - - - - - - n0 - - - - - - -",
        "n2 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D D D | D D D D | D D D# D# | A A A A
    s12: {
      guitar: [
        "o5 - - . x5 . x5 . x5 . x5 . x5 . x5 .",
        "x5 . x5 . x5 . x5 . x5 . x5 . x5 . x5 .",
        "x5 . x5 . x5 . x5 . o6 - - . x6 . x6 .",
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "d6 - - - - - - - a5 - - - d6 - f6 -",
        "f6 - - - - - e6 - d6 - - - - - a5 -",
        "a5 - - - f5 - a5 - a#5 - - - - - g5 -",
        "a5 - - - - - - - e5 - - - - - . .",
      ],
      bass: [
        "n5 - n5 - n5 - n5 - n5 - n5 - n5 - n5 -",
        "n5 - n5 - n5 - n5 - n5 - n5 - n5 - n5 -",
        "n5 - n5 - n5 - n5 - n6 - n6 - n6 - n6 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D D D | D D D D | D D D D | D D A A
    s13: {
      guitar: [
        "o5 - - - - - - - - - - - - - - -",
        "o5 - - - - - - - - - - - - - - -",
        "o5 - - - - - - - - - - - - - - -",
        "o5 - - - - - - - o0 - - - - - - -",
      ],
      bass: [
        "n5 - - - - - - - n5 - - - - - - -",
        "n5 - - - - - - - n5 - - - - - - -",
        "n5 - - - - - - - n5 - - - - - - -",
        "n5 - - - - - - - n0 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: G# G# G# G# | G# G# G# G# | G# G# G# G# | D D F F
    s14: {
      guitar: [
        "o-1 - - . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 .",
        "x-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 .",
        "x-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 .",
        "o5 - - . x5 . x5 . o8 - - . x8 . x8 .",
      ],
      bass: [
        "n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 -",
        "n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 -",
        "n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 -",
        "n5 - n5 - n5 - n5 - n8 - n8 - n8 - n8 -",
      ],
      drums: [
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.....x.x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: F F A A | A A A A | A A E E | E E F F
    s15: {
      guitar: [
        "o-4 - - . x-4 . x-4 . o0 - - . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . o-5 - - . x-5 . x-5 .",
        "x-5 . x-5 . x-5 . x-5 . o-4 - - . x-4 . x-4 .",
      ],
      lead: [
        "c6 - - - - - a5 - c6 - - - e6 - - -",
        "e6 - - - - - d6 - c6 - - - - - a5 -",
        "c6 - - - - - - - b5 - - - g5 - - -",
        "b5 - - - - - g5 - a5 - - - c6 - - -",
      ],
      bass: [
        "n-4 - n-4 - n-4 - n-4 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n-5 - n-5 - n-5 - n-5 -",
        "n-5 - n-5 - n-5 - n-5 - n-4 - n-4 - n-4 - n-4 -",
      ],
      drums: [
        { k: "x.....x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.....x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.....x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.....x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: F F C C | E E E E | E E E E | D D D D
    s16: {
      guitar: [
        "o-4 . x-4 . x-4 . x-4 . o3 . x3 . x3 . x3 .",
        "o7 . x7 . x7 . x7 . x7 . x7 . x7 . x7 .",
        "x7 . x7 . x7 . x7 . x7 . x7 . x7 . x7 .",
        "o5 . x5 . x5 . x5 . x5 . x5 . x5 . x5 .",
      ],
      bass: [
        "n-4 - n-4 - n-4 - n-4 - n3 - n3 - n3 - n3 -",
        "n7 - n7 - n7 - n7 - n7 - n7 - n7 - n7 -",
        "n7 - n7 - n7 - n7 - n7 - n7 - n7 - n7 -",
        "n5 - n5 - n5 - n5 - n5 - n5 - n5 - n5 -",
      ],
      drums: [
        { k: "x.....x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
  },
});
