import * as THREE from "three";
import * as SFX from "./audio";
import { Game } from "./game";
import { TouchControls } from "./touch";
import { loadMap } from "./map";
import { cleanCode, connect, newRoomCode } from "./net";
import { buildWorld } from "./world";

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

const map = await loadMap(`${import.meta.env.BASE_URL}map.json`).catch((e) => {
  $("loading").textContent = String(e.message ?? e);
  throw e;
});
const world = buildWorld(map);
$("loading").hidden = true;
$("menuform").hidden = false;
if (roomParam) $("join").focus(); else $("create").focus();

// Menu backdrop: drift slowly over the village until a game starts.
let t0 = performance.now();
function attract(now: number) {
  const a = (now - t0) / 40000;
  const x = Math.cos(a) * 180, z = Math.sin(a) * 180;
  camera.position.set(x, map.ground(x, z) + 45, z);
  camera.lookAt(0, map.ground(0, 0) + 5, 0);
  world.update(x, camera.position.y, z);
}

function start(code: string, local: boolean) {
  const name = ($<HTMLInputElement>("name").value.trim() || "Player").slice(0, 16);
  try { localStorage.setItem("cd-name", name); } catch { /* storage may be blocked */ }
  SFX.unlock();
  const net = connect(code, local);
  game = new Game(map, world, camera, net, name, code);
  game.player.sensitivity = 0.0022 * savedSens;
  $("menu").hidden = true;
  $("hud").hidden = false;
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", code);
  if (local) url.searchParams.set("net", "local");
  history.replaceState(null, "", url);
  $<HTMLInputElement>("invite").value = code === "SOLO" ? "" : url.toString();
  $("invitebox").hidden = code === "SOLO";
  $("pauseroom").textContent = code === "SOLO" ? "Practice on your own. Create a game from the menu to play with friends."
    : `Room code: ${code}. Send your friends the link below.`;
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

$("create").onclick = () => start(newRoomCode(), LOCAL);
$("solo").onclick = () => start("SOLO", true);
$("join").onclick = () => {
  const code = cleanCode($<HTMLInputElement>("code").value);
  if (code.length < 4) { $("menuerr").textContent = "Enter the room code your friend sent you."; return; }
  start(code, LOCAL);
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
  renderer.render(world.scene, camera);
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
