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

// The soundtrack is just the original theme for now. The other tracks stay here to bring back:
// add them to this list.
export const TRACKS = [hadleyArms];

export const SPARE_TRACKS = [
  quarryTunnels, firsFieldFrenzy, ralphAllensRampage, midfordRoadRun,
  bathStoneInferno, tyningTriplets, monktonMayhem, priorParkShuffle, lyncombeLurker,
  shaftRoadShowdown, mulberryParkMeltdown, foxhillFirefight, theLongBarrow, churchRoadChaos,
  byfieldBossFight, entryHillEscape, bloomfieldBunker, summerLaneSiege, combeDownVictoryLap,
];
