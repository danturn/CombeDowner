import { defineTrack } from "../notation";

// Football on TV: the feel of the original (drums, bass and guitar voted across every repeat of each
// section of the recording), played in the song's order, with a new lead melody written for each section.
export default defineTrack({
  name: "Football on TV",
  artist: "Awful Sparks",
  bpm: 148,
  key: 2,
  intro: "s1",
  tone: { lead: "brass", bass: "pick", bright: 1.1 },
  form: ["~s1", "~s1", "s1", "s1", "s1", "s1", "s2", "s2", "s2", "s2", "~s1", "s1", "s3", "s1", "s2", "s2", "s2", "s2", "s4", "s4", "~s4", "s4", "s5", "s5", "s6"],
  riffs: {
    // 4 bars, heard 9x; roots per half bar: A# A# | G# G | C# C# | G# F#
    s1: {
      guitar: [
        "o4 - - - x4 - x4 - x4 - x4 - x4 - x4 -",
        "x4 - o2 - - - x2 - o1 - - - - - - -",
        "o7 - - - x7 - x7 - x7 - o7 - - - x5 -",
        "o5 - - - - - x2 - o0 - - o0 - - - -",
      ],
      lead: [
        "a#4 - - - c#5 - - - f5 - - - c#5 - a#4 -",
        "g#4 - - - b4 - d#5 - - - . . b4 - - -",
        "c#5 - - - . . f5 - g#5 - - - f5 - c#5 -",
        "d#5 - - - c#5 - b4 - a#4 - - - - - . .",
      ],
      bass: [
        "n4 - - - - - . . n4 - - - . . n4 n4",
        "- - n2 . . . n2 - n1 - - - n1 - - .",
        "n7 - - - n7 - . . n7 n7 - - . . n5 -",
        "- - . . . . n2 - n0 - - - n0 - - .",
      ],
      drums: [
        { k: "x.......x.x...x.", s: "....x.......x...", h: "x...x...x.x.x.x." },
        { k: "..x...x.........", s: "..x.x...x...x...", h: "x.x.x...x...x..." },
        { k: "x.......x.x...x.", s: "....x.......x...", h: "..x.x...x.x.x..." },
        { k: "..x...x.........", s: "..x.x...x...x...", h: "..x.x...x...x..." },
      ],
    },
    // 4 bars, heard 8x; roots per half bar: F# F# | F# F# | C# C# | B B
    s2: {
      guitar: [
        "o0 - - x0 - x0 - o0 - - - x0 - o0 - -",
        ". . . x0 - o0 - - x0 - x0 - x0 - x0 -",
        "o-5 - - - - - x-5 - x-5 - o-5 - - - - x-5",
        "x5 - o5 - - - o5 - - x5 - o5 - - x5 -",
      ],
      lead: [
        "f#5 - - - a#5 - - - c#6 - - - a#5 - - -",
        "c#6 - - - - - a#5 - g#5 - f#5 - - - . .",
        "g#5 - - - f5 - - - g#5 - c#6 - - - a#5 -",
        "b5 - - - a#5 - g#5 - f#5 - - - d#5 - - -",
      ],
      bass: [
        "n0 - n0 - n0 - n0 - - - n0 - n0 - n0 -",
        "n0 - n0 - n0 - n0 - n0 - n0 - n0 - . .",
        "n-5 - n-5 - n-5 - n-5 - n-5 - n-5 - n-5 - n-5 .",
        "n5 - n5 - n5 - n5 - - - n5 - n5 n5 . .",
      ],
      drums: [
        { k: "x.......x.x.....", s: "....x.......x...", h: "x...x...x.x.x..." },
        { k: "x.......x.x...x.", s: "x...x.....x.x...", h: "x.x.x...x.x.x.x." },
        { k: "x.......x.x.....", s: "....x.......x...", h: "....x...x.x.x..." },
        { k: "x.......x.x.....", s: "....x...x...x...", h: "x...x...x.x.x..." },
      ],
    },
    // 4 bars, heard 1x; roots per half bar: A# A# | A# G | C# C# | B F#
    s3: {
      guitar: [
        "o4 - - - x4 - x2 - x4 - x4 - x4 - x4 x4",
        "o4 - - - - x4 - x2 - o1 - - x1 - x7 -",
        "x7 - o7 - - - x2 - x7 - o7 - - - x5 -",
        ". x5 - x5 - x5 x2 x2 x0 o0 - - - x0 - x0",
      ],
      lead: [
        ". . . . a#4 - - - c#5 - - - . . . .",
        "f5 - - - - - . . b4 - - - - - . .",
        "c#5 - - - g#4 - - - f5 - - - - - . .",
        "d#5 - - - b4 - - - c#5 - - - - - - -",
      ],
      bass: [
        "n4 n4 - - n4 . n2 - n4 n4 - - . . . n4",
        "- - . . . . . n2 . n1 - - n1 - n7 .",
        "n7 - n7 n7 - . n2 . n7 - - - . . n5 n5",
        "- - . . . n5 n2 - n0 - n0 - n0 - n0 .",
      ],
      drums: [
        { k: "x.......x.x...x.", s: "....x.......x.x.", h: "....x.x.x.x.x.x." },
        { k: "..x...x...x...x.", s: "..x.x...x...x...", h: "..x.x...xx..x..." },
        { k: "........x.x...x.", s: "....x.......x.x.", h: "x...x..x..x.x.xx" },
        { k: "..x...x.........", s: "..x.x...x...x...", h: "..x.x...x...x..." },
      ],
    },
    // 4 bars, heard 4x; roots per half bar: A# A# | A# A# | B B | B B
    s4: {
      guitar: [
        "x4 o4 - - x4 - x4 x4 x4 - x4 - x2 x2 x4 -",
        "x4 o4 - - - - x4 - o4 - - x4 - x4 x4 -",
        "x7 x7 - o7 - - x2 x5 x7 x7 x7 - x5 - x5 x5",
        ". x5 o5 - - - x5 - x5 x5 - x5 - o5 - -",
      ],
      lead: [
        "a#5 - - - - - - - f5 - a#5 - c#6 - - -",
        "c#6 - a#5 - f5 - - - c#5 - - - f5 - - -",
        "f#5 - - - - - - - d#5 - f#5 - b5 - - -",
        "a#5 - - - f#5 - - - d#5 - c#5 - b4 - - -",
      ],
      bass: [
        "n4 - n4 - n4 . . n4 n4 - n4 - n2 . n4 -",
        "n4 - n4 - - n4 - n4 n4 - n4 - n4 - n4 .",
        "n7 - n7 - n7 - n2 n5 n7 - n7 - n5 . . n5",
        "n5 - n5 - n5 - - - - n5 - - n5 - - -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x...", h: "....x.......x.x." },
        { k: "x.......x.......", s: "....x.......x...", h: "x...x.x.x...x..." },
        { k: "x.......x.......", s: "....x.......x...", h: "x...x.......x..." },
        { k: "x...x...x.......", s: "....x...x.x.x.x.", h: "....x.x...x.x..." },
      ],
    },
    // 4 bars, heard 2x; roots per half bar: A# A# | A# A# | C# C# | B B
    s5: {
      guitar: [
        "x4 x4 - x4 x4 - x4 x4 x4 x4 - x4 x2 x2 x2 x4",
        "x4 - x2 x2 - x2 x2 - x4 o4 - - - x4 - x4",
        "x7 x7 - x7 - x7 x7 x7 x7 x7 - x7 x7 x7 x5 x5",
        ". x5 x5 x5 - x5 - x5 x5 x5 x5 x5 x5 x5 x5 -",
      ],
      lead: [
        "f5 - - - a#5 - - - c#6 - - - - - - -",
        "c#6 - - - a#5 - g#5 - f5 - - - c#5 - - -",
        "g#5 - - - - - - - f5 - g#5 - c#6 - - -",
        "b5 - - - - - a#5 - g#5 - - - f#5 - - -",
      ],
      bass: [
        "n4 n4 - - n4 . . . n4 - - - n2 . . n4",
        "n4 . n2 . . . . . n4 - - - n4 n4 n4 .",
        "n7 - - - - n7 . . n7 - - . . . n5 n5",
        "- . . . . n5 . . . n5 - - n5 - - -",
      ],
      drums: [
        { k: "x.......x.......", s: "....x.......x..x", h: "....x..x....x..x" },
        { k: "x.......x..x....", s: "....x.....x.x...", h: "x...x.....x.x.x." },
        { k: "x...x...x.x.x...", s: "....x.......x...", h: "....x...x...x..." },
        { k: "x...x...x.......", s: "....x...x.x.x.x.", h: "....x...x.x.x.x." },
      ],
    },
    // 4 bars, heard 1x; roots per half bar: A# G# | G# D# | G# D | - -
    s6: {
      guitar: [
        "o4 - - x4 - x4 - x4 - o2 - - x2 - x2 x2",
        ". . x2 - x2 - x2 - x2 - o2 - - - x-3 x2",
        ". . . o2 - - x2 - x2 x8 x9 - o8 - - -",
        "o8 - - x8 . . x8 - . . . . . . . .",
      ],
      bass: [
        "n4 - n4 - - - - - - n2 - - - - - -",
        "- - - - - n2 - - . . . . . . n-3 n2",
        "- - - . . . n2 - n2 n8 n9 - n8 - . .",
        ". . . . . . . . . . . . . . . .",
      ],
      drums: [
        { k: "................", s: "x...............", h: "x..............." },
        { k: "................", s: "................", h: "................" },
        { k: "................", s: "................", h: "................" },
        { k: "................", s: "................", h: "................" },
      ],
    },
  },
});
