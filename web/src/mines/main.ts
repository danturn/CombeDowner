// Under Combe Down: the mines page. Sets up the renderer and menu, finds or starts a party, and runs
// the frame loop. The game itself is in game.ts.
import * as THREE from "three";
import * as SFX from "../audio";
import { cleanCode, connect, newRoomCode, Net } from "../net";
import { Post } from "../post";
import { MineGame } from "./game";
import { CLASS_IDS, CLASSES, ClassId } from "./items";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const LOCAL = params.get("net") === "local";
// mine parties live in their own rooms, apart from games up in the streets
const room = (code: string) => `MINES-${code}`;

const canvas = $<HTMLCanvasElement>("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.autoClear = false;
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
const post = new Post(renderer, camera, params.get("fx") !== "0", params.get("res") !== "full");
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
};
$<HTMLInputElement>("name").value = store.get("cd-name") ?? "";
const sens = Number(store.get("cd-sens")) || 1;
$<HTMLInputElement>("sens").value = String(sens);
const music = Number(store.get("cd-music") ?? 0.6);
SFX.setMusicVolume(Number.isFinite(music) ? music : 0.6);
$<HTMLInputElement>("music").value = String(music);
$<HTMLInputElement>("music").oninput = (e) => { const v = Number((e.target as HTMLInputElement).value); SFX.setMusicVolume(v); store.set("cd-music", String(v)); };
addEventListener("pointerdown", () => SFX.unlock(), { once: true });
addEventListener("keydown", () => SFX.unlock(), { once: true });
const roomParam = cleanCode(params.get("room") ?? "");
// for testing: ?go=1 skips the menu, ?depth=3 starts the run that far down, ?class=mage skips the choice
const GO = params.get("go") === "1";
const DEPTH = Number(params.get("depth")) || undefined;
const CLASS = params.get("class") as ClassId | null;
if (roomParam) $<HTMLInputElement>("code").value = roomParam;

let game: MineGame | null = null;

function start(code: string, net: Net) {
  const name = ($<HTMLInputElement>("name").value.trim() || "Player").slice(0, 16);
  store.set("cd-name", name);
  SFX.unlock();
  game = new MineGame(camera, net, name, code, { depth: DEPTH });
  game.player.sensitivity = 0.0022 * sens;
  $("menu").hidden = true;
  $("hud").hidden = false;
  if (CLASS && CLASSES[CLASS]) { game.setClass(CLASS); lock(); }
  else pickClass();
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", code);
  if (LOCAL) url.searchParams.set("net", "local");
  if (code !== "SOLO") history.replaceState(null, "", url);
  else history.replaceState(null, "", location.pathname + (LOCAL ? "?net=local" : ""));
  $<HTMLInputElement>("invite").value = url.toString();
  $("invitebox").hidden = code === "SOLO";
  $("pauseroom").textContent = code === "SOLO" ? "Down the mine on your own." : `Party: ${code}. Send friends the link to come down with you.`;
}

/** Choose a class. The click on a card also captures the mouse. */
function pickClass() {
  const last = store.get("cd-class");
  const list = $("classes");
  list.innerHTML = "";
  for (const id of CLASS_IDS) {
    const c = CLASSES[id];
    const b = document.createElement("button");
    b.innerHTML = `<b></b><span></span><small></small>`;
    b.querySelector("b")!.textContent = c.name;
    b.querySelector("span")!.textContent = c.blurb;
    b.querySelector("small")!.textContent = `${c.hp} health. ${c.how}`;
    if (id === last) b.classList.add("last");
    b.onclick = () => {
      store.set("cd-class", id);
      game?.setClass(id);
      $("classpick").hidden = true;
      lock();
    };
    list.append(b);
  }
  $("classpick").hidden = false;
}

function lock() {
  try { (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => ($("clickhint").hidden = false)); } catch { $("clickhint").hidden = false; }
}
document.addEventListener("pointerlockchange", () => {
  if (!game) return;
  const locked = document.pointerLockElement === canvas;
  game.active = locked;
  $("pause").hidden = locked || !$("classpick").hidden;
  $("clickhint").hidden = true;
});
canvas.addEventListener("click", () => { if (game && $("classpick").hidden && document.pointerLockElement !== canvas) lock(); });
$("resume").onclick = () => lock();
$("leave").onclick = () => { game?.dispose(); location.href = location.pathname; };
$("again").onclick = () => game?.again();
$("copy").onclick = async () => {
  const input = $<HTMLInputElement>("invite");
  try { await navigator.clipboard.writeText(input.value); $("copy").textContent = "Copied"; } catch { input.select(); }
  setTimeout(() => ($("copy").textContent = "Copy link"), 1800);
};
$<HTMLInputElement>("sens").oninput = (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  if (game) game.player.sensitivity = 0.0022 * v;
  store.set("cd-sens", String(v));
};

/** Join the party if it's down there already, or start it. Either way the host sends the mine. */
async function play(code: string) {
  const net = connect(room(code), LOCAL);
  let cancelled = false;
  $("menuform").hidden = true;
  $("lookup").hidden = false;
  $("lookupmsg").textContent = `Looking for ${code}…`;
  $("lookcancel").onclick = () => { cancelled = true; net.leave(); $("lookup").hidden = true; $("menuform").hidden = false; };
  // anyone already playing says hello to newcomers; give them a few seconds
  const found = await new Promise<boolean>((resolve) => {
    net.on("hello", () => resolve(true));
    setTimeout(() => resolve(false), LOCAL ? 1500 : 8000);
  });
  if (cancelled) return;
  start(code, net);
  game!.toast(found ? `Joining ${code}` : `You've started ${code}. Press Esc for the invite link`, 4);
}

$("play").onclick = () => {
  const code = cleanCode($<HTMLInputElement>("code").value) || newRoomCode();
  if (code.length < 4 || code === "SOLO") { $("menuerr").textContent = "Pick a party name of at least 4 letters or numbers."; return; }
  play(code);
};
const solo = () => start("SOLO", connect(room(`SOLO${Math.random().toString(36).slice(2, 8)}`), true));
$("solo").onclick = solo;
$<HTMLInputElement>("code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("play").click(); });

// straight in, from the front door on The Firs or a test link
if (GO) { if (roomParam && roomParam !== "SOLO") play(roomParam); else solo(); }

// the menu backdrop
const backdrop = new THREE.Scene();
backdrop.background = new THREE.Color("#030202");

let last = performance.now();
let frames = 0, fpsT = 0;
function frame(now: number) {
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw);
  last = now;
  if (game) { game.update(dt); post.render(game.scene, game.weaponScene); }
  else post.render(backdrop, null);
  frames++; fpsT += raw;
  if (fpsT >= 1) { (window as any).__fps = frames / fpsT; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as any).__mines = () => game;
(window as any).__renderer = renderer;
