// Room saves. A room's name is its save, like a slot: the strange objects and sockets (so the zones
// and challenges open), the challenges won and the Kingswood bonfire pile belong to the room, kept on
// each player's machine per room and map ("cd-oddments:<map>:<room>", "cd-bonfire:<map>:<room>").
// A new room starts from nothing; going back to one carries on. Practice solo is one more room,
// "SOLO", so each map has one solo save. The day's scars, the Gaffers who got away, the Chronicle's
// news and where you last stood were already kept per room by their own files.
//
// What stays yours on every room: your name, look and settings, your bests and ghosts, trophies,
// the daily jobs, what you've cleared on the big map and the list of recent rooms.
//
// This file also packs all of that up to carry to another device (link.ts), and merges a pack into
// this browser without losing anything: per room the furthest on, per best the best. Telemetry's
// browser id and this device's graphics settings never travel.
//
// Who decides what: nobody, it's all this browser's own. When a room comes together its host takes
// on the furthest any player has saved for that room (oddments.ts), so a room never goes backwards.
import { DEFAULT_MAP } from "./maps";
import * as Recent from "./recentrooms";

export const SOLO = "SOLO";
export const oddKey = (map: string, room: string) => `cd-oddments:${map}:${room}`;
export const bonfireKey = (map: string, room: string) => `cd-bonfire:${map}:${room}`;

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const json = (s: string | null): any => { try { return s === null ? null : JSON.parse(s); } catch { return null; } };
const keys = (): string[] => { try { return Object.keys(localStorage); } catch { return []; } };

/** How far a room has got, for the menu. z and zc are missing on a save from before they were kept. */
export interface Progress { map: string; room: string; f: number; o: number; w: number; z?: number; zc?: number; at: number }

function progressOf(map: string, room: string, d: any): Progress | null {
  if (!d || !Number.isFinite(d.f)) return null;
  return {
    map, room, f: d.f | 0, o: Array.isArray(d.o) ? d.o.length : 0, w: Number(d.w) | 0,
    z: Number.isFinite(d.z) ? d.z : undefined, zc: Number.isFinite(d.zc) ? d.zc : undefined, at: Number(d.at) || 0,
  };
}

export function progress(map: string, room: string): Progress | null {
  return progressOf(map, room, json(get(oddKey(map, room))));
}

/** Which parts of the game are switched on, so the menu only counts those. */
export interface Shown { zones: boolean; objects: boolean; challenges: boolean }

/** "3 of 7 zones open, 9 sockets filled, 2 challenges done", or "Nothing done yet". */
export function progressText(p: Progress | null, on: Shown = { zones: true, objects: true, challenges: true }): string {
  if (!p || (p.f === 0 && p.w === 0 && p.o === 0)) return "Nothing done yet";
  const n = (v: number, one: string, many = one + "s") => `${v} ${v === 1 ? one : many}`;
  const bits = [
    on.zones && p.z !== undefined && p.zc !== undefined && p.zc > 1 ? `${p.z} of ${p.zc} zones open` : "",
    on.objects && p.f > 0 ? `${n(p.f, "socket")} filled` : "",
    on.objects && p.o > 0 ? `${n(p.o, "strange object")} lying about` : "",
    on.challenges && p.w > 0 ? `${n(p.w, "challenge")} done` : "",
  ].filter(Boolean);
  return bits.length ? bits.join(", ") : "Nothing done yet";
}

/** Every map's solo save. */
export function soloSaves(): Progress[] {
  const out: Progress[] = [];
  for (const k of keys()) {
    const m = /^cd-oddments:([^:]+):SOLO$/.exec(k);
    const p = m && progressOf(m[1], SOLO, json(get(k)));
    if (p) out.push(p);
  }
  return out;
}

const further = (a: any, b: any) => !b || (Number(a?.f) | 0) > (Number(b.f) | 0)
  || ((Number(a?.f) | 0) === (Number(b.f) | 0) && ((Number(a?.w) | 0) > (Number(b.w) | 0)
    || ((Number(a?.w) | 0) === (Number(b.w) | 0) && (a?.o?.length ?? 0) > (b.o?.length ?? 0))));

// ---- moving progress kept per map into per room ------------------------------------------------

const MIGRATED = "cd-saves-v";

/** Once per browser: the old per-map save becomes the save of every room on that map in the recent
 *  list, and of that map's solo game, since both used to play from it. The old keys are left as they
 *  were, for a page still on an older version. */
export function migrate() {
  if (get(MIGRATED)) return;
  const rooms = Recent.recent();
  for (const k of keys()) {
    const m = /^cd-oddments:([^:]+)$/.exec(k);
    if (!m) continue;
    const old = json(get(k));
    if (!old || !Number.isFinite(old.f)) continue;
    const on = rooms.filter((r) => r.map === m[1]);
    const at = Number(old.at) || on[0]?.at || Date.now();
    for (const room of [...on.map((r) => r.code), SOLO]) {
      if (further(old, json(get(oddKey(m[1], room))))) put(oddKey(m[1], room), JSON.stringify({ ...old, at }));
    }
  }
  // the bonfire was kept once for the whole browser, and only Bath has the court
  const pile = get("cd-bonfire");
  if (pile) {
    for (const room of [...rooms.filter((r) => r.map === DEFAULT_MAP).map((r) => r.code), SOLO]) {
      if (get(bonfireKey(DEFAULT_MAP, room)) === null) put(bonfireKey(DEFAULT_MAP, room), pile);
    }
  }
  put(MIGRATED, "1");
}

// ---- carrying it all to another device ---------------------------------------------------------

/** Kept to this device: telemetry counts devices, and graphics settings suit the device they were set on. */
const STAY = new Set(["cd-tid", "cd-telemetry", "cd-starting", "cd-crashed", "cd-shadows", "cd-res", "cd-fx", "cd-view", "cd-debug", "cd-fullscreen", "cd-spots", MIGRATED]);
const travels = (k: string) => (k.startsWith("cd-") || k.startsWith("combedowner.")) && !STAY.has(k);

export type Pack = Record<string, string>;

export function pack(): Pack {
  const out: Pack = {};
  for (const k of keys()) if (travels(k)) { const v = get(k); if (v !== null) out[k] = v; }
  return out;
}

/** What a pack holds, for the confirm: rooms saved and trophies won. */
export function packSize(p: Pack): { rooms: number; trophies: number } {
  let rooms = 0;
  for (const k in p) if (/^cd-oddments:[^:]+:[^:]+$/.test(k)) rooms++;
  return { rooms, trophies: Object.keys(json(p["cd-trophies"] ?? null)?.got ?? {}).length };
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

/** Each key of two records of numbers, the higher (or with low, the lower but not nought). */
function eachBest(a: any, b: any, low = false): Record<string, number> {
  const out: Record<string, number> = { ...(isObj(a) ? a : {}) };
  if (isObj(b)) for (const [k, v] of Object.entries(b)) {
    const n = num(v), had = out[k];
    if (had === undefined || !Number.isFinite(had)) out[k] = n;
    else if (low ? n > 0 && (n < had || had <= 0) : n > had) out[k] = n;
  }
  return out;
}

/** Two days' worth, dated (d.day): the later day, or on the same day both together. */
function sameDay(mine: any, theirs: any, both: (a: any, b: any) => any) {
  if (!isObj(theirs)) return mine;
  if (!isObj(mine) || num(theirs.day) > num(mine.day)) return theirs;
  return num(theirs.day) < num(mine.day) ? mine : both(mine, theirs);
}

function mergeTrophies(a: any, b: any) {
  if (!isObj(b)) return a;
  if (!isObj(a)) return b;
  const got: Record<string, number> = { ...a.got };
  for (const [k, v] of Object.entries(b.got ?? {})) got[k] = got[k] === undefined ? num(v) : Math.min(got[k], num(v));
  const sets: Record<string, string[]> = { ...a.sets };
  for (const [k, v] of Object.entries(b.sets ?? {})) sets[k] = [...new Set([...(sets[k] ?? []), ...(Array.isArray(v) ? v : [])])];
  const best = { ...a.best };
  for (const [k, v] of Object.entries<any>(b.best ?? {})) if (!best[k] || num(v?.v) > num(best[k].v)) best[k] = v;
  return { got, n: eachBest(a.n, b.n), sets, best, tot: eachBest(a.tot, b.tot) };
}

function mergeYours(a: any, b: any) {
  if (!isObj(b)) return a;
  if (!isObj(a)) return b;
  const span = (x: any, y: any) => {
    const out = { ...x };
    for (const [k, v] of Object.entries<any>(y ?? {})) {
      const h = out[k];
      if (!Array.isArray(h) || !Array.isArray(v)) { out[k] = v; continue; }
      // [times..., first day, last day] or [first, last]: the most times, the earliest first, the latest last
      out[k] = h.length === 2 ? [Math.min(h[0], v[0]), Math.max(h[1], v[1])]
        : h.map((n: any, i: number) => (typeof n !== "number" ? n : i === h.length - 2 ? Math.min(n, v[i]) : Math.max(n, num(v[i]))));
    }
    return out;
  };
  return { ...a, v: span(a.v, b.v), c: span(a.c, b.c), f: eachBest(a.f, b.f), p: span(a.p, b.p), n: Math.max(num(a.n), num(b.n)),
    ...(num(b.best) > num(a.best) ? { best: b.best, bestAt: b.bestAt } : {}) };
}

function mergeRooms(a: any, b: any) {
  const all = new Map<string, any>();
  for (const r of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!r || typeof r.code !== "string") continue;
    const h = all.get(r.code);
    if (!h) all.set(r.code, r);
    else all.set(r.code, { ...(num(r.at) > num(h.at) ? r : h), at: Math.max(num(r.at), num(h.at)), with: [...new Set([...(h.with ?? []), ...(r.with ?? [])])].slice(0, 4) });
  }
  return [...all.values()].sort((x, y) => num(y.at) - num(x.at)).slice(0, 8);
}

/** The pair's better value for one key, or undefined to leave this browser's as it is. personal:
 *  take their name, look and settings too (you've chosen to bring that device's things here). */
function mergeOne(k: string, mine: string | null, theirs: string, personal: boolean): string | undefined {
  if (mine === null) return theirs;
  if (mine === theirs) return undefined;
  const a = json(mine), b = json(theirs);
  const out = (v: unknown) => JSON.stringify(v);
  if (/^cd-oddments:[^:]+(:[^:]+)?$/.test(k)) {
    if (!further(b, a)) return undefined;
    return out({ ...b, w: Math.max(num(a?.w), num(b?.w)), at: Math.max(num(a?.at), num(b?.at)) });
  }
  if (k.startsWith("cd-bonfire")) return num(b?.n) > num(a?.n) || (num(b?.b) && !num(a?.b)) ? theirs : undefined;
  if (/^cd-race-\d+r?$/.test(k)) return num(b?.t) > 0 && (num(b.t) < num(a?.t) || !(num(a?.t) > 0)) ? theirs : undefined;
  if (k === "cd-race-list") return out([...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])]);
  if (k === "cd-race-daily") return num(b?.s) > num(a?.s) ? theirs : num(b?.s) < num(a?.s) ? undefined : out({ s: a.s, t: num(a.t) > 0 && num(b.t) > 0 ? Math.min(a.t, b.t) : num(a.t) || num(b.t), n: Math.max(num(a.n), num(b.n)) });
  if (k.startsWith("cd-stunt-") || k === "cd-bounties") return num(b) > num(a) ? theirs : undefined;
  if (k === "cd-gulls-best") return out(eachBest(a, b));
  if (k === "cd-trail-k") return out(eachBest(a, b, true));
  if (k === "combedowner.rideBests") {
    const r: Record<string, any> = { ...(isObj(a) ? a : {}) };
    if (isObj(b)) for (const [ride, v] of Object.entries(b)) r[ride] = eachBest(r[ride], v);
    return out(r);
  }
  if (k === "cd-rosettes") return [...mine + theirs].filter((c) => "gsb".includes(c)).sort((x, y) => "gsb".indexOf(x) - "gsb".indexOf(y)).slice(0, 3).join("");
  if (k === "cd-trail-daily-stars") return out(sameDay(a, b, (x, y) => ({ day: x.day, best: Math.max(num(x.best), num(y.best)) })));
  if (k === "cd-jobs-done") return out(sameDay(a, b, (x, y) => ({ day: x.day, seeds: [...new Set([...(x.seeds ?? []), ...(y.seeds ?? [])])] })));
  if (k === "cd-daily") return out(sameDay(a, b, (x, y) => ({ day: x.day, got: Array.isArray(x.got) && Array.isArray(y.got) ? x.got.map((n: any, i: number) => Math.max(num(n), num(y.got[i]))) : x.got })));
  if (k === "cd-trophies") return out(mergeTrophies(a, b));
  if (k.startsWith("cd-yourmap:")) return out(mergeYours(a, b));
  if (k === "cd-rooms") return out(mergeRooms(a, b));
  if (k === "cd-wardrobe" && isObj(a) && isObj(b)) {
    return out({ got: [...new Set([...(a.got ?? []), ...(b.got ?? [])])], worn: personal ? b.worn ?? a.worn : a.worn, n: eachBest(a.n, b.n) });
  }
  // the day's scars, the Gaffers who got away and the Chronicle: this browser's own word stands
  if (/^cd-(scars|fugitives|paper)/.test(k)) return undefined;
  return personal ? theirs : undefined;
}

/** Bring a pack into this browser. Returns how many rooms came on further than they were here. */
export function merge(p: Pack, personal: boolean): { rooms: number; keys: number } {
  let rooms = 0, n = 0;
  for (const [k, v] of Object.entries(p)) {
    if (typeof v !== "string" || !travels(k)) continue;
    const mine = get(k), next = mergeOne(k, mine, v, personal);
    if (next === undefined || next === mine) continue;
    if (put(k, next)) { n++; if (/^cd-oddments:[^:]+:[^:]+$/.test(k) && further(json(next), json(mine))) rooms++; }
  }
  return { rooms, keys: n };
}

// ---- as text, for when the two can't both be online ---------------------------------------------

const TAG_GZ = "CDSAVE1:", TAG_PLAIN = "CDSAVE0:";

const toB64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function through(data: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(t));
  return new Uint8Array(await out.arrayBuffer());
}

export async function packText(): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(pack()));
  if (typeof CompressionStream === "function") return TAG_GZ + toB64(await through(raw, new CompressionStream("gzip")));
  return TAG_PLAIN + toB64(raw);
}

/** A pasted save back into a pack, or null if it isn't one. */
export async function unpackText(text: string): Promise<Pack | null> {
  const s = text.replace(/\s+/g, "");
  try {
    let raw: Uint8Array;
    if (s.startsWith(TAG_GZ)) raw = await through(fromB64(s.slice(TAG_GZ.length)), new DecompressionStream("gzip"));
    else if (s.startsWith(TAG_PLAIN)) raw = fromB64(s.slice(TAG_PLAIN.length));
    else return null;
    const d = JSON.parse(new TextDecoder().decode(raw));
    return isObj(d) ? d as Pack : null;
  } catch { return null; }
}
