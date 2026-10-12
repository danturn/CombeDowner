import { defineTrack } from "../notation";

// La Nuit, C'est Paradis: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order.
export default defineTrack({
  name: "La Nuit, C'est Paradis",
  artist: "Awful Sparks",
  bpm: 96,
  key: -5,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["s1", "s1", "s2", "s3", "s4", "s5", "s6"],
  riffs: {
    // 4 bars, heard 2x; roots per beat: F# F# E E | B B B B | F# F# E E | B B B B
    s1: {
      guitar: [
        "o7 - - . x7 . x7 . o5 - - . x5 . x5 .",
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o7 - - . x7 . x7 . o5 - - . x5 . x5 .",
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n7 - n7 - n7 - n7 - n5 - n5 - n5 - n5 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n7 - n7 - n7 - n7 - n5 - n5 - n5 - n5 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: B B B B | B B B B | B B B B | B B B B
    s2: {
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
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: G# G# F# F# | B B B B | B B F# F# | D# D# B B
    s3: {
      guitar: [
        "o9 - - . x9 . x9 . o7 - - . x7 . x7 .",
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . o7 - - . x7 . x7 .",
        "o4 - - . x4 . x4 . o0 - - . x0 . x0 .",
      ],
      bass: [
        "n9 - n9 - n9 - n9 - n7 - n7 - n7 - n7 -",
        "n12 - n12 - n12 - n12 - n12 - n12 - n12 - n12 -",
        "n12 - n12 - n12 - n12 - n7 - n7 - n7 - n7 -",
        "n4 - n4 - n4 - n4 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: B B F# F# | B B B B | B B B B | B B B B
    s4: {
      guitar: [
        "o0 - - . x0 . x0 . o7 - - . x7 . x7 .",
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n7 - n7 - n7 - n7 -",
        "n12 - n12 - n12 - n12 - n12 - n12 - n12 - n12 -",
        "n12 - n12 - n12 - n12 - n12 - n12 - n12 - n12 -",
        "n12 - n12 - n12 - n12 - n12 - n12 - n12 - n12 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.x...x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.x...x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.x...x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.......", s: "....x.x...x.x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: B B B B | B B B B | B B B B | B B B B
    s5: {
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
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: B B B B | B B A A | C# C# C# C# | B B B B
    s6: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - o10 - - - - - - -",
        "o2 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n10 - - - - - - -",
        "n2 - - - - - - - n2 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
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
