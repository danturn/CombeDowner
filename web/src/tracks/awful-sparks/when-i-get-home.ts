import { defineTrack } from "../notation";

// When I Get Home: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order.
export default defineTrack({
  name: "When I Get Home",
  artist: "Awful Sparks",
  bpm: 148,
  key: -2,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["~s1", "~s2", "s1", "s2", "s3", "~s4", "s4", "s5", "s5", "~s1", "s1", "s2", "s1", "s2", "s3", "s6", "s5", "s4", "s5", "s5", "s2"],
  riffs: {
    // 4 bars, heard 5x; roots per beat: D D D D | D D G G | D D D D | D D G G
    s1: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - o5 - - - - - - -",
        "o0 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - o5 - - - - - - -",
      ],
      lead: [
        "a4 - - - - - d5 - f#5 - - - - - . .",
        "f#5 - - - e5 - d5 - b4 - - - - - . .",
        "d5 - - - . . a4 - f#5 - - - e5 - d5 -",
        "a4 - - - b4 - - - d5 - - - - - . .",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n5 - - - - - - -",
        "n0 - - - - - - - n0 - - - - - - -",
        "n0 - - - - - - - n5 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 5x; roots per beat: D D D D | C# C# F# F# | C# C# C# C# | D D G G
    s2: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o-1 - - - - - - - o4 - - - - - - -",
        "o-1 - - - - - - - - - - - - - - -",
        "o0 - - - - - - - o5 - - - - - - -",
      ],
      lead: [
        "f#5 - - - - - e5 - d5 - - - - - . .",
        "e5 - - - - - c#5 - a4 - - - - - . .",
        "c#5 - - - e5 - - - c#5 - - - b4 - a4 -",
        "d5 - - - f#5 - - - g5 - - - - - . .",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n-1 - - - - - - - n4 - - - - - - -",
        "n-1 - - - - - - - n-1 - - - - - - -",
        "n0 - - - - - - - n5 - - - - - - -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 2x; roots per beat: D D C# C# | E E E E | E E C# C# | E E E E
    s3: {
      guitar: [
        "o0 - - . x0 . x0 . o-1 - - . x-1 . x-1 .",
        "o2 - - . x2 . x2 . x2 . x2 . x2 . x2 .",
        "x2 . x2 . x2 . x2 . o-1 - - . x-1 . x-1 .",
        "o2 - - . x2 . x2 . x2 . x2 . x2 . x2 .",
      ],
      lead: [
        "a5 - - - - - f#5 - e5 - - - - - c#5 -",
        "e5 - - - f#5 - a5 - b5 - - - - - - -",
        "e6 - - - - - d6 - c#6 - - - - - b5 -",
        "b5 - - - - - - - e5 - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n-1 - n-1 - n-1 - n-1 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n2 - n2 - n2 - n2 - n-1 - n-1 - n-1 - n-1 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
      ],
      drums: [
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 3x; roots per beat: D D D D | D D D D | D D D D | D D D D
    s4: {
      guitar: [
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "d5 - - - d5 - e5 - f#5 - - - e5 - d5 -",
        "a5 - - - - - g5 - f#5 - - - - - . .",
        "d5 - - - d5 - e5 - f#5 - - - a5 - b5 -",
        "f#5 - - - g5 - - - a5 - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 5x; roots per beat: D D D D | D D D D | D D D D | D D D D
    s5: {
      guitar: [
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "a5 - - - - - f#5 - a5 - - - b5 - a5 -",
        "f#5 - - - - - - - d5 - - - e5 - - -",
        "a5 - - - - - f#5 - a5 - - - d6 - - -",
        "f#5 - - - e5 - - - d5 - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: E E C# C# | E E E E | E E E E | D D D D
    s6: {
      guitar: [
        "o2 - - . x2 . x2 . o-1 - - . x-1 . x-1 .",
        "o2 - - . x2 . x2 . x2 . x2 . x2 . x2 .",
        "x2 . x2 . x2 . x2 . x2 . x2 . x2 . x2 .",
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "b5 - - - - - - - c#6 - - - - - e6 -",
        "e6 - - - - - - - b5 - - - - - d6 -",
        "e6 - - - f#6 - - - e6 - - - d6 - b5 -",
        "a5 - - - - - - - f#5 - - - - - . .",
      ],
      bass: [
        "n2 - n2 - n2 - n2 - n-1 - n-1 - n-1 - n-1 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n2 - n2 - n2 - n2 - n2 - n2 - n2 - n2 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
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
