// Anonymous play counts: how many people play, for how long, which maps and mini-games, and how big
// the rooms get. Entirely optional: unless the build was given VITE_TELEMETRY_URL (forks and local
// builds are not), every call here returns at once and nothing is read, written or sent. The
// player can also turn it off with ?telemetry=0, which is remembered.
//
// Nothing goes over the peer network. Events are batched and posted to the telemetry server
// (a separate service) fire and forget: if it is down, slow or refuses, they are dropped. Only the
// room's host (game.ts, hostId) reports the room's size, so a room is counted once.
//
// No names, chat, voice or positions are ever included.

declare const __BUILD__: number;

const URL_ = import.meta.env.VITE_TELEMETRY_URL as string | undefined;
const FLUSH_MS = 30_000, BEAT_MS = 60_000, ROOM_POLL_MS = 5_000, ROOM_EVERY_MS = 60_000;
const MAX_QUEUE = 100, BATCH = 50;

interface Ev { k: string; b: string; s: string; test?: true; [field: string]: unknown }

let on = false, test = false, started = false, dead = false;
let browser = "", session = "";
let queue: Ev[] = [];
const open = new Map<string, number>();   // mini-games and modes in progress, and when they began
let roomWatching = false;

function pick(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
}

function keep(store: Storage, key: string): string {
  try {
    let v = store.getItem(key);
    if (!v) { v = pick(); store.setItem(key, v); }
    return v;
  } catch { return pick(); }
}

function wanted(): boolean {
  const q = new URLSearchParams(location.search).get("telemetry");
  try {
    if (q === "0") localStorage.setItem("cd-telemetry", "0");
    else if (q === "1" || q === "test") localStorage.removeItem("cd-telemetry");
    return localStorage.getItem("cd-telemetry") !== "0";
  } catch { return q !== "0"; }
}

function device(): "phone" | "tablet" | "desktop" {
  const touch = navigator.maxTouchPoints > 1 || matchMedia("(pointer: coarse)").matches;
  const small = Math.min(screen.width, screen.height);
  return !touch ? "desktop" : small < 600 ? "phone" : "tablet";
}

function add(k: string, fields: Record<string, unknown> = {}) {
  const e: Ev = { k, b: browser, s: session, ...fields };
  if (test) e.test = true;
  if (queue.push(e) > MAX_QUEUE) queue.shift();
}

/** Normal flushes use fetch, so a server that refuses us is noticed and given up on for this page
 *  (one failed request, not one every half minute). Leaving the page needs sendBeacon. */
function flush(leaving = false) {
  while (queue.length && !dead) {
    const body = JSON.stringify(queue.splice(0, BATCH));
    try {
      if (leaving && navigator.sendBeacon) navigator.sendBeacon(URL_!, new Blob([body], { type: "text/plain" }));
      else fetch(URL_!, { method: "POST", body, mode: "no-cors", keepalive: true }).catch(() => { dead = true; });
    } catch { dead = true; }
  }
  if (dead) queue = [];
}

function init() {
  if (started) return;
  started = true;
  try {
    on = !!URL_ && wanted();
    if (!on) return;
    test = new URLSearchParams(location.search).get("telemetry") === "test";
    browser = keep(localStorage, "cd-tid");
    session = keep(sessionStorage, "cd-tsid");
    setInterval(() => { if (document.visibilityState === "visible") add("beat"); }, BEAT_MS);
    setInterval(() => flush(), FLUSH_MS);
    addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(true); });
  } catch { on = false; }
}

function leave() {
  for (const name of [...open.keys()]) end(name);
  flush(true);
}

/** The page is in play: a session on this map ("mines" and "deli" for those pages). */
export function play(map: string) {
  init();
  if (!on) return;
  try { add("start", { map, device: device(), v: String(__BUILD__) }); } catch { /* never reaches the game */ }
}

/** A mini-game or mode begins (a race, a ball to kick, the mines). */
export function begin(mode: string) {
  if (!on || open.has(mode)) return;
  open.set(mode, performance.now());
  try { add("mode_start", { mode }); } catch { /* never reaches the game */ }
}

/** It ends. Does nothing if it isn't running. */
export function end(mode: string) {
  const t = open.get(mode);
  if (!on || t === undefined) return;
  open.delete(mode);
  try { add("mode_end", { mode, secs: Math.round((performance.now() - t) / 1000) }); } catch { /* never reaches the game */ }
}

/** Something with no length worth timing, like calling a bus. */
export function note(mode: string) {
  if (!on) return;
  try { add("mode_start", { mode }); } catch { /* never reaches the game */ }
}

async function hashed(code: string): Promise<string | null> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("cd-room:" + code));
  return Array.from(new Uint8Array(d).slice(0, 6), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Only the host reports, only when the count changes, and no more than once a minute. */
export function watchRoom(look: () => { code: string; host: boolean; players: number } | null) {
  init();
  if (!on || roomWatching) return;
  roomWatching = true;
  let sent = "", last = 0;
  setInterval(() => {
    try {
      const r = look();
      if (!r || !r.host || r.code === "SOLO" || document.visibilityState !== "visible") return;
      const key = r.code + ":" + r.players;
      if (key === sent || performance.now() - last < ROOM_EVERY_MS) return;
      sent = key; last = performance.now();
      hashed(r.code).then((room) => { if (room) add("room", { room, players: r.players }); }).catch(() => {});
    } catch { /* never reaches the game */ }
  }, ROOM_POLL_MS);
}
