// The match: local player, remote players, shooting, damage, deaths, respawns and scores.
//
// Who decides what:
// - Each player moves themselves and sends their position about 20 times a second.
// - The shooter checks their own hits against what they see (it feels fair to the shooter, and
//   cheating isn't a worry among friends), then tells the host.
// - The host applies damage, kills and scores, and tells everyone. The host is simply the player
//   with the lowest id, so if the host leaves, the next player takes over with the latest scores.
// - The host also runs the chavs (see chavs.ts), and decides when their punches land.
// - The host also owns the pickups (see pickups.ts) and decides who gets each one.
// - Everyone says which map they're on in their hello. Players on another map in the same room
//   (two people who started the same code at once) are ignored: they can't see each other.
import * as THREE from "three";
import * as SFX from "./audio";
import { Avatar, colourFor } from "./avatar";
import { Blood, Walker } from "./blood";
import { ChavState, Chavs, PUNCH_DAMAGE, Target } from "./chavs";
import { GameMap, Place } from "./map";
import { DEFAULT_MAP, mapName } from "./maps";
import { Net } from "./net";
import { Minimap } from "./minimap";
import { BLIP, AMMO_PICKUP, Kind, PINT_HEAL, Pickups, SNIPER_PICKUP } from "./pickups";
import { Player } from "./player";
import { damage, Effects, GunKind, GUNS, MAX_RESERVE, SLOTS, Weapon } from "./weapon";
import { World } from "./world";

const RESPAWN_SECONDS = 3;
const SEND_HZ = 20;
const CHAV_HZ = 10;
/** Who hit you, when it was a chav. */
const CHAV = "chav";
const SPOT_KEY = "cd-spots";             // last place you stood in each room, so rejoining puts you back
const SPOT_TTL = 24 * 3600 * 1000;       // forget a spot after a day
const PK_EVERY = 2;                      // seconds between the host's pickup lists

interface Score { name: string; k: number; d: number; c: number; hp: number; alive: boolean; life: number }
interface Remote { id: string; name: string; colour: string; avatar: Avatar; life: number; lastSeen: number; lastShot: number }

const $ = (id: string) => document.getElementById(id)!;

export class Game {
  readonly player: Player;
  readonly weapon = new Weapon();
  readonly effects: Effects;
  readonly chavs: Chavs;
  readonly pickups: Pickups;
  private blood: Blood;
  private remotes = new Map<string, Remote>();
  private elsewhere = new Set<string>();            // players in this room on a different map
  private scores: Record<string, Score> = {};      // the host's word, copied to everyone
  private hp = 100;
  private alive = true;
  private life = 0;                                 // goes up on each respawn, so stale hits are ignored
  private deadFor = 0;
  private killer = "";
  private sendT = 0;
  private sbT = 0;
  private chT = 0;
  private chasedT = 0;     // a while between "chavs are after you" warnings
  private pkT = 0;
  private claimed = new Map<number, number>();   // pickups asked for, and when (ms), so we don't keep asking
  private hintT = 0;                             // a while between "can't pick that up" hints
  firing = false;
  aiming = false;
  shootOnce = false;   // a tap in touch mode
  /** True when the mouse isn't captured: touch controls handle looking and firing. */
  freeMode = false;
  private spawns: [number, number][] = [];
  private lastLook = { dx: 0, dy: 0 };
  private hitT = 0;
  private hurtT = 0;
  private toastT = 0;
  private placeT = 0;
  private spotT = 0;                               // when the spot was last saved (ms)
  private streets: { x: number; z: number; n: string }[] = [];
  active = false;   // pointer locked and playing
  private minimap: Minimap;

  constructor(
    private map: GameMap,
    private world: World,
    private camera: THREE.PerspectiveCamera,
    readonly net: Net,
    readonly name: string,
    readonly room: string,
  ) {
    this.player = new Player(map);
    this.effects = new Effects(world.scene);
    this.blood = new Blood(world.scene, world.surface);
    this.chavs = new Chavs(map, world.scene);
    this.pickups = new Pickups(map, world.scene);
    this.chavs.onSwing = (x, y, z) => {
      const to = new THREE.Vector3(x, y + 1.4, z).sub(this.camera.position);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      SFX.punch(to.length(), to.normalize().dot(right));
    };
    this.minimap = new Minimap(map, document.getElementById("minimap") as HTMLCanvasElement);
    $("minimap").addEventListener("pointerdown", (e) => { e.stopPropagation(); this.toggleMap(); });
    $("bigmap").addEventListener("pointerdown", (e) => { e.stopPropagation(); this.toggleMap(); });
    this.buildSpawns();
    this.scores[net.selfId] = { name, k: 0, d: 0, c: 0, hp: 100, alive: true, life: 0 };
    this.respawn(this.savedSpot());
    addEventListener("pagehide", () => this.saveSpot());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.saveSpot(); });

    const here = (fn: (d: any, from: string) => void) => (d: any, from: string) => { if (!this.elsewhere.has(from)) fn(d, from); };
    net.on("hello", (d, from) => this.onHello(d, from));
    net.on("st", here((d, from) => this.onState(d, from)));
    net.on("shot", here((d, from) => this.onShot(d, from)));
    net.on("hit", here((d, from) => { if (this.isHost) this.applyHit(from, d); }));
    net.on("ev", here((d) => this.onEvent(d)));
    net.on("sb", here((d, from) => { if (from === this.hostId) this.onScores(d); }));
    net.on("rs", here((d, from) => { if (this.isHost) this.applyRespawn(from, d.life); }));
    net.on("ch", here((d: ChavState, from) => { if (from === this.hostId && !this.isHost) this.chavs.apply(d); }));
    net.on("chit", here((d, from) => { if (this.isHost) this.applyChavHit(from, d); }));
    net.on("pick", here((d, from) => { if (this.isHost) this.applyPick(from, d); }));
    net.on("pk", here((d, from) => { if (from === this.hostId && !this.isHost) this.pickups.apply(d); }));
    net.onJoin = (id) => {
      this.hello(id);
      if (this.isHost) { this.sendScores(); this.pkT = 0; }
    };
    net.onLeave = (id) => {
      this.elsewhere.delete(id);
      const r = this.remotes.get(id);
      if (r) { this.world.scene.remove(r.avatar.root); this.remotes.delete(id); this.feed(`<b>${esc(r.name)}</b> left`); }
      delete this.scores[id];
    };
    net.onError = (msg) => this.toast(msg, 6);
    this.hello(undefined, true);   // and ask everyone already here to say hello back

    addEventListener("mousedown", (e) => {
      if (!this.active || this.freeMode) return;
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.aiming = !this.aiming;   // right click toggles aiming
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 0) this.firing = false;
    });
    addEventListener("wheel", (e) => {
      if (!this.active || this.freeMode || !e.deltaY) return;
      this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
    addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("mousemove", (e) => {
      if (!this.active || this.freeMode) return;
      this.look(e.movementX, e.movementY);
    });
    addEventListener("keydown", (e) => {
      if (e.code === "Tab") { e.preventDefault(); $("scoreboard").hidden = false; this.renderScores(); }
      if (e.code === "KeyR" && this.active) this.reload();
      if (this.active && !e.repeat) {
        const n = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
        if (n >= 0) this.switchTo(SLOTS[n], true);
        if (e.code === "KeyQ") this.cycleWeapon(1);
      }
      if (e.code === "KeyM" && !e.repeat) this.toggleMap();
    });
    addEventListener("keyup", (e) => { if (e.code === "Tab") $("scoreboard").hidden = true; });
  }

  toggleMap() {
    const el = $("bigmap");
    el.hidden = !el.hidden;
  }

  look(dx: number, dy: number) {
    const zoom = 1 - this.weapon.aim * this.weapon.gun.zoom;
    this.player.look(dx, dy, zoom);
    this.lastLook.dx += dx; this.lastLook.dy += dy;
  }

  reload() {
    if (this.alive && this.weapon.startReload()) SFX.reload();
  }

  /** Change weapon (1 fists, 2 rifle, 3 sniper). say: explain if you can't. */
  switchTo(kind: GunKind, say = false) {
    const w = this.weapon;
    if (!this.alive || kind === w.kind) return;
    if (!w.select(kind)) {
      if (say) this.toast(kind === "sniper" ? (w.hasSniper ? "The sniper rifle's empty" : "No sniper rifle yet. It's the blue dot on the map") : "Out of rifle rounds", 1.8);
      return;
    }
    this.aiming = false;
    this.firing = false;
    SFX.dryFire();
  }

  /** Next or previous weapon you can use. */
  cycleWeapon(way: number) {
    const w = this.weapon;
    for (let i = 1; i < SLOTS.length; i++) {
      const k = SLOTS[(SLOTS.indexOf(w.kind) + way * i + SLOTS.length * 2) % SLOTS.length];
      if (w.has(k)) { this.switchTo(k); return; }
    }
  }

  get mapId(): string { return this.map.d.id ?? DEFAULT_MAP; }

  /** Players in this room on the same map. */
  peers(): string[] { return this.net.peers().filter((id) => !this.elsewhere.has(id)); }

  get hostId(): string {
    return [this.net.selfId, ...this.peers()].sort()[0];
  }
  get isHost() { return this.hostId === this.net.selfId; }

  // ---- spawning ---------------------------------------------------------------------
  private buildSpawns() {
    const D = this.map.d;
    // everyone starts on Firs Field, the green between North Road, The Firs and The Avenue
    if (D.spawn && D.spawn.length > 2) {
      const ring = D.spawn;
      const inside = (x: number, y: number) => {
        let c = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i], [xj, yj] = ring[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
        }
        return c;
      };
      const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 3) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 3) {
        if (inside(x, y) && !this.map.blocked(x, -y, 1.2)) this.spawns.push([x, -y]);
      }
    }
    const fallback = !this.spawns.length;
    const ok = (x: number, z: number) => Math.hypot(x, z) < this.map.field * 0.85 && !this.map.blocked(x, z, 0.8);
    // streets and footpaths, so a park has spawn points across it, not only around its edge
    for (const r of D.rd) {
      for (let i = 0; i < r.p.length; i += 3) {
        const [x, y] = r.p[i];
        if (r.n) this.streets.push({ x, z: -y, n: r.n });
        if (fallback && i % 6 === 0 && ok(x, -y)) this.spawns.push([x, -y]);
      }
    }
  }

  /** The smallest named place (park, garden, pond...) at data point (x, y), if any. */
  private placeAt(x: number, y: number): Place | undefined {
    return this.map.d.pl?.find((p) => {
      let inside = false;
      for (let i = 0, j = p.r.length - 1; i < p.r.length; j = i++) {
        const [xi, yi] = p.r[i], [xj, yj] = p.r[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    });
  }

  private respawn(at?: { x: number; z: number; yaw: number }) {
    if (at) this.player.spawn(at.x, at.z, at.yaw);
    else {
      // pick from a random sample the spot furthest from everyone else
      const others = [...this.remotes.values()].filter((r) => r.avatar.alive).map((r) => [r.avatar.x, r.avatar.z]);
      let best = this.spawns[0], bestScore = -1;
      for (let i = 0; i < 40; i++) {
        const s = this.spawns[Math.floor(Math.random() * this.spawns.length)];
        const d = others.length ? Math.min(...others.map(([x, z]) => Math.hypot(x - s[0], z - s[1]))) : 100 + Math.random();
        const score = Math.min(d, 160) + Math.random() * 30;
        if (score > bestScore) { bestScore = score; best = s; }
      }
      this.player.spawn(best[0], best[1]);
    }
    this.hp = 100;
    this.alive = true;
    this.weapon.reset();
    this.aiming = false;
    this.claimed.clear();
    this.life++;
    this.blood.stop(this.net.selfId);
    this.sendState();
    if (this.isHost) this.applyRespawn(this.net.selfId, this.life);
    else this.net.send("rs", { life: this.life }, this.hostId);
  }

  // ---- rejoining where you left off ------------------------------------------------------
  private readSpots(): Record<string, { x: number; z: number; yaw: number; t: number }> {
    try { return JSON.parse(localStorage.getItem(SPOT_KEY) ?? "{}") ?? {}; } catch { return {}; }
  }

  private get spotKey() { return `${this.mapId}:${this.room}`; }

  private savedSpot() {
    const s = this.readSpots()[this.spotKey];
    if (!s || !(Date.now() - s.t < SPOT_TTL) || ![s.x, s.z, s.yaw].every(Number.isFinite)) return undefined;
    if (Math.hypot(s.x, s.z) > this.map.field - 1 || this.map.blocked(s.x, s.z, 0.35)) return undefined;
    return s;
  }

  /** Remember where you are (or forget it while you're dead, so you rejoin at a normal spawn). */
  private saveSpot() {
    const spots = this.readSpots(), now = Date.now();
    for (const k in spots) if (!(now - spots[k]?.t < SPOT_TTL)) delete spots[k];
    const p = this.player.pos;
    if (this.alive) spots[this.spotKey] = { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, yaw: Math.round(this.player.yaw * 100) / 100, t: now };
    else delete spots[this.spotKey];
    try { localStorage.setItem(SPOT_KEY, JSON.stringify(spots)); } catch { /* storage may be blocked */ }
  }

  // ---- messages -----------------------------------------------------------------------
  private remote(id: string): Remote {
    let r = this.remotes.get(id);
    if (!r) {
      const colour = colourFor(id);
      r = { id, name: "Player", colour, avatar: new Avatar("Player", colour), life: 0, lastSeen: performance.now(), lastShot: -1e9 };
      this.remotes.set(id, r);
      this.world.scene.add(r.avatar.root);
    }
    return r;
  }

  private hello(to?: string, ask = false) {
    this.net.send("hello", ask ? { name: this.name, map: this.mapId, ask: 1 } : { name: this.name, map: this.mapId }, to);
  }

  private onHello(d: { name: string; map?: string; ask?: number }, from: string) {
    const name = String(d?.name || "Player").slice(0, 16);
    if (d?.ask) this.hello(from);
    if (String(d?.map || DEFAULT_MAP) !== this.mapId) {
      if (this.elsewhere.has(from)) return;
      this.elsewhere.add(from);
      const r = this.remotes.get(from);
      if (r) { this.world.scene.remove(r.avatar.root); this.remotes.delete(from); }
      delete this.scores[from];
      this.toast(`${name} is in this room on ${mapName(String(d?.map || DEFAULT_MAP))}, so you can't see each other. Start a new game to play together.`, 7);
      return;
    }
    const r = this.remote(from);
    const isNew = r.name === "Player" && name !== "Player";
    r.name = name;
    r.avatar.setName(name, r.colour);
    if (isNew) this.feed(`<b style="color:${r.colour}">${esc(name)}</b> joined`);
    if (this.scores[from]) this.scores[from].name = name;
  }

  private onState(d: number[], from: string) {
    if (!Array.isArray(d) || d.length < 8) return;
    const r = this.remote(from);
    const [x, y, z, yaw, pitch, crouch, alive, life] = d;
    r.lastSeen = performance.now();
    if (life !== r.life) { r.life = life; r.avatar.teleport(); this.blood.stop(from); }
    if (this.isHost) this.catchUpLife(from, life);
    r.avatar.alive = alive === 1;
    r.avatar.push({ t: performance.now(), x, y, z, yaw, pitch, crouch });
  }

  private onShot(d: number[], from: string) {
    const r = this.remotes.get(from);
    if (!r || !Array.isArray(d)) return;
    r.lastShot = performance.now();
    const o = new THREE.Vector3(d[0], d[1], d[2]), e = new THREE.Vector3(d[3], d[4], d[5]);
    const sniper = d[7] === 1;
    this.effects.tracer(o, e, sniper ? "#fff4d0" : "#ffc070", sniper ? 0.35 : 0.07);
    if (d[6]) this.effects.impact(e, new THREE.Vector3(0, 1, 0), d[6] === 2 ? "#9a2a1e" : "#cfc4a8", 4);
    const toShot = o.clone().sub(this.camera.position);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    SFX.shot(toShot.length(), toShot.normalize().dot(right), sniper);
  }

  private onEvent(d: any) {
    const me = this.net.selfId;
    const nameOf = (id: string) => (id === CHAV ? "A chav" : id === me ? this.name : this.remotes.get(id)?.name ?? this.scores[id]?.name ?? "Someone");
    const colOf = (id: string) => (id === CHAV ? "#d8d8d8" : id === me ? "#e3a33b" : colourFor(id));
    const who = (id: string) => `<b style="color:${colOf(id)}">${esc(nameOf(id))}</b>`;
    if (d.k === "dmg" && d.t === me && d.life === this.life) {
      this.hp = d.hp;
      this.hurtT = 0.5;
      SFX.hurt();
      if (d.by === CHAV) { this.player.yaw += (Math.random() - 0.5) * 0.08; this.player.pitch += 0.03; }   // knocked about
    }
    if ((d.k === "dmg" || d.k === "kill") && d.by !== CHAV && !d.m) {
      const v = this.posOf(d.t), from = this.posOf(d.by);
      if (v) {
        this.blood.hit(d.t, v.x, v.z, from?.x ?? v.x, from?.z ?? v.z, !!d.h);
        if (d.k === "kill") this.bodyPool(v.x, v.z, v.yaw, 1);
      }
    }
    if (d.k === "kill") {
      const head = d.h ? " (headshot)" : "";
      const how = d.by === CHAV || d.m ? "battered" : d.w === 2 ? "sniped" : "shot";
      this.feed(`${who(d.by)} ${how} ${who(d.t)}${head}`);
      if (d.t === me && d.life === this.life) {
        this.hp = 0;
        this.alive = false;
        this.deadFor = 0;
        this.killer = nameOf(d.by);
        this.firing = false;
      }
      if (d.by === me && d.t !== me) { SFX.kill(); this.toast(`You ${d.m ? "battered" : "shot"} ${nameOf(d.t)}`, 1.5); }
      const r = this.remotes.get(d.t);
      if (r) r.avatar.alive = false;
    }
    if (d.k === "cdmg" || d.k === "ckill") {
      const c = this.chavs.at(d.c), from = this.posOf(d.by);
      if (c && c.gen === d.g && !d.m) {
        this.blood.hit(c.key, c.x, c.z, from?.x ?? c.x, from?.z ?? c.z, !!d.h);
        if (d.k === "ckill") this.bodyPool(c.x, c.z, c.yaw, -1);
      }
      if (d.k === "ckill") {
        this.chavs.killed(d.c, d.g);
        this.feed(`${who(d.by)} decked a chav${d.h ? " (headshot)" : ""}`);
        if (d.by === me) { SFX.kill(); this.toast("You decked a chav", 1.5); }
      }
    }
    if (d.k === "pick") this.onPick(d);
  }

  /** Someone took a pickup. If it was us, have it. */
  private onPick(d: { i: number; kind: Kind; t: string; life: number; hp?: number }) {
    this.pickups.take(d.i);
    this.claimed.delete(d.i);
    if (d.kind === "sniper" && d.t !== this.net.selfId) {
      const r = this.remotes.get(d.t);
      if (r) this.feed(`<b style="color:${r.colour}">${esc(r.name)}</b> picked up the sniper rifle`);
    }
    if (d.t !== this.net.selfId || d.life !== this.life || !this.alive) return;
    const w = this.weapon;
    SFX.pickup(d.kind);
    if (d.kind === "pint") { this.hp = d.hp ?? this.hp; this.toast(`Cheers! +${PINT_HEAL} health`, 1.8); }
    if (d.kind === "fizz") { this.hp = d.hp ?? 100; this.toast("Co-op Bucks Fizz: full health", 2); }
    if (d.kind === "ammo") {
      w.reserve = Math.min(MAX_RESERVE, w.reserve + AMMO_PICKUP);
      this.toast(`+${AMMO_PICKUP} rifle rounds`, 1.5);
      if (w.kind === "fists") this.switchTo("rifle");
    }
    if (d.kind === "sammo") {
      w.sniperAmmo = Math.min(GUNS.sniper.mag, w.sniperAmmo + SNIPER_PICKUP);
      this.toast(`+${SNIPER_PICKUP} sniper rounds`, 1.5);
    }
    if (d.kind === "sniper") {
      w.giveSniper();
      this.aiming = false;
      this.toast("Sniper rifle: 10 rounds. Right click for the scope, 3 to pick it, 2 for the rifle", 3.5);
      this.feed(`You picked up the sniper rifle`);
    }
  }

  /** Could we use this pickup right now? Otherwise, why not. */
  private wants(kind: Kind): true | string {
    const w = this.weapon;
    if (kind === "pint" || kind === "fizz") return this.hp < 100 || "You're at full health. Save it for later";
    if (kind === "ammo") return w.reserve < MAX_RESERVE || "You can't carry any more rifle rounds";
    if (kind === "sammo") return !w.hasSniper ? "Sniper rounds: you need the sniper rifle from Firs Field" : w.sniperAmmo < GUNS.sniper.mag || "Your sniper rifle's full";
    return w.sniperAmmo < GUNS.sniper.mag || "Your sniper rifle's already full";
  }

  /** Walk over pickups to ask the host for them. */
  private grab() {
    const p = this.player.pos, now = performance.now();
    for (const it of this.pickups.near(p.x, p.y, p.z)) {
      const ok = this.wants(it.kind);
      if (ok !== true) {
        if (this.hintT <= 0 && this.toastT <= 0) { this.toast(ok, 2); this.hintT = 6; }
        continue;
      }
      if (now - (this.claimed.get(it.id) ?? -1e9) < 1000) continue;
      this.claimed.set(it.id, now);
      const claim = { i: it.id, life: this.life };
      if (this.isHost) this.applyPick(this.net.selfId, claim);
      else this.net.send("pick", claim, this.hostId);
    }
  }

  /** Where a player is, as this player sees them. */
  private posOf(id: string): { x: number; y: number; z: number; yaw: number } | null {
    if (id === this.net.selfId) { const p = this.player; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw }; }
    const a = this.remotes.get(id)?.avatar;
    return a ? { x: a.x, y: a.y, z: a.z, yaw: a.yaw } : null;
  }

  /** A pool spreads under the chest of a body that fell forwards (1) or backwards (-1) from facing yaw. */
  private bodyPool(x: number, z: number, yaw: number, way: number) {
    this.blood.pool(x - Math.sin(yaw) * 0.9 * way, z - Math.cos(yaw) * 0.9 * way);
  }

  private onScores(d: Record<string, Score>) {
    const mine = this.scores[this.net.selfId];
    this.scores = d;
    const s = d[this.net.selfId];
    if (s && s.life === this.life) this.hp = s.hp;
    else if (mine) this.scores[this.net.selfId] = { ...mine, k: s?.k ?? mine.k, d: s?.d ?? mine.d, c: s?.c ?? mine.c };
    if (!$("scoreboard").hidden) this.renderScores();
  }

  // ---- host rules --------------------------------------------------------------------------
  private entry(id: string): Score {
    return (this.scores[id] ??= { name: id === this.net.selfId ? this.name : this.remotes.get(id)?.name ?? "Player", k: 0, d: 0, c: 0, hp: 100, alive: true, life: 0 });
  }

  /** Lives only go up. If a player is on a newer life than the host knew, their respawn message was missed. */
  private catchUpLife(id: string, life: number) {
    const s = this.entry(id);
    if (life > s.life) { Object.assign(s, { hp: 100, alive: true, life }); this.sendScores(); }
  }

  private applyHit(from: string, d: { t: string; head: boolean; life: number; w?: number }) {
    this.catchUpLife(d.t, d.life);
    if (!this.entry(from).alive || d.t === from) return;
    const kind = SLOTS[d.w ?? 1] ?? "rifle";
    this.hurt(d.t, damage(kind, d.head), from, d.head, d.life, d.w);
  }

  /** Hand a pickup to whoever asked first, and tell everyone. */
  private applyPick(from: string, d: { i: number; life: number }) {
    const it = this.pickups.items.get(d?.i), s = this.entry(from);
    if (!it || !s.alive || s.life !== d.life) return;
    const e: Record<string, unknown> = { k: "pick", i: it.id, kind: it.kind, t: from, life: d.life };
    if (it.kind === "pint" || it.kind === "fizz") {
      if (s.hp >= 100) return;
      s.hp = it.kind === "fizz" ? 100 : Math.min(100, s.hp + PINT_HEAL);
      e.hp = s.hp;
    }
    this.broadcastEvent(e);
    this.net.send("pk", this.pickups.snapshot());
    if (e.hp !== undefined) this.sendScores();
  }

  /** Take health off a player and tell everyone. by is the shooter's id, or CHAV. w is the weapon slot. */
  private hurt(id: string, amount: number, by: string, head: boolean, life: number, w?: number) {
    const target = this.entry(id);
    if (!target.alive || target.life !== life) return;
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp <= 0) {
      target.alive = false;
      target.d++;
      if (by !== CHAV) this.entry(by).k++;
      this.broadcastEvent({ k: "kill", t: id, by, h: head, life, w, m: w === 0 ? 1 : 0 });
    } else {
      this.broadcastEvent({ k: "dmg", t: id, by, h: head, hp: target.hp, life, w, m: w === 0 ? 1 : 0 });
    }
    this.sendScores();
  }

  private applyChavHit(from: string, d: { c: number; g: number; head: boolean; w?: number }) {
    const shooter = this.entry(from);
    if (!shooter.alive) return;
    const res = this.chavs.damage(d.c, d.g, damage(SLOTS[d.w ?? 1] ?? "rifle", d.head));
    if (!res) return;
    const at = this.posOf(from);
    if (at) this.chavs.aggro(d.c, from, at.x, at.z);
    this.broadcastEvent({ k: res === "kill" ? "ckill" : "cdmg", c: d.c, g: d.g, by: from, h: d.head, m: d.w === 0 ? 1 : 0 });
    if (res === "kill") {
      shooter.c = (shooter.c ?? 0) + 1;
      this.sendScores();
      // chavs sometimes drop a pint, a bottle or some rounds
      const c = this.chavs.at(d.c);
      if (c && this.pickups.drop(c.x, c.z)) this.net.send("pk", this.pickups.snapshot());
    }
  }

  /** Who the chavs can go for, as the host sees them. */
  private targets(): Target[] {
    const p = this.player.pos;
    const out: Target[] = [{ id: this.net.selfId, x: p.x, y: p.y, z: p.z, alive: this.alive }];
    for (const r of this.remotes.values()) out.push({ id: r.id, x: r.avatar.x, y: r.avatar.y, z: r.avatar.z, alive: r.avatar.alive });
    return out;
  }

  private applyRespawn(id: string, life: number) {
    const s = this.entry(id);
    if (life < s.life) return;
    Object.assign(s, { hp: 100, alive: true, life });
    this.sendScores();
  }

  private broadcastEvent(e: object) {
    this.net.send("ev", e);
    this.onEvent(e);
  }

  private sendScores() {
    for (const [id, r] of this.remotes) this.entry(id).name = r.name;
    this.entry(this.net.selfId).name = this.name;
    this.net.send("sb", this.scores);
    if (!$("scoreboard").hidden) this.renderScores();
  }

  // ---- shooting ----------------------------------------------------------------------------
  private shoot() {
    const w = this.weapon, p = this.player;
    if (!w.canFire) {
      if (w.kind === "rifle" && w.ammo === 0 && w.cooldown <= 0 && w.reloading <= 0 && w.switching <= 0) {
        if (w.startReload()) SFX.reload();
        else { w.dry(); SFX.dryFire(); }
      }
      return;
    }
    const kind = w.kind, slot = SLOTS.indexOf(kind), gun = w.gun, melee = kind === "fists";
    w.fire();
    if (melee) SFX.swing();
    else SFX.shot(0, 0, kind === "sniper");
    if (kind === "sniper" && w.sniperAmmo > 0) SFX.bolt();
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const spread = w.spread(Math.min(1, p.speed / 5), !p.onGround);
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    // recoil
    p.pitch = Math.min(1.5, p.pitch + gun.recoil * (1 - w.aim * 0.4));
    p.yaw += (Math.random() - 0.5) * gun.recoil * 0.55;

    const wall = this.map.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, gun.range);
    let maxD = wall ? wall.dist : gun.range;
    let victim: Remote | null = null, head = false;
    for (const r of this.remotes.values()) {
      const h = r.avatar.hit(origin, dir);
      if (h && h.dist < maxD) { maxD = h.dist; victim = r; head = h.head; }
    }
    const chav = this.chavs.hit(origin, dir, maxD);
    if (chav) { maxD = chav.dist; victim = null; head = chav.head; }
    const end = origin.clone().addScaledVector(dir, maxD);
    const muzzle = new THREE.Vector3(0.2, -0.15, kind === "sniper" ? -1.1 : -0.9).applyQuaternion(this.camera.quaternion).add(origin);
    if (!melee) this.effects.tracer(muzzle, end, kind === "sniper" ? "#fff4d0" : undefined, kind === "sniper" ? 0.35 : 0.07);
    let mark = 0;
    if (victim || chav) {
      mark = 2;
      if (melee) SFX.punch();
      else this.effects.impact(end, dir.clone().negate(), "#9a2a1e", kind === "sniper" ? 12 : 7);
      this.hitT = 0.18;
      $("hitmarker").classList.toggle("head", head);
      SFX.hitMarker(head);
    }
    if (victim) {
      const claim = { t: victim.id, head, life: victim.life, w: slot };
      if (this.isHost) this.applyHit(this.net.selfId, claim);
      else this.net.send("hit", claim, this.hostId);
    } else if (chav) {
      const claim = { c: chav.i, g: chav.gen, head, w: slot };
      if (this.isHost) this.applyChavHit(this.net.selfId, claim);
      else this.net.send("chit", claim, this.hostId);
    } else if (wall && !melee) {
      mark = 1;
      const n = new THREE.Vector3(wall.nx, wall.ny, wall.nz);
      const col = wall.kind === "ground" ? "#6b5a3e" : wall.kind === "tree" ? "#5a4630" : "#d8c9a4";
      this.effects.impact(end, n, col, 6);
    }
    if (melee) return;
    const q = (v: number) => Math.round(v * 100) / 100;
    this.net.send("shot", [q(muzzle.x), q(muzzle.y), q(muzzle.z), q(end.x), q(end.y), q(end.z), mark, kind === "sniper" ? 1 : 0]);
  }

  private sendState() {
    const p = this.player, q = (v: number) => Math.round(v * 100) / 100;
    this.net.send("st", [q(p.pos.x), q(p.pos.y), q(p.pos.z), q(p.yaw), q(p.pitch), q(p.crouch), this.alive ? 1 : 0, this.life]);
  }

  // ---- frame ------------------------------------------------------------------------------
  update(dt: number) {
    const now = performance.now();
    const p = this.player, w = this.weapon;
    p.update(dt, this.active && this.alive);
    p.applyToCamera(this.camera);
    // the sniper's scope wanders, and the shot goes where it points
    this.camera.rotation.y += w.drift.x;
    this.camera.rotation.x += w.drift.y;
    if (p.sprinting) this.aiming = false;
    // out of rounds: the rifle if it has any, else fists
    if (this.alive && !w.has(w.kind) && w.gun.interval - w.cooldown > 0.5) {
      const to: GunKind = w.has("rifle") ? "rifle" : "fists";
      this.switchTo(to);
      this.toast(w.kind === "rifle" ? "Out of sniper rounds" : "Out of ammo. Fists it is", 2);
    }
    if (this.active && this.alive && (this.firing || this.shootOnce) && !p.sprinting) this.shoot();
    this.shootOnce = false;
    const look = this.lastLook;
    w.update(dt, this.camera, this.aiming && this.alive, p.bob, p.speed, p.sprinting, p.crouch, look.dx, look.dy);
    w.model.visible = this.alive && !this.scoped;
    look.dx = look.dy = 0;
    const fov = 72 - w.aim * (72 - w.gun.adsFov);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 20);
      this.camera.updateProjectionMatrix();
    }

    this.pickups.update(dt);
    if (this.isHost) {
      const changed = this.pickups.host(dt);
      this.pkT -= dt;
      if (changed || this.pkT <= 0) { this.pkT = PK_EVERY; this.net.send("pk", this.pickups.snapshot()); }
    }
    this.hintT -= dt;
    if (this.alive) this.grab();

    for (const r of this.remotes.values()) r.avatar.update(now, dt);
    const host = this.isHost;
    if (host) this.chavs.simulate(dt, this.targets(), (_i, id) => this.hurt(id, PUNCH_DAMAGE, CHAV, false, this.entry(id).life));
    this.chavs.update(dt, host);
    this.chT -= dt;
    if (host && this.chT <= 0) { this.chT = 1 / CHAV_HZ; this.net.send("ch", this.chavs.snapshot()); }
    const walkers: Walker[] = [{ id: this.net.selfId, x: p.pos.x, y: p.pos.y, z: p.pos.z, alive: this.alive }];
    for (const r of this.remotes.values()) walkers.push({ id: r.id, x: r.avatar.x, y: r.avatar.y, z: r.avatar.z, alive: r.avatar.alive });
    for (const c of this.chavs.living()) walkers.push({ id: c.key, x: c.x, y: c.y, z: c.z, alive: true });
    this.blood.update(dt, walkers);
    this.effects.update(dt);
    this.world.update(p.pos.x, p.pos.y, p.pos.z, dt);

    if (!this.alive) {
      this.deadFor += dt;
      if (this.deadFor >= RESPAWN_SECONDS) this.respawn();
    }

    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = 1 / SEND_HZ; this.sendState(); }
    if (now - this.spotT > 1000) { this.spotT = now; this.saveSpot(); }
    this.sbT -= dt;
    if (this.sbT <= 0) {
      this.sbT = 2;
      if (this.isHost) this.sendScores();
      else this.hello(this.hostId);   // keeps the host's name list fresh
    }
    this.updateHud(dt);
  }

  /** Looking through the sniper's scope. */
  get scoped() { return this.weapon.kind === "sniper" && this.weapon.aim > 0.85; }

  // ---- HUD -----------------------------------------------------------------------------------
  private updateHud(dt: number) {
    const w = this.weapon, p = this.player;
    // players who fired in the last two seconds show up as red dots
    const now = performance.now();
    const blips = [...this.pickups.items.values()].map((it) => ({ x: it.x, z: it.z, colour: BLIP[it.kind] }));
    for (const r of this.remotes.values()) if (r.avatar.alive && now - r.lastShot < 2000) blips.push({ x: r.avatar.x, z: r.avatar.z, colour: "#ff4a3a" });
    // chavs nearby: white if they're after someone, grey if they're hanging about
    let chased = false;
    for (const c of this.chavs.living()) {
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d > 90) continue;
      blips.push({ x: c.x, z: c.z, colour: c.target ? "#f4f4f4" : "#8f949a" });
      if (c.target === this.net.selfId && d < 60) chased = true;
    }
    this.chasedT -= dt;
    if (chased && this.alive && this.chasedT <= 0) { this.toast("Chavs are after you. Leg it!", 2.5); SFX.alarm(); }
    if (chased) this.chasedT = Math.max(this.chasedT, 20);
    this.minimap.draw(p.pos.x, p.pos.z, p.yaw, blips);
    if (!$("bigmap").hidden) this.minimap.drawFull($("bigmapcanvas") as HTMLCanvasElement, p.pos.x, p.pos.z, p.yaw, blips);
    $("hpnum").textContent = String(Math.ceil(this.hp));
    $("health").classList.toggle("low", this.alive && this.hp <= 30);
    const fill = $("hpfill");
    fill.style.width = `${this.hp}%`;
    fill.style.background = this.hp > 60 ? "var(--ok)" : this.hp > 30 ? "var(--accent)" : "var(--danger)";
    const gun = w.gun, fists = w.kind === "fists", sniper = w.kind === "sniper";
    $("ammolabel").textContent = gun.label;
    $("ammonum").textContent = fists ? "–" : String(w.rounds);
    $("ammomax").textContent = fists ? "" : `/ ${sniper ? gun.mag : w.reserve}`;
    $("magfill").style.width = fists ? "0%" : `${(w.rounds / gun.mag) * 100}%`;
    $("ammo").style.setProperty("--segs", String(gun.mag || 1));
    $("ammo").classList.toggle("low", !fists && w.rounds <= (sniper ? 2 : 6));
    $("reloadmsg").textContent = fists ? (w.has("rifle") ? "Press 2 for the rifle" : w.has("sniper") ? "Press 3 for the sniper" : "Out of ammo: find some rounds")
      : sniper ? (w.rechambering ? "Working the bolt…" : w.sniperAmmo === 1 ? "Last round" : w.sniperAmmo === 2 ? "2 rounds left" : "")
      : w.reloading > 0 ? "Reloading…" : w.ammo === 0 ? (w.reserve ? "Press R to reload" : "Out of ammo")
      : w.ammo <= 6 ? "Low ammo" : w.reserve === 0 ? "No spare rounds" : "";
    $("scope").hidden = !this.scoped || !this.alive;
    $("t-aim").classList.toggle("latched", this.aiming);
    const gap = 4 + w.spread(Math.min(1, p.speed / 5), !p.onGround) * 700;
    const ch = $("crosshair");
    ch.style.setProperty("--gap", `${gap.toFixed(1)}px`);
    ch.style.opacity = w.aim > 0.6 || p.sprinting || !this.alive ? "0" : "1";
    this.hitT -= dt;
    $("hitmarker").style.opacity = this.hitT > 0 ? "1" : "0";
    this.hurtT -= dt;
    $("vignette").style.opacity = String(Math.max(0, this.hurtT * 2, this.hp < 35 && this.alive ? 0.35 : 0));
    const death = $("death");
    death.hidden = this.alive;
    if (!this.alive) {
      $("deathby").textContent = this.killer;
      $("deathcount").textContent = `Respawn in ${Math.max(1, Math.ceil(RESPAWN_SECONDS - this.deadFor))}…`;
    }
    const n = this.remotes.size + 1, where = mapName(this.mapId);
    $("roominfo").textContent = this.net.kind === "local" && this.room === "SOLO"
      ? `Practice · ${where} · on your own`
      : `Room ${this.room} · ${where} · ${n} player${n === 1 ? "" : "s"}${this.isHost ? " · you're hosting" : ""}`;
    this.toastT -= dt;
    $("toast").classList.toggle("show", this.toastT > 0);
    this.placeT -= dt;
    if (this.placeT <= 0) {
      this.placeT = 0.5;
      // on a street: its name; off the streets: the place you're in; otherwise the nearest street
      let best = "", bd = 30;
      for (const s of this.streets) {
        const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
        if (d < bd) { bd = d; best = s.n; }
      }
      if (bd > 10) best = this.placeAt(p.pos.x, -p.pos.z)?.n ?? best;
      const edge = this.map.field - Math.hypot(p.pos.x, p.pos.z);
      const where = $("where");
      where.textContent = edge < 25 ? "Force field: you can't go further" : best;
      where.classList.toggle("warn", edge < 25);
    }
  }

  private renderScores() {
    const rows = Object.entries(this.scores).sort((a, b) => b[1].k - a[1].k || a[1].d - b[1].d);
    $("scores").innerHTML = rows.map(([id, s]) =>
      `<tr class="${id === this.net.selfId ? "me" : ""}"><td>${esc(id === this.net.selfId ? this.name : s.name)}</td><td>${s.k}</td><td>${s.d}</td><td>${s.c ?? 0}</td></tr>`).join("");
  }

  feed(html: string) {
    const el = document.createElement("div");
    el.innerHTML = html;
    const f = $("feed");
    f.prepend(el);
    while (f.children.length > 5) f.lastChild!.remove();
    setTimeout(() => el.remove(), 7000);
  }

  toast(text: string, secs = 2) {
    $("toast").textContent = text;
    this.toastT = secs;
  }

  dispose() {
    this.net.leave();
    for (const r of this.remotes.values()) this.world.scene.remove(r.avatar.root);
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
