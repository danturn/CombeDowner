// What make each everyday car is: the parked ones, the traffic, and the ones you drive off in. Most
// are the modern run-arounds (except that every Golf is a Mk1 GTI); some are old Land Rovers, in their classic colours, a lot of them out
// in the country, where there are few buildings round where they're parked, and the odd one in town.
// Who decides: nobody needs to. Everyone works out the same make from the same map (a parked car,
// from where it stands) or the same number (a car in the traffic), so nothing goes over the network
// for it beyond what already does.
import type { GameMap } from "./map";

/** What the cars are, in the HUD: by number. The Land Rover is the last. */
export const MAKES = ["Ford Fiesta", "Vauxhall Corsa", "Volkswagen Golf GTI", "Ford Focus", "Vauxhall Astra", "Nissan Micra", "Toyota Yaris", "Peugeot 206", "Renault Clio", "Honda Jazz", "Land Rover"];
export const LAND_ROVER = 10;
export const GOLF = 2;
const MODERN = 10;   // the makes before it

/** The Golf GTIs' paint: Mars Red, Diamond Silver, black, Alpine White, Lhasa Green and Helios Blue. */
export const GOLF_PAINT = ["#b3201b", "#a9adb0", "#16171a", "#efefe9", "#3f5d4a", "#4c6f9c"];
/** The Land Rovers' paint: Bronze Green, Pastel Green, Limestone, Marine Blue, Mid Grey, Sand, Poppy Red, Masai Red and Coniston Green. */
export const LR_PAINT = ["#4b5a3c", "#9eb29a", "#d9d3b8", "#2e4a6b", "#7c8184", "#c8b282", "#b3302a", "#7c2420", "#2d4a33"];

/**
 * The shape each make is drawn in (furniture.ts): a little hatchback (Fiesta, Corsa, 206, Clio), a
 * longer family one (Focus, Astra), a tall one-box (Micra, Yaris, Jazz), a Land Rover, or a Mk1 Golf GTI.
 */
const MAKE_SHAPE = [0, 0, 4, 1, 1, 2, 2, 0, 0, 2, 3];
export const CAR_SHAPES = 5;
export const carShape = (make: number) => MAKE_SHAPE[((make % MAKES.length) + MAKES.length) % MAKES.length];

/** A number from 0 to 1 that's always the same for the same two whole numbers. */
function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// how many buildings there are in each 50 m cell of a map, worked out once for each
const CELL = 50;
const crowds = new WeakMap<GameMap, Map<string, number>>();
function buildingsNear(map: GameMap, x: number, y: number): number {
  let cells = crowds.get(map);
  if (!cells) {
    cells = new Map();
    for (const b of map.d.bl ?? []) {
      const p = b.r?.[0]?.[0];
      if (!p) continue;
      const k = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
      cells.set(k, (cells.get(k) ?? 0) + 1);
    }
    crowds.set(map, cells);
  }
  const ci = Math.floor(x / CELL), cj = Math.floor(y / CELL);
  let n = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) n += cells.get(`${ci + i},${cj + j}`) ?? 0;
  return n;
}

/** The make of parked car k of a map, parked at (x, y) in data metres: a Land Rover more often the fewer buildings there are about. */
export function parkedMake(map: GameMap, x: number, y: number, k: number): number {
  const rural = Math.max(0, 1 - buildingsNear(map, x, y) / 18);
  return hash(Math.round(x * 10), Math.round(y * 10)) < 0.03 + 0.4 * rural ? LAND_ROVER : k % MODERN;
}

/** The make of car n in the traffic: now and then a Land Rover. */
export const trafficMake = (n: number) => (hash(n, 7919) < 0.06 ? LAND_ROVER : n % MODERN);
