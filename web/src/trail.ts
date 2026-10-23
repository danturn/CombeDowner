// The treasure trail: a chain of clues across part of Bath, each one about a real place (a pub, a
// church, a park or garden, a square, a street), written from the place's name and what kind of
// place it is. Somewhere near each place there's a biscuit tin on a post: walk up and press E to
// open it and get the next clue. The last one is the Bath Bun chest, buried in a mound: open it and
// it's dug up, coins burst out, and you get a rosette for your jacket that everyone can see. Four
// clues on an easy trail, five on a medium one, six on a hard one.
//
// Nothing gives the answer away. A one-star riddle says roughly which way ("somewhere south of
// here"); from two stars there's no distance or compass at all, only the place, with letters
// missing, jumbled or as a cryptic hint ("where a sly red raider of bins drinks"). Now and then the
// riddle is a picture instead: a little inked sketch of the view from near the tin (snapshot.ts),
// taken once that part of Bath is loaded round you. No search circle comes up by itself: stuck, you
// can ask a local (E), and a circle goes on the maps, off-centre, smaller each time you ask. The
// tin only shows within a few metres' walk and rattles when you're close. On medium and hard
// trails some legs have an empty decoy tin near the real one.
//
// Together, there's no clock and no par: the trail is scored on elegance instead. Each leg is worth
// three brass stars, and you lose one for asking a local and one for opening a decoy or the wrong
// tin. The rosette comes from the total (gold for nine in ten of the stars, then silver, then
// bronze), and the end card lists how each leg went. A trail done together can't be lost, so it
// leaves no scar. A race keeps its clock and its par, and has a ghost rival, K: her time is the
// best anyone's done that trail on this device, or the par the first time. Beat her to the chest
// or she digs it up first, leaving a hole and a note for the rest of the day (scars.ts).
//
// Each trail mixes its legs, so it isn't the same thing over and over (after the walking game Big
// Walk's puzzles). Besides the riddles there are:
// - Look-outs: climb to a high place nearby (picked from the lie of the land) and a beam of gold
//   light shows over the tin, but only while you're up there. On your own you remember where it was;
//   with friends, whoever's up top talks the others in.
// - Split clues: the place's name in two halves, alternate letters each. With friends each of you
//   has one half on your own screen, so you have to talk; the other half is also pinned to a post a
//   way off, for anyone on their own.
// - Sounds: no name at all, just a church bell or a busker's tune from where the tin is, carried
//   across the town, to follow by ear.
// - Words: a plaque by the place has a word painted on it; close by stand three tins with words on
//   their tags, and only the one with the plaque's word is the real one.
// - Twin tins: open both within 30 seconds of each other with friends, or on your own with just
//   long enough to get from one to the other quickly (ride if you can).
//
// Two ways to play, set on the poster: together, where anyone's find moves everyone on and the
// brass stars are the team's, and a race, where everyone has their own copy of the trail and first
// to the chest wins. One trail on the noticeboards each day is the trail of the day, the same for
// everyone in every room, with your best brass stars kept on this device.
//
// Who decides what: the trail comes from the poster's seed, so everyone has the same one, and where
// each tin stands comes from the seed and the map too. Opening a tin goes round as "tin" (and half
// of a pair of twin tins as "half"), from whoever opened it; whoever opens a tin says if the next
// leg is twin tins. Asking a local and opening a decoy go round as "el", so together everyone's
// stars agree. Getting up to a look-out goes round as "saw", so everyone's card moves on, but
// the beam is only ever drawn on the screen of whoever is stood up there; which half of a split
// clue you hold comes from the room's ids in order. Nobody needs the host for any of it. K runs on
// each racer's own clock. Rosettes are kept on your device and go round in your hello (game.ts),
// for others to draw on your jacket.
import * as THREE from "three";
import * as SFX from "./audio";
import { dayNumber } from "./daylight";
import { clearSpot, streetSpot } from "./haunts";
import { PATHS } from "./map";
import { snapshot } from "./snapshot";
import { missionEnd } from "./missionscreens";
import { type Fact, type House, countsIn, houseNear, loadedRound, placeAt, shopNear } from "./clues";
import { Lock } from "./lock";
import { type Card, type Job, type Offer, type PostSpot, type QuestWorld, type Rng, compassWord, esc, far, hash, pickOf, registerJob, rng, shuffled } from "./quests";

const COLOUR = "#e0a526";
const RINGS = [130, 75, 40];              // the circle's sizes, a step smaller each time you ask a local
const RING_SHOWN = 150;                   // the circle's edge glows on the ground within this many metres
const GLINT_NEAR = 12;                    // the tin only glints this close
const TIN_NEAR = 40;                      // and isn't even put up until you're this close
const LISTEN_NEAR = 200;                  // the tin can be heard from inside an asked-for circle, at most this far
const LAST_RING = 180;                    // the chest's circle is big, and never shrinks
const PAR_PACE = 5.4;                     // a race's par assumes a brisk walk with some sprinting
const PAR_SEARCH = 55;                    // and a short look about per clue
const SILVER = 1.15;                      // silver's par and a bit
const WALK_PACE = 4.5;                    // metres a second along the streets, for spacing the legs
const ASK_AFTER = 45;                     // seconds on a clue before you can ask a local
const ASK_AGAIN = 20;                     // and between asks
const STARS = 3;                          // brass stars a leg is worth
const GOLD_SHARE = 0.9, SILVER_SHARE = 0.65;   // of all the brass stars, for a gold or silver rosette
const OPEN = 2.6;                         // how close to open a tin
const TWIN_WINDOW = 30;                   // seconds to open the second of twin tins
const SEARCH = 90;                        // seconds of looking about per clue, in the spacing
const TRAIL_TIME = 900;                   // what a trail aims to take, seconds
const PICTURE_NEAR = 700;                 // a picture clue is drawn once you're this close
const THEMES = ["Pubs", "Parks and places", "A bit of everything", "Streets and squares"] as const;
const DAILY = 8;                          // in the poster's mode: the trail of the day
const VIEW_AT = 40;                       // how close to a look-out to see its beam
const SAW_AT = 30;                        // and to count as having been up there
const NOTE_AWAY = 140;                    // the other half of a split clue is pinned up this far along the way
const READ_AT = 5;                        // and can be read this close
const PLAQUE_NEAR = 70;                   // a word leg's plaque is put up this close
const SOUND_EVERY = 4;                    // seconds between the bell's tolls, or the busker's tune
const CLOSE_RATTLE = 30;                  // the tin rattles this close
const LOOK_NEAR = 10;                     // a look leg's tin, on a doorstep, only shows this close
const TWIN_SOLO_PACE = 6;                 // on your own, twin tins give you time to get from one to the other at this many metres a second
const K_SLOW = 1.1;                       // K's first go at a trail: a bit over the par
// plain words anyone can read off a plaque, with nothing to do with any one town
const WORDS = ["LANTERN", "BISCUIT", "OTTER", "THIMBLE", "PUDDLE", "BADGER", "TEAPOT", "WALNUT", "PEBBLE", "KIPPER",
  "MARBLE", "SPROUT", "TRUMPET", "WHISKER", "CRUMPET", "ACORN", "COBBLE", "SPARROW", "TUFFET", "GIBLET"];
const ROSETTE_KEY = "cd-rosettes";
const DAILY_KEY = "cd-trail-daily-stars";
const K_KEY = "cd-trail-k";                // the best race time on each trail, for K

type Kind = "pub" | "church" | "rest" | "green" | "garden" | "square" | "street" | "place";
interface Spot { n: string; x: number; z: number; kind: Kind; rating: number | null }
/** What a leg asks of you: a riddle, a look-out, a clue in two halves, a sound to follow, or a word to read. */
type Step = "riddle" | "view" | "split" | "sound" | "word" | "look";
interface Leg extends Spot {
  tx: number; tz: number;                 // roughly where its tin is (the map picks the exact spot)
  d: number;                              // how far the leg is
  decoy: boolean;                         // an empty decoy tin stands in the circle too
  pic: boolean;                           // a picture clue, once you're near enough
  twin: (Spot & { tx: number; tz: number }) | null;   // a second place, for twin tins
  step: Step;
  hi: Spot | null;                        // a look-out leg's high place, where the beam can be seen from
  word: string;                           // a word leg's word, on the plaque and one of the tins
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
/** Your best brass stars on today's trail of the day. */
function dailyBest(day: number): number | null {
  try { const d = JSON.parse(localStorage.getItem(DAILY_KEY) ?? "null"); return d?.day === day && Number.isFinite(d.best) ? d.best : null; } catch { return null; }
}
/** The best race time on a trail on this device, for K to run to. */
function kBest(seed: number): number | null {
  try { const d = JSON.parse(localStorage.getItem(K_KEY) ?? "{}"); return Number.isFinite(d?.[seed]) ? d[seed] : null; } catch { return null; }
}
function setKBest(seed: number, secs: number) {
  try {
    const d = JSON.parse(localStorage.getItem(K_KEY) ?? "{}") ?? {};
    if (!Number.isFinite(d[seed]) || secs < d[seed]) d[seed] = Math.round(secs);
    const keys = Object.keys(d);
    if (keys.length > 40) delete d[keys[0]];
    localStorage.setItem(K_KEY, JSON.stringify(d));
  } catch { /* ignore */ }
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
  // the lie of the land from the city-wide map, which every player has whole, so everyone picks the same look-outs
  const hgt = (x: number, z: number) => (w.map.wide ?? w.map).ground(x, z);
  const lookouts = [...pubs, ...places].filter((p) => p.kind !== "street");
  const deck = shuffled(r, ["view", "split", "sound", "word", "look", "look"] as Step[]);
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
    let step: Step = k === n - 1 || (k === 0 && o.stars === 1) ? "riddle" : deck.shift() ?? "riddle";
    let hi: Spot | null = null;
    if (step === "view") {
      // somewhere well above the tin and not too far off, the highest there is
      const below = hgt(next.x, next.z);
      let best = 18;
      for (const p of lookouts) {
        const dd = Math.hypot(p.x - next.x, p.z - next.z), up = hgt(p.x, p.z) - below;
        if (dd > 150 && dd < 650 && up > best && p.n !== next.n) { best = up; hi = p; }
      }
      if (!hi) step = "riddle";
    }
    const word = step === "word" ? pickOf(r, WORDS) : "";
    const pic = step === "riddle" && o.stars >= 2 && k < n - 1 && r() < 0.4;
    let twin: Leg["twin"] = null;
    if (step === "riddle" && k > 0 && k < n - 1 && r() < 0.5) {
      const near = pool.filter((p) => p !== next && free(p) && Math.hypot(p.x - next.x, p.z - next.z) > 150 && Math.hypot(p.x - next.x, p.z - next.z) < 450);
      if (near.length) {
        const t = near[Math.floor(r() * near.length)], ta = r() * Math.PI * 2;
        twin = { ...t, tx: t.x + Math.cos(ta) * 10, tz: t.z + Math.sin(ta) * 10 };
        used.add(t.n);
      }
    }
    legs.push({ ...next, tx: next.x + Math.cos(a) * off, tz: next.z + Math.sin(a) * off, d, decoy: step === "riddle" && o.stars >= 2 && k < n - 1 && !twin && r() < 0.45, pic, twin, step, hi, word });
    used.add(next.n);
    par += (hi ? Math.hypot(hi.x - at.x, hi.z - at.z) + Math.hypot(hi.x - next.x, hi.z - next.z) : d) / PAR_PACE + PAR_SEARCH;
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
 * jumbled or cryptic. vague: a one-star trail, which says roughly which way and no more. Places
 * that don't fit a kind get the old missing-letters, first-letter and anagram clues.
 */
function riddle(s: Spot, fx: number, fz: number, hard: number, vague: boolean, r: Rng): string {
  return riddleText(s, hard, vague ? `Somewhere ${compassWord(s.x - fx, s.z - fz)} of here.` : "", r).replace(/\s+$/, "").replace(/<br>$/, "");
}
function riddleText(s: Spot, hard: number, where: string, r: Rng): string {
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
      if (hard === 1) return `A place beginning with <b>${esc(s.n[0].toUpperCase())}</b>. ${where}`;
      return `<b class="clue">${esc(anagram(s.n, r))}</b> (jumbled)<br>${where}`;
  }
}

// ---- the job ------------------------------------------------------------------------------------

let dailyDay = -1;   // the day whose trail of the day has been put up

registerJob({
  id: "trail", glyph: "T", colour: COLOUR, label: "Treasure trail",
  goal: (o) => (o.mode ?? 0) % 2 ? "Solve the riddles and beat the others, and K, to the chest" : "Solve the riddles, find every tin and dig up the chest, tidily",
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
    const kinds = new Set(t.legs.map((l) => l.step)), extra = [kinds.has("view") && "a look-out", kinds.has("split") && "a split clue",
      kinds.has("sound") && "a sound to follow", kinds.has("word") && "a word to read", kinds.has("look") && "a house to pick out"].filter(Boolean).join(", ");
    o.blurb = `${t.legs.length} clues, each to a real place, with a locked tin to find near each${extra ? `, with ${extra} along the way` : ""}. `
      + "Each lock's code is read off the place: count what it asks. "
      + (o.stars > 1 ? "The clues don't say how far or which way: work it out, or ask a local. " : "")
      + (race ? `Everyone has their own copy: first to the chest wins, and K's racing you too. Par ${clock(t.par)}.`
        : `Anyone's find moves everyone on. No clock: each leg's worth three brass stars, and asking a local costs one.${daily ? " The same trail for everyone today, so compare stars." : ""}`)
      + (best !== null ? ` Your best today: ${best} brass stars.` : "");
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
  o.traverse((m) => {
    if (m instanceof THREE.Mesh) m.geometry.dispose();
    if (m instanceof THREE.Mesh || m instanceof THREE.Sprite) { const mat = m.material as THREE.MeshBasicMaterial; mat.map?.dispose(); mat.dispose(); }
  });
}

const COINS = 36;
const GLOW_SEGS = 96;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1), ZERO = new THREE.Vector3(0, 0, 0);

/** How far data point (x, y) is from the segment a to b. */
function segDist(x: number, y: number, a: number[], b: number[]) {
  const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2));
  return Math.hypot(a[0] + ex * t - x, a[1] + ey * t - y);
}

/** What a leg cost in brass stars: locals asked, locks jammed, decoys opened; and who opened its tin. */
interface Cost { ask: number; jam: number; decoy: number; by: string }
const legStars = (c: Cost) => Math.max(0, STARS - c.ask - c.jam - c.decoy);
const K_COLOUR = "#b0b8c8";
/** What a local says when asked the way. */
const LOCALS = ["\"Oh, you want round there, love.\"", "\"Seen a tin? Try over that way.\"", "\"Everyone's asking me that today.\"",
  "\"I'll draw you a circle, shall I?\"", "\"Down there and about a bit, I think.\""];

interface Tin { view: THREE.Group; n: number; h: number; x: number; z: number; y: number; decoy?: boolean; word?: string; sign?: boolean }

/** A picture drawn on a canvas, for a sign or a label. */
function painted(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A painted plaque on a post, with a word lettered on it by hand (both faces). */
function plaqueModel(word: string) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), new THREE.MeshLambertMaterial({ color: "#3b2a1a" }));
  post.position.y = 0.75;
  const tex = painted(256, 128, (x) => {
    x.fillStyle = "#1f3b5a"; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = "#e8d9a8"; x.lineWidth = 6; x.strokeRect(8, 8, 240, 112);
    x.fillStyle = "#f4ecd4"; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = "700 44px Georgia, serif";
    x.fillText(word, 128, 66, 220);
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
  face.position.y = 1.55;
  g.add(post, face);
  return g;
}

/** A tin with a word on a little tag over it, for a word leg's three tins. */
function wordTinModel(word: string) {
  const g = tinModel(false, "#2e7d4f");
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: painted(256, 64, (x) => {
    x.fillStyle = "#f4ecd4"; x.fillRect(0, 0, 256, 64);
    x.fillStyle = "#1b1b1d"; x.font = "700 40px Georgia, serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(word, 128, 34, 240);
  }), toneMapped: false }));
  tag.scale.set(0.8, 0.2, 1); tag.position.y = 1.75;
  g.add(tag);
  return g;
}

/** Half a clue on a sheet of paper pinned to a post. */
function noteModel() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), new THREE.MeshLambertMaterial({ color: "#5a3d22" }));
  post.position.y = 0.7;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), new THREE.MeshLambertMaterial({ color: "#f4ecd4", side: THREE.DoubleSide }));
  sheet.position.set(0, 1.25, 0.05);
  g.add(post, sheet);
  return g;
}

/** A tall shaft of gold light over a look-out leg's tin, drawn only for someone stood up at the look-out. */
function beamModel() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 160, 10, 1, true), new THREE.MeshBasicMaterial({
    color: "#ffd84a", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
  }));
  m.frustumCulled = false;
  return m;
}

/** A name in two halves: alternate letters each, so neither half reads on its own. */
function halves(name: string): [string, string] {
  const up = name.toUpperCase(), out: [string, string] = ["", ""];
  let k = 0;
  for (const c of up) {
    if (/[A-Z]/.test(c)) { out[k % 2] += c + " "; out[1 - (k % 2)] += "_ "; k++; }
    else if (c === " ") { out[0] += "&nbsp;&nbsp;"; out[1] += "&nbsp;&nbsp;"; }
    else { out[0] += esc(c) + " "; out[1] += esc(c) + " "; }
  }
  return out;
}
const KIND_WORD: Record<Kind, string> = { pub: "a pub", church: "a church", rest: "a churchyard", green: "a park or green", garden: "a garden", square: "a square or terrace", street: "a street", place: "a place" };

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
  private askT = 0;                          // seconds since a local was last asked
  private costs: Cost[];                     // what each leg's cost in brass stars, and who opened it
  private kTime: number;                     // a race: when K gets to the chest, seconds in
  private kAt = 0;                           // and how many tins she's opened
  private near: { tin: Tin; d: number } | null = null;
  private glows = new Map<string, { mesh: THREE.Mesh; k: number; built: number }>();   // the circles' edges on the ground
  private decoys = new Map<number, { x: number; z: number }>();   // where each leg's decoy tin stands, once known
  private emptied = new Set<number>();       // decoys already opened
  private tickIn = new Map<string, number>();   // seconds until each tin next rattles
  private chestFx: { t: number; tin: Tin; coins: THREE.InstancedMesh; v: Float32Array; sounded: boolean } | null = null;
  private viewed = new Set<number>();        // look-out legs someone's been up to
  private sawBy = new Map<number, string>();
  private beam: THREE.Mesh | null = null;
  private halfRead = new Set<number>();      // split clues whose pinned-up half you've read yourself
  private notes = new Map<number, { x: number; z: number }>();
  private noteView: { n: number; view: THREE.Group } | null = null;
  private wordSpots = new Map<number, { x: number; z: number; word: string }[]>();
  private wrong = new Set<string>();         // wrong-word tins already opened
  private soundT = 0;
  private lock = new Lock();
  private locks = new Map<string, { code: number[]; ask: string }>();   // each tin's lock, by "leg:half", once its place is loaded
  private wheels = new Map<string, number[]>();   // where you left each lock's wheels
  private lockAt: { x: number; z: number; key: string } | null = null;
  private houses = new Map<number, House | null>();   // a look leg's house, once its street is loaded (null: none to be had)

  constructor(readonly offer: Offer, private w: QuestWorld, private started: number) {
    this.t = trailOf(offer, w);
    this.race = !!((offer.mode ?? 0) & 1);
    this.daily = !!((offer.mode ?? 0) & DAILY);
    this.costs = this.t.legs.map(() => ({ ask: 0, jam: 0, decoy: 0, by: "" }));
    this.kTime = kBest(offer.seed) ?? this.t.par * K_SLOW;
    const r = rng(hash("clues", offer.seed));
    let fx = offer.x, fz = offer.z;
    this.clues = this.t.legs.map((s) => {
      const hard = offer.stars === 1 ? 1 : offer.stars === 2 ? 1 + Math.floor(r() * 2) : 2;
      const vague = offer.stars === 1;
      const c = [riddle(s, fx, fz, hard, vague, r), s.twin ? riddle(s.twin, fx, fz, hard, vague, r) : ""];
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
    if (this.t.legs[n].step === "look") {
      // on the doorstep of the house the clue picks out
      const house = this.houseOf(n);
      if (house === undefined) return null;
      if (house) {
        const ox = house.x + Math.sin(house.a) * 2.2, oz = house.z + Math.cos(house.a) * 2.2;
        const c = map.indoors(ox, oz) ? (([x, z]) => ({ x, z }))(clearSpot(map, ox, oz, 6) ?? [ox, oz]) : { x: ox, z: oz };
        this.spots.set(key, c);
        return c;
      }
    }
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
    this.legT += dt; this.askT += dt;
    this.lock.update(dt);
    if (this.lock.open && this.lockAt && (Math.hypot(this.lockAt.x - me.x, this.lockAt.z - me.z) > OPEN + 2 || !this.lockAt.key.startsWith(`${n}:`) || !me.alive)) {
      if (this.lockAt) this.wheels.set(this.lockAt.key, this.lock.wheels);
      this.lock.hide();
    }
    if (this.race) this.rival();
    if (this.done) return;
    // tins from an earlier clue come down
    for (const [k, tin] of this.tins) if (tin.n !== n) { dispose(tin.view); this.tins.delete(k); }
    if (this.noteView && this.noteView.n !== n) { dispose(this.noteView.view); this.noteView = null; }
    const last = n === this.t.legs.length - 1, step = s.step;
    const climbing = step === "view" && !this.viewed.has(n);
    this.near = null;
    for (const h of this.halvesOf(n)) {
      const key = `${n}:${h}`, spot = this.spotOf(n, h), at = spot ?? this.aim(n, h);
      const d = Math.hypot(at.x - me.x, at.z - me.z);
      // the tin itself (a word leg's plaque), once you're close enough for it to matter
      if (spot && !this.tins.has(key) && d < (step === "word" ? PLAQUE_NEAR : step === "look" && this.houses.get(n) ? LOOK_NEAR : TIN_NEAR)) {
        const view = step === "word" ? plaqueModel(s.word) : tinModel(last, h ? "#2f6fb3" : "#b3262e"), y = this.w.map.ground(spot.x, spot.z);
        view.position.set(spot.x, y, spot.z);
        if (step === "word") view.rotation.y = Math.atan2(me.x - spot.x, me.z - spot.z);
        this.w.scene.add(view);
        this.tins.set(key, { view, n, h, x: spot.x, z: spot.z, y, sign: step === "word" });
      }
      const tin = this.tins.get(key);
      if (tin && !tin.sign) {
        const g = tin.view.getObjectByName("glint");
        if (g) { g.visible = d < GLINT_NEAR; g.rotation.y += dt * 3; g.position.y = (last ? 1.2 : 1.4) + Math.sin(performance.now() / 300) * 0.06; }
        if (d < OPEN && (!this.near || d < this.near.d)) this.near = { tin, d };
      }
      this.showRing(n, h, dt);
      if (spot && step !== "word") this.listen(n, h, spot, d, dt);
      if (step === "sound" && h === 0) this.sound(n, at, dt);
    }
    if (step === "word") this.wordTins(n, dt);
    if (step === "split") this.splitNote(n);
    if (step === "view") this.lookout(n, climbing);
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
    // a picture clue: drawn once, when that part of Bath is round you
    if (s.pic && !this.pics.has(n) && !this.picTried.has(n)) {
      const spot = this.spotOf(n, 0);
      if (spot && Math.hypot(spot.x - me.x, spot.z - me.z) < PICTURE_NEAR) this.takePicture(n, spot);
    }
  }

  /** A race: K's on her own clock, a tin at a time, and if she gets to the chest first, you've lost. */
  private rival() {
    const secs = (Date.now() - this.started) / 1000, total = this.t.legs.length;
    const at = Math.min(total, Math.floor((secs / this.kTime) * total));
    if (at > this.kAt) {
      this.kAt = at;
      if (at < total) this.w.feed(`<b style="color:${K_COLOUR}">K</b> has opened tin ${at} of ${total}. She's not hanging about`);
    }
    if (secs > this.kTime) this.lose();
  }

  /** A look-out leg: get up to the high place, and from there a beam shows over the tin, for you only while you're up there. */
  private lookout(n: number, climbing: boolean) {
    const s = this.t.legs[n], hi = s.hi!, me = this.w.me();
    const up = Math.hypot(hi.x - me.x, hi.z - me.z);
    this.w.circle("trailhi", climbing ? { x: hi.x, z: hi.z, r: SAW_AT + 10, colour: COLOUR, pulse: true } : null);
    if (climbing) {
      if (up < SAW_AT && me.alive) {
        const msg = { k: "saw", s: this.offer.seed, n };
        this.w.send("qe", msg);
        this.event(msg, this.w.selfId);
      }
    }
    const show = up < VIEW_AT;
    if (show && !this.beam) { this.beam = beamModel(); this.w.scene.add(this.beam); }
    if (this.beam) {
      this.beam.visible = show;
      const at = this.spotOf(n, 0) ?? this.aim(n, 0);
      this.beam.position.set(at.x, this.w.map.ground(at.x, at.z) + 80, at.z);
      (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.15 * Math.sin(performance.now() / 300);
    }
  }

  /** A sound leg: the bell (or the busker) from where the tin is, every few seconds, wherever you are within earshot. */
  private sound(n: number, at: { x: number; z: number }, dt: number) {
    if (!this.w.hear || (this.soundT -= dt) > 0) return;
    this.soundT = SOUND_EVERY;
    const [dist, pan] = this.w.hear(at.x, this.w.map.ground(at.x, at.z) + 6, at.z), s = this.t.legs[n];
    if (s.kind === "church" || s.kind === "rest") SFX.trailBell(dist, pan);
    else SFX.buskerTune(hash("tune", this.offer.seed, n), dist, pan);
  }

  /** Where the other half of a split clue is pinned up: a way along from where the leg starts, the same for everyone. */
  private noteOf(n: number) {
    const had = this.notes.get(n);
    if (had) return had;
    const from = this.legStart(n), s = this.t.legs[n], map = this.w.map;
    const toward = Math.atan2(s.z - from.z, s.x - from.x), a = toward + (rng(hash("note", this.offer.seed, n))() - 0.5) * 1.6;
    const tx = from.x + Math.cos(a) * NOTE_AWAY, tz = from.z + Math.sin(a) * NOTE_AWAY;
    if (!map.detailedAt(tx, tz)) return null;
    const p = streetSpot(map, tx, tz, 0, 40, 0.6, (x, z) => !map.indoors(x, z), 4, 3, rng(hash("notespot", this.offer.seed, n)));
    const c = p ? { x: p.x, z: p.z } : (([x, z]) => ({ x, z }))(clearSpot(map, tx, tz, 15) ?? [tx, tz]);
    this.notes.set(n, c);
    return c;
  }

  /** Where leg n starts, from the seed alone, so a note pinned up from it is in the same place for everyone. */
  private legStart(n: number) {
    return n ? { x: this.t.legs[n - 1].tx, z: this.t.legs[n - 1].tz } : { x: this.offer.x, z: this.offer.z };
  }

  private splitNote(n: number) {
    if (this.halfRead.has(n)) return;
    const at = this.noteOf(n), me = this.w.me();
    if (!at) return;
    const d = Math.hypot(at.x - me.x, at.z - me.z);
    if (!this.noteView && d < TIN_NEAR * 2) {
      const view = noteModel();
      view.position.set(at.x, this.w.map.ground(at.x, at.z), at.z);
      view.rotation.y = Math.atan2(me.x - at.x, me.z - at.z);
      this.w.scene.add(view);
      this.noteView = { n, view };
    }
    if (d < READ_AT) {
      this.halfRead.add(n);
      SFX.jobStep();
      this.w.toast("You've read the other half of the clue", 2.5);
    }
  }

  /** A word leg's three tins, a little way from the plaque: only the one with the plaque's word on it is the real one. */
  private wordTins(n: number, dt: number) {
    const plaque = this.spots.get(`${n}:0`), map = this.w.map, me = this.w.me(), s = this.t.legs[n];
    if (!plaque) return;
    let list = this.wordSpots.get(n);
    if (!list) {
      const r = rng(hash("words", this.offer.seed, n)), words = shuffled(r, [s.word, ...shuffled(r, WORDS.filter((w) => w !== s.word)).slice(0, 2)]);
      list = [];
      for (const word of words) {
        const p = streetSpot(map, plaque.x, plaque.z, 14, 45, 0.6, (x, z) => !map.indoors(x, z) && list!.every((o) => Math.hypot(o.x - x, o.z - z) > 6), 4, 3, r);
        const c = p ?? (([x, z]) => ({ x, z }))(clearSpot(map, plaque.x + (list.length - 1) * 5, plaque.z + 20, 10) ?? [plaque.x + (list.length - 1) * 5, plaque.z + 20]);
        list.push({ x: c.x, z: c.z, word });
      }
      this.wordSpots.set(n, list);
    }
    list.forEach((o, k) => {
      const key = `${n}:w${k}`, d = Math.hypot(o.x - me.x, o.z - me.z);
      if (!this.tins.has(key) && d < TIN_NEAR) {
        const view = wordTinModel(o.word), y = map.ground(o.x, o.z);
        view.position.set(o.x, y, o.z);
        this.w.scene.add(view);
        this.tins.set(key, { view, n, h: k, x: o.x, z: o.z, y, word: o.word });
      }
      const tin = this.tins.get(key);
      if (!tin) return;
      const g = tin.view.getObjectByName("glint");
      if (g) { g.visible = d < GLINT_NEAR && !this.wrong.has(key); g.rotation.y += dt * 3; }
      if (d < OPEN && (!this.near || d < this.near.d)) this.near = { tin, d };
    });
  }

  /** A race K got to first: she digs up the chest. Only a race can be lost. */
  private lose() {
    const s = this.t.legs[this.t.legs.length - 1], at = this.spots.get(`${this.t.legs.length - 1}:0`) ?? { x: s.tx, z: s.tz };
    this.done = { won: false, text: `K got to the chest first, in ${clock(this.kTime)}`, x: at.x, z: at.z };
  }

  /** Where losing leaves its mark: the chest's hole, dug by K. */
  scarAt() {
    const k = this.t.legs.length - 1, s = this.t.legs[k];
    return s ? this.spots.get(`${k}:0`) ?? { x: s.tx, z: s.tz } : null;
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
    const inRing = !!ring && Math.hypot(me.x - ring.x, me.z - ring.z) <= ring.r;
    if (!this.w.hear || d > LISTEN_NEAR || (!inRing && d > CLOSE_RATTLE)) return;
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
      const tin = this.near.tin;
      if (tin.word) return `<b>E</b> Open the tin marked ${esc(tin.word)}`;
      return last ? "<b>E</b> Dig up the Bath Bun chest" : this.halvesOf(tin.n).length > 1 ? `<b>E</b> Open tin ${tin.h ? "B" : "A"}` : "<b>E</b> Open the tin";
    }
    return this.askReady() ? "<b>E</b> Ask a local (costs a brass star)" : "";
  }

  private askReady() {
    if (this.legT < ASK_AFTER || this.askT < ASK_AGAIN) return false;
    const n = this.mine;
    return this.halvesOf(n).some((h) => (this.rings.get(`${n}:${h}`) ?? -1) < this.maxRing(n));
  }

  use() {
    if (this.done) return false;
    if (this.near) { this.open(this.near.tin); return true; }
    if (!this.askReady()) return false;
    // a local points the way: every circle for this clue comes up, or shrinks a step
    const n = this.mine;
    for (const h of this.halvesOf(n)) {
      const key = `${n}:${h}`;
      this.rings.set(key, Math.min(this.maxRing(n), (this.rings.get(key) ?? -1) + 1));
      this.showRing(n, h);
    }
    this.askT = 0;
    this.spend(n, "ask");
    SFX.warmer(true, true);
    this.w.toast(pickOf(rng(hash("local", this.offer.seed, n, this.costs[n]?.ask ?? 0)), LOCALS) + " It's on your map.", 3.5);
    return true;
  }

  /** A brass star lost on leg n, for everyone doing it with you. */
  private spend(n: number, what: "ask" | "jam" | "decoy") {
    const msg = { k: "el", s: this.offer.seed, n, w: what };
    if (!this.race) this.w.send("qe", msg);
    this.event(msg, this.w.selfId);
  }

  /** Whether the next leg should be twin tins: together, where the trail has a pair (on your own too, with longer to do it). */
  private twinNext(n: number) {
    return !this.race && !!this.t.legs[n]?.twin ? 1 : 0;
  }

  /** Seconds to open the second of twin tins: half a minute between friends, or long enough to get there quick on your own. */
  private twinWindow(n: number) {
    const s = this.t.legs[n];
    if (this.w.players().length >= 2 || !s?.twin) return TWIN_WINDOW;
    return Math.round(TWIN_WINDOW + Math.hypot(s.twin.tx - s.tx, s.twin.tz - s.tz) / TWIN_SOLO_PACE);
  }

  private open(tin: Tin) {
    const n = tin.n;
    if (tin.word) {
      const key = `${n}:w${tin.h}`;
      if (tin.word !== this.t.legs[n].word) {
        if (this.wrong.has(key)) { this.w.toast("Still the wrong word", 1.5); return; }
        this.wrong.add(key);
        this.spend(n, "decoy");
        SFX.warmer(false);
        this.w.toast("Not what the plaque said: an empty tin. That's a brass star gone", 3);
        return;
      }
      this.unlock(tin, () => this.sendTin(n));
      return;
    }
    if (tin.decoy) {
      if (this.emptied.has(n)) { this.w.toast("Empty, still", 1.5); return; }
      this.emptied.add(n);
      this.spend(n, "decoy");
      SFX.warmer(false);
      this.w.toast("Nothing here but crumbs: a decoy. That's a brass star gone", 3);
      return;
    }
    this.unlock(tin, () => this.opened(tin));
  }

  /** A real tin's lock: up it comes, and once the wheels are right, then() opens the tin. The chest has none. */
  private unlock(tin: Tin, then: () => void) {
    const n = tin.n, key = `${n}:${tin.word ? "w" : tin.h}`;
    if (n === this.t.legs.length - 1) { then(); return; }
    const lock = this.lockOf(key, n, tin.x, tin.z);
    if (!lock) { this.w.toast("The lock's stiff: give it a moment", 1.5); return; }
    this.lockAt = { x: tin.x, z: tin.z, key };
    this.lock.show({
      ask: lock.ask, code: lock.code,
      onOpen: () => { this.wheels.delete(key); this.lockAt = null; SFX.jobStep(); then(); },
      onJam: () => { this.spend(n, "jam"); this.w.toast("Clunk. Jammed for ten seconds, and a brass star gone", 2.5); },
    }, this.wheels.get(key));
  }

  /** What tin (n, h)'s lock asks, read off the place round it: the house it stands at, or things to
   *  count in the park it's in, or the shop beside it; failing all those, the code's been scratched
   *  on the lid. Null until the place round it is loaded; the same for everyone after that. */
  private lockOf(key: string, n: number, x: number, z: number) {
    const had = this.locks.get(key);
    if (had) return had;
    const map = this.w.map, r = rng(hash("lock", this.offer.seed, key)), s = this.t.legs[n];
    if (!loadedRound(map, x, z, 140)) return null;
    let facts: Fact[] | null = null, ask = "";
    const house = s.step === "look" ? this.houses.get(n) ?? null : houseNear(map, x, z, 30);
    if (house) { facts = shuffled(r, house.facts); ask = `My code's on ${house.name}: `; }
    if (!facts) {
      const place = placeAt(map, x, z), counts = place ? countsIn(map, place.r, place.n) : null;
      const shop = shopNear(map, x, z, 25);
      const all = [...counts ?? [], ...shop ? [shop] : []];
      if (all.length >= 3) { facts = shuffled(r, all).slice(0, 3); ask = "My code: count "; }
    }
    let lock: { code: number[]; ask: string };
    if (facts) lock = { code: facts.map((f) => f.n), ask: `${ask}${facts.map((f) => esc(f.ask)).join(", then ")}.` };
    else {
      const code = [0, 1, 2].map(() => Math.floor(r() * 10));
      lock = { code, ask: `Someone's scratched <b>${code.join(" ")}</b> into the lid. Lucky.` };
    }
    this.locks.set(key, lock);
    return lock;
  }

  /** A look leg's house: picked out from its street once that's loaded here, the same for everyone. */
  private houseOf(n: number): House | null | undefined {
    if (this.houses.has(n)) return this.houses.get(n);
    const s = this.t.legs[n], map = this.w.map;
    if (!loadedRound(map, s.x, s.z, 230)) return undefined;
    let where: ((x: number, z: number) => boolean) | undefined;
    if (s.kind === "street") {
      const lines = [map, ...map.tilesNear(s.x, s.z, 200)].flatMap((m) => m.d.rd).filter((rd) => rd.n === s.n).map((rd) => rd.p);
      where = (x, z) => lines.some((p) => p.some((q, i) => i > 0 && segDist(x, -z, p[i - 1], q) < 22));
    }
    const house = houseNear(map, s.x, s.z, 120, where, where ? 100 : 60);
    this.houses.set(n, house);
    return house;
  }

  /** A real tin opened: half of twin tins, or the leg done. */
  private opened(tin: Tin) {
    const n = tin.n, now = performance.now() / 1000;
    if (this.halvesOf(n).length > 1) {
      const other = 1 - tin.h;
      const win = this.twinWindow(n);
      if (now - this.halves[other] > win) {
        this.halves[tin.h] = now; this.halfBy[tin.h] = this.w.selfId;
        this.w.send("qe", { k: "half", s: this.offer.seed, n, h: tin.h });
        SFX.jobStep();
        this.w.toast(`Tin ${tin.h ? "B" : "A"}'s open! ${this.w.players().length >= 2 ? "Someone open" : "Get to"} tin ${other ? "B" : "A"} within ${win} seconds`, 3);
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
    if (d.k === "el") {
      const n = Number(d.n), c = this.costs[n], what = d.w;
      if (!c || (this.race && from !== this.w.selfId) || (what !== "ask" && what !== "jam" && what !== "decoy")) return;
      c[what as "ask" | "jam" | "decoy"]++;
      if (from !== this.w.selfId && n === this.mine && what === "ask") {
        for (const h of this.halvesOf(n)) { const key = `${n}:${h}`; this.rings.set(key, Math.min(this.maxRing(n), (this.rings.get(key) ?? -1) + 1)); }
        this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(this.w.nameOf(from))}</b> asked a local: there's a circle on the map`);
      }
      return;
    }
    if (d.k === "saw") {
      const n = Number(d.n);
      if ((this.race && from !== this.w.selfId) || n !== this.mine || this.viewed.has(n)) return;
      this.viewed.add(n); this.sawBy.set(n, from);
      SFX.jobStep();
      if (from === this.w.selfId) this.w.toast("There! A beam of gold light over the tin. Remember where it is: you can only see it from up here", 4.5);
      else this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(this.w.nameOf(from))}</b> can see the beam from up at the look-out: ask them where to go`);
      return;
    }
    if (d.k === "half") {
      const n = Number(d.n), h = Number(d.h) ? 1 : 0;
      if (this.race || n !== this.mine) return;
      const now = performance.now() / 1000;
      this.halves[h] = now; this.halfBy[h] = from;
      const win = this.twinWindow(n);
      this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(this.w.nameOf(from))}</b> opened tin ${h ? "B" : "A"}: ${win} seconds to open the other!`);
      // both open at once: whoever opened the other one calls it
      if (now - this.halves[1 - h] <= win && this.halfBy[1 - h] === this.w.selfId) this.sendTin(n);
      return;
    }
    if (d.k !== "tin") return;
    const key = this.race ? from : "", n = Number(d.n);
    if ((this.at.get(key) ?? 0) !== n) return;   // already past it (two at once)
    this.at.set(key, n + 1);
    const last = n + 1 >= this.t.legs.length, mine = from === this.w.selfId, me = key === "" || mine;
    if (mine && this.costs[n]) this.costs[n].by = from;
    else if (!this.race && this.costs[n] && !this.costs[n].by) this.costs[n].by = from;
    if (me) {
      this.legT = 0; this.askT = ASK_AGAIN; this.near = null;
      this.halves = [-1e9, -1e9]; this.halfBy = ["", ""];
      if (d.sp) this.twins.add(n + 1);
      this.w.circle("trail", null); this.w.circle("trail2", null); this.w.circle("trailhi", null);
      this.clearGlows();
      if (this.beam) { dispose(this.beam); this.beam = null; }
      this.soundT = 0;
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
    const s = this.t.legs[n], at = tin ?? { x: s.tx, z: s.tz };
    if (this.race) this.raceEnd(from, mine, Number(d.t), at);
    else this.togetherEnd(at);
  }

  /** A race over: your time against the par, and K's to beat next time. */
  private raceEnd(from: string, mine: boolean, t: number, at: { x: number; z: number }) {
    const secs = (t - this.started) / 1000, par = this.t.par;
    const medal = secs <= par ? "gold" : secs <= par * SILVER ? "silver" : "bronze";
    const score = Math.max(0, Math.round(1000 + (par - secs) * 2));
    let text = `${mine ? "You" : this.w.nameOf(from)} reached the chest first, in ${clock(secs)}, ahead of K`;
    setKBest(this.offer.seed, secs);
    if (mine) {
      addRosette(medal);
      text += ` (${medal}, score ${score}). A ${medal} rosette for your jacket!`;
      this.w.announce?.();
    }
    this.done = { won: true, text, x: at.x, z: at.z, wear: medal === "gold" && mine ? ["helmet"] : undefined,
      grade: mine ? { tier: medal === "gold" ? 3 : medal === "silver" ? 2 : 1, best: { v: (medal === "gold" ? 3 : medal === "silver" ? 2 : 1) * 1e5 - secs, text: medal } } : undefined };
  }

  /** Done together: the rosette from the brass stars, and the end card telling how each leg went. */
  private togetherEnd(at: { x: number; z: number }) {
    const got = this.costs.reduce((a, c) => a + legStars(c), 0), of = this.costs.length * STARS, share = got / of;
    const medal = share >= GOLD_SHARE ? "gold" : share >= SILVER_SHARE ? "silver" : "bronze";
    addRosette(medal);
    const lines = [`${got} of ${of} brass stars: a ${medal} rosette for your jacket!`, ...this.costs.map((c, k) => this.moment(c, k))];
    if (this.daily) {
      const day = dayNumber(), best = dailyBest(day);
      if (best === null || got > best) { try { localStorage.setItem(DAILY_KEY, JSON.stringify({ day, best: got })); } catch { /* ignore */ } }
      this.w.feed(`Trail of the day: <b>${got} of ${of}</b> brass stars${best !== null ? (got > best ? ", a new best!" : `, your best ${best}`) : ""}`);
    }
    this.w.announce?.();
    missionEnd({ result: "complete", title: "Bath Bun chest dug up!", lines, medal });
    this.done = { won: true, screen: true, text: lines[0], x: at.x, z: at.z, wear: medal === "gold" ? ["helmet"] : undefined,
      grade: { tier: medal === "gold" ? 3 : medal === "silver" ? 2 : 1, best: { v: got, text: `${got} of ${of} brass stars` } } };
  }

  /** How leg k went, in a line for the end card. */
  private moment(c: Cost, k: number) {
    const who = c.by ? this.w.nameOf(c.by) : "Someone", stars = "★".repeat(legStars(c)) + "☆".repeat(STARS - legStars(c));
    const bits = [c.ask && `${c.ask === 1 ? "a local asked" : `${c.ask} locals asked`}`, c.jam && `${c.jam === 1 ? "a jammed lock" : `${c.jam} jams`}`,
      c.decoy && `${c.decoy === 1 ? "a decoy opened" : `${c.decoy} decoys opened`}`].filter(Boolean);
    const last = k === this.costs.length - 1;
    return `${stars} Leg ${k + 1}: ${bits.length ? `${who} got there, with ${bits.join(", ")}` : `${who} ${last ? "found the chest" : "opened it"} first time`}`;
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

  progress() { return { at: [...this.at], tw: [...this.twins], v: [...this.viewed], c: this.race ? undefined : this.costs }; }
  restore(p: any) {
    if (Array.isArray(p?.c)) p.c.forEach((c: any, k: number) => {
      const mine = this.costs[k];
      if (!mine || !c) return;
      mine.ask = Number(c.ask) || 0; mine.jam = Number(c.jam) || 0; mine.decoy = Number(c.decoy) || 0; mine.by = String(c.by ?? "");
    });
    if (Array.isArray(p?.v)) for (const n of p.v) this.viewed.add(Number(n));
    if (Array.isArray(p?.at)) for (const [k, v] of p.at) this.at.set(String(k), Number(v) || 0);
    if (Array.isArray(p?.tw)) for (const n of p.tw) this.twins.add(Number(n));
  }

  card(): Card {
    const n = this.mine, total = this.t.legs.length, s = this.t.legs[n];
    const lead = this.race ? Math.max(0, ...[...this.at].filter(([k]) => k !== this.w.selfId).map(([, v]) => v)) : 0;
    let clue = "";
    if (s) {
      const pic = this.pics.get(n), [a, b] = this.clues[n] ?? ["", ""];
      if (pic) clue = `Where was this drawn?${this.vague(n)}<img src="${pic}" alt="" style="display:block;width:100%;max-width:240px;image-rendering:pixelated;margin-top:4px">`;
      else clue = this.stepClue(n, a) + (s.pic ? "<br><i>A picture comes when you're nearer</i>" : "");
      if (this.halvesOf(n).length > 1) {
        const ids = this.w.players().map((p) => p.id).sort(), mine = ids.indexOf(this.w.selfId) % 2;
        const win = this.twinWindow(n), solo = this.w.players().length < 2;
        const now = performance.now() / 1000, open = [0, 1].find((h) => now - this.halves[h] <= win);
        const wait = open !== undefined ? `<br><b>Tin ${open ? "B" : "A"} is open: ${Math.ceil(win - (now - this.halves[open]))} s to open tin ${open ? "A" : "B"}!</b>` : "";
        clue = `Twin tins: open both within ${win} seconds (${solo ? "on your own, so be quick between them" : `you try ${mine ? "B" : "A"}`}).<br>A: ${clue}<br>B: ${b}${wait}`;
      }
    }
    if (s && n < total - 1) {
      const me = this.w.me();
      for (const t of this.tins.values()) {
        if (t.n !== n || t.decoy || t.sign || (t.word && t.word !== s.word) || Math.hypot(t.x - me.x, t.z - me.z) > TIN_NEAR) continue;
        const lock = this.lockOf(`${n}:${t.word ? "w" : t.h}`, n, t.x, t.z);
        if (lock) clue += `<br>The tin's lock: ${lock.ask}`;
        break;
      }
    }
    const got = this.costs.slice(0, n).reduce((a, c) => a + legStars(c), 0), here = this.costs[n] ? legStars(this.costs[n]) : 0;
    const asked = this.costs[n]?.ask ?? 0;
    const sub = this.race
      ? [`par ${clock(this.t.par)}`, `K: ${this.kAt} of ${total} tins`, lead ? `best rival on clue ${Math.min(total, lead + 1)}` : "", this.askReady() ? "E to ask a local" : ""]
      : [`brass stars ${got}${n < total ? ` + ${"★".repeat(here)}${"☆".repeat(STARS - here)}` : ""}`, asked ? `${asked} local${asked > 1 ? "s" : ""} asked` : "",
        this.askReady() ? "E to ask a local (costs a star)" : ""];
    return {
      line: `Clue ${n + 1} of ${total}${n === total - 1 ? " (the chest)" : ""}: ${clue}`,
      sub: sub.filter(Boolean).join(" · "),
      bar: n / total,
      progress: `${Math.min(n + 1, total)} / ${total}`,
      timer: this.race ? clock((Date.now() - this.started) / 1000) : undefined,
      stage: s ? { key: `c${n}`, title: n === total - 1 ? "The chest!" : `Clue ${n + 1} of ${total}` } : undefined,
    };
  }

  /** On a one-star trail, which way the place is from where the leg starts (" Somewhere south of here."); otherwise nothing. */
  private vague(n: number, x = this.t.legs[n].x, z = this.t.legs[n].z) {
    if (this.offer.stars > 1) return "";
    const from = this.legStart(n);
    return ` Somewhere ${compassWord(x - from.x, z - from.z)} of here.`;
  }

  /** The clue for leg n as its kind of step puts it; riddle: the leg's riddle, for the steps that use one. */
  private stepClue(n: number, riddle: string) {
    const s = this.t.legs[n], from = this.legStart(n);
    switch (s.step) {
      case "view": {
        const hi = s.hi!;
        if (!this.viewed.has(n)) return `A look-out: climb up to <b>${esc(hi.n)}</b> (ringed on the map) and look for a beam of gold light. It can only be seen from up there.${this.vague(n, hi.x, hi.z)}`;
        const by = this.sawBy.get(n) ?? "", me = this.w.me(), up = Math.hypot(hi.x - me.x, hi.z - me.z) < VIEW_AT;
        if (up) return `The tin's under the beam of gold light. Remember which way it is: it's gone once you come down.`;
        return by && by !== this.w.selfId ? `<b>${esc(this.w.nameOf(by))}</b> saw the beam from ${esc(hi.n)}: ask them where the tin is, or go up and look.`
          : `The tin's under the beam you saw from ${esc(hi.n)}. Go back up if you've forgotten.`;
      }
      case "sound": {
        const bell = s.kind === "church" || s.kind === "rest";
        return `Listen: ${bell ? "a bell is tolling" : "a busker is whistling a tune"} somewhere near the tin. Follow it by ear.${this.vague(n)}`;
      }
      case "split": {
        const [ha, hb] = halves(keyOf(s.n).key), ids = this.w.players().map((p) => p.id).sort(), friends = ids.length >= 2;
        const mine = friends ? ids.indexOf(this.w.selfId) % 2 : 0, note = this.noteOf(n) ?? { x: from.x, z: from.z };
        const where = `It's ${KIND_WORD[s.kind]}.${this.vague(n)}`;
        if (this.halfRead.has(n)) return `<b class="clue">${ha}</b><br><b class="clue">${hb}</b><br>Put the halves together. ${where}`;
        const pinned = `the other half is pinned to a post ${far(Math.hypot(note.x - from.x, note.z - from.z))} from where this clue began`;
        return `Half a clue: <b class="clue">${mine ? hb : ha}</b><br>${friends ? `Your friends have the other half: put your heads together, or read it where ${pinned.replace("the other half is ", "it's ")}.` : `And ${pinned}.`} ${where}`;
      }
      case "look": {
        const house = this.houses.get(n);
        if (house) return `${riddle}<br>There, find <b>${esc(house.name)}</b>. Its tin's on the doorstep, and its lock asks about the house.`;
        if (house === null) return riddle;
        return `${riddle}<br>When you're there, you'll be told what to look for.`;
      }
      case "word":
        return `${riddle}<br>Find the plaque there and read its word: then open the tin with that word on it, close by. The wrong tin costs a brass star.`;
      default:
        return riddle;
    }
  }

  private clearGlows() {
    for (const g of this.glows.values()) dispose(g.mesh);
    this.glows.clear();
    this.tickIn.clear();
  }

  /** Held still while you're at a lock. */
  held() { return this.lock.open && this.lockAt ? { x: this.w.me().x, z: this.w.me().z } : null; }

  end() {
    this.lock.hide();
    this.clearGlows();
    for (const tin of this.tins.values()) dispose(tin.view);
    this.tins.clear();
    if (this.chestFx) { dispose(this.chestFx.coins); this.chestFx = null; }
    if (this.beam) { dispose(this.beam); this.beam = null; }
    if (this.noteView) { dispose(this.noteView.view); this.noteView = null; }
    this.pics.clear();
    this.w.circle("trail", null); this.w.circle("trail2", null); this.w.circle("trailhi", null);
  }
}
