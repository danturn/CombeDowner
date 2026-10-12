import { defineTrack } from "../notation";

// Hello Pancake: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order.
export default defineTrack({
  name: "Hello Pancake",
  artist: "Awful Sparks",
  bpm: 157,
  key: 5,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["s1", "s2", "s1", "s2", "s1", "s2", "s1", "s2", "s1", "s2", "s3", "s4"],
  riffs: {
    // 4 bars, heard 5x; roots per beat: A A A A | A A A A | A A A A | C C C C
    s1: {
      guitar: [
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o3 - - . x3 . x3 . x3 . x3 . x3 . x3 .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n3 - n3 - n3 - n3 - n3 - n3 - n3 - n3 -",
      ],
      drums: [
        { k: "x.x...x.x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 5x; roots per beat: D# D# A A | A A A A | A A A A | A A A A
    s2: {
      guitar: [
        "o6 . x6 . x6 . x6 . o0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      bass: [
        "n6 - n6 - n6 - n6 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A A A A | A A A A | A A C C | C C C C
    s3: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - o3 - - - - - - -",
        "o3 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n3 - - - - - - -",
        "n3 - - - - - - - n3 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x...x.", s: "....x.....x.x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: A A A A | A A A A | A A A A | A A A A
    s4: {
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
  },
});
