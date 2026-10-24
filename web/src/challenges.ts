// Team challenges: the big things to do on a map, each opened up by filling the sockets of the
// strange structure (oddments.ts). A challenge finds its own place from the map's data (a canal
// lock, a big field, a church tower), so it works on any map, and is left out of a map that hasn't
// got one. Once open it has a noticeboard of its own at its place every day, and one day in a few
// a second one round where everyone starts. Taking it runs it as a job (quests.ts), so it goes
// round the room, joins and restores the way jobs do. A challenge won leaves one of the strange
// objects where it finished. docs/challenges.md is the guide to writing one.
//
// Who decides what: nobody. Where each challenge goes comes from the map alone, and which are open
// from how many sockets are full, which the host of oddments.ts decides and sends round; so every
// player in a room puts up the same boards. Running one is a job's business (quests.ts).
import type { GameMap } from "./map";
import { dayNumber } from "./daylight";
import { hash, registerJob, type Job, type Offer, type QuestWorld, type Rng } from "./quests";

/** A place a challenge uses, scene coordinates: its first is where it starts and where the fly-over looks. */
export interface ChallengeSpot { x: number; z: number; name: string; y?: number; a?: number }

/** What a challenge is lent when it starts. */
export interface ChallengeStart {
  offer: Offer; spots: ChallengeSpot[]; w: QuestWorld;
  /** When it was taken (ms since 1970) and by whom: the same on every screen. */
  started: number; by: string;
}

export interface Challenge {
  id: string;
  /** What the title card and the poster call it ("The Tightrope"). */
  name: string;
  /** One line for the poster and the start card. */
  blurb: string;
  /** Its badge on the maps: a letter and a colour. */
  glyph: string; colour: string;
  /** Lower opens first. Challenges on the same tier open in the order of their ids. */
  tier: number;
  /** How hard, 1 to 3, for the poster. */
  stars?: number;
  /** Where it goes on this map, worked out from the map's own data, the same on every machine; null to leave it out of this map. */
  place(map: GameMap): ChallengeSpot[] | null;
  /** The challenge itself, run as a job on every player's screen. Set done.x, done.z to where it finished. */
  start(s: ChallengeStart): Job;
  /** What the start card says to do. */
  goal?(o: Offer): string;
}

const list: Challenge[] = [];
/** A challenge joins the game. */
export function registerChallenge(c: Challenge) {
  const k = list.findIndex((o) => o.id === c.id);
  if (k >= 0) list[k] = c; else list.push(c);
}

/** The structure's sockets. */
export const SOCKETS = 24;

let placedOn: GameMap | null = null;
let placed: { c: Challenge; spots: ChallengeSpot[]; at: number }[] = [];
let filled = () => 0;

/** The challenges on this map, in the order they open, with how many full sockets open each. */
export function challengesOn(map: GameMap) {
  if (placedOn !== map) {
    placedOn = map;
    const here = [...list].sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id)).flatMap((c) => {
      let spots: ChallengeSpot[] | null = null;
      try { spots = c.place(map); } catch (e) { console.warn(`challenge ${c.id}: can't place it`, e); }
      return spots?.length ? [{ c, spots }] : [];
    });
    // spread out up the sockets, with the last socket kept for the finale
    placed = here.map((p, k) => ({ ...p, at: Math.max(1, Math.round((SOCKETS * (k + 1)) / (here.length + 1))) }));
  }
  return placed;
}

/** The challenges open with n sockets full. */
export const openWith = (map: GameMap, n: number) => challengesOn(map).filter((p) => n >= p.at);

/** Is challenge id kind of job (quests.ts)? */
export const isChallenge = (kind: string) => list.some((c) => c.id === kind);

/** Hook every challenge on this map into the noticeboards (call once a game, after its map is in). */
export function useChallenges(map: GameMap, sockets: () => number) {
  filled = sockets;
  placedOn = null;
  const here = challengesOn(map);
  for (const c of list) {
    const p = here.find((q) => q.c.id === c.id);
    const open = () => !!p && placedOn === map && filled() >= p.at;
    const offer = (seed: number, x: number, z: number, where: string): Offer => ({
      kind: c.id, seed, stars: c.stars ?? 3, title: c.name, blurb: c.blurb,
      reward: "Something strange, left where you finish", x, z, where,
    });
    registerJob({
      id: c.id, glyph: c.glyph, colour: c.colour, label: "Challenge",
      challenge: true, open, goal: c.goal,
      offer: () => null,
      // its own board at its place every day, and now and then one round the village as well
      daily: (r: Rng, spots) => {
        if (!open() || !p) return null;
        const seed = hash("challenge", c.id, dayNumber());
        const out = [offer(seed, p.spots[0].x, p.spots[0].z, p.spots[0].name)];
        const opened = openWith(map, filled());
        const near = spots[Math.floor(r() * spots.length)];
        if (near && opened[hash("pick", dayNumber()) % opened.length]?.c.id === c.id && Math.hypot(near.x - p.spots[0].x, near.z - p.spots[0].z) > 400) {
          out.push(offer(seed, near.x, near.z, near.name));
        }
        return out;
      },
      start: (o, w, started, by) => c.start({ offer: o, spots: p?.spots ?? [{ x: o.x, z: o.z, name: o.where }], w, started, by }),
    });
  }
}
