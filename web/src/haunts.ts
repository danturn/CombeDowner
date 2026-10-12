// Where things happen: street corners, alleys, bus stops, shop fronts and pubs. Chavs hang about
// at these (Fox Hill most of all, and outside the Hadley Arms), and pickups turn up at the corners
// and outside the shops.
import { GameMap, PATHS } from "./map";

export type HauntKind = "corner" | "alley" | "bus" | "shop" | "pub";
export interface Haunt { x: number; z: number; kind: HauntKind; name: string; foxhill: boolean }

const FOXHILL_REACH = 250;   // metres from Fox Hill itself that count as the estate

const cache = new WeakMap<GameMap, Haunt[]>();

/** The nearest open ground to (x, z) within r metres, so nothing stands in a wall or a tree. */
export function clearSpot(map: GameMap, x: number, z: number, r = 8): [number, number] | null {
  for (let d = 0; d <= r; d++) {
    for (let k = 0, n = d ? 12 : 1; k < n; k++) {
      const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!map.blocked(px, pz, 0.6)) return [px, pz];
    }
  }
  return null;
}

export function haunts(map: GameMap): Haunt[] {
  const hit = cache.get(map);
  if (hit) return hit;
  const D = map.d, lim = map.field * 0.9, out: Haunt[] = [];
  const fox = D.rd.filter((r) => r.n === "Fox Hill").flatMap((r) => r.p.map((p) => [p[0], -p[1]]));
  const add = (kind: HauntKind, x: number, z: number, name = "", spread = 0) => {
    const a = Math.random() * Math.PI * 2;
    const s = clearSpot(map, x + Math.cos(a) * spread, z + Math.sin(a) * spread);
    if (!s || Math.hypot(s[0], s[1]) > lim) return;
    const foxhill = fox.some(([fx, fz]) => Math.hypot(fx - s[0], fz - s[1]) < FOXHILL_REACH);
    out.push({ x: s[0], z: s[1], kind, name, foxhill });
  };

  // street corners: where two streets meet, or three bits of street, nudged off the junction onto a corner
  const seen = new Map<string, Set<number>>();
  D.rd.forEach((r, i) => {
    if (PATHS.has(r.c)) return;
    for (const [x, y] of r.p) {
      const k = `${Math.round(x)},${Math.round(y)}`;
      (seen.get(k) ?? seen.set(k, new Set()).get(k)!).add(i);
    }
  });
  for (const [k, roads] of seen) {
    const names = new Set([...roads].map((i) => D.rd[i].n));
    if (roads.size < 3 && names.size < 2) continue;   // just one street split in two
    const [x, y] = k.split(",").map(Number);
    add("corner", x, -y, "", 6);
  }
  // alleys: service lanes and footpaths, every 30 m or so
  for (const r of D.rd) {
    if (r.c !== "service" && r.c !== "footway" && r.c !== "path" && r.c !== "steps") continue;
    let run = 15;
    for (let i = 1; i < r.p.length; i++) {
      run += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
      if (run >= 30) { run = 0; add("alley", r.p[i][0], -r.p[i][1]); }
    }
  }
  for (const f of D.fx ?? []) if (f[0] === "bus") add("bus", +f[1], -f[2], String(f[5] ?? ""), 1.5);
  // in front of a sign: its local +z faces out, which is (sin a, cos a) in the scene
  for (const [x, y, , a, , name, style] of D.sh ?? []) {
    add(style === "pub" ? "pub" : "shop", +x + Math.sin(+a) * 3, -y + Math.cos(+a) * 3, String(name));
  }
  cache.set(map, out);
  return out;
}
