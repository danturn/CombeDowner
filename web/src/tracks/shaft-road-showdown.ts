import { defineTrack } from "./notation";

// Spaghetti-western metal with gallops and trumpet-call leads: E harmonic minor, 140 bpm.
export default defineTrack({
  name: "Shaft Road Showdown",
  bpm: 140,
  intro: "draw",
  tone: { bright: 1.1, lead: "hollow" },
  riffs: {
    // E gallop answered by C and B, galloping down A, G, F# onto the B chord
    draw: {
      guitar: [
        "x0 . x0 x0 x0 . x0 x0 o8 - - - o7 - - -",
        "x0 . x0 x0 x0 . x0 x0 o5 - - - o7 - o8 -",
        "x0 . x0 x0 x0 . x0 x0 o8 - - - o7 - - -",
        "x5 . x5 x5 x3 . x3 x3 x2 . x2 x2 o7 - - -",
      ],
      drums: "gallop", shift: 5, weight: 3,
    },
    // ringing chords with gallop pickups under a held trumpet call that lands on D#
    bugle: {
      guitar: [
        "o0 - - - - - - - - - - - x0 . x0 x0",
        "o8 - - - - - - - - - - - x8 . x8 x8",
        "o5 - - - - - - - o7 - - - - - - -",
        "o0 - - - - - - - x0 . x0 x0 o7 - - -",
      ],
      lead: [
        "e5 . e5 e5 b5 - - - - - - - - - - .",
        "c6 - - - - - - - b5 - a5 - g5 - - -",
        "a5 - - - c6 - - - d#6 - - - - - - -",
        "e6 - - - - - - - . . . . b5 - d#5 -",
      ],
      drums: "rock", weight: 2,
    },
    // pairs of muted hits in a three-against-four push, snapping to a D# stab
    posse: {
      guitar: [
        "x0 x0 . x0 x0 . x0 x0 . x0 x0 . o3 - o2 -",
        "x0 x0 . x0 x0 . x0 x0 . x0 x0 . o-1 - - -",
        "x0 x0 . x0 x0 . x0 x0 . x0 x0 . o3 - o5 -",
        "o8 - - - x8 x8 . x8 o7 - - - x7 x7 . x7",
      ],
      drums: { k: "x..x..x..x..x.x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 7,
    },
    // full gallop through E, A, C and B with sixteenth runs and a held leading tone
    duel: {
      guitar: [
        "x0 . x0 x0 x0 . x0 x0 x0 . x0 x0 x0 . x0 x0",
        "x5 . x5 x5 x5 . x5 x5 x5 . x5 x5 x5 . x5 x5",
        "x8 . x8 x8 x8 . x8 x8 x7 . x7 x7 x7 . x7 x7",
        "x0 . x0 x0 x0 . x0 x0 o7 - - - o7 - - -",
      ],
      lead: [
        "e6 . b5 . g5 a5 b5 c6 b5 a5 g5 f#5 g5 . e5 .",
        "a5 . e6 . c6 b5 a5 . e5 f#5 g5 a5 c6 . a5 .",
        "c6 . g5 . e5 g5 c6 . b5 . f#5 . d#5 f#5 b5 .",
        "e6 - - - b5 - - - d#6 - - - - - - -",
      ],
      drums: "gallop", weight: 2,
    },
    // the standoff: long held chords and silence, a lone call echoing over them
    standoff: {
      guitar: [
        "o0 - - - - - - - - - - - . . . .",
        "o8 - - - - - - - o7 - - - - - - -",
        "o0 - - - - - - - - - - - . . . .",
        "o5 - - - - - - - o7 - - - x7 x7 x7 x7",
      ],
      lead: [
        "e6 - - - - - - - - - - - b5 . e6 .",
        "g6 - - - - - f#6 - d#6 - - - - - - -",
        "e6 - - - - - - - - - - - b5 . g5 .",
        "a5 - - - c6 - b5 a5 b5 - - - f#5 - d#5 -",
      ],
      drums: { k: "x.......x.......", s: "............x...", h: "x...x...x...x..." },
    },
    // riding chorus, E and G then A, C and B, climbing F#, G, A, B to the top
    ride: {
      guitar: [
        "o0 - - - - - x0 x0 o3 - - - - - x3 x3",
        "o5 - - - - - x5 x5 o8 - - - o7 - - -",
        "o0 - - - - - x0 x0 o3 - - - - - x3 x3",
        "o2 - - - o3 - - - o5 - - - o7 - - -",
      ],
      drums: { k: "x.....xxx.....xx", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
      shift: 5,
    },
  },
});
