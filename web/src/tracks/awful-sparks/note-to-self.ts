import { defineTrack } from "../notation";

// Note To Self: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order.
export default defineTrack({
  name: "Note To Self",
  artist: "Awful Sparks",
  bpm: 157,
  key: -5,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["~s1", "~s1", "s2", "s2", "s2", "s2", "s1", "s3", "s3", "s3", "s3", "s1", "s1", "~s1", "s4", "s4", "s1", "s5"],
  riffs: {
    // 4 bars, heard 7x; roots per beat: B B B B | B B B B | B B B B | B B B B
    s1: {
      guitar: [
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "b4 - - - d#5 - - - f#5 - - - d#5 - f#5 -",
        "f#5 - - - g#5 - f#5 - d#5 - - - - - . .",
        "b5 - - - - - g#5 - f#5 - - - d#5 - c#5 -",
        "d#5 - - - c#5 - - - b4 - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
      ],
      drums: [
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 4x; roots per beat: E E E E | G# G# A A | B B B B | B B B B
    s2: {
      guitar: [
        "o5 . x5 . x5 . x5 . x5 . x5 . x5 . x5 .",
        "o9 . x9 . x9 . x9 . o10 . x10 . x10 . x10 .",
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
      ],
      lead: [
        "g#4 - - - - - b4 - e5 - - - - - . .",
        "d#5 - - - . . b4 - c#5 - - - e5 - - -",
        "d#5 - - - c#5 - b4 - f#5 - - - - - - -",
        "d#5 - - - b4 - - - - - - - f#4 - - -",
      ],
      bass: [
        "n5 - n5 - n5 - n5 - n5 - n5 - n5 - n5 -",
        "n9 - n9 - n9 - n9 - n10 - n10 - n10 - n10 -",
        "n12 - n12 - n12 - n12 - n12 - n12 - n12 - n12 -",
        "n12 - n12 - n12 - n12 - n12 - n12 - n12 - n12 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 4x; roots per beat: B B B B | B B B B | E E E E | A A A A
    s3: {
      guitar: [
        "o0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "x0 . x0 . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o5 . x5 . x5 . x5 . x5 . x5 . x5 . x5 .",
        "o10 . x10 . x10 . x10 . x10 . x10 . x10 . x10 .",
      ],
      lead: [
        "f#5 - - - - - d#5 - b4 - - - d#5 - f#5 -",
        "b5 - - - g#5 - - - f#5 - - - - - . .",
        "g#5 - - - - - e5 - b5 - - - g#5 - - -",
        "c#6 - - - a5 - - - e5 - - - - - . .",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n5 - n5 - n5 - n5 - n5 - n5 - n5 - n5 -",
        "n10 - n10 - n10 - n10 - n10 - n10 - n10 - n10 -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      ],
    },
    // 4 bars, heard 2x; roots per beat: B B B B | F# F# F# F# | B B B B | F# F# F# F#
    s4: {
      guitar: [
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o7 - - . x7 . x7 . x7 . x7 . x7 . x7 .",
        "o0 - - . x0 . x0 . x0 . x0 . x0 . x0 .",
        "o7 - - . x7 . x7 . x7 . x7 . x7 . x7 .",
      ],
      lead: [
        "b5 - - - - - - - f#5 - b5 - d#6 - - -",
        "c#6 - - - - - a#5 - f#5 - - - - - . .",
        "b5 - - - - - - - f#5 - b5 - f#6 - - -",
        "f#6 - - - e6 - c#6 - a#5 - - - - - - -",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n7 - n7 - n7 - n7 - n7 - n7 - n7 - n7 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - n0 -",
        "n7 - n7 - n7 - n7 - n7 - n7 - n7 - n7 -",
      ],
      drums: [
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
        { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.o." },
      ],
    },
    // 4 bars, heard 1x; roots per beat: B B B B | E E E E | E E E E | E E E E
    s5: {
      guitar: [
        "o0 - - - - - - - - - - - - - - -",
        "o5 - - - - - - - - - - - - - - -",
        "o5 - - - - - - - - - - - - - - -",
        "o5 - - - - - - - - - - - - - - -",
      ],
      bass: [
        "n0 - - - - - - - n0 - - - - - - -",
        "n5 - - - - - - - n5 - - - - - - -",
        "n5 - - - - - - - n5 - - - - - - -",
        "n5 - - - - - - - n5 - - - - - - -",
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
