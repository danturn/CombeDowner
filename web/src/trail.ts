// The treasure trail: a chain of clues across part of Bath, each one a little riddle about a real
// place (a pub, a church, a park or garden, a square, a street), written from the place's name and
// what kind of place it is. Somewhere near each place there's a biscuit tin on a post, stood where
// you can get to it: walk up and press E to open it and get the next clue. The last one is the
// Bath Bun chest, buried in a mound: open it and it's dug up, coins burst out, and you get a
// rosette for your jacket that everyone can see. Four clues on an easy trail, five on a medium one,
// six on a hard one, about 15 minutes all told, on foot (you keep whatever ride you're on).
//
// The riddles get harder with the stars: the place's name with letters missing, then jumbled or as
// a cryptic hint ("where a sly red raider of bins drinks"). Now and then the riddle is a picture
// instead: a little inked sketch of the view from near the tin (snapshot.ts), taken once that part
// of Bath is loaded round you; until then it's a riddle.
//
// Within 400 m a search circle goes on the maps, bold and pulsing, and its edge glows on the ground
// when you're near it. The tin is never at the middle: each circle is off-centre by an amount fixed
// by the seed, and it shrinks once (to 75 m) as you get closer, with a chime; heading the wrong way
// gets a colder one. The tin doesn't show until you're close and only glints within a few metres,
// so inside the circle you listen: it rattles from where it stands, quicker and louder as you
// near it. On medium and hard trails some legs have an empty decoy tin in the circle too, which
// costs a time penalty. The chest's circle is bigger and never shrinks. Stuck three minutes on a
// clue? E for a hint shrinks the circle (never below 40 m), but costs score and the gold.
//
// Two ways to play, set on the poster: together, where anyone's find moves everyone on, and a race,
// where everyone has their own copy of the trail and first to the chest wins. Together, with two or
// more of you, some legs have twin tins at two places: both must be opened within 30 seconds of
// each other, so you have to split up. Either way there's a par time, with gold, silver and bronze;
// gold takes a good run. One trail on the noticeboards each day is the trail of the day, the same
// for everyone in every room, with your best time kept on this device.
//
// Who decides what: the trail comes from the poster's seed, so everyone has the same one, and where
// each tin stands comes from the seed and the map too. Opening a tin goes round as "tin" (and half
// of a pair of twin tins as "half"), from whoever opened it; whoever opens a tin says if the next
// leg is twin tins (they know how many are playing). Nobody needs the host for any of it. Rosettes
// are kept on your device and go round in your hello (game.ts), for others to draw on your jacket.
import * as THREE from "three";
import * as SFX from "./audio";
import { dayNumber } from "./daylight";
import { clearSpot, streetSpot } from "./haunts";
import { PATHS } from "./map";
import { snapshot } from "./snapshot";
import { type Card, type Job, type Offer, type PostSpot, type QuestWorld, type Rng, compassWord, esc, far, hash, pickOf, registerJob, rng, shuffled } from "./quests";

const COLOUR = "#e0a526";
const RINGS = [130, 75, 40];              // the search circle's sizes; the smallest only comes with a hint
const SHRINK_AT = [400, 200];             // it comes up within the first of these, and shrinks at the second
const RING_SHOWN = 150;                   // the circle's edge glows on the ground within this many metres
const GLINT_NEAR = 12;                    // the tin only glints this close
const TIN_NEAR = 40;                      // and isn't even put up until you're this close
const LISTEN_NEAR = 200;                  // the tin can be heard from inside the circle, at most this far
const LAST_RING = 180;                    // the chest's circle is big, and never shrinks
const DECOY_PENALTY = 20;                 // seconds added for opening an empty decoy tin
const PAR_PACE = 5.4;                     // the par assumes a brisk walk with some sprinting
const PAR_SEARCH = 55;                    // and a short look about per clue
const SILVER = 1.15;                      // silver's par and a bit
const WALK_PACE = 4.5;                    // metres a second along the streets, for the par
const HINT_AFTER = 180;                   // seconds stuck on a clue before a hint's offered
const HINT_AGAIN = 90;                    // and between hints
const HINT_COST = 300;                    // score a hint costs
const OPEN = 2.6;                         // how close to open a tin
const TWIN_WINDOW = 30;                   // seconds to open the second of twin tins
const SEARCH = 90;                        // seconds of looking about per clue, in the par
const TRAIL_TIME = 900;                   // what a trail aims to take, seconds
const PICTURE_NEAR = 700;                 // a picture clue is drawn once you're this close
const THEMES = ["Pubs", "Parks and places", "A bit of everything", "Streets and squares"] as const;
const DAILY = 8;                          // in the poster's mode: the trail of the day
const ROSETTE_KEY = "cd-rosettes";
const DAILY_KEY = "cd-trail-daily";

type Kind = "pub" | "church" | "rest" | "green" | "garden" | "square" | "street" | "place";
interface Spot { n: string; x: number; z: number; kind: Kind; rating: number | null }
interface Leg extends Spot {
  tx: number; tz: number;                 // roughly where its tin is (the map picks the exact spot)
  d: number;                              // how far the leg is
  decoy: boolean;                         // an empty decoy tin stands in the circle too
  pic: boolean;                           // a picture clue, once you're near enough
  twin: (Spot & { tx: number; tz: number }) | null;   // a second place, for twin tins together
}

// ---- souvenirs ----------------------------------------------------------------------------------

/** Your rosettes from trails, as a letter each (g, s, b), best first, at most three. */
export function myRosettes(): string {
  try { return (localStorage.getItem(ROSETTE_KEY) ?? "").replace(/[^gsb]/g, "").slice(0, 3); } catch { return ""; }
}
function addRosette(medal: "gold" | "silver" | "bronze") {
  const order = "gsb", all = [...myRosettes(), medal[0]].sort((a, b) => order.indexOf(a) - order.indexOf(b)).slice(0, 3).join("");
  try { localStorage.setItem(ROSETTE_KEY, all); } catch { /* ignore */ }
}
function dailyBest(day: number): number | null {
  try { const d = JSON.parse(localStorage.getItem(DAILY_KEY) ?? "null"); return d?.day === day && Number.isFinite(d.best) ? d.best : null; } catch { return null; }
}
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

// ---- where trails go ----------------------------------------------------------------------------

/** What kind of place a name sounds like. */
function kindOf(name: string): Kind {
  if (/churchyard|cemetery|burial/i.test(name)) return "rest";
  if (/church|chapel|abbey|minster|cathedral|priory/i.test(name)) return "church";
  if (/garden/i.test(name)) return "garden";
  if (/park|green|common|field|recreation|meadow|wood|playing|allotment|\brec\b/i.test(name)) return "green";
  if (/square|circus|crescent|parade|terrace|buildings|\bplace$/i.test(name)) return "square";
  return "place";
}
const STREETY = /\b(road|street|lane|hill|way|avenue|walk|close|row|drive|grove|rise|view|place|terrace|crescent|gardens|vale|mead)$/i;

const streetsOf = new WeakMap<object, Spot[]>();
/** Every named street in the city: one spot on each, part way along. */
function streets(w: QuestWorld): Spot[] {
  const had = streetsOf.get(w.map);
  if (had) return had;
  const out: Spot[] = [], byName = new Map<string, Spot[]>();
  for (const r of [...w.map.d.rd, ...w.map.wide?.rd ?? []]) {
    if (!r.n || r.n.length < 6 || PATHS.has(r.c) || r.c === "service" || r.p.length < 2 || !STREETY.test(r.n)) continue;
    const m = r.p[Math.floor(r.p.length / 2)], x = m[0], z = -m[1];
    const same = byName.get(r.n) ?? byName.set(r.n, []).get(r.n)!;
    if (same.some((o) => Math.hypot(o.x - x, o.z - z) < 400)) continue;
    const s: Spot = { n: r.n, x, z, kind: "street", rating: null };
    same.push(s); out.push(s);
  }
  streetsOf.set(w.map, out);
  return out;
}

/** The trail from the poster's seed: where each tin is and what kind of clue leads there. */
function trailOf(o: Offer, w: QuestWorld): { theme: string; legs: Leg[]; par: number } {
  const r = rng(o.seed), theme = THEMES[((o.mode ?? 0) >> 1) & 3] ?? THEMES[2];
  const ok = (x: number, z: number) => w.map.fieldEdge(x, z) > 100;
  const pubs: Spot[] = w.pubs().filter((p) => ok(p.x, p.z)).map((p) => ({ n: p.name, x: p.x, z: p.z, kind: "pub", rating: p.rating }));
  const places: Spot[] = w.places().filter((p) => ok(p.x, p.z) && p.n.length >= 5).map((p) => ({ ...p, kind: kindOf(p.n), rating: null }));
  const roads = theme === "Streets and squares" || theme === "A bit of everything" ? streets(w).filter((p) => ok(p.x, p.z)) : [];
  const pool = (theme === "Pubs" ? pubs : theme === "Parks and places" ? places
    : theme === "Streets and squares" ? [...roads, ...places.filter((p) => p.kind === "square")]
    : [...pubs, ...places, ...roads.filter(() => r() < 0.15)])
    .sort((a, b) => a.x - b.x || a.z - b.z || a.n.localeCompare(b.n));
  const n = 3 + o.stars, legs: Leg[] = [], used = new Set<string>();
  const free = (p: Spot) => !used.has(p.n) && !legs.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 200);
  let at = { x: o.x, z: o.z }, par = 0;
  for (let k = 0; k < n; k++) {
    const v = WALK_PACE;
    const ideal = Math.max(260, (TRAIL_TIME / n - SEARCH) * v);
    const within = (lo: number, hi: number) => pool.filter((p) => { const d = Math.hypot(p.x - at.x, p.z - at.z); return d > lo && d < hi && free(p); });
    let cands = within(Math.max(200, ideal * 0.6), Math.min(1500, ideal * 1.5));
    if (!cands.length) cands = within(200, 1600);
    if (!cands.length) break;
    const next = cands[Math.floor(r() * cands.length)];
    const d = Math.hypot(next.x - at.x, next.z - at.z);
    // the tin's somewhere near the place, not on it (on a street, along it)
    const a = r() * Math.PI * 2, off = next.kind === "street" ? 4 : 8 + r() * 20;
    const pic = o.stars >= 2 && k < n - 1 && r() < 0.4;
    let twin: Leg["twin"] = null;
    if (k > 0 && k < n - 1 && r() < 0.5) {
      const near = pool.filter((p) => p !== next && free(p) && Math.hypot(p.x - next.x, p.z - next.z) > 150 && Math.hypot(p.x - next.x, p.z - next.z) < 450);
      if (near.length) {
        const t = near[Math.floor(r() * near.length)], ta = r() * Math.PI * 2;
        twin = { ...t, tx: t.x + Math.cos(ta) * 10, tz: t.z + Math.sin(ta) * 10 };
        used.add(t.n);
      }
    }
    legs.push({ ...next, tx: next.x + Math.cos(a) * off, tz: next.z + Math.sin(a) * off, d, decoy: o.stars >= 2 && k < n - 1 && !twin && r() < 0.45, pic, twin });
    used.add(next.n);
    par += d / PAR_PACE + PAR_SEARCH;
    at = next;
  }
  return { theme, legs, par };
}

// ---- riddles ------------------------------------------------------------------------------------

/** The name with some of its letters missing: "S _ D N _ Y   G A R D _ N S". */
function gaps(name: string, r: Rng) {
  return name.toUpperCase().split(/\s+/).map((wd) => [...wd].map((c, k) => (/[A-Z]/.test(c) && k > 0 && r() < 0.4 ? "_" : esc(c))).join(" ")).join("&nbsp;&nbsp;&nbsp;");
}
/** The name's letters jumbled, word by word. */
function anagram(name: string, r: Rng) {
  return name.toUpperCase().split(/\s+/).map((wd) => {
    let s = wd;
    for (let t = 0; t < 6 && (s === wd || wd.length < 3); t++) s = shuffled(r, [...wd]).join("");
    return s;
  }).join(" ");
}

/** Cryptic stand-ins for words that turn up in pub names. */
const CRYPTIC: Record<string, string> = {
  fox: "a sly red raider of bins", crown: "the thing a queen wears", king: "a man in a crown", queen: "a woman in a crown",
  bell: "something that rings for church", lion: "the king of the jungle", swan: "a white bird gliding down the Avon",
  bear: "a big brown fan of honey", horse: "something that wears shoes but no socks", rose: "a red flower with thorns",
  star: "something that twinkles", hare: "the one who lost to the tortoise", lamb: "a woolly baby", raven: "a big black bird",
  ram: "a sheep with curly horns", moon: "something made of cheese, they say", sun: "something that rises in the east",
  ship: "something that sails", anchor: "what stops a boat drifting", keys: "what opens doors", plough: "what turns a field over",
  oak: "a tree full of acorns", grapes: "what wine is made from", hat: "something you wear on your head", boat: "something that floats",
  castle: "a king's stone house", wheatsheaf: "a bundle of harvest", huntsman: "someone in a red coat with hounds",
  cricketers: "a team dressed in white", volunteer: "someone who didn't have to", coach: "something pulled by horses",
  dragon: "something that breathes fire", george: "the saint who fought a dragon", eagle: "a bird with a hooked beak",
  griffin: "half eagle, half lion", pig: "something that oinks", cow: "something that moos", goat: "something that eats anything",
  owl: "a bird up all night", cat: "something that purrs", dog: "something that wags", fiddle: "a violin at a ceilidh",
  barrel: "where beer lives", chequers: "a board for draughts", forester: "someone who looks after trees",
  gardeners: "people with green fingers", pelican: "a bird with a big beak to keep its fish in", hop: "what gives beer its bite",
  pole: "a long stick", bunch: "a handful of grapes", huntsmen: "riders in red coats", rummer: "a big old drinking glass",
};
/** Words that say what a place is, rather than which one. */
const PLAIN = /^(the|inn|arms|tavern|hotel|bar|pub|house|tap|park|gardens?|church|chapel|abbey|square|road|street|lane|hill|way|avenue|walk|close|row|drive|grove|rise|view|place|terrace|crescent|circus|parade|green|field|common|recreation|ground|and|&|of|at|on|playing|fields|wood|meadow|cemetery|churchyard|buildings|vale|mead|rooms|kitchen|club|bistro|cafe|social)$/i;

/** The words of a name that pick it out: "Hadley" from "The Hadley Arms", "Mary" from "St Mary's Church". */
function keyOf(name: string): { key: string; saint: boolean } {
  const saint = name.match(/\b(?:St\.?|Saint)\s+([A-Z][\w'-]*)/);
  if (saint) return { key: saint[1].replace(/'s$/i, ""), saint: true };
  const words = name.split(/\s+/).filter((wd) => !PLAIN.test(wd));
  return { key: (words.length ? words : name.split(/\s+/)).join(" "), saint: false };
}

/**
 * The riddle that leads from (fx, fz) to s. hard: 0 says the name plainly, 1 with letters missing, 2
 * jumbled or cryptic. Places that don't fit a kind get the old missing-letters, first-letter and
 * anagram clues.
 */
function riddle(s: Spot, fx: number, fz: number, hard: number, r: Rng): string {
  const d = Math.hypot(s.x - fx, s.z - fz), way = compassWord(s.x - fx, s.z - fz), where = `About ${far(d)} ${way}.`;
  const { key, saint } = keyOf(s.n);
  const plain = s.n.replace(/^the\s+/i, "");
  const rest = plain.replace(key, "").replace(/\s+/g, " ").replace(/^St\.?\s+'?s?\s*/i, "").trim();
  const show = hard === 0 ? `<b>${esc(key)}</b>` : hard === 1 ? `<b class="clue">${gaps(key, r)}</b>` : `<b class="clue">${esc(anagram(key, r))}</b> (jumbled)`;
  const named = `${show}${rest ? ` ${esc(rest)}` : ""}`;
  const pick = (...t: string[]) => pickOf(r, t);
  switch (s.kind) {
    case "pub": {
      const odd = key.toLowerCase().split(/\s+/).map((wd) => CRYPTIC[wd.replace(/'?s$/, "")] ?? CRYPTIC[wd]).find(Boolean);
      if (hard === 2 && odd) return `Look for the sign of ${odd}, and order a pint. ${where}`;
      const rated = hard > 0 && s.rating !== null ? ` Rated ${s.rating} for food hygiene.` : "";
      return pick(`Where the ${named} crowd drinks. ${where}`, `Thirsty work. Your next pint's at the ${named}. ${where}`,
        `Last orders at the ${named}! ${where}`, `Follow your nose to the beer garden of the ${named}. ${where}`) + rated;
    }
    case "church":
      return saint ? pick(`Bells ring for Saint ${show}. ${where}`, `Saint ${show} keeps a pew warm for you. ${where}`)
        : pick(`Pews, bells and a quiet porch: ${named}. ${where}`, `Hymn books at the ready at ${named}. ${where}`);
    case "rest":
      return pick(`The quietest neighbours in Bath, at ${named}. ${where}`, `Tread softly round ${named}. ${where}`);
    case "green":
      return pick(`Dogs, frisbees and a bench with a plaque: ${named}. ${where}`, `Grass stains guaranteed at ${named}. ${where}`,
        `Where the pigeons have their picnics: ${named}. ${where}`);
    case "garden":
      return pick(`Roses, a bench in the shade and a sign saying keep off: ${named}. ${where}`, `Mind the flowerbeds in ${named}. ${where}`);
    case "square":
      return /crescent/i.test(s.n) ? `Bath stone shaped like a slice of the moon: ${named}. ${where}`
        : /circus/i.test(s.n) ? `No clowns here, just a ring of grand houses: ${named}. ${where}`
        : pick(`Bath stone all round and pigeons in the middle: ${named}. ${where}`, `Somewhere to promenade in your best hat: ${named}. ${where}`);
    case "street":
      return pick(`Walk the length of ${named}. ${where}`, `A tin's tied to a post on ${named}. ${where}`, `Put your best foot down ${named}. ${where}`);
    default:
      if (hard === 0) return `<b class="clue">${gaps(s.n, r)}</b><br>${where}`;
      if (hard === 1) return `${where.replace(/\.$/, "")}: a place beginning with <b>${esc(s.n[0].toUpperCase())}</b>`;
      return `<b class="clue">${esc(anagram(s.n, r))}</b><br>Somewhere ${way}`;
  }
}

// ---- the job ------------------------------------------------------------------------------------

let dailyDay = -1;   // the day whose trail of the day has been put up

registerJob({
  id: "trail", glyph: "T", colour: COLOUR, label: "Treasure trail",
  goal: (o) => (o.mode ?? 0) % 2 ? "Solve the riddles and beat the others to the chest" : "Solve the riddles, find every tin and dig up the chest",
  offer(r, spot: PostSpot, w) {
    // the first trail on today's noticeboards is the trail of the day: the same for everyone
    const day = dayNumber(), daily = dailyDay !== day;
    const mode = daily ? 2 * 2 + DAILY : Math.floor(r() * THEMES.length) * 2 + (r() < 0.35 ? 1 : 0);
    const stars = daily ? 2 : 1 + Math.floor(r() * 3);
    const seed = daily ? hash("trail of the day", day) : hash("trail", r() * 1e9);
    const o: Offer = { kind: "trail", seed, stars, title: "", blurb: "", reward: "", x: spot.x, z: spot.z, where: spot.name, mode };
    const t = trailOf(o, w);
    if (t.legs.length < 3 + o.stars) return null;
    if (daily) dailyDay = day;
    const race = mode & 1;
    o.title = daily ? "Trail of the day" : `${race ? "Trail race" : "Trail"}: ${t.theme}`;
    const best = daily ? dailyBest(day) : null;
    o.blurb = `${t.legs.length} riddles, each to a real place in Bath, with a tin to find near each. `
      + "Each search circle hides its tin off-centre: listen for it. "
      + (daily ? "The same trail for everyone today, so compare times. " : "")
      + (race ? "Everyone has their own copy: first to the chest wins." : "Anyone's find moves everyone on.")
      + ` Par ${clock(t.par)}.` + (best !== null ? ` Your best today: ${clock(best)}.` : "");
    o.reward = `${o.stars} prize${o.stars > 1 ? "s" : ""} and a rosette for your jacket`;
    return o;
  },
  start: (o, w, started) => new Trail(o, w, started),
});

/** A tin on a post (in colour), or the chest at the end, buried in a mound, with a glint over it. */
function tinModel(chest: boolean, colour = "#b3262e") {
  const g = new THREE.Group();
  const lambert = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  if (chest) {
    const crate = new THREE.Group();
    crate.name = "crate";
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), lambert("#6b4423"));
    box.position.y = 0.25;
    const lid = new THREE.Group();
    lid.name = "lid"; lid.position.set(0, 0.5, 0.3);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12, 1, false, 0, Math.PI), lambert("#7a5030"));
    top.rotation.z = Math.PI / 2; top.position.z = -0.3;
    lid.add(top);
    crate.add(box, lid);
    for (const x of [-0.3, 0.3]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.64), lambert("#d9b143")); b.position.set(x, 0.26, 0); crate.add(b); }
    crate.position.y = -0.55;   // buried
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert("#5b4632"));
    mound.scale.y = 0.35; mound.name = "mound";
    const cross = new THREE.Group();
    for (const a of [0.7, -0.7]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.1), lambert("#c23b2e")); p.rotation.y = a; cross.add(p); }
    cross.position.y = 0.33; cross.name = "cross";
    g.add(crate, mound, cross);
  } else {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), lambert("#5a3d22"));
    post.position.y = 0.45;
    const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 16), lambert(colour));
    tin.position.y = 0.96;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.03, 16), lambert("#d9b143"));
    lid.position.y = 1.03;
    g.add(post, tin, lid);
  }
  const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: "#fff2b0", toneMapped: false }));
  glint.position.y = chest ? 1.2 : 1.4; glint.name = "glint";
  g.add(glint);
  return g;
}

function dispose(o: THREE.Object3D) {
  o.parent?.remove(o);
  o.traverse((m) => { if (m instanceof THREE.Mesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
}

const COINS = 36;
const GLOW_SEGS = 96;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1), ZERO = new THREE.Vector3(0, 0, 0);

interface Tin { view: THREE.Group; n: number; h: number; x: number; z: number; y: number; decoy?: boolean }

class Trail implements Job {
  done: Job["done"] = null;
  private t: ReturnType<typeof trailOf>;
  private race: boolean;
  private daily: boolean;
  private at = new Map<string, number>();   // how many tins each player's opened (together: everyone's the same)
  private twins = new Set<number>();         // legs that are twin tins this time
  private spots = new Map<string, { x: number; z: number }>();   // where each tin stands, by "leg:half", once known
  private tins = new Map<string, Tin>();     // the tins put up round you
  private rings = new Map<string, number>(); // how far each tin's search circle has shrunk (an index into RINGS)
  private halves: [number, number] = [-1e9, -1e9];   // when each of twin tins was last opened (seconds, this page's clock)
  private halfBy: [string, string] = ["", ""];
  private pics = new Map<number, string>();  // picture clues drawn, by leg (as image data)
  private picTried = new Set<number>();
  private clues: string[][];
  private legT = 0;                          // seconds on this clue
  private hintT = 0;                         // seconds since the last hint
  private hints = 0;
  private near: { tin: Tin; d: number } | null = null;
  private nearest = Infinity;
  private checkD = Infinity; private checkT = 0;
  private warmth = "";
  private glows = new Map<string, { mesh: THREE.Mesh; k: number; built: number }>();   // the circles' edges on the ground
  private decoys = new Map<number, { x: number; z: number }>();   // where each leg's decoy tin stands, once known
  private emptied = new Set<number>();       // decoys already opened
  private penalty = 0;                       // seconds added for decoys
  private tickIn = new Map<string, number>();   // seconds until each tin next rattles
  private chestFx: { t: number; tin: Tin; coins: THREE.InstancedMesh; v: Float32Array; sounded: boolean } | null = null;

  constructor(readonly offer: Offer, private w: QuestWorld, private started: number) {
    this.t = trailOf(offer, w);
    this.race = !!((offer.mode ?? 0) & 1);
    this.daily = !!((offer.mode ?? 0) & DAILY);
    const r = rng(hash("clues", offer.seed));
    let fx = offer.x, fz = offer.z;
    this.clues = this.t.legs.map((s) => {
      const hard = offer.stars === 1 ? 1 : offer.stars === 2 ? 1 + Math.floor(r() * 2) : 2;
      const c = [riddle(s, fx, fz, hard, r), s.twin ? riddle(s.twin, fx, fz, hard, r) : ""];
      fx = s.x; fz = s.z;
      return c;
    });
  }

  private get mine() { return this.at.get(this.race ? this.w.selfId : "") ?? 0; }
  private halvesOf(n: number) { return this.twins.has(n) && this.t.legs[n]?.twin ? [0, 1] : [0]; }
  private aim(n: number, h: number) { const s = this.t.legs[n]; return h ? { x: s.twin!.tx, z: s.twin!.tz } : { x: s.tx, z: s.tz }; }

  /** Where tin (n, h) stands: on a street or path near its place, the same for everyone; once that part of Bath is loaded. */
  private spotOf(n: number, h: number) {
    const key = `${n}:${h}`, had = this.spots.get(key);
    if (had) return had;
    const a = this.aim(n, h), map = this.w.map;
    if (!map.detailedAt(a.x, a.z)) return null;
    const r = rng(hash("tin", this.offer.seed, n, h));
    const p = streetSpot(map, a.x, a.z, 0, 45, 0.6, (x, z) => !map.indoors(x, z), 4, 3, r);
    const c = p ? { x: p.x, z: p.z } : (([x, z]) => ({ x, z }))(clearSpot(map, a.x, a.z, 20) ?? [a.x, a.z]);
    this.spots.set(key, c);
    return c;
  }

  update(dt: number) {
    this.chestUpdate(dt);
    if (this.done) return;
    const n = this.mine, s = this.t.legs[n], me = this.w.me();
    if (!s) return;
    this.legT += dt; this.hintT += dt;
    // tins from an earlier clue come down
    for (const [k, tin] of this.tins) if (tin.n !== n) { dispose(tin.view); this.tins.delete(k); }
    const last = n === this.t.legs.length - 1;
    this.near = null; this.nearest = Infinity;
    for (const h of this.halvesOf(n)) {
      const key = `${n}:${h}`, spot = this.spotOf(n, h), at = spot ?? this.aim(n, h);
      const d = Math.hypot(at.x - me.x, at.z - me.z);
      // the tin itself, once you're close enough for it to matter
      if (spot && !this.tins.has(key) && d < TIN_NEAR) {
        const view = tinModel(last, h ? "#2f6fb3" : "#b3262e"), y = this.w.map.ground(spot.x, spot.z);
        view.position.set(spot.x, y, spot.z);
        this.w.scene.add(view);
        this.tins.set(key, { view, n, h, x: spot.x, z: spot.z, y });
      }
      const tin = this.tins.get(key);
      if (tin) {
        const g = tin.view.getObjectByName("glint");
        if (g) { g.visible = d < GLINT_NEAR; g.rotation.y += dt * 3; g.position.y = (last ? 1.2 : 1.4) + Math.sin(performance.now() / 300) * 0.06; }
        if (d < OPEN && (!this.near || d < this.near.d)) this.near = { tin, d };
      }
      // the search circle comes up within 400 m and shrinks as you close in, and never grows again
      const step = Math.min(this.maxRing(n), d < SHRINK_AT[1] ? 1 : d < SHRINK_AT[0] ? 0 : -1), had = this.rings.get(key) ?? -1;
      if (step > had) {
        this.rings.set(key, step);
        if (step > 0) { SFX.warmer(true, true); this.w.toast("Warmer! The circle's shrunk", 2); }
      }
      this.showRing(n, h, dt);
      if (spot) this.listen(n, h, spot, d, dt);
      this.nearest = Math.min(this.nearest, d);
    }
    const dc = this.decoyOf(n);
    if (dc) {
      const d = Math.hypot(dc.x - me.x, dc.z - me.z), key = `${n}:d`;
      if (!this.tins.has(key) && d < TIN_NEAR) {
        const view = tinModel(false), y = this.w.map.ground(dc.x, dc.z);
        view.position.set(dc.x, y, dc.z);
        this.w.scene.add(view);
        this.tins.set(key, { view, n, h: 0, x: dc.x, z: dc.z, y, decoy: true });
      }
      const tin = this.tins.get(key), g = tin?.view.getObjectByName("glint");
      if (g) { g.visible = d < GLINT_NEAR && !this.emptied.has(n); g.rotation.y += dt * 3; }
      if (tin && d < OPEN && (!this.near || d < this.near.d)) this.near = { tin, d };
    }
    // warmer or colder: a chime when you've gone a good way either way
    if ((this.checkT -= dt) <= 0) {
      this.checkT = 2;
      if (this.nearest < 700 && Number.isFinite(this.checkD)) {
        if (this.checkD - this.nearest > 40) { this.checkD = this.nearest; SFX.warmer(true); this.warmth = "Warmer"; }
        else if (this.nearest - this.checkD > 40) { this.checkD = this.nearest; SFX.warmer(false); this.warmth = "Colder"; }
      } else this.checkD = this.nearest;
    }
    const td = this.nearest;
    const heat = td < 25 ? "Red hot!" : td < 60 ? "Hot" : td < 150 ? "Warm" : "";
    if (heat) this.warmth = heat;
    else if (td >= 700) this.warmth = "";
    // a picture clue: drawn once, when that part of Bath is round you
    if (s.pic && !this.pics.has(n) && !this.picTried.has(n)) {
      const spot = this.spotOf(n, 0);
      if (spot && Math.hypot(spot.x - me.x, spot.z - me.z) < PICTURE_NEAR) this.takePicture(n, spot);
    }
  }

  /** The circle for tin (n, h) at its current size: off-centre by an amount fixed by the seed, so the tin is somewhere inside it. */
  private ringOf(n: number, h: number) {
    const key = `${n}:${h}`, k = this.rings.get(key) ?? -1, at = this.spots.get(key);
    if (k < 0 || !at) return null;
    const R = n === this.t.legs.length - 1 ? LAST_RING : RINGS[Math.min(k, RINGS.length - 1)], r = rng(hash("ring", this.offer.seed, n, h, k)), a = r() * Math.PI * 2, f = (0.3 + r() * 0.4) * R;
    return { x: at.x + Math.cos(a) * f, z: at.z + Math.sin(a) * f, r: R, k };
  }

  private maxRing(n: number) { return n === this.t.legs.length - 1 ? 0 : RINGS.length - 1; }

  /** Where leg n's decoy tin stands: a little way from the real one, so it's in the same circle. */
  private decoyOf(n: number) {
    const had = this.decoys.get(n), real = this.spots.get(`${n}:0`), map = this.w.map;
    if (had || !real || !this.t.legs[n]?.decoy) return had ?? null;
    const r = rng(hash("decoy", this.offer.seed, n)), a = r() * Math.PI * 2, f = 14 + r() * 14;
    const tx = real.x + Math.cos(a) * f, tz = real.z + Math.sin(a) * f;
    if (!map.detailedAt(tx, tz)) return null;
    const p = streetSpot(map, tx, tz, 0, 25, 0.6, (x, z) => !map.indoors(x, z) && Math.hypot(x - real.x, z - real.z) > 8, 4, 3, r);
    const c = p ? { x: p.x, z: p.z } : (([x, z]) => ({ x, z }))(clearSpot(map, tx, tz, 15) ?? [tx, tz]);
    this.decoys.set(n, c);
    return c;
  }

  private showRing(n: number, h: number, dt = 0) {
    const key = `${n}:${h}`, ck = h ? "trail2" : "trail", ring = this.ringOf(n, h), colour = h ? "#4f8fd6" : COLOUR;
    this.w.circle(ck, ring && { x: ring.x, z: ring.z, r: ring.r, colour, pulse: true });
    this.glow(key, ring, colour, dt);
  }

  /** A faint ribbon of light along the circle's edge, draped on the ground, while you're near it. */
  private glow(key: string, ring: { x: number; z: number; r: number; k: number } | null, colour: string, dt: number) {
    let g = this.glows.get(key);
    if (g && (!ring || g.k !== ring.k)) { dispose(g.mesh); this.glows.delete(key); g = undefined; }
    if (!ring) return;
    const me = this.w.me(), edge = Math.abs(Math.hypot(me.x - ring.x, me.z - ring.z) - ring.r);
    if (!g) {
      const geo = new THREE.BufferGeometry(), idx: number[] = [];
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((GLOW_SEGS + 1) * 6), 3));
      for (let i = 0; i < GLOW_SEGS; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 3;
      this.w.scene.add(mesh);
      g = { mesh, k: ring.k, built: 1e9 };
      this.glows.set(key, g);
    }
    g.mesh.visible = edge < RING_SHOWN;
    if (!g.mesh.visible) return;
    (g.mesh.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.2 * Math.sin(performance.now() / 350);
    g.built += dt;
    if (g.built < 2) return;   // the ground under it may still be loading, so it's laid again now and then
    g.built = 0;
    const pos = g.mesh.geometry.getAttribute("position") as THREE.BufferAttribute, map = this.w.map;
    for (let i = 0; i <= GLOW_SEGS; i++) {
      const a = (i / GLOW_SEGS) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      for (let side = 0; side < 2; side++) {
        const rr = ring.r + (side ? 0.6 : -0.6), x = ring.x + c * rr, z = ring.z + sn * rr;
        pos.setXYZ(i * 2 + side, x, map.ground(x, z) + 0.35, z);
      }
    }
    pos.needsUpdate = true;
  }

  /** Inside the circle the tin rattles now and then from where it stands: quicker the nearer you are. */
  private listen(n: number, h: number, spot: { x: number; z: number }, d: number, dt: number) {
    const key = `${n}:${h}`, ring = this.ringOf(n, h), me = this.w.me();
    if (!ring || !this.w.hear || d > LISTEN_NEAR || Math.hypot(me.x - ring.x, me.z - ring.z) > ring.r) return;
    const left = (this.tickIn.get(key) ?? 0.5) - dt;
    if (left > 0) { this.tickIn.set(key, left); return; }
    this.tickIn.set(key, 0.4 + Math.min(d, 90) / 90 * 1.5);
    const [dist, pan] = this.w.hear(spot.x, this.w.map.ground(spot.x, spot.z) + 1, spot.z);
    SFX.tinRattle(dist, pan);
  }

  /** The view from by the tin, looking at the place it's near, inked like an old sketch. */
  private takePicture(n: number, spot: { x: number; z: number }) {
    this.picTried.add(n);
    const s = this.t.legs[n], map = this.w.map, y = map.ground(spot.x, spot.z) + 1.7;
    let lx = s.x, lz = s.z;
    if (Math.hypot(lx - spot.x, lz - spot.z) < 12) {
      const a = rng(hash("view", this.offer.seed, n))() * Math.PI * 2;
      lx = spot.x + Math.cos(a) * 30; lz = spot.z + Math.sin(a) * 30;
    }
    const c = snapshot(this.w.scene, spot.x, y, spot.z, lx, map.ground(lx, lz) + 2.5, lz);
    if (!c) return;
    try { this.pics.set(n, c.toDataURL("image/jpeg", 0.8)); } catch { /* ignore */ }
  }

  hint() {
    if (this.near) {
      const last = this.near.tin.n === this.t.legs.length - 1;
      return last ? "<b>E</b> Dig up the Bath Bun chest" : this.halvesOf(this.near.tin.n).length > 1 ? `<b>E</b> Open tin ${this.near.tin.h ? "B" : "A"}` : "<b>E</b> Open the tin";
    }
    return this.hintReady() ? "<b>E</b> Hint: shrink the circle (no gold)" : "";
  }

  private hintReady() {
    if (this.legT < HINT_AFTER || (this.hints && this.hintT < HINT_AGAIN)) return false;
    const n = this.mine;
    return this.halvesOf(n).some((h) => (this.rings.get(`${n}:${h}`) ?? -1) < this.maxRing(n));
  }

  use() {
    if (this.done) return false;
    if (this.near) { this.open(this.near.tin); return true; }
    if (!this.hintReady()) return false;
    // a hint: every circle for this clue comes up, or shrinks a step
    const n = this.mine;
    for (const h of this.halvesOf(n)) {
      const key = `${n}:${h}`;
      this.rings.set(key, Math.min(this.maxRing(n), (this.rings.get(key) ?? -1) + 1));
      this.showRing(n, h);
    }
    this.hints++; this.hintT = 0;
    SFX.warmer(true, true);
    this.w.toast(`Hint: the circle's ${this.nearest < SHRINK_AT[0] ? "shrunk" : "on the map"}. No gold this time`, 3);
    return true;
  }

  /** Whether the next leg should be twin tins: together, with company, where the trail has a pair. */
  private twinNext(n: number) {
    return !this.race && !!this.t.legs[n]?.twin && this.w.players().length >= 2 ? 1 : 0;
  }

  private open(tin: Tin) {
    const n = tin.n, now = performance.now() / 1000;
    if (tin.decoy) {
      if (this.emptied.has(n)) { this.w.toast("Empty, still", 1.5); return; }
      this.emptied.add(n); this.penalty += DECOY_PENALTY;
      SFX.warmer(false);
      this.w.toast(`Nothing here but crumbs: a decoy. +${DECOY_PENALTY} seconds`, 3);
      return;
    }
    if (this.halvesOf(n).length > 1) {
      const other = 1 - tin.h;
      if (now - this.halves[other] > TWIN_WINDOW) {
        this.halves[tin.h] = now; this.halfBy[tin.h] = this.w.selfId;
        this.w.send("qe", { k: "half", s: this.offer.seed, n, h: tin.h });
        SFX.jobStep();
        this.w.toast(`Tin ${tin.h ? "B" : "A"}'s open! Someone open tin ${other ? "B" : "A"} within 30 seconds`, 3);
        return;
      }
    }
    this.sendTin(n);
  }

  private sendTin(n: number) {
    const msg = { k: "tin", s: this.offer.seed, n, t: Date.now(), sp: this.twinNext(n + 1) };
    this.w.send("qe", msg);
    this.event(msg, this.w.selfId);
  }

  event(d: any, from: string) {
    if (this.done) return;
    if (d.k === "half") {
      const n = Number(d.n), h = Number(d.h) ? 1 : 0;
      if (this.race || n !== this.mine) return;
      const now = performance.now() / 1000;
      this.halves[h] = now; this.halfBy[h] = from;
      this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(this.w.nameOf(from))}</b> opened tin ${h ? "B" : "A"}: 30 seconds to open the other!`);
      // both open at once: whoever opened the other one calls it
      if (now - this.halves[1 - h] <= TWIN_WINDOW && this.halfBy[1 - h] === this.w.selfId) this.sendTin(n);
      return;
    }
    if (d.k !== "tin") return;
    const key = this.race ? from : "", n = Number(d.n);
    if ((this.at.get(key) ?? 0) !== n) return;   // already past it (two at once)
    this.at.set(key, n + 1);
    const last = n + 1 >= this.t.legs.length, mine = from === this.w.selfId, me = key === "" || mine;
    if (me) {
      this.legT = 0; this.hintT = 0; this.checkD = Infinity; this.warmth = ""; this.near = null;
      this.halves = [-1e9, -1e9]; this.halfBy = ["", ""];
      if (d.sp) this.twins.add(n + 1);
      this.w.circle("trail", null); this.w.circle("trail2", null);
      this.clearGlows();
    }
    if (!last) {
      if (me) {
        SFX.jobStep();
        const twin = this.twins.has(n + 1) ? " Twin tins: split up!" : "";
        this.w.toast(`${mine ? "Got it!" : `${this.w.nameOf(from)} found the tin.`} Next riddle on the card.${twin}`, 3.5);
      } else this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(this.w.nameOf(from))}</b> is on clue ${n + 2} of ${this.t.legs.length}`);
      return;
    }
    // the chest: dug up, and done
    const tin = [...this.tins.values()].find((t) => t.n === n);
    if (tin) this.digUp(tin);
    const secs = (Number(d.t) - this.started) / 1000 + (me ? this.penalty : 0), par = this.t.par;
    const medal = secs <= par && !this.hints ? "gold" : secs <= par * SILVER ? "silver" : "bronze";
    const score = Math.max(0, Math.round(1000 + (par - secs) * 2 - this.hints * HINT_COST));
    const s = this.t.legs[n], at = tin ?? { x: s.tx, z: s.tz };
    let text: string;
    if (this.race) {
      text = `${mine ? "You" : this.w.nameOf(from)} reached the chest first, in ${clock(secs)}`;
      if (mine) { addRosette(medal); text += ` (${medal}, score ${score}). A ${medal} rosette for your jacket!`; }
    } else {
      addRosette(medal);
      text = `Bath Bun chest dug up in ${clock(secs)}: ${medal}, score ${score}${this.hints ? ` (${this.hints} hint${this.hints > 1 ? "s" : ""})` : ""}. A ${medal} rosette for your jacket!`;
    }
    if (this.daily && (!this.race || mine)) {
      const day = dayNumber(), best = dailyBest(day);
      if (best === null || secs < best) { try { localStorage.setItem(DAILY_KEY, JSON.stringify({ day, best: secs })); } catch { /* ignore */ } }
      this.w.feed(`Trail of the day in <b>${clock(secs)}</b>${best !== null ? (secs < best ? ": a new best!" : `, your best ${clock(best)}`) : ""}`);
    }
    if (!this.race || mine) this.w.announce?.();
    this.done = { won: true, text, x: at.x, z: at.z, wear: medal === "gold" && (!this.race || mine) ? ["helmet"] : undefined,
      grade: !this.race || mine ? { tier: medal === "gold" ? 3 : medal === "silver" ? 2 : 1, best: { v: (medal === "gold" ? 3 : medal === "silver" ? 2 : 1) * 1e5 - secs, text: medal } } : undefined };
  }

  /** The chest rises out of its mound, the lid flies open and coins burst out. */
  private digUp(tin: Tin) {
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 0.015, 8);
    const coins = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: "#f2c94c", toneMapped: false }), COINS);
    coins.position.set(tin.x, tin.y, tin.z);
    coins.frustumCulled = false;
    const v = new Float32Array(COINS * 6);
    for (let k = 0; k < COINS; k++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.2;
      v.set([0, 0.6, 0, Math.cos(a) * s, 4 + Math.random() * 3.5, Math.sin(a) * s], k * 6);
      coins.setMatrixAt(k, _m.makeScale(0, 0, 0));
    }
    coins.visible = false;
    this.w.scene.add(coins);
    this.chestFx = { t: 0, tin, coins, v, sounded: false };
    const me = this.w.me();
    if (Math.hypot(tin.x - me.x, tin.z - me.z) < 60) SFX.dig();
  }

  private chestUpdate(dt: number) {
    const fx = this.chestFx;
    if (!fx) return;
    fx.t += dt;
    const g = fx.tin.view, crate = g.getObjectByName("crate"), lid = g.getObjectByName("lid"), cross = g.getObjectByName("cross");
    const up = Math.min(1, fx.t / 1.1);
    if (crate) crate.position.y = -0.55 + up * 0.6;
    if (cross) cross.visible = fx.t < 0.3;
    const glint = g.getObjectByName("glint");
    if (glint) glint.visible = false;
    if (fx.t > 1.1) {
      if (lid) lid.rotation.x = Math.min(1.9, (fx.t - 1.1) * 6);
      if (!fx.sounded) {
        fx.sounded = true;
        const me = this.w.me();
        if (Math.hypot(fx.tin.x - me.x, fx.tin.z - me.z) < 80) SFX.chest();
      }
      // the coins: up and out, spinning, and down again
      const ct = Math.min(fx.t - 1.1, 2.6);
      fx.coins.visible = fx.t < 4;
      for (let k = 0; k < COINS; k++) {
        const o = k * 6, tk = Math.max(0, ct - (k % 6) * 0.05);
        _p.set(fx.v[o] + fx.v[o + 3] * tk, Math.max(0.02, fx.v[o + 1] + fx.v[o + 4] * tk - 4.9 * tk * tk), fx.v[o + 2] + fx.v[o + 5] * tk);
        _q.setFromEuler(_e.set(tk * 9 + k, tk * 5, 0));
        fx.coins.setMatrixAt(k, _m.compose(_p, _q, tk > 0 ? ONE : ZERO));
      }
      fx.coins.instanceMatrix.needsUpdate = true;
    }
  }

  progress() { return { at: [...this.at], tw: [...this.twins] }; }
  restore(p: any) {
    if (Array.isArray(p?.at)) for (const [k, v] of p.at) this.at.set(String(k), Number(v) || 0);
    if (Array.isArray(p?.tw)) for (const n of p.tw) this.twins.add(Number(n));
  }

  card(): Card {
    const n = this.mine, total = this.t.legs.length, s = this.t.legs[n];
    const secs = (Date.now() - this.started) / 1000 + this.penalty;
    const lead = this.race ? Math.max(0, ...[...this.at].filter(([k]) => k !== this.w.selfId).map(([, v]) => v)) : 0;
    let clue = "";
    if (s) {
      const pic = this.pics.get(n), [a, b] = this.clues[n] ?? ["", ""];
      if (pic) {
        const way = compassWord(s.x - (n ? this.t.legs[n - 1].x : this.offer.x), s.z - (n ? this.t.legs[n - 1].z : this.offer.z));
        clue = `Where was this drawn? Somewhere ${way}.<img src="${pic}" alt="" style="display:block;width:100%;max-width:240px;image-rendering:pixelated;margin-top:4px">`;
      } else clue = a + (s.pic ? "<br><i>A picture comes when you're nearer</i>" : "");
      if (this.halvesOf(n).length > 1) {
        const ids = this.w.players().map((p) => p.id).sort(), mine = ids.indexOf(this.w.selfId) % 2;
        const now = performance.now() / 1000, open = [0, 1].find((h) => now - this.halves[h] <= TWIN_WINDOW);
        const wait = open !== undefined ? `<br><b>Tin ${open ? "B" : "A"} is open: ${Math.ceil(TWIN_WINDOW - (now - this.halves[open]))} s to open tin ${open ? "A" : "B"}!</b>` : "";
        clue = `Twin tins: open both within 30 seconds (you try ${mine ? "B" : "A"}).<br>A: ${clue}<br>B: ${b}${wait}`;
      }
    }
    return {
      line: `Clue ${n + 1} of ${total}${n === total - 1 ? " (the chest)" : ""}: ${clue}`,
      sub: [`par ${clock(this.t.par)}`, this.warmth, this.penalty ? `+${this.penalty} s decoys` : "",
        this.hintReady() ? "E for a hint (no gold)" : this.hints ? `${this.hints} hint${this.hints > 1 ? "s" : ""}` : "",
        this.race && lead ? `best rival on clue ${Math.min(total, lead + 1)}` : ""].filter(Boolean).join(" · "),
      bar: n / total,
      progress: `${Math.min(n + 1, total)} / ${total}`,
      timer: clock(secs),
      stage: s ? { key: `c${n}`, title: n === total - 1 ? "The chest!" : `Clue ${n + 1} of ${total}` } : undefined,
    };
  }

  private clearGlows() {
    for (const g of this.glows.values()) dispose(g.mesh);
    this.glows.clear();
    this.tickIn.clear();
  }

  end() {
    this.clearGlows();
    for (const tin of this.tins.values()) dispose(tin.view);
    this.tins.clear();
    if (this.chestFx) { dispose(this.chestFx.coins); this.chestFx = null; }
    this.pics.clear();
    this.w.circle("trail", null); this.w.circle("trail2", null);
  }
}
