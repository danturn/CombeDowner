// The bus routes you can drive (busdriver.ts), as the places each goes through in turn: kept on their own so
// the vehicles (vehicles.ts) know where they run too, and don't leave a bus waiting at a stop along them.
//
// Nothing here goes over the network: every player has the same routes.

/** First's route 2 as it really runs, round from the bus station and back (OpenStreetMap's route 18468181,
 *  "Bus 2: City Centre ↔ Fox Hill"): out by Widcombe, Prior Park Road, Ralph Allen Drive, The Avenue,
 *  Church Road and Combe Road, through Combe Down to Fox Hill and round Queen's Drive and Hawthorn Grove,
 *  and back by Bradford Road and North Road. A point every 60 m or so, data metres east and north. */
const ROUTE_2 = "-944,1726,-1006,1730,-1058,1702,-1023,1652,-976,1619,-912,1618,-845,1597,-774,1590,-721,1576,-646,1564,-581,1562,-530,1482,-499,1430,-466,1376,-392,1260,-362,1173,-306,1128,-253,1094,-156,998,-86,898,-62,820,-74,675,-55,481,-50,417,-58,316,-41,256,-13,182,9,26,-11,-61,-47,-145,-74,-209,-99,-265,-122,-321,-152,-353,-225,-375,-300,-395,-361,-372,-412,-316,-452,-259,-549,-258,-603,-256,-632,-134,-657,-47,-696,-29,-789,-35,-785,25,-781,98,-836,132,-910,136,-970,122,-993,-15,-1003,-82,-1055,-192,-1051,-253,-947,-236,-876,-236,-816,-241,-799,-138,-792,-66,-744,-39,-683,-25,-648,-78,-610,-206,-579,-254,-475,-238,-326,-166,-225,-113,-156,-76,-65,-25,-1,9,-2,125,-29,223,-54,288,-53,375,-52,447,-75,645,-59,782,-66,850,-146,986,-222,1063,-279,1114,-335,1140,-371,1216,-439,1337,-499,1430,-530,1482,-567,1543,-540,1594,-535,1644,-593,1621,-652,1611,-712,1603,-771,1577,-831,1579,-891,1604,-990,1610,-1055,1622,-1120,1632,-1092,1664,-1077,1711,-1128,1739,-1114,1804,-1058,1819,-1018,1771,-1020,1713,-977,1693,-919,1713,-944,1726".split(",").map(Number).reduce((a: number[][], v, i, all) => (i % 2 ? a : [...a, [v, all[i + 1]]]), []);
/** The routes, as the places they go through in turn (data metres east and north): out to the end and
 *  back the same way, or (loop) right round, the way back being its own. */
export const ROUTES: { n: string; end: string; via: number[][]; loop?: boolean }[] = [
  { n: "2", end: "Fox Hill", via: ROUTE_2, loop: true },
  { n: "4", end: "Lansdown", via: [[-950, 1728], [-826, 1850], [-832, 1990], [-880, 2200], [-985, 2270], [-1040, 2380], [-1170, 2490], [-1300, 3100], [-1700, 4170], [-3270, 5747]] },
];
export const MAP = "combe-down";      // the map they're on
/** Where each route runs on a map (scene x, z), for the zones to open them once one is open all the way (zones.ts). */
export const busRouteSpots = (mapId: string): [number, number][][] => (mapId === MAP ? ROUTES.map((r) => r.via.map(([x, y]) => [x, -y] as [number, number])) : []);

/** Whether scene (x, z) is a bus stop along one of the routes (within reach of the line between its points). */
export function onRoute(mapId: string, x: number, z: number, reach = 30): boolean {
  if (mapId !== MAP) return false;
  for (const r of ROUTES) for (let k = 0; k + 1 < r.via.length; k++) {
    const [ax, ay] = r.via[k], [bx, by] = r.via[k + 1], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
    const f = Math.max(0, Math.min(1, ((x - ax) * vx + (-z - ay) * vy) / l2));
    if (Math.hypot(x - ax - vx * f, -z - ay - vy * f) < reach) return true;
  }
  return false;
}
