import * as THREE from "three";
import * as SFX from "./audio";
import { Game } from "./game";
import { TouchControls } from "./touch";
import { GameMap, inlineMapId, loadMap } from "./map";
import { DEFAULT_MAP, MAPS, MapInfo, mapInfo, mapName } from "./maps";
import { cleanCode, connect, newRoomCode, Net } from "./net";
import { buildWorld, World } from "./world";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const LOCAL = params.get("net") === "local";   // link tabs in one browser instead of WebRTC (for testing)
// The single-file preview build runs where outside connections are blocked, so it is solo only.
const SOLO_ONLY = import.meta.env.VITE_SOLO_ONLY === "1";
if (SOLO_ONLY) {
  $("create").hidden = true;
  document.querySelector(".join")!.setAttribute("hidden", "");
  $("solonote").hidden = false;
  $("solo").classList.add("primary");
}

const canvas = $<HTMLCanvasElement>("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
// iPads have very dense screens: render a little below native resolution to keep the frame rate up
renderer.setPixelRatio(Math.min(devicePixelRatio, navigator.maxTouchPoints > 1 ? 1.25 : 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
// the far plane sits just past the fog, so nothing hidden in it gets drawn
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 560);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

let game: Game | null = null;
// iPad and iPhone Safari can't capture the mouse, so go straight to touch controls there.
// (iPadOS Safari reports itself as a Mac, hence the touch-point check.)
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
let freeMode = false;

const savedName = (() => { try { return localStorage.getItem("cd-name") ?? ""; } catch { return ""; } })();
$<HTMLInputElement>("name").value = savedName;
const savedSens = (() => { try { return Number(localStorage.getItem("cd-sens")) || 1; } catch { return 1; } })();
$<HTMLInputElement>("sens").value = String(savedSens);
const savedMusic = (() => { try { const v = Number(localStorage.getItem("cd-music") ?? 0.6); return Number.isFinite(v) ? v : 0.6; } catch { return 0.6; } })();
SFX.setMusicVolume(savedMusic);
for (const id of ["music", "music2"]) {
  const input = $<HTMLInputElement>(id);
  input.value = String(savedMusic);
  input.oninput = () => {
    const v = Number(input.value);
    SFX.setMusicVolume(v);
    for (const other of ["music", "music2"]) $<HTMLInputElement>(other).value = String(v);
    try { localStorage.setItem("cd-music", String(v)); } catch { /* ignore */ }
  };
}
// Browsers only allow sound after the player interacts, so start the music on the first one.
addEventListener("pointerdown", () => SFX.unlock(), { once: true });
addEventListener("keydown", () => SFX.unlock(), { once: true });
const roomParam = cleanCode(params.get("room") ?? "");
if (roomParam) $<HTMLInputElement>("code").value = roomParam;

// ---- maps -----------------------------------------------------------------------------------
// The single-file build carries one map inline, and that is the only choice.
const inlineId = inlineMapId();
const choices: MapInfo[] = inlineId ? MAPS.filter((m) => m.id === inlineId) : MAPS;
const valid = (id: string | null): id is string => !!id && choices.some((m) => m.id === id);
const savedMap = (() => { try { return localStorage.getItem("cd-map"); } catch { return null; } })();
const firstMap = [params.get("map"), savedMap, DEFAULT_MAP, choices[0]?.id].find(valid)!;

const loaded = new Map<string, Promise<GameMap>>();
function fetchMap(id: string): Promise<GameMap> {
  let p = loaded.get(id);
  if (!p) {
    p = loadMap(`${import.meta.env.BASE_URL}maps/${id}.json`);
    p.catch(() => loaded.delete(id));   // let a later try fetch it again
    loaded.set(id, p);
  }
  return p;
}

/** The map on screen: the menu backdrop, and the one a game starts on. */
let current: { id: string; map: GameMap; world: World };
let wanted = firstMap;
/** Show a map (loading it first if need be). Resolves false if another map was asked for meanwhile. */
async function showMap(id: string): Promise<boolean> {
  wanted = id;
  if (current?.id === id) return true;
  const map = await fetchMap(id);
  if (wanted !== id) return false;
  const old = current;
  current = { id, map, world: buildWorld(map) };
  old?.world.dispose();
  return true;
}

await showMap(firstMap).catch((e) => {
  $("loading").textContent = String(e.message ?? e);
  throw e;
});
$("loading").hidden = true;
$("menuform").hidden = false;
if (roomParam) $("join").focus(); else $("create").focus();

const list = $("maplist");
for (const m of choices) {
  const opt = document.createElement("label");
  opt.className = "mapopt";
  opt.innerHTML = `<input type="radio" name="map"><b></b><small></small>`;
  const input = opt.querySelector("input")!;
  input.value = m.id;
  input.checked = m.id === firstMap;
  opt.querySelector("b")!.textContent = m.name;
  opt.querySelector("small")!.textContent = m.blurb;
  input.onchange = () => pickMap(m.id);
  list.append(opt);
}
$("maps").hidden = choices.length < 2;
const pickedMap = () => list.querySelector<HTMLInputElement>("input:checked")?.value ?? firstMap;

let busy = 0;
/** Grey out the menu while a map loads or a room is looked up. */
function setBusy(on: boolean) {
  busy += on ? 1 : -1;
  for (const id of ["create", "solo", "join"]) $<HTMLButtonElement>(id).disabled = busy > 0;
}

async function pickMap(id: string) {
  try { localStorage.setItem("cd-map", id); } catch { /* storage may be blocked */ }
  $("menuerr").textContent = "";
  setBusy(true);
  try { await showMap(id); }
  catch (e: any) { $("menuerr").textContent = String(e.message ?? e); }
  finally { setBusy(false); }
}

// Menu backdrop: circle slowly around where everyone starts (Firs Field on Combe Down).
const t0 = performance.now();
function attract(now: number) {
  const { map, world } = current;
  // each map can say what to circle (the Royal Crescent); otherwise, where everyone starts (Firs Field)
  const ring = map.d.spawn ?? [[0, 0]];
  const [fx, fy] = map.d.v ?? [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  const fz = -fy;
  const a = (now - t0) / 30000;
  const x = fx + Math.cos(a) * 95, z = fz + Math.sin(a) * 95;
  camera.position.set(x, map.ground(fx, fz) + 32, z);
  camera.lookAt(fx, map.ground(fx, fz) + 2, fz);
  world.update(x, camera.position.y, z);
}

function start(code: string, local: boolean, net: Net = connect(code, local)) {
  const name = ($<HTMLInputElement>("name").value.trim() || "Player").slice(0, 16);
  try { localStorage.setItem("cd-name", name); } catch { /* storage may be blocked */ }
  SFX.unlock();
  const { id, map, world } = current;
  game = new Game(map, world, camera, net, name, code);
  game.player.sensitivity = 0.0022 * savedSens;
  $("menu").hidden = true;
  $("hud").hidden = false;
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", code);
  url.searchParams.set("map", id);
  if (local) url.searchParams.set("net", "local");
  history.replaceState(null, "", url);
  $<HTMLInputElement>("invite").value = code === "SOLO" ? "" : url.toString();
  $("invitebox").hidden = code === "SOLO";
  $("pauseroom").textContent = code === "SOLO" ? `Practice on ${mapName(id)} on your own. Create a game from the menu to play with friends.`
    : `Room code: ${code}, on ${mapName(id)}. Send your friends the link below.`;
  $("nethint").textContent = code === "SOLO" ? "" : local
    ? "Local test mode: only tabs in this browser can join."
    : "Players connect directly to each other. If a friend can't connect, their network may block it: try another network or a phone hotspot.";
  new TouchControls(game, canvas, showPause);
  if (IOS || !("requestPointerLock" in canvas)) enterFreeMode();
  else lock();
}

/** Play without a captured mouse: on-screen controls, drag to look. */
function enterFreeMode() {
  if (!game) return;
  freeMode = true;
  game.freeMode = true;
  game.active = true;
  $("touch").hidden = false;
  $("pause").hidden = true;
  $("pausehint").textContent = "Drag on the right to look, use the stick on the left to move, tap to shoot.";
}

function lock() {
  if (freeMode) { game!.active = true; $("pause").hidden = true; return; }
  let settled = false;
  const fail = () => { if (!settled) { settled = true; enterFreeMode(); } };
  try {
    const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.then?.(() => (settled = true), fail);
  } catch { fail(); }
  // some browsers neither lock nor report an error
  setTimeout(() => { if (document.pointerLockElement !== canvas) fail(); else settled = true; }, 1000);
}
document.addEventListener("pointerlockerror", () => { if (game && !freeMode) enterFreeMode(); });
function showPause() {
  if (!game) return;
  game.active = false;
  $("pause").hidden = false;
}
document.addEventListener("pointerlockchange", () => {
  if (!game || freeMode) return;
  const locked = document.pointerLockElement === canvas;
  game.active = locked;
  $("pause").hidden = locked;
});
canvas.addEventListener("click", () => { if (game && !game.active && !freeMode) lock(); });
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && freeMode && game) { if ($("pause").hidden) showPause(); else lock(); }
});

// ---- create, join or host ---------------------------------------------------------------------
// Whoever creates a game picks its map. Joining with a code first looks for a game in that room:
// if there is one, you join it on its map; if not, you host that room on the map you picked.

/** Wait for players already in the room to say hello. Resolves with their map, or null if nobody's playing. */
function lookForGame(net: Net, signal: AbortSignal): Promise<{ map: string; names: string[] } | null> {
  return new Promise((resolve) => {
    const names = new Map<string, string>();
    let map = "", done = false, settle = 0;
    const finish = (v: { map: string; names: string[] } | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer); clearTimeout(settle);
      resolve(v);
    };
    // Players in a game greet anyone who arrives. Someone else still on this screen stays quiet.
    net.on("hello", (d, from) => {
      if (done) return;
      names.set(from, String(d?.name || "Player").slice(0, 16));
      map ||= String(d?.map || DEFAULT_MAP);
      // give the rest of the room a moment to say hello too
      clearTimeout(settle);
      settle = window.setTimeout(() => finish({ map, names: [...names.values()] }), 600);
    });
    // finding peers over the internet takes a few seconds; tabs in one browser are instant
    const timer = window.setTimeout(() => finish(null), net.kind === "local" ? 1500 : 8000);
    signal.addEventListener("abort", () => finish(null));
  });
}

function showLookup(msg: string, canJoin = false) {
  $("menuform").hidden = true;
  $("lookup").hidden = false;
  $("lookupmsg").textContent = msg;
  $("lookjoin").hidden = !canJoin;
  $(canJoin ? "lookjoin" : "lookcancel").focus();
}
function hideLookup() {
  $("lookup").hidden = true;
  $("menuform").hidden = false;
}

let cancelLookup = () => {};
$("lookcancel").onclick = () => cancelLookup();

async function join(code: string) {
  const fromLink = code === roomParam;   // following an invite link already says "join this game"
  const ctrl = new AbortController();
  const net = connect(code, LOCAL);
  cancelLookup = () => { ctrl.abort(); net.leave(); hideLookup(); };
  setBusy(true);
  showLookup(`Looking for a game in room ${code}…`);
  try {
    const found = await lookForGame(net, ctrl.signal);
    if (ctrl.signal.aborted) return;
    if (!found) {
      // nobody's playing here: host it on the chosen map
      if (!(await showMap(pickedMap()))) return cancelLookup();
      start(code, LOCAL, net);
      game!.toast(`Nobody was in room ${code}, so you're hosting it on ${mapName(current.id)}. Press Esc for the invite link.`, 6);
      return;
    }
    if (!mapInfo(found.map) || !valid(found.map)) {
      cancelLookup();
      $("menuerr").textContent = `The game in room ${code} is on a map this version doesn't have. Reload the page to update.`;
      return;
    }
    if (!fromLink) {
      const who = found.names.length > 3 ? `${found.names.slice(0, 3).join(", ")} and others` : found.names.join(", ");
      showLookup(`There's already a game in room ${code}, on ${mapName(found.map)}, with ${who}. Do you want to join it?`, true);
      const ok = await new Promise<boolean>((resolve) => {
        $("lookjoin").onclick = () => resolve(true);
        ctrl.signal.addEventListener("abort", () => resolve(false));
      });
      if (!ok) return;
    }
    showLookup(`Joining room ${code}…`);
    await showMap(found.map);
    if (ctrl.signal.aborted) return;
    start(code, LOCAL, net);
  } catch (e: any) {
    cancelLookup();
    $("menuerr").textContent = String(e.message ?? e);
  } finally {
    setBusy(false);
  }
}

$("create").onclick = () => start(newRoomCode(), LOCAL);
$("solo").onclick = () => start("SOLO", true);
$("join").onclick = () => {
  const code = cleanCode($<HTMLInputElement>("code").value);
  if (code.length < 4) { $("menuerr").textContent = "Enter a room code: the one your friend sent you, or make one up."; return; }
  $("menuerr").textContent = "";
  join(code);
};
$("code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("join").click(); });
$("resume").onclick = () => { SFX.unlock(); lock(); };
$("leave").onclick = () => {
  game?.dispose();
  location.href = location.pathname;
};
$("copy").onclick = async () => {
  const input = $<HTMLInputElement>("invite");
  try { await navigator.clipboard.writeText(input.value); $("copy").textContent = "Copied"; }
  catch { input.select(); $("copy").textContent = "Press Ctrl+C"; }
  setTimeout(() => ($("copy").textContent = "Copy link"), 1800);
};
$<HTMLInputElement>("sens").oninput = (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  if (game) game.player.sensitivity = 0.0022 * v;
  try { localStorage.setItem("cd-sens", String(v)); } catch { /* ignore */ }
};

let last = performance.now();
let frames = 0, fpsT = 0;
function frame(now: number) {
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw);
  last = now;
  if (game) game.update(dt); else attract(now);
  renderer.clear();
  renderer.render(current.world.scene, camera);
  if (game) {
    renderer.clearDepth();
    renderer.render(game.weapon.scene, camera);
  }
  frames++; fpsT += raw;
  if (fpsT >= 1) { (window as any).__fps = frames / fpsT; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// for automated tests
(window as any).__game = () => game;
(window as any).__renderer = renderer;
