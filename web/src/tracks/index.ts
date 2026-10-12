// Every track in the soundtrack. Each file holds one track in the notation from ./notation.
import bathStoneInferno from "./bath-stone-inferno";
import bloomfieldBunker from "./bloomfield-bunker";
import byfieldBossFight from "./byfield-boss-fight";
import churchRoadChaos from "./church-road-chaos";
import combeDownVictoryLap from "./combe-down-victory-lap";
import entryHillEscape from "./entry-hill-escape";
import firsFieldFrenzy from "./firs-field-frenzy";
import foxhillFirefight from "./foxhill-firefight";
import hadleyArms from "./hadley-arms";
import lyncombeLurker from "./lyncombe-lurker";
import midfordRoadRun from "./midford-road-run";
import monktonMayhem from "./monkton-mayhem";
import mulberryParkMeltdown from "./mulberry-park-meltdown";
import priorParkShuffle from "./prior-park-shuffle";
import quarryTunnels from "./quarry-tunnels";
import ralphAllensRampage from "./ralph-allens-rampage";
import shaftRoadShowdown from "./shaft-road-showdown";
import summerLaneSiege from "./summer-lane-siege";
import theLongBarrow from "./the-long-barrow";
import tyningTriplets from "./tyning-triplets";

import { AWFUL_SPARKS } from "./awful-sparks";

// For now only the Awful Sparks covers play. Set this to true to bring the original 20 back.
const PLAY_ORIGINALS = false;

const ORIGINALS = [
  hadleyArms, quarryTunnels, firsFieldFrenzy, ralphAllensRampage, midfordRoadRun,
  bathStoneInferno, tyningTriplets, monktonMayhem, priorParkShuffle, lyncombeLurker,
  shaftRoadShowdown, mulberryParkMeltdown, foxhillFirefight, theLongBarrow, churchRoadChaos,
  byfieldBossFight, entryHillEscape, bloomfieldBunker, summerLaneSiege, combeDownVictoryLap,
];

export const TRACKS = PLAY_ORIGINALS ? [...ORIGINALS, ...AWFUL_SPARKS] : AWFUL_SPARKS;
