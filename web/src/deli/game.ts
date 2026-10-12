// COMBE DOWN WITH ME: a shift in the Darling Deli's kitchen, for one to four cooks.
//
// How a shift is shared (the same pattern as the streets and the mines, see ../game.ts):
// - Each cook moves themselves and sends where they are, which way they face and which chopping
//   board they're working at ("st") about 20 times a second.
// - The host is the cook with the lowest id. It owns the Shift (kitchen.ts): what's on every counter,
//   what everyone's holding, the orders, the clock and the takings. Grabbing or putting something
//   down is asked of the host ("dg", with the tile), and the host sends the whole shift to everyone
//   about 10 times a second ("dk"), with anything that just happened for sounds. If the host leaves,
//   the next cook carries on from the last copy they had.
// - Names go round with "hello", as everywhere else.
import * as SFX from "../audio";
import { colourFor } from "../avatar";
import type { Net } from "../net";
import { Voice } from "../voice";
import { begin, Food, H, Item, NAMES, newShift, RECIPES, Shift, STARTS, stars, STARS, tick, tileAt, use, W, walkable } from "./kitchen";
import { Cook, KitchenView, tileX } from "./view";
import * as THREE from "three";

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const SPEED = 3.4;            // tiles a second
const RADIUS = 0.3;
const ST_EVERY = 0.05, DK_EVERY = 0.1;

interface Remote { id: string; name: string; cook: Cook | null; k: boolean; x: number; y: number; a: number; c: number; tx: number; ty: number; ta: number; speed: number; seen: number }

export class DeliGame {
  readonly selfId: string;
  /** Movement from the touch stick, -1..1 each way. */
  joy = { x: 0, y: 0 };
  /** The chop button or key is held. */
  chopHeld = false;
  /** False while the menu's open: your cook stands still, but the shift goes on. */
  active = true;
  private keys = new Set<string>();
  private S: Shift = newShift();
  private remotes = new Map<string, Remote>();
  /** Talking: everyone in a kitchen is close enough to hear each other at full volume, so it's one open mic. */
  readonly voice: Voice;
  private fwd = new THREE.Vector3();
  private x: number; private y: number; private a = Math.PI; private speed = 0;
  private me: Cook;
  private stT = 0; private dkT = 0;
  private outbox: [string, number][] = [];
  private shownShift = -1;
  private ticketKey = "";
  private chopSound = 0;
  private t = 0;
  private disposed = false;
  /** We have the kitchen: we've had a copy from the host, or there was nobody here to send one. */
  private settled: boolean;
  private born = performance.now();
  private onKey = (e: KeyboardEvent) => this.key(e);
  private offKey = (e: KeyboardEvent) => this.keyUp(e);

  constructor(readonly view: KitchenView, readonly net: Net, readonly name: string, readonly room: string, known: string[] = []) {
    this.selfId = net.selfId;
    this.voice = new Voice(net, (text, secs) => this.toast(text, secs));
    this.settled = !known.length;
    const s = STARTS[Math.floor(Math.random() * STARTS.length)];
    this.x = s[0]; this.y = s[1];
    this.me = new Cook(name, colourFor(this.selfId));
    view.scene.add(this.me.o);

    net.on("hello", (d, from) => {
      if (!d?.deli) return;
      const r = this.remote(from);
      r.name = String(d.name || "Cook").slice(0, 16);
      if (r.cook) { view.scene.remove(r.cook.o); r.cook = null; }
      if (d.ask) net.send("hello", { name: this.name, deli: 1 }, from);
      this.lobby();
    });
    net.on("st", (d, from) => {
      if (typeof d?.x !== "number") return;
      const r = this.remote(from);
      this.voice.heard(from, d.v);
      r.tx = d.x; r.ty = d.y; r.ta = d.a; r.c = d.c ?? -1; r.k = !!d.k; r.seen = performance.now();
    });
    net.on("dg", (d, from) => {
      if (!this.isHost) return;
      if (d?.go) { if (this.S.ph === 0 || this.S.ph === 3) begin(this.S); return; }
      if (typeof d?.i === "number" && this.remotes.has(from)) use(this.S, from, d.i);
    });
    net.on("dk", (d: Shift, from) => {
      if (!d || typeof d.ph !== "number") return;
      this.remote(from).k = true;
      if (from !== this.hostId) return;
      this.settled = true;
      this.S = d;
      for (const e of d.ev ?? []) this.happened(e[0], e[1]);
      delete this.S.ev;
    });
    net.onJoin = (id) => { net.send("hello", { name: this.name, deli: 1, ask: 1 }, id); this.voice.join(id); };
    net.onLeave = (id) => {
      const r = this.remotes.get(id);
      if (r?.cook) view.scene.remove(r.cook.o);
      this.remotes.delete(id);
      this.voice.drop(id);
      // whatever they were holding is dropped (the host decides, and tells everyone)
      if (this.isHost) delete this.S.h[id];
      this.lobby();
    };
    net.send("hello", { name: this.name, deli: 1, ask: 1 });
    for (const id of net.peers()) net.send("hello", { name: this.name, deli: 1, ask: 1 }, id);

    addEventListener("keydown", this.onKey);
    addEventListener("keyup", this.offKey);
    addEventListener("blur", () => { this.keys.clear(); this.chopHeld = false; });
    $("startshift").onclick = () => this.go();
    $("again").onclick = () => this.go();
    this.lobby();
  }

  private remote(id: string): Remote {
    let r = this.remotes.get(id);
    if (!r) {
      const s = STARTS[this.remotes.size % STARTS.length];
      r = { id, name: "Cook", cook: null, k: false, x: s[0], y: s[1], a: 0, c: -1, tx: s[0], ty: s[1], ta: 0, speed: 0, seen: 0 };
      this.remotes.set(id, r);
    }
    return r;
  }

  /** The host: the lowest id among cooks who already have the kitchen, so someone just arriving
   *  never wipes the shift that's going on. */
  get hostId() {
    const ids = [...this.remotes.values()].filter((r) => r.k).map((r) => r.id);
    if (this.settled || !ids.length) ids.push(this.selfId);
    return ids.sort()[0];
  }
  get isHost() { return this.hostId === this.selfId; }
  get cooks() { return 1 + this.remotes.size; }

  // ---- controls ---------------------------------------------------------------------------
  private key(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "Space" || e.code === "KeyE" || e.code === "Enter") { e.preventDefault(); this.grab(); }
    if (["KeyF", "KeyQ", "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "KeyJ"].includes(e.code)) { e.preventDefault(); this.chopHeld = true; }
  }
  private keyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
    if (["KeyF", "KeyQ", "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "KeyJ"].includes(e.code)) {
      this.chopHeld = ["KeyF", "KeyQ", "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "KeyJ"].some((k) => this.keys.has(k));
    }
  }

  /** Start the shift (or the next one). Anyone can; the host does it. */
  go() {
    if (this.S.ph === 1 || this.S.ph === 2) return;
    if (this.isHost) begin(this.S); else this.net.send("dg", { go: 1 }, this.hostId);
  }

  /** Pick up or put down at the tile in front of you. */
  grab() {
    if (!this.active) return;
    const idx = this.facingTile();
    if (idx < 0) return;
    if (this.isHost) use(this.S, this.selfId, idx);
    else this.net.send("dg", { i: idx }, this.hostId);
  }

  /** The tile you're facing: the one a short step ahead, or failing that the nearest counter beside you. */
  private facingTile(): number {
    const dx = Math.sin(this.a), dy = Math.cos(this.a);
    const i = Math.floor(this.x + dx * 0.8), j = Math.floor(this.y + dy * 0.8);
    if (!walkable(i, j) && i >= 0 && j >= 0 && i < W && j < H) return j * W + i;
    // reaching diagonally: whichever way you're facing more
    const ci = Math.floor(this.x), cj = Math.floor(this.y);
    const tries = Math.abs(dx) > Math.abs(dy) ? [[Math.sign(dx), 0], [0, Math.sign(dy)]] : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
    for (const [a, b] of tries) {
      const ti = ci + a, tj = cj + b;
      if ((a || b) && !walkable(ti, tj) && ti >= 0 && tj >= 0 && ti < W && tj < H) return tj * W + ti;
    }
    return -1;
  }

  // ---- each frame ---------------------------------------------------------------------------
  update(dt: number) {
    if (this.disposed) return;
    this.t += dt;
    this.move(dt);
    const face = this.facingTile();
    const chopping = this.chopHeld && face >= 0 && tileAt(face % W, Math.floor(face / W)) === "K" ? face : -1;
    if (chopping >= 0 && this.S.it[chopping]?.s === 0 && (this.chopSound -= dt) <= 0) { SFX.tick(); this.chopSound = 0.22; }

    const cam = this.view.camera;
    cam.getWorldDirection(this.fwd);
    this.voice.update(cam.position.x, cam.position.y, cam.position.z, this.fwd.x, this.fwd.y, this.fwd.z, (id) => {
      const r = this.remotes.get(id);
      return r ? { x: r.x - W / 2, y: 0.8, z: r.y - H / 2 } : null;
    });

    this.stT -= dt;
    if (this.stT <= 0) {
      this.stT = ST_EVERY;
      this.net.send("st", { x: +this.x.toFixed(2), y: +this.y.toFixed(2), a: +this.a.toFixed(2), c: chopping, k: this.settled ? 1 : 0, v: this.voice.mode });
    }
    // nobody sent the kitchen after a while: open our own
    if (!this.settled && performance.now() - this.born > 6000) this.settled = true;

    // the cooks who've gone quiet for a while are dropped from the list (they'll say hello if they come back)
    const now = performance.now();
    for (const r of this.remotes.values()) {
      const k = Math.min(1, dt * 14);
      const ox = r.x, oy = r.y;
      r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k;
      let da = r.ta - r.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      r.a += da * k;
      r.speed = Math.hypot(r.x - ox, r.y - oy) / Math.max(dt, 1e-3);
      if (!r.cook && r.seen) { r.cook = new Cook(r.name, colourFor(r.id)); this.view.scene.add(r.cook.o); }
      if (r.seen && now - r.seen > 15000) r.c = -1;
    }

    if (this.isHost && this.settled) {
      const chops = [chopping, ...[...this.remotes.values()].map((r) => r.c)].filter((c) => c >= 0);
      tick(this.S, dt, chops, this.cooks);
      for (const e of this.S.ev ?? []) { this.happened(e[0], e[1]); this.outbox.push(e); }
      delete this.S.ev;
      this.dkT -= dt;
      if (this.dkT <= 0) {
        this.dkT = DK_EVERY;
        if (this.net.peers().length) this.net.send("dk", { ...this.S, ev: this.outbox });
        this.outbox = [];
      }
    }

    // draw
    const S = this.S;
    this.view.sync(S.it, this.t);
    this.view.face(face);
    this.me.set(this.x - W / 2, this.y - H / 2, this.a, this.speed, chopping >= 0, S.h[this.selfId], this.t, dt);
    for (const r of this.remotes.values()) r.cook?.set(r.x - W / 2, r.y - H / 2, r.a, r.speed, r.c >= 0, S.h[r.id], this.t, dt);
    this.hud();
  }

  private move(dt: number) {
    let mx = this.joy.x, my = this.joy.y;
    const k = this.active ? this.keys : new Set<string>();
    if (!this.active) mx = my = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) my -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) my += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
    [mx, my] = this.view.screenToFloor(mx, my);
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const amt = Math.min(1, len);
    if (amt > 0.15) this.a = Math.atan2(mx, my);
    const vx = mx * SPEED, vy = my * SPEED;
    const ox = this.x, oy = this.y;
    this.x = this.slide(this.x + vx * dt, this.y, true);
    this.y = this.slide(this.x, this.y + vy * dt, false);
    // cooks bump into each other
    for (const r of this.remotes.values()) {
      if (!r.seen) continue;
      const dx = this.x - r.x, dy = this.y - r.y, d = Math.hypot(dx, dy);
      if (d > 0.001 && d < RADIUS * 2) {
        const push = RADIUS * 2 - d;
        const nx = this.slide(this.x + (dx / d) * push, this.y, true);
        this.y = this.slide(nx, this.y + (dy / d) * push, false);
        this.x = nx;
      }
    }
    this.speed = Math.hypot(this.x - ox, this.y - oy) / Math.max(dt, 1e-3);
  }

  /** Move along one axis, stopping at counters. */
  private slide(x: number, y: number, alongX: boolean): number {
    const blocked = (px: number, py: number) => {
      for (const [ox, oy] of [[-RADIUS, -RADIUS], [RADIUS, -RADIUS], [-RADIUS, RADIUS], [RADIUS, RADIUS]]) {
        if (!walkable(Math.floor(px + ox), Math.floor(py + oy))) return true;
      }
      return false;
    };
    if (!blocked(x, y)) return alongX ? x : y;
    if (alongX) {
      const i = Math.floor(x);
      return x > this.x ? i + 1 - RADIUS - 0.001 : i + RADIUS + 0.001 > this.x ? this.x : i + RADIUS + 0.001;
    }
    const j = Math.floor(y);
    return y > this.y ? j + 1 - RADIUS - 0.001 : j + RADIUS + 0.001 > this.y ? this.y : j + RADIUS + 0.001;
  }

  /** Something happened in the kitchen: a sound, and maybe a word. */
  private happened(kind: string, idx: number) {
    const pan = idx >= 0 ? Math.max(-1, Math.min(1, tileX(idx % W) / (W / 2))) : 0;
    switch (kind) {
      case "grab": case "pick": case "put": case "plate": SFX.tick(0, pan); break;
      case "chopped": SFX.bell(4, 25, pan); break;
      case "bin": SFX.clunk(4, pan); break;
      case "serve": SFX.bell(3, 0, pan); setTimeout(() => SFX.bell(4, 0, pan), 120); this.toast("Service!", 1.2); break;
      case "nope": SFX.clunk(0, pan); this.toast("Nobody's ordered that", 1.6); break;
      case "done": SFX.bell(2, 12, pan); break;
      case "burnt": SFX.alarm(); this.toast("Something's burning!", 1.8); break;
      case "late": SFX.alarm(); this.toast("A customer gave up and left", 2); break;
      case "order": SFX.bell(0, 6); break;
      case "end": SFX.bell(0); setTimeout(() => SFX.bell(2), 200); setTimeout(() => SFX.bell(4), 400); break;
    }
  }

  // ---- the screen ---------------------------------------------------------------------------
  private toastT = 0;
  toast(text: string, secs = 2) {
    const el = $("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => el.classList.remove("show"), secs * 1000);
  }

  /** Who's in the kitchen, on the waiting card. */
  private lobby() {
    const names = [this.name + " (you)", ...[...this.remotes.values()].map((r) => r.name)];
    $("cooks").textContent = names.length === 1 ? `Just you in the kitchen. ${this.room === "SOLO" ? "" : "Send friends the link to cook with you."}`
      : `In the kitchen: ${names.join(", ")}.`;
  }

  private hud() {
    const S = this.S;
    const mm = Math.floor(Math.max(0, S.t) / 60), ss = Math.floor(Math.max(0, S.t) % 60);
    $("clock").textContent = S.ph === 2 ? `${mm}:${String(ss).padStart(2, "0")}` : S.ph === 1 ? "Ready" : "3:00";
    $("clock").classList.toggle("low", S.ph === 2 && S.t < 30);
    $("takings").textContent = `£${S.sc}`;
    $("countin").hidden = S.ph !== 1;
    if (S.ph === 1) $("countin").textContent = String(Math.max(1, Math.ceil(S.t)));
    $("waiting").hidden = S.ph !== 0;
    $("results").hidden = S.ph !== 3;
    if (S.ph === 3 && this.shownShift !== S.n) {
      this.shownShift = S.n;
      const st = stars(S.sc);
      $("stars").innerHTML = [0, 1, 2].map((n) => `<span class="${n < st ? "on" : ""}">★</span>`).join("");
      $("restext").textContent = `£${S.sc} taken. ${S.ok} served, ${S.bad} walked out. ${st === 3 ? "The best kitchen in Combe Down." : st === 2 ? "A good shift." : st === 1 ? "You got through it." : "The Hadley Arms is looking tempting."}`;
      $("resnext").textContent = st < 3 ? `£${STARS[st]} for the next star.` : "";
    }
    if (S.ph !== 3) this.shownShift = -1;
    // the tickets along the top
    const key = S.o.map((o) => o.id).join(",");
    if (key !== this.ticketKey) {
      this.ticketKey = key;
      $("tickets").innerHTML = S.o.map((o) => {
        const r = RECIPES[o.r];
        return `<div class="ticket" data-id="${o.id}"><b>${esc(r.name)}</b><div class="needs">${r.needs.map((f) => `<img src="${icon(f)}" alt="${esc(NAMES[f][1])}" title="${esc(NAMES[f][1])}">`).join("")}</div><div class="wait"><i></i></div></div>`;
      }).join("");
    }
    for (const o of S.o) {
      const el = document.querySelector<HTMLElement>(`.ticket[data-id="${o.id}"] .wait i`);
      if (!el) continue;
      const f = Math.max(0, o.t / o.T);
      el.style.width = `${f * 100}%`;
      el.style.background = f > 0.5 ? "#4cc26b" : f > 0.25 ? "#f5a623" : "#d4351c";
    }
    // what's in your hands, in words, for the touch buttons
    const held = S.h[this.selfId];
    $("held").textContent = held ? heldName(held) : "";
  }

  dispose() {
    this.disposed = true;
    removeEventListener("keydown", this.onKey);
    removeEventListener("keyup", this.offKey);
    this.voice.dispose();
    this.net.leave();
  }
}

function heldName(it: Item) {
  if (it.k === "plate") {
    if (!it.on?.length) return "A clean plate";
    return `A plate of ${it.on.map((f) => NAMES[f][1].toLowerCase()).join(", ")}`;
  }
  if (it.s === 2) return `Burnt ${NAMES[it.k][0].toLowerCase()} (bin it)`;
  return NAMES[it.k][it.s ? 1 : 0];
}

// ---- little pictures of each food, for the tickets ---------------------------------------------
const icons = new Map<Food, string>();
function icon(f: Food): string {
  let u = icons.get(f);
  if (u) return u;
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const g = c.getContext("2d")!;
  const disc = (x: number, y: number, r: number, col: string) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  switch (f) {
    case "bread":
      g.fillStyle = "#b9773a"; g.beginPath(); g.roundRect(8, 10, 32, 30, [12, 12, 3, 3]); g.fill();
      g.fillStyle = "#f2deb0"; g.beginPath(); g.roundRect(12, 15, 24, 21, [9, 9, 2, 2]); g.fill();
      break;
    case "cheddar":
      g.fillStyle = "#f2c23b"; g.beginPath(); g.moveTo(6, 36); g.lineTo(42, 36); g.lineTo(42, 14); g.closePath(); g.fill();
      disc(30, 28, 3, "#d9a420"); disc(36, 22, 2, "#d9a420");
      break;
    case "tomato":
      disc(24, 26, 15, "#d8352a"); disc(24, 26, 9, "#f7907f"); disc(24, 26, 3, "#d8352a");
      break;
    case "bacon":
      for (let n = 0; n < 2; n++) {
        g.fillStyle = "#a2462a"; g.fillRect(6, 13 + n * 14, 36, 10);
        g.fillStyle = "#e7b483"; g.fillRect(6, 19 + n * 14, 36, 3);
      }
      break;
    case "egg":
      g.fillStyle = "#fbfaf4"; g.beginPath(); g.ellipse(24, 26, 19, 15, 0, 0, Math.PI * 2); g.fill();
      disc(26, 25, 7, "#f6a41c");
      break;
    case "dough":
      g.fillStyle = "#b9692a"; g.beginPath(); g.ellipse(24, 28, 18, 13, 0, Math.PI, 0); g.fill();
      g.fillRect(6, 28, 36, 6);
      g.fillStyle = "#fff"; for (let n = 0; n < 8; n++) g.fillRect(12 + (n * 7) % 24, 18 + (n * 5) % 9, 3, 3);
      break;
  }
  u = c.toDataURL();
  icons.set(f, u);
  return u;
}
