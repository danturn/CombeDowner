import * as THREE from "three";
import * as SFX from "./audio";
import { Game } from "./game";
import { trackTitle } from "./music";
import { nowPlaying } from "./nowplaying";
import { TouchControls } from "./touch";
import { GameMap, inlineMapId, loadMap } from "./map";
import { DEFAULT_MAP, MAPS, MapInfo, mapInfo, mapName } from "./maps";
import { cleanCode, connect, newRoomCode, Net } from "./net";
import { buildWorld, World } from "./world";
import { Post } from "./post";
import * as Quips from "./quips";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const LOCAL = params.get("net") === "local";   // link tabs in one browser instead of WebRTC (for testing)
const UP = params.get("up") === "1";   // just climbed back up from the mines
// The single-file preview build runs where outside connections are blocked, so it is solo only.
const SOLO_ONLY = import.meta.env.VITE_SOLO_ONLY === "1";
if (SOLO_ONLY) {
  $("play").hidden = true;
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
// ?fx=0 turns off the retro colour grade and ?res=full draws at full resolution, to compare
const post = new Post(renderer, camera, params.get("fx") !== "0", params.get("res") !== "full");

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

let game: Game | null = null;
// iPad and iPhone Safari can't capture the mouse, so go straight to touch controls there.
// (iPadOS Safari reports itself as a Mac, hence the touch-point check.)
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
// A mouse or trackpad drives the pointer. Such a device never gets touch controls: if the browser
// won't capture the mouse right away, it shows the pause screen so a click can try again.
const MOUSE = matchMedia("(pointer: fine) and (hover: hover)").matches;
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
const savedVoice = (() => { try { const v = Number(localStorage.getItem("cd-voice") ?? 1); return Number.isFinite(v) ? v : 1; } catch { return 1; } })();
SFX.setVoiceVolume(savedVoice);
$<HTMLInputElement>("voice").value = String(savedVoice);
$<HTMLInputElement>("voice").oninput = (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  SFX.setVoiceVolume(v);
  try { localStorage.setItem("cd-voice", String(v)); } catch { /* ignore */ }
};
nowPlaying($("np"));
SFX.onTrackChange((name) => {
  for (const el of document.querySelectorAll(".nowplaying")) el.textContent = `Now playing: ${trackTitle(name)}`;
});
for (const id of ["nexttrack", "nexttrack2"]) $(id).onclick = () => { SFX.unlock(); SFX.nextTrack(); };
let micOn = (() => { try { return localStorage.getItem("cd-mic") !== "off"; } catch { return true; } })();
$<HTMLInputElement>("micon").checked = micOn;
$<HTMLInputElement>("micon").onchange = (e) => {
  micOn = (e.target as HTMLInputElement).checked;
  game?.voice.mute(!micOn);
  try { localStorage.setItem("cd-mic", micOn ? "on" : "off"); } catch { /* ignore */ }
};
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
    const maps = `${import.meta.env.BASE_URL}maps/`;
    p = loadMap(`${maps}${id}.json`, mapInfo(id)?.wide ? `${maps}${id}-wide.json` : undefined);
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
$(roomParam ? "play" : "code").focus();

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
  for (const id of ["play", "solo"]) $<HTMLButtonElement>(id).disabled = busy > 0;
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

function start(code: string, local: boolean, net: Net = connect(code, local), known: string[] = []) {
  const name = ($<HTMLInputElement>("name").value.trim() || "Player").slice(0, 16);
  try { localStorage.setItem("cd-name", name); } catch { /* storage may be blocked */ }
  SFX.unlock();
  const { id, map, world } = current;
  game = new Game(map, world, camera, net, name, code, known);
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
  $("pauseroom").textContent = code === "SOLO" ? `Practice on ${mapName(id)} on your own. Name a game from the menu to play with friends.`
    : `Game: ${code}, on ${mapName(id)}. Tell your friends the name, or send them the link below.`;
  $("nethint").textContent = code === "SOLO" ? "" : local
    ? "Local test mode: only tabs in this browser can join."
    : "Players connect directly to each other. If a friend can't connect, their network may block it: try another network or a phone hotspot. "
      + "Players near you hear your mic; hold V (or Radio) to talk to everyone. Headphones stop your speakers echoing into your mic.";
  $("voiceopts").hidden = $("t-radio").hidden = !net.media;
  game.voice.mute(!micOn);
  new TouchControls(game, canvas, showPause);
  if ((IOS && !MOUSE) || !("requestPointerLock" in canvas)) enterFreeMode();
  else {
    // Start playing straight away. Joining can take long enough that the browser no longer counts
    // the click on Play, so it may refuse to capture the mouse; then a click on the game does it.
    game.active = true;
    lock();
  }
  Quips.loadIn();
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

/** Pointer lock was refused, often because the click that asked for it came too long ago. */
function lockFailed() {
  if (!game || freeMode) return;
  if (!MOUSE) return enterFreeMode();
  if ($("pause").hidden) { $("clickhint").hidden = false; return; }   // keep playing; a click captures the mouse
  showPause();
  $("pausehint").textContent = "Click Resume to aim with the mouse.";
}

function lock() {
  if (freeMode) { game!.active = true; $("pause").hidden = true; return; }
  let settled = false;
  const fail = () => { if (!settled) { settled = true; lockFailed(); } };
  try {
    const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.then?.(() => (settled = true), fail);
  } catch { fail(); }
  // some browsers neither lock nor report an error
  setTimeout(() => { if (document.pointerLockElement !== canvas) fail(); else settled = true; }, 1000);
}
document.addEventListener("pointerlockerror", lockFailed);
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
  $("clickhint").hidden = true;
  if (locked) $("pausehint").textContent = "";
});
canvas.addEventListener("click", () => { if (game && !freeMode && document.pointerLockElement !== canvas) lock(); });
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && freeMode && game) { if ($("pause").hidden) showPause(); else lock(); }
  // playing without the mouse captured yet: Esc still pauses
  else if (e.code === "Escape" && game?.active && document.pointerLockElement !== canvas) { $("clickhint").hidden = true; showPause(); }
  // , and . step back and forward through the soundtrack, as in Winamp's playlist
  if ((e.code === "Comma" || e.code === "Period") && !e.repeat && !(e.target instanceof HTMLInputElement)) {
    SFX.unlock();
    if (e.code === "Comma") SFX.previousTrack(); else SFX.nextTrack();
  }
});

// ---- play: join or start a game by name ---------------------------------------------------------
// A game's name is its room. If a game with that name is running you join it, on its map;
// if not, you start it on the map you picked.

/** Wait for players already in the room to say hello. Resolves with their map, or null if nobody's playing. */
function lookForGame(net: Net, signal: AbortSignal): Promise<{ map: string; names: string[]; ids: string[] } | null> {
  return new Promise((resolve) => {
    const names = new Map<string, string>();
    let map = "", done = false, settle = 0;
    const finish = (v: { map: string; names: string[]; ids: string[] } | null) => {
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
      settle = window.setTimeout(() => finish({ map, names: [...names.values()], ids: [...names.keys()] }), 600);
    });
    // finding peers over the internet takes a few seconds; tabs in one browser are instant
    const timer = window.setTimeout(() => finish(null), net.kind === "local" ? 1500 : 8000);
    signal.addEventListener("abort", () => finish(null));
  });
}

function showLookup(msg: string) {
  $("menuform").hidden = true;
  $("lookup").hidden = false;
  $("lookupmsg").textContent = msg;
  $("lookcancel").focus();
}
function hideLookup() {
  $("lookup").hidden = true;
  $("menuform").hidden = false;
}

let cancelLookup = () => {};
$("lookcancel").onclick = () => cancelLookup();

/** Join the game with this name if it's running, otherwise start it on the chosen map. */
async function play(code: string) {
  const ctrl = new AbortController();
  const net = connect(code, LOCAL);
  // and listen down the mine too: the party may all be down there, in a room of their own (see mines/main.ts)
  const below = UP ? null : connect(`MINES-${code}`, LOCAL);
  const miners = new Map<string, string>();
  below?.on("hello", (d, from) => { if (d?.mines) miners.set(from, String(d.name || "Player").slice(0, 16)); });
  cancelLookup = () => { ctrl.abort(); net.leave(); below?.leave(); hideLookup(); $("code").focus(); };
  setBusy(true);
  showLookup(`Looking for ${code}…`);
  try {
    const found = await lookForGame(net, ctrl.signal);
    below?.leave();
    if (ctrl.signal.aborted) return;
    if (!found && miners.size) {
      const names = [...miners.values()];
      const who = names.length === 1 ? `${names[0]} is` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are`;
      showLookup(`Nobody's on the street in ${code}, but ${who} down the mines.`);
      const choice = await new Promise<"down" | "stay" | null>((resolve) => {
        $("lookmines").hidden = $("lookstay").hidden = false;
        $("lookmines").onclick = () => resolve("down");
        $("lookstay").onclick = () => resolve("stay");
        ctrl.signal.addEventListener("abort", () => resolve(null));
        $("lookmines").focus();
      });
      $("lookmines").hidden = $("lookstay").hidden = true;
      if (!choice) return;
      if (choice === "down") {
        net.leave();
        const url = new URL("mines.html", location.href);
        url.search = "";
        url.searchParams.set("go", "1");
        url.searchParams.set("room", code);
        url.searchParams.set("map", pickedMap());
        if (LOCAL) url.searchParams.set("net", "local");
        location.href = url.toString();
        return;
      }
      showLookup(`Starting ${code}…`);
    }
    if (!found) {
      if (!(await showMap(pickedMap()))) return cancelLookup();
      start(code, LOCAL, net);
      if (UP) game!.toast("Back up out of the mines, at the door of 1 The Firs", 4);
      else game!.toast(`You've started ${code} on ${mapName(current.id)}. Tell your friends to play ${code}, or press Esc for the invite link.`, 6);
      return;
    }
    if (!mapInfo(found.map) || !valid(found.map)) {
      cancelLookup();
      $("menuerr").textContent = `${code} is on a map this version doesn't have. Reload the page to update.`;
      return;
    }
    showLookup(`Joining ${code}…`);
    await showMap(found.map);
    if (ctrl.signal.aborted) return;
    start(code, LOCAL, net, found.ids);
    if (UP) game!.toast("Back up out of the mines, at the door of 1 The Firs", 4);
  } catch (e: any) {
    cancelLookup();
    $("menuerr").textContent = String(e.message ?? e);
  } finally {
    setBusy(false);
  }
}

$("play").onclick = () => {
  const code = cleanCode($<HTMLInputElement>("code").value) || newRoomCode();
  if (code.length < 4 || code === "SOLO") { $("menuerr").textContent = "Pick a game name of at least 4 letters or numbers (not SOLO)."; return; }
  $("menuerr").textContent = "";
  play(code);
};
$("solo").onclick = () => start("SOLO", true);
const codeInput = $<HTMLInputElement>("code");
// Show the name exactly as it will be used (no spaces or punctuation), so what you see is what you tell your friends.
codeInput.addEventListener("input", () => { const v = cleanCode(codeInput.value); if (v !== codeInput.value) codeInput.value = v; });
codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") $("play").click(); });
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
  post.render(current.world.scene, game ? game.weapon.scene : null);
  frames++; fpsT += raw;
  if (fpsT >= 1) { (window as any).__fps = frames / fpsT; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// climbing back up from the mines: straight back into the game you went down from
if (UP) {
  if (roomParam && roomParam !== "SOLO") $("play").click();
  else { start("SOLO", true); game!.toast("Back up out of the mines, at the door of 1 The Firs", 4); }
}

// for automated tests
(window as any).__game = () => game;
(window as any).__renderer = renderer;
