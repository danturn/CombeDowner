// COMBE DOWN WITH ME: the rules of the kitchen, with nothing about drawing or the network in it.
//
// The kitchen is a grid of tiles. Everything that matters to the shift (what's on each counter,
// what each cook is holding, the orders, the clock and the takings) lives in one small object, the
// Shift, which only the host changes (see game.ts). Everyone else is sent a copy about ten times a
// second and just draws it, so these functions run on the host alone.

/** The back of the Darling Deli Kitchen, looking in from the shop. Row 0 is the back wall.
 *  . floor   # counter   K chopping board   H hob   O oven   P clean plates   S the pass (serve)
 *  X bin     b c t p e d crates of bread, cheddar, tomatoes, bacon, eggs and Bath bun dough */
export const LAYOUT = [
  "#bct##SS##P#",
  "#..........#",
  "K..........X",
  "K..#KK##...#",
  "#..#####...H",
  "H..........H",
  "#..........O",
  "#ped#####O##",
];
export const W = LAYOUT[0].length, H = LAYOUT.length;
export const tileAt = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? "#" : LAYOUT[j][i]);
export const walkable = (i: number, j: number) => tileAt(i, j) === ".";
/** Where each cook starts, in tile units (x across, y down from the back wall). */
export const STARTS = [[1.5, 1.5], [10.5, 1.5], [1.5, 6.5], [10.5, 6.5]];

export type Food = "bread" | "cheddar" | "tomato" | "bacon" | "egg" | "dough";
export const CRATES: Record<string, Food> = { b: "bread", c: "cheddar", t: "tomato", p: "bacon", e: "egg", d: "dough" };
/** How each food gets ready: chopped on a board, fried on a hob or baked in the oven. */
export const PREP: Record<Food, "chop" | "hob" | "oven"> = { bread: "chop", cheddar: "chop", tomato: "chop", bacon: "hob", egg: "hob", dough: "oven" };
/** What it's called raw and ready, for the tickets. */
export const NAMES: Record<Food, [string, string]> = {
  bread: ["Loaf", "Sliced bread"], cheddar: ["Somerset cheddar", "Sliced cheddar"], tomato: ["Tomato", "Chopped tomato"],
  bacon: ["Bacon", "Crispy bacon"], egg: ["Egg", "Fried egg"], dough: ["Bun dough", "Bath bun"],
};
export const CHOP_TIME = 1.6;    // seconds of chopping
export const COOK_TIME: Record<string, number> = { hob: 7, oven: 9 };
export const BURN_TIME: Record<string, number> = { hob: 8, oven: 9 };   // seconds after it's ready before it burns

export interface Recipe { name: string; needs: Food[]; blurb: string }
export const RECIPES: Recipe[] = [
  { name: "Bath Bun", needs: ["dough"], blurb: "Sticky, with sugar on top" },
  { name: "Bacon Butty", needs: ["bread", "bacon"], blurb: "Crispy, on sliced bread" },
  { name: "Ploughman's", needs: ["bread", "cheddar"], blurb: "Somerset cheddar and bread" },
  { name: "Cheese & Tomato Sarnie", needs: ["bread", "cheddar", "tomato"], blurb: "A Firs Field picnic" },
  { name: "The Full Combe Down", needs: ["bacon", "egg", "tomato"], blurb: "The Hadley Arms hangover cure" },
];

/** Something on a counter or in a cook's hands. A plate carries ready food in `on`. */
export interface Item {
  k: Food | "plate";
  s?: number;        // 0 raw, 1 ready, 2 burnt
  p?: number;        // how far along it is: chopping, cooking, or towards burning once it's ready
  on?: Food[];
}
export interface Order { id: number; r: number; t: number; T: number }

export interface Shift {
  ph: number;                       // 0 the kitchen's open for a look round, 1 counting in, 2 cooking, 3 closed
  t: number;                        // seconds left in the shift, or of the count-in
  sc: number; ok: number; bad: number;
  o: Order[]; nid: number; next: number;
  it: Record<number, Item>;         // what's on each tile, by j * W + i
  h: Record<string, Item | null>;   // what each cook holds
  n: number;                        // which shift this is, so a new one clears everyone's screen
  ev?: [string, number][];          // things that just happened, for sounds and pop-ups: kind, tile
}

export const SHIFT_TIME = 180;
export const MAX_ORDERS = 4;
export const STARS = [60, 140, 240];

export function newShift(n = 0): Shift {
  return { ph: 0, t: 0, sc: 0, ok: 0, bad: 0, o: [], nid: 1, next: 1.5, it: {}, h: {}, n };
}

const ready = (it: Item) => it.k !== "plate" && it.s === 1;
const isFood = (it: Item | null | undefined): it is Item & { k: Food } => !!it && it.k !== "plate";

/** A plate can take this food if what's on it then still makes something on the menu. */
export function fits(on: Food[], f: Food) {
  if (on.includes(f)) return false;
  const want = [...on, f];
  return RECIPES.some((r) => want.every((w) => r.needs.includes(w)));
}
/** Which dish a plate is, if it's finished. */
export function dishOf(on: Food[] | undefined) {
  if (!on?.length) return -1;
  return RECIPES.findIndex((r) => r.needs.length === on.length && r.needs.every((n) => on.includes(n)));
}

function place(tile: string, it: Item) {
  if (tile === "#" || tile === "K") return true;
  if (tile === "H") return isFood(it) && PREP[it.k] === "hob";
  if (tile === "O") return isFood(it) && PREP[it.k] === "oven";
  return false;
}

/** A cook grabs or puts down at a tile. Returns what happened, for a sound (or "" for nothing). */
export function use(S: Shift, who: string, idx: number): string {
  const i = idx % W, j = Math.floor(idx / W), tile = tileAt(i, j);
  if (tile === "." || S.ph === 3) return "";
  const held = S.h[who] ?? null, on = S.it[idx] ?? null;
  const ev = (k: string) => { (S.ev ??= []).push([k, idx]); return k; };
  if (tile in CRATES) {
    if (held) return "";
    S.h[who] = { k: CRATES[tile], s: 0, p: 0 };
    return ev("grab");
  }
  if (tile === "P") {
    if (held) return "";
    S.h[who] = { k: "plate", on: [] };
    return ev("plate");
  }
  if (tile === "X") {
    if (!held) return "";
    if (held.k === "plate") held.on = []; else S.h[who] = null;
    return ev("bin");
  }
  if (tile === "S") {
    if (held?.k !== "plate" || !held.on?.length) return "";
    if (S.ph !== 2) return "";
    const d = dishOf(held.on);
    // the order that's been waiting longest for this dish
    const o = S.o.filter((o) => o.r === d).sort((a, b) => a.t - b.t)[0];
    if (!o) return ev("nope");
    S.o = S.o.filter((x) => x !== o);
    const tip = Math.ceil((o.t / o.T) * 3) * 3;
    S.sc += 20 + 8 * RECIPES[d].needs.length + tip;
    S.ok++;
    S.h[who] = null;   // the plate goes out with the food; there's always another on the rack
    return ev("serve");
  }
  // a counter, a board, a hob or the oven
  if (!held && on) { S.h[who] = on; delete S.it[idx]; return ev("pick"); }
  if (held && !on) {
    if (!place(tile, held)) return "";
    S.it[idx] = held; S.h[who] = null;
    return ev("put");
  }
  if (held && on) {
    // food onto a plate, whichever of the two you're holding
    if (held.k === "plate" && isFood(on) && ready(on) && fits(held.on!, on.k)) { held.on!.push(on.k); delete S.it[idx]; return ev("plate"); }
    if (on.k === "plate" && isFood(held) && ready(held) && fits(on.on!, held.k)) { on.on!.push(held.k); S.h[who] = null; return ev("plate"); }
  }
  return "";
}

/** One step of the shift, on the host. `chopping` is which board each cook is working at, if any. */
export function tick(S: Shift, dt: number, chopping: number[], cooks: number) {
  if (S.ph === 1) {
    S.t -= dt;
    if (S.t <= 0) { S.ph = 2; S.t = SHIFT_TIME; S.next = 1; }
    return;
  }
  // chopping, cooking and burning go on whenever the kitchen's open, so you can practise first
  for (const idx of chopping) {
    const it = S.it[idx];
    if (!isFood(it) || PREP[it.k] !== "chop" || it.s !== 0 || tileAt(idx % W, Math.floor(idx / W)) !== "K") continue;
    it.p = (it.p ?? 0) + dt / CHOP_TIME;
    if (it.p >= 1) { it.s = 1; it.p = 0; (S.ev ??= []).push(["chopped", idx]); }
  }
  for (const key in S.it) {
    const idx = Number(key), it = S.it[idx], tile = tileAt(idx % W, Math.floor(idx / W));
    if (!isFood(it) || (tile !== "H" && tile !== "O")) continue;
    const kind = tile === "H" ? "hob" : "oven";
    if (PREP[it.k] !== kind || it.s === 2) continue;
    if (it.s === 0) {
      it.p = (it.p ?? 0) + dt / COOK_TIME[kind];
      if (it.p >= 1) { it.s = 1; it.p = 0; (S.ev ??= []).push(["done", idx]); }
    } else {
      it.p = (it.p ?? 0) + dt / BURN_TIME[kind];
      if (it.p >= 1) { it.s = 2; it.p = 0; (S.ev ??= []).push(["burnt", idx]); }
    }
  }
  if (S.ph !== 2) return;
  S.t -= dt;
  for (const o of S.o) o.t -= dt;
  const gone = S.o.filter((o) => o.t <= 0);
  if (gone.length) {
    S.o = S.o.filter((o) => o.t > 0);
    S.bad += gone.length;
    S.sc = Math.max(0, S.sc - 10 * gone.length);
    (S.ev ??= []).push(["late", -1]);
  }
  S.next -= dt;
  if (S.next <= 0 && S.o.length < MAX_ORDERS) {
    // early on, the simple things; later, anything
    const elapsed = SHIFT_TIME - S.t;
    const pool = elapsed < 30 ? 3 : RECIPES.length;
    const r = Math.floor(Math.random() * pool);
    const T = 50 + 14 * RECIPES[r].needs.length;
    S.o.push({ id: S.nid++, r, t: T, T });
    // more cooks, busier kitchen
    S.next = Math.max(8, 22 - 3 * cooks) * (0.8 + Math.random() * 0.4);
    (S.ev ??= []).push(["order", -1]);
  } else if (S.next <= 0) S.next = 2;
  if (S.t <= 0) { S.t = 0; S.ph = 3; (S.ev ??= []).push(["end", -1]); }
}

/** Start counting in a new shift: the counters are cleared and everyone's hands emptied. */
export function begin(S: Shift) {
  const n = S.n + 1;
  Object.assign(S, newShift(n), { ph: 1, t: 3 });
}

export function stars(sc: number) { return STARS.filter((s) => sc >= s).length; }
