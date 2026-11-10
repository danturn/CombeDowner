// Every track in the soundtrack. Each file holds one track in the notation from ./notation.
import { AWFUL_SPARKS } from "./awful-sparks";
import bathStoneInferno from "./bath-stone-inferno";
import bloomfieldBunker from "./bloomfield-bunker";
import byfieldBossFight from "./byfield-boss-fight";
import churchRoadChaos from "./church-road-chaos";
import combeDownVictoryLap from "./combe-down-victory-lap";
import elevensesAtTheDeli from "./elevenses-at-the-deli";
import entryHillEscape from "./entry-hill-escape";
import firsFieldFrenzy from "./firs-field-frenzy";
import firstLightOnSolsburyHill from "./first-light-on-solsbury-hill";
import foxesAtFour from "./foxes-at-four";
import foxhillFirefight from "./foxhill-firefight";
import goldenHourRainbowWood from "./golden-hour-rainbow-wood";
import hadleyArms from "./hadley-arms";
import highNoonOnNorthRoad from "./high-noon-on-north-road";
import lastOrders from "./last-orders";
import lyncombeLurker from "./lyncombe-lurker";
import midfordRoadRun from "./midford-road-run";
import monktonMayhem from "./monkton-mayhem";
import mulberryParkMeltdown from "./mulberry-park-meltdown";
import priorParkShuffle from "./prior-park-shuffle";
import quarryTunnels from "./quarry-tunnels";
import ralphAllensRampage from "./ralph-allens-rampage";
import schoolRunStampede from "./school-run-stampede";
import shaftRoadShowdown from "./shaft-road-showdown";
import summerLaneSiege from "./summer-lane-siege";
import theLampsComeOn from "./the-lamps-come-on";
import theLongBarrow from "./the-long-barrow";
import threeOclockLull from "./three-oclock-lull";
import tyningTriplets from "./tyning-triplets";
import witchingHourOnTheSkyline from "./witching-hour-on-the-skyline";

// The soundtrack: the original theme, then a track for each part of the day, in the order the day
// goes. Those each have an hour and come up most often round it (music.ts). The other tracks, and
// the Awful Sparks covers, stay here to bring back: add them to this list.
export const TRACKS = [
  hadleyArms,
  firstLightOnSolsburyHill, schoolRunStampede, elevensesAtTheDeli, highNoonOnNorthRoad, threeOclockLull,
  goldenHourRainbowWood, theLampsComeOn, lastOrders, witchingHourOnTheSkyline, foxesAtFour,
];

export const SPARE_TRACKS = [
  ...AWFUL_SPARKS, quarryTunnels, firsFieldFrenzy, ralphAllensRampage, midfordRoadRun,
  bathStoneInferno, tyningTriplets, monktonMayhem, priorParkShuffle, lyncombeLurker,
  shaftRoadShowdown, mulberryParkMeltdown, foxhillFirefight, theLongBarrow, churchRoadChaos,
  byfieldBossFight, entryHillEscape, bloomfieldBunker, summerLaneSiege, combeDownVictoryLap,
];
