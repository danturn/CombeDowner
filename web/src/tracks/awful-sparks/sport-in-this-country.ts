import { defineTrack } from "../notation";

// Sport In This Country: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order.
export default defineTrack({
  name: "Sport In This Country",
  artist: "Awful Sparks",
  bpm: 140,
  key: -4,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13", "s13", "s14", "s15", "s16", "s17", "s18", "s19", "s20"],
  riffs: {
    // 4 bars, heard 1x; roots per beat: A A A A | A A A A | A A A A | A A A# A#
    s1: {
      guitar: [
        "o9 - - - - - - - - - - - - - - -",
        "o9 - - - - - - - - - - - - - - -",
        "o9 - - - - - - - - - - - - - - -",
        "o9 - - - - - - - o10 - - - - - - -",
      ],
      bass: [
        "n9 - - - - - - - n9 - - - - - - -",
        "n9 - - - - - - - n9 - - - - - - -",
        "n9 - - - - - - - n9 - - - - - - -",
        "n9 - - - - - - - n10 - - - - - - -",
      ],
      drums: [
        { k: "x...x.x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x.x...x.", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A A A A | A A A A | A A A A | A A C C
    s2: {
      guitar: [
        "o9 - - - - - - - - - - - - - - -",
        "o9 - - - - - - - - - - - - - - -",
        "o9 - - - - - - - - - - - - - - -",
        "o9 - - - - - - - o0 - - - - - - -",
      ],
      bass: [
        "n9 - - - - - - - n9 - - - - - - -",
        "n9 - - - - - - - n9 - - - - - - -",
        "n9 - - - - - - - n9 - - - - - - -",
        "n9 - - - - - - - n12 - - - - - - -",
      ],
      drums: [
        { k: "x...x.x.x.x.....", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x.x.....", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x.x.....", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x.x.x.x.....", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C C C | C C A A | D D A A | D D C C
    s3: {
      guitar: [
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . o9 - - . x9 . x9 .",
        "o2 - - . x2 . x2 . o9 - - . x9 . x9 .",
        "o2 - - . x2 . x2 . o0 - - . x0 . x0 .",
      ],
      lead: [
        "g5 - - - - - f5 - e5 - - - - - d5 -",
        "c5 - - - - - d5 - e5 - - - - - . .",
        "a5 - - - - - g5 - e5 - - - - - d5 -",
        "f5 - - - d5 - - - e5 - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n9 - n9 - n9 - n9 -",
        "n2 - n2 - n2 - n2 - n9 - n9 - n9 - n9 -",
        "n2 - n2 - n2 - n2 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.x...x.x.x.x.x.", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x.x.x.", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x.x.x.", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x.x.x.", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A A A A | A A A A | D D A A | D D A A
    s4: {
      guitar: [
        "o9 - - . x9 . x9 . x9 . x9 . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "o2 - - . x2 . x2 . o9 - - . x9 . x9 .",
        "o2 - - . x2 . x2 . o9 - - . x9 . x9 .",
      ],
      lead: [
        "a5 - - - - - g5 - e5 - - - - - d5 -",
        "e5 - - - - - . . c5 - d5 - e5 - - -",
        "a5 - - - - - g5 - e5 - - - - - . .",
        "f5 - - - e5 - d5 - c5 - - - a4 - - -",
      ],
      bass: [
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n2 - n2 - n2 - n2 - n9 - n9 - n9 - n9 -",
        "n2 - n2 - n2 - n2 - n9 - n9 - n9 - n9 -",
      ],
      drums: [
        { k: "x.....x.x.......", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.....x.x.......", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.....x.x.......", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.....x.x.......", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A A A A | A A A A | D D D D | A A A A
    s5: {
      guitar: [
        "o9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "o2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "o9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
      ],
      lead: [
        "e5 - - - - - - - c5 - - - d5 - - -",
        "e5 - - - - - - - . . . . . . . .",
        "f5 - - - - - - - a5 - - - g5 - - -",
        "e5 - - - - - c5 - a4 - - - - - . .",
      ],
      bass: [
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
      ],
      drums: [
        { k: "x.....x.x...x...", s: "..x.x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x...x...", s: "..x.x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x...x...", s: "..x.x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x...x...", s: "..x.x.x.....x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A A A A | A A A A | D D D D | D D D D
    s6: {
      guitar: [
        "o9 - - - - - - - - - - - - - - -",
        "o9 - - - - - - - - - - - - - - -",
        "o2 - - - - - - - - - - - - - - -",
        "o2 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n9 - - - - - - - n9 - - - - - - -",
        "n9 - - - - - - - n9 - - - - - - -",
        "n2 - - - - - - - n2 - - - - - - -",
        "n2 - - - - - - - n2 - - - - - - -",
      ],
      drums: [
        { k: "x.....x.x...x...", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x...x...", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x...x...", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x...x...", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C C C | C C C C | C C C C | C C C C
    s7: {
      guitar: [
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        ". . . . g4 - - - c5 - - - e5 - - -",
        "g5 - - - - - - - e5 - - - - - . .",
        "g5 - - - a5 - - - g5 - - - e5 - d5 -",
        "e5 - - - - - - - . . . . . . . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
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
    // 4 bars, heard 1x; roots per beat: E E E E | E E E E | E E E E | E E D D
    s8: {
      guitar: [
        "o4 - - . x4 . x4 . x4 . x4 . x4 . x4 .",
        "x4 . x4 . x4 . x4 . x4 . x4 . x4 . x4 .",
        "x4 . x4 . x4 . x4 . x4 . x4 . x4 . x4 .",
        "x4 . x4 . x4 . x4 . o2 - - . x2 . x2 .",
      ],
      lead: [
        "b5 - - - - - a5 - g5 - - - - - e5 -",
        "g5 - - - - - . . e5 - f#5 - g5 - - -",
        "b5 - - - - - a5 - g5 - - - - - . .",
        "e5 - - - g5 - - - a5 - - - - - b5 -",
      ],
      bass: [
        "n4 - n4 - n4 - n4 - n4 - n4 - n4 - n4 -",
        "n4 - n4 - n4 - n4 - n4 - n4 - n4 - n4 -",
        "n4 - n4 - n4 - n4 - n4 - n4 - n4 - n4 -",
        "n4 - n4 - n4 - n4 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: E E E E | E E E E | D D A A | A A A A
    s9: {
      guitar: [
        "o4 - - . x4 . x4 . x4 . x4 . x4 . x4 .",
        "x4 . x4 . x4 . x4 . x4 . x4 . x4 . x4 .",
        "o2 - - . x2 . x2 . o9 - - . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
      ],
      lead: [
        "e6 - - - - - d6 - b5 - - - - - a5 -",
        "g5 - - - - - . . e5 - - - g5 - a5 -",
        "a5 - - - - - g5 - e5 - - - - - d5 -",
        "c5 - - - - - - - a4 - - - - - . .",
      ],
      bass: [
        "n4 - n4 - n4 - n4 - n4 - n4 - n4 - n4 -",
        "n4 - n4 - n4 - n4 - n4 - n4 - n4 - n4 -",
        "n2 - n2 - n2 - n2 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A A A A | A A A A | A A A A | G# G# A A
    s10: {
      guitar: [
        "o9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "o8 . x8 . x8 . x8 . o9 . x9 . x9 . x9 .",
      ],
      lead: [
        ". . . . e5 - - - a5 - - - - - . .",
        "c6 - - - b5 - - - a5 - - - - - . .",
        "e5 - - - - - - - c5 - - - d5 - - -",
        "b4 - - - d5 - - - c5 - - - a4 - - -",
      ],
      bass: [
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n8 - n8 - n8 - n8 - n9 - n9 - n9 - n9 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A A A A | A A A# A# | A# A# A# A# | A# A# A# A#
    s11: {
      guitar: [
        "o9 - - - - - - - - - - - - - - -",
        "o9 - - - - - - - o10 - - - - - - -",
        "o10 - - - - - - - - - - - - - - -",
        "o10 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n9 - - - - - - - n9 - - - - - - -",
        "n9 - - - - - - - n10 - - - - - - -",
        "n10 - - - - - - - n10 - - - - - - -",
        "n10 - - - - - - - n10 - - - - - - -",
      ],
      drums: [
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C C C | C C C C | C C C C | C C C C
    s12: {
      guitar: [
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
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
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 2x; roots per beat: E E E E | E E G G | B B D D | A A C C
    s13: {
      guitar: [
        "o4 - - . x4 . x4 . x4 . x4 . x4 . x4 .",
        "x4 . x4 . x4 . x4 . o7 - - . x7 . x7 .",
        "o11 - - . x11 . x11 . o2 - - . x2 . x2 .",
        "o9 - - . x9 . x9 . o0 - - . x0 . x0 .",
      ],
      lead: [
        "e6 - - - - - d6 - b5 - - - - - g5 -",
        "b5 - - - - - . . d6 - - - b5 - - -",
        "d6 - - - - - b5 - a5 - - - - - . .",
        "c6 - - - b5 - a5 - g5 - - - - - - -",
      ],
      bass: [
        "n4 - n4 - n4 - n4 - n4 - n4 - n4 - n4 -",
        "n4 - n4 - n4 - n4 - n7 - n7 - n7 - n7 -",
        "n11 - n11 - n11 - n11 - n2 - n2 - n2 - n2 -",
        "n9 - n9 - n9 - n9 - n12 - n12 - n12 - n12 -",
      ],
      drums: [
        { k: "x...x...x.x.....", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.x.....", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.x.....", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.x.....", s: "....x.x.....x.x.", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C A A | A A A A | A A A A | A A A A
    s14: {
      guitar: [
        "o0 - - . x0 . x0 . o9 - - . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
      ],
      lead: [
        "g5 - - - - - f5 - e5 - - - - - d5 -",
        "e5 - - - - - . . a5 - - - g5 - e5 -",
        "a5 - - - - - g5 - e5 - - - - - d5 -",
        "c5 - - - - - b4 - a4 - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
      ],
      drums: [
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.x.x...", s: "....x.x...x.x.x.", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A A A A | A A A A | A A A A | D D D D
    s15: {
      guitar: [
        "o9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "o2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
      ],
      lead: [
        "c5 - - - - - - - e5 - - - - - . .",
        "a5 - - - - - g5 - e5 - - - - - . .",
        "c5 - - - d5 - - - e5 - - - - - . .",
        "f5 - - - - - - - d5 - - - - - . .",
      ],
      bass: [
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x...x...x.x.x...", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.x.x...", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.x.x...", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.x.x...", s: "....x.x.....x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: B B B B | B B B B | B B B B | B B B B
    s16: {
      guitar: [
        "o-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 .",
        "x-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 .",
        "x-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 .",
        "x-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 . x-1 .",
      ],
      lead: [
        "b5 - - - - - - - d6 - - - - - - -",
        "f#6 - - - - - e6 - d6 - - - - - - -",
        "b5 - - - - - - - f#5 - - - a5 - - -",
        "b5 - - - - - - - - - - - . . . .",
      ],
      bass: [
        "n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 -",
        "n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 -",
        "n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 -",
        "n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 - n-1 -",
      ],
      drums: [
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C C C | C C C C | C C C C | C C D D
    s17: {
      guitar: [
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . o2 - - . x2 . x2 .",
      ],
      lead: [
        "g5 - - - - - f5 - e5 - - - - - d5 -",
        "e5 - - - - - . . c5 - d5 - e5 - - -",
        "c6 - - - - - a5 - g5 - - - - - e5 -",
        "g5 - - - e5 - - - f5 - - - a5 - - -",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A A A A | A A A A | A A A A | F# F# E E
    s18: {
      guitar: [
        "o9 - - . x9 . x9 . x9 . x9 . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "x9 . x9 . x9 . x9 . x9 . x9 . x9 . x9 .",
        "o6 - - . x6 . x6 . o4 - - . x4 . x4 .",
      ],
      lead: [
        "e6 - - - - - d6 - c6 - - - - - a5 -",
        "c6 - - - - - . . e6 - - - d6 - c6 -",
        "a5 - - - - - g5 - e5 - - - - - a5 -",
        "a5 - - - - - f#5 - b5 - - - - - . .",
      ],
      bass: [
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n9 - n9 - n9 - n9 - n9 - n9 - n9 - n9 -",
        "n6 - n6 - n6 - n6 - n4 - n4 - n4 - n4 -",
      ],
      drums: [
        { k: "x.x...x.x.x...x.", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "..x.x.....x.x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: F# F# F# F# | F# F# F# F# | F# F# G G | C C C C
    s19: {
      guitar: [
        "o6 . x6 . x6 . x6 . x6 . x6 . x6 . x6 .",
        "x6 . x6 . x6 . x6 . x6 . x6 . x6 . x6 .",
        "x6 . x6 . x6 . x6 . o7 . x7 . x7 . x7 .",
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "f#5 - - - - - - - a5 - - - - - - -",
        "a5 - - - - - b5 - a5 - - - f#5 - - -",
        "f#5 - - - a5 - - - b5 - - - d6 - - -",
        "e6 - - - - - d6 - c6 - - - - - - -",
      ],
      bass: [
        "n6 - n6 - n6 - n6 - n6 - n6 - n6 - n6 -",
        "n6 - n6 - n6 - n6 - n6 - n6 - n6 - n6 -",
        "n6 - n6 - n6 - n6 - n7 - n7 - n7 - n7 -",
        "n12 - n12 - n12 - n12 - n12 - n12 - n12 - n12 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C C C | C C C C | C C C C | C C C C
    s20: {
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
        { k: "................", s: "................", h: "................" },
        { k: "................", s: "................", h: "................" },
        { k: "................", s: "................", h: "................" },
        { k: "................", s: "................", h: "................" },
      ],
    },
  },
});
