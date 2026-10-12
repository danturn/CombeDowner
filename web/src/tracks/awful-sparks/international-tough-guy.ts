import { defineTrack } from "../notation";

// International Tough Guy: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order.
export default defineTrack({
  name: "International Tough Guy",
  artist: "Awful Sparks",
  bpm: 110,
  key: -2,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["s1", "s2", "s3", "~s4", "s4", "s5", "s6", "s7", "s8", "s9", "s5", "s10", "s11", "s4", "s12"],
  riffs: {
    // 4 bars, heard 1x; roots per beat: E E E E | D D C C | C C E E | E E D# D#
    s1: {
      guitar: [
        "o2 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - o-2 - - - - - - -",
        "o-2 - - - - - - - o2 - - - - - - -",
        "o2 - - - - - - - o1 - - - - - - -",
      ],
      bass: [
        "n2 - - - - - - - n2 - - - - - - -",
        "n0 - - - - - - - n-2 - - - - - - -",
        "n-2 - - - - - - - n2 - - - - - - -",
        "n2 - - - - - - - n1 - - - - - - -",
      ],
      drums: [
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D C C | C C B B | D# D# D# D# | E E E E
    s2: {
      guitar: [
        "o0 . x0 . x0 . x0 . o-2 . x-2 . x-2 . x-2 .",
        "x-2 . x-2 . x-2 . x-2 . o-3 . x-3 . x-3 . x-3 .",
        "o1 . x1 . x1 . x1 . x1 . x1 . x1 . x1 .",
        "o2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n-2 - n-2 - n-2 - n-2 -",
        "n-2 - n-2 - n-2 - n-2 - n-3 - n-3 - n-3 - n-3 -",
        "n1 - n1 - n1 - n1 - n1 - n1 - n1 - n1 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: C C C C | B B D# D# | E E E E | E E C C
    s3: {
      guitar: [
        "o-2 - - . x-2 . x-2 . x-2 . x-2 . x-2 . x-2 .",
        "o-3 - - . x-3 . x-3 . o1 - - . x1 . x1 .",
        "o2 - - . x2 . x2 . x2 . x2 . x2 . x2 .",
        "x2 . x2 . x2 . x2 . o-2 - - . x-2 . x-2 .",
      ],
      lead: [
        "g5 - - - - - e5 - g5 - - - c6 - - -",
        "f#5 - - - d5 - . . a#5 - - - - - . .",
        "b5 - - - - - g5 - e5 - - - g5 - a5 -",
        "b5 - - - - - - - g5 - - - e5 - - -",
      ],
      bass: [
        "n-2 - n-2 - n-2 - n-2 - n-2 - n-2 - n-2 - n-2 -",
        "n-3 - n-3 - n-3 - n-3 - n1 - n1 - n1 - n1 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n2 - n2 - n2 - n2 - n-2 - n-2 - n-2 - n-2 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 3x; roots per beat: C C F# F# | D D D D | D D D D | B B D D
    s4: {
      guitar: [
        "o-2 . x-2 . x-2 . x-2 . o4 . x4 . x4 . x4 .",
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o-3 . x-3 . x-3 . x-3 . o0 . x0 . x0 . x0 .",
      ],
      lead: [
        "g5 - - - g5 - e5 - f#5 - - - a5 - - -",
        "a5 - - - - - f#5 - a5 - d6 - - - . .",
        "d6 - - - c6 - a5 - f#5 - - - g5 - e5 -",
        "f#5 - - - - - e5 - d5 - - - - - . .",
      ],
      bass: [
        "n-2 - n-2 - n-2 - n-2 - n4 - n4 - n4 - n4 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n-3 - n-3 - n-3 - n-3 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 2x; roots per beat: D D E E | B B F# F# | D D D D | B B D D
    s5: {
      guitar: [
        "o0 - - . x0 . x0 . o2 - - . x2 . x2 .",
        "o-3 - - . x-3 . x-3 . o4 - - . x4 . x4 .",
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o-3 - - . x-3 . x-3 . o0 - - . x0 . x0 .",
      ],
      lead: [
        "a5 - - - d6 - - - e6 - - - b5 - - -",
        "f#6 - - - - - d6 - c#6 - - - a5 - - -",
        "d6 - - - - - a5 - f#5 - a5 - d6 - e6 -",
        "f#6 - - - - - e6 - d6 - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n2 - n2 - n2 - n2 -",
        "n-3 - n-3 - n-3 - n-3 - n4 - n4 - n4 - n4 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n-3 - n-3 - n-3 - n-3 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: B B B B | D D E E | E E D D | C C C C
    s6: {
      guitar: [
        "o-3 - - . x-3 . x-3 . x-3 . x-3 . x-3 . x-3 .",
        "o0 - - . x0 . x0 . o2 - - . x2 . x2 .",
        "x2 . x2 . x2 . x2 . o0 - - . x0 . x0 .",
        "o-2 - - . x-2 . x-2 . x-2 . x-2 . x-2 . x-2 .",
      ],
      lead: [
        "b5 - - - - - a5 - f#5 - - - d5 - f#5 -",
        "a5 - - - - - . . b5 - - - g5 - e5 -",
        "e6 - - - - - d6 - a5 - - - f#5 - - -",
        "g5 - - - - - - - e5 - - - . . . .",
      ],
      bass: [
        "n-3 - n-3 - n-3 - n-3 - n-3 - n-3 - n-3 - n-3 -",
        "n0 - n0 - n0 - n0 - n2 - n2 - n2 - n2 -",
        "n2 - n2 - n2 - n2 - n0 - n0 - n0 - n0 -",
        "n-2 - n-2 - n-2 - n-2 - n-2 - n-2 - n-2 - n-2 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: E E D# D# | E E E E | C C C C | E E E E
    s7: {
      guitar: [
        "o2 . x2 . x2 . x2 . o1 . x1 . x1 . x1 .",
        "o2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "o-2 . x-2 . x-2 . x-2 . x-2 . x-2 . x-2 . x-2 .",
        "o2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
      ],
      bass: [
        "n2 - n2 - n2 - n2 - n1 - n1 - n1 - n1 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n-2 - n-2 - n-2 - n-2 - n-2 - n-2 - n-2 - n-2 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D# D# D# D# | D D C C | C C D D | D# D# D# D#
    s8: {
      guitar: [
        "o1 - - . x1 . x1 . x1 . x1 . x1 . x1 .",
        "o0 - - . x0 . x0 . o-2 - - . x-2 . x-2 .",
        "x-2 . x-2 . x-2 . x-2 . o0 - - . x0 . x0 .",
        "o1 - - . x1 . x1 . x1 . x1 . x1 . x1 .",
      ],
      lead: [
        "d#6 - - - - - - - a#5 - - - g5 - a#5 -",
        "a5 - - - - - f#5 - g5 - - - - - e5 -",
        "c6 - - - - - e6 - f#6 - - - - - d6 -",
        "g6 - - - - - - - - - - - a#5 - - -",
      ],
      bass: [
        "n1 - n1 - n1 - n1 - n1 - n1 - n1 - n1 -",
        "n0 - n0 - n0 - n0 - n-2 - n-2 - n-2 - n-2 -",
        "n-2 - n-2 - n-2 - n-2 - n0 - n0 - n0 - n0 -",
        "n1 - n1 - n1 - n1 - n1 - n1 - n1 - n1 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A# A# A# A# | C C C C | D D D D | B B D D
    s9: {
      guitar: [
        "o8 - - - - - - - - - - - - - - -",
        "o-2 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o-3 - - - - - - - o0 - - - - - - -",
      ],
      bass: [
        "n8 - - - - - - - n8 - - - - - - -",
        "n-2 - - - - - - - n-2 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
        "n-3 - - - - - - - n0 - - - - - - -",
      ],
      drums: [
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D B B | D D D D | E E B B | F# F# D D
    s10: {
      guitar: [
        "o0 - - . x0 . x0 . o-3 - - . x-3 . x-3 .",
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o2 - - . x2 . x2 . o-3 - - . x-3 . x-3 .",
        "o4 - - . x4 . x4 . o0 - - . x0 . x0 .",
      ],
      lead: [
        "d6 - - - - - a5 - b5 - - - f#5 - - -",
        "a5 - - - - - . . d5 - f#5 - a5 - - -",
        "b5 - - - - - g5 - f#5 - - - d6 - - -",
        "c#6 - - - a5 - - - d6 - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n-3 - n-3 - n-3 - n-3 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n2 - n2 - n2 - n2 - n-3 - n-3 - n-3 - n-3 -",
        "n4 - n4 - n4 - n4 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D D# D# | D D D D | D D D D | D D E E
    s11: {
      guitar: [
        "o0 - - - - - - - o1 - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - o2 - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n1 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n2 - - - - - - -",
      ],
      drums: [
        { k: "x.x.....x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.....x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.....x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.x.....x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: D D E E | D D E E | B B F# F# | D D D D
    s12: {
      guitar: [
        "o0 . x0 . x0 . x0 . o2 . x2 . x2 . x2 .",
        "o0 . x0 . x0 . x0 . o2 . x2 . x2 . x2 .",
        "o-3 . x-3 . x-3 . x-3 . o4 . x4 . x4 . x4 .",
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "a5 - - - f#5 - - - b5 - - - - - . .",
        "a5 - - - d6 - - - e6 - - - b5 - - -",
        "f#5 - - - - - d5 - c#5 - - - - - . .",
        "d5 - - - - - - - - - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n2 - n2 - n2 - n2 -",
        "n0 - n0 - n0 - n0 - n2 - n2 - n2 - n2 -",
        "n-3 - n-3 - n-3 - n-3 - n4 - n4 - n4 - n4 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.....x.x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.....x.x.....x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
  },
});
