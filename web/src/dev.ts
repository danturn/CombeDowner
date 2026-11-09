// The chat phone's commands (chat.ts), for trying things out: type one on the phone with a / in
// front.
//
//   /idkfa   god mode: nothing hurts you, you have every weapon and they never run dry (again to stop)
//   /sunrise, /day, /noon, /sunset, /night, /midnight
//            move the clock on to six in the morning, ten, twelve, quarter to eight at night, eleven
//            and midnight, for everyone in the game, as F3's "+3 hours" does
//   /fridaynight  moves the clock on to nine on the next Friday night, when the town's out (nightOut)
//   /time    says the time and the day; /time 21:30 moves the clock on to then
//   /bonfire builds Get Wood's bonfire and makes it dark, as F3's "Bonfire night" does
//   /pub     puts a list of the pubs on the phone, nearest first, and takes you to the one you pick;
//            /pub bell (part of a name) goes straight there, as the big map's pub cards do
//   /goto    takes you to east,north (data metres), or to a spot from a link Shift+F3 or /where copied
//   /where   copies where you are, with a link back to the spot, as Shift+F3 does
//   /spawn   puts a list on the phone of the people, animals, vehicles and things you can bring,
//            5 m in front of you; /spawn cat (or a number off the list) brings one straight away
//   /drone   flies you about as a camera drone, and takes snaps of what's wrong to paste to Claude
//            Code (drone.ts says how); /drone copy, /drone pic 3 and /drone clear do the rest
//   /help    lists these (and so does /?)
//
// Who decides what:
// - God mode is yours: you say so in your position updates ("god", game.ts) and the host lets nothing
//   hurt you, as it does while you're smoking one of Jamie's. An older host doesn't know the word,
//   and its blows still land.
// - The clock is the host's, as ever (daylight.ts's clockLink): /day and the rest ask them to move it
//   on. It only ever goes forward, through the week, so /noon at one in the afternoon is tomorrow's.
// - /pub and /goto only move you, as going to a pub from the big map does: everyone else sees you there.
// - Everything spawned is the host's to run, like the rest of its kind: you say what and where
//   ("dv"), and the host brings it (hostSpawn) and sends it round with the others. Players on an older
//   page don't know "dv", so a guest's /spawn needs a host on this version.
import { chatLine, chatPick, putAway, type PickItem } from "./chat";
import { ctlText } from "./controls";
import { clockText, dayText, nightOut, skipHours, timeOfDay, weekday } from "./daylight";
import { copyText, spotFrom } from "./debug";
import { KITS, look, NAUGHTY, RUGBY, CRICKET, SOCIETY, LADDER, CHAIR, GIRL, RESIDENT, type NaughtyBoys, type Target } from "./naughtyboys";
import type { Cats } from "./cats";
import type { Pickups, Kind as PickupKind } from "./pickups";
import { SPECS, type VKind, type Vehicles } from "./vehicles";

/** Something /spawn can bring: its word, what the list calls it, and its heading on the list. */
interface Spawnable { id: string; label: string; group: string }

const PEOPLE: [string, string, number][] = [
  ["boy", "Naughty boy", NAUGHTY], ["girl", "Naughty girl, on a night out", GIRL],
  ["rugby", "Rugby lad", RUGBY], ["cricket", "Cricketer", CRICKET],
  ["flaglad", "Flag Lad", SOCIETY], ["ladder", "Flag Lads' ladder man", LADDER], ["gaffer", "The Gaffer", CHAIR],
  ["resident", "Royal Crescent resident", RESIDENT],
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
  /** /drone, with whatever came after it (drone.ts). */
  drone(rest: string): void;
  /** The pubs on this map you can go to, with how far off each is (game.ts's pubs). */
  pubs(): { i: number; name: string; far: number }[];
  /** Go to pub i; returns why not, if you can't just now. */
  goPub(i: number): string | null;
  /** Go straight to a spot (scene x, z, facing yaw, looking up by pitch); returns why not. */
  goSpot(at: { x: number; z: number; yaw: number; pitch: number }): string | null;
  /** Where you are, as text to paste with a link back (debug.ts's whereText). */
  where(): string;
  /** Get Wood's bonfire, and dark (game.ts's bonfireNight). */
  bonfire(): void;
}

/** The times of day there's a word for: the hour on the clock, and what the phone says. */
const TIMES: Record<string, [number, string]> = {
  sunrise: [6, "Sunrise, for everyone"],
  dawn: [6, "Sunrise, for everyone"],
  day: [10, "Broad daylight, for everyone"],
  morning: [10, "Broad daylight, for everyone"],
  noon: [12, "Midday, for everyone"],
  midday: [12, "Midday, for everyone"],
  sunset: [19.75, "Sunset, for everyone"],
  dusk: [19.75, "Sunset, for everyone"],
  night: [23, "Night, for everyone"],
  midnight: [0, "Midnight, for everyone"],
};

const HELP = [
  "/idkfa  God mode, every weapon",
  "/sunrise /day /noon /sunset /night /midnight  The time of day, for everyone",
  "/fridaynight  Next Friday night out in town",
  "/time  The time; /time 21:30 to set it",
  "/bonfire  Bonfire night",
  "/pub  Go to a pub (/pub bell for one)",
  "/goto 1275,2559  Go to a spot (or paste a Shift+F3 link)",
  "/where  Copy where you are, with a link back",
  "/spawn  Bring something, 5 m in front",
  "/drone  Fly about (or {drone}); shoot to snap",
  "/help or /?  This list",
];

/** Hours to move the clock on so it reads h o'clock (forward only, the quickest way round). */
function hoursTo(h: number): number {
  return ((h - timeOfDay() * 24) % 24 + 24) % 24;
}

export class Dev {
  /** God mode: nothing hurts you, and your guns never run dry. */
  god = false;

  constructor(private hooks: DevHooks) {}

  /** A /command off the phone. */
  run(word: string, rest: string) {
    if (word === "idkfa") { this.god = !this.god; this.hooks.god(this.god); chatLine(this.god ? "God mode on. Every weapon, no harm" : "God mode off"); return; }
    if (Object.hasOwn(TIMES, word)) { const [h, said] = TIMES[word]; skipHours(hoursTo(h)); chatLine(said); return; }
    if (word === "fridaynight" || word === "friday") { this.fridayNight(); return; }
    if (word === "time" || word === "clock") { this.time(rest.trim()); return; }
    if (word === "bonfire") { this.hooks.bonfire(); return; }
    if (word === "pub" || word === "pubs") { this.pub(rest.trim().toLowerCase()); return; }
    if (word === "goto" || word === "go" || word === "tp") {
      const at = spotFrom(rest);
      if (!at) { chatLine("Where to? /goto east,north, such as /goto 1275,2559, or paste a link Shift+F3 copied"); return; }
      const why = this.hooks.goSpot(at);
      chatLine(why ?? `Gone to ${Math.round(at.x)}, ${Math.round(-at.z)}`);
      return;
    }
    if (word === "where") {
      const text = this.hooks.where();
      copyText(text).then((ok) => chatLine(ok ? `Copied: ${text}` : text));
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
    if (word === "drone") { this.hooks.drone(rest); return; }
    if (word === "help" || word === "?") { for (const l of HELP) chatLine(ctlText(l)); return; }
    chatLine(`No command /${word}. /help for the list`);
  }

  /** /fridaynight: on to nine on the next Friday night, when everyone's out in town. */
  private fridayNight() {
    if (nightOut()) { chatLine(`It's ${dayText()} night out already`); return; }
    let h = ((5 - weekday() + 7) % 7) * 24 + 21 - timeOfDay() * 24;
    if (h < 0) h += 7 * 24;
    skipHours(h);
    chatLine("Friday night out, for everyone. The town's busy");
  }

  /** /time: say what the clock reads, or move it on to the time given ("21:30", "9", "9pm"). */
  private time(q: string) {
    if (!q) { chatLine(`${clockText()} on ${dayText()}`); return; }
    const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(q);
    let h = m ? Number(m[1]) : NaN;
    const min = m?.[2] ? Number(m[2]) : 0;
    if (m?.[3]) { if (h < 1 || h > 12) h = NaN; else h = (h % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0); }
    if (!(h >= 0 && h < 24 && min < 60)) { chatLine("Say a time such as /time 21:30 or /time 9pm"); return; }
    skipHours(hoursTo(h + min / 60));
    chatLine(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}, for everyone`);
  }

  /** /pub: the list of pubs, nearest first, or straight to the one whose name has q in it. */
  private pub(q: string) {
    const pubs = this.hooks.pubs().sort((a, b) => a.far - b.far);
    if (!pubs.length) { chatLine("There are no pubs to go to on this map"); return; }
    const go = (i: number) => { const why = this.hooks.goPub(i); if (why) chatLine(why); else putAway(); };
    if (!q) {
      const far = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
      chatPick("Go to a pub", pubs.map((p): PickItem => ({ label: `${p.name} (${far(p.far)})`, run: () => go(p.i) })));
      return;
    }
    const p = pubs.find((o) => o.name.toLowerCase() === q) ?? pubs.find((o) => o.name.toLowerCase().includes(q));
    if (p) go(p.i); else chatLine(`No pub called "${q}". /pub for the list`);
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
