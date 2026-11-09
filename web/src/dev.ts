// The chat phone's commands (chat.ts), for trying things out: type one on the phone with a / in
// front.
//
//   /idkfa   god mode: nothing hurts you, you have every weapon and they never run dry (again to stop)
//   /day     moves the clock on to midday, for everyone in the game, as F3's "+3 hours" does
//   /spawn   puts a list on the phone of the people, animals, vehicles and things you can bring,
//            5 m in front of you; /spawn cat (or a number off the list) brings one straight away
//   /help    lists these
//
// Who decides what:
// - God mode is yours: you say so in your position updates ("god", game.ts) and the host lets nothing
//   hurt you, as it does while you're smoking one of Jamie's. An older host doesn't know the word,
//   and its blows still land.
// - The clock is the host's, as ever (daylight.ts's clockLink): /day asks them to move it on.
// - Everything spawned is the host's to run, like the rest of its kind: you say what and where
//   ("dv"), and the host brings it (hostSpawn) and sends it round with the others. Players on an older
//   page don't know "dv", so a guest's /spawn needs a host on this version.
import { chatLine, chatPick, type PickItem } from "./chat";
import { skipHours, timeOfDay } from "./daylight";
import { KITS, look, NAUGHTY, RUGBY, CRICKET, SOCIETY, LADDER, CHAIR, GIRL, type NaughtyBoys, type Target } from "./naughtyboys";
import type { Cats } from "./cats";
import type { Pickups, Kind as PickupKind } from "./pickups";
import { SPECS, type VKind, type Vehicles } from "./vehicles";

/** Something /spawn can bring: its word, what the list calls it, and its heading on the list. */
interface Spawnable { id: string; label: string; group: string }

const PEOPLE: [string, string, number][] = [
  ["boy", "Naughty boy", NAUGHTY], ["girl", "Naughty girl, on a night out", GIRL],
  ["rugby", "Rugby lad", RUGBY], ["cricket", "Cricketer", CRICKET],
  ["flaglad", "Flag Lad", SOCIETY], ["ladder", "Flag Lads' ladder man", LADDER], ["gaffer", "The Gaffer", CHAIR],
];
const THINGS: [PickupKind, string][] = [
  ["sniper", "Sniper rifle"], ["ammo", "Tin of rounds"], ["sammo", "Box of sniper rounds"], ["pint", "Pint"],
  ["fizz", "Co-op Bucks Fizz"], ["boost", "Boost"], ["bike", "Bike"], ["bmx", "BMX"], ["blades", "Rollerblades"],
  ["board", "Skateboard"], ["scooter", "Scooter"], ["pogo", "Pogo stick"], ["trolley", "Shopping trolley"], ["ladder", "Ladder"],
];

/** Everything on /spawn's list, in order. */
export const SPAWNS: Spawnable[] = [
  ...PEOPLE.map(([id, label]) => ({ id, label, group: "People" })),
  { id: "cat", label: "Cat", group: "Animals" },
  ...(Object.keys(SPECS) as VKind[]).filter((k) => SPECS[k].paint.length).map((k) => ({ id: "v:" + k, label: SPECS[k].name, group: "Vehicles" })),
  ...THINGS.map(([k, label]) => ({ id: "p:" + k, label, group: "Things" })),
];

/** What the commands need from the game (game.ts). */
export interface DevHooks {
  /** Where you stand and which way you face (scene x, z and yaw), or null if you can't spawn just now (dead). */
  me(): { x: number; z: number; yaw: number } | null;
  /** Bring something: here if we're the host, or ask the host. a: which way it faces. */
  spawn(what: string, x: number, z: number, a: number): void;
  /** God mode went on or off. */
  god(on: boolean): void;
}

const HELP = [
  "/idkfa  God mode, every weapon",
  "/day  Midday, for everyone",
  "/spawn  Bring something, 5 m in front",
  "/help  This list",
];

export class Dev {
  /** God mode: nothing hurts you, and your guns never run dry. */
  god = false;

  constructor(private hooks: DevHooks) {}

  /** A /command off the phone. */
  run(word: string, rest: string) {
    if (word === "idkfa") { this.god = !this.god; this.hooks.god(this.god); chatLine(this.god ? "God mode on. Every weapon, no harm" : "God mode off"); return; }
    if (word === "day") {
      // to noon, the quickest way round the clock
      skipHours(((12 - timeOfDay() * 24) % 24 + 24) % 24);
      chatLine("Midday, for everyone");
      return;
    }
    if (word === "spawn") {
      const q = rest.trim().toLowerCase();
      if (!q) { chatPick("Spawn", SPAWNS.map((s): PickItem => ({ label: s.label, group: s.group, run: () => this.spawn(s) }))); return; }
      const n = Number(q);
      const s = Number.isInteger(n) ? SPAWNS[n - 1]
        : SPAWNS.find((o) => o.id === q || o.id.slice(2) === q || o.label.toLowerCase() === q) ?? SPAWNS.find((o) => o.label.toLowerCase().includes(q));
      if (s) this.spawn(s); else chatLine(`Nothing called "${rest.trim()}" to spawn. /spawn for the list`);
      return;
    }
    if (word === "help" || word === "?") { for (const l of HELP) chatLine(l); return; }
    chatLine(`No command /${word}. /help for the list`);
  }

  /** Bring one, 5 m in front of you. A vehicle stands side on across your view, its near side 5 m off. */
  private spawn(s: Spawnable) {
    const me = this.hooks.me();
    if (!me) { chatLine("Not while you're dead"); return; }
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    const kind = s.id.startsWith("v:") ? s.id.slice(2) as VKind : null;
    const d = 5 + (kind ? SPECS[kind].W / 2 : 0);
    // a vehicle's angle is in the map's own terms (from east, anticlockwise, north up): square to
    // the way you're facing
    const a = Math.atan2(-fz, fx) + Math.PI / 2;
    this.hooks.spawn(s.id, me.x + fx * d, me.z + fz * d, a);
    chatLine(`Spawned: ${s.label}`);
  }
}

/** What the host needs to bring something. */
export interface HostWorld {
  vehicles: Vehicles;
  naughtyBoys: NaughtyBoys;
  cats: Cats;
  pickups: Pickups;
  targets(): Target[];
  /** Send the pickups round now, so the new one shows at once. */
  pickupsChanged(): void;
}

/** Host: bring what someone asked for at (x, z), facing a. Returns false if it couldn't be done
 *  (a word this version doesn't know, or no room left for another of its kind). */
export function hostSpawn(w: HostWorld, what: unknown, x: number, z: number, a: number): boolean {
  if (typeof what !== "string" || ![x, z, a].every(Number.isFinite)) return false;
  if (what === "cat") return w.cats.bring(x, z);
  if (what.startsWith("v:")) {
    const k = what.slice(2) as VKind;
    return Object.hasOwn(SPECS, k) && !!w.vehicles.conjure(k, x, z, a);
  }
  if (what.startsWith("p:")) {
    const k = what.slice(2) as PickupKind;
    if (!THINGS.some(([t]) => t === k)) return false;
    w.pickups.place(x, z, k, 300);
    w.pickupsChanged();
    return true;
  }
  const p = PEOPLE.find(([id]) => id === what);
  if (!p) return false;
  const kind = p[2], got = w.naughtyBoys.bring(x, z, look(kind, Math.floor(Math.random() * (KITS[kind] ?? 1))), 1, w.targets(), undefined, 0)[0];
  // let go at once: they get on with what their kind does, picking a fight with whoever's nearest
  if (got) w.naughtyBoys.release(got.i, got.gen);
  return !!got;
}
