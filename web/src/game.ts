// The match: local player, remote players, shooting, damage, deaths, respawns and scores.
//
// Who decides what:
// - Each player moves themselves and sends their position about 20 times a second.
// - The shooter checks their own hits against what they see (it feels fair to the shooter, and
//   cheating isn't a worry among friends), then tells the host.
// - The host applies damage, kills and scores, and tells everyone. The host is simply the player
//   with the lowest id, so if the host leaves, the next player takes over with the latest scores.
// - The host also runs the chavs (see chavs.ts), and decides when their punches land.
import * as THREE from "three";
import * as SFX from "./audio";
import { Avatar, colourFor } from "./avatar";
import { Blood, Walker } from "./blood";
import { ChavState, Chavs, PUNCH_DAMAGE, Target } from "./chavs";
import { GameMap, PATHS } from "./map";
import { Net } from "./net";
import { Minimap } from "./minimap";
import { Player } from "./player";
import { DAMAGE_BODY, DAMAGE_HEAD, Effects, MAG, RANGE, Weapon } from "./weapon";
import { World } from "./world";

const RESPAWN_SECONDS = 3;
const SEND_HZ = 20;
const CHAV_HZ = 10;
/** Who hit you, when it was a chav. */
const CHAV = "chav";

interface Score { name: string; k: number; d: number; c: number; hp: number; alive: boolean; life: number }
interface Remote { id: string; name: string; colour: string; avatar: Avatar; life: number; lastSeen: number; lastShot: number }

const $ = (id: string) => document.getElementById(id)!;

export class Game {
  readonly player: Player;
  readonly weapon = new Weapon();
  readonly effects: Effects;
  readonly chavs: Chavs;
  private blood: Blood;
  private remotes = new Map<string, Remote>();
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
    this.respawn();

    net.on("hello", (d, from) => this.onHello(d, from));
    net.on("st", (d, from) => this.onState(d, from));
    net.on("shot", (d, from) => this.onShot(d, from));
    net.on("hit", (d, from) => { if (this.isHost) this.applyHit(from, d); });
    net.on("ev", (d) => this.onEvent(d));
    net.on("sb", (d, from) => { if (from === this.hostId) this.onScores(d); });
    net.on("rs", (d, from) => { if (this.isHost) this.applyRespawn(from, d.life); });
    net.on("ch", (d: ChavState, from) => { if (from === this.hostId && !this.isHost) this.chavs.apply(d); });
    net.on("chit", (d, from) => { if (this.isHost) this.applyChavHit(from, d); });
    net.onJoin = (id) => {
      net.send("hello", { name: this.name }, id);
      if (this.isHost) this.sendScores();
    };
    net.onLeave = (id) => {
      const r = this.remotes.get(id);
      if (r) { this.world.scene.remove(r.avatar.root); this.remotes.delete(id); this.feed(`<b>${esc(r.name)}</b> left`); }
      delete this.scores[id];
    };
    net.onError = (msg) => this.toast(msg, 6);
    net.send("hello", { name });

    addEventListener("mousedown", (e) => {
      if (!this.active || this.freeMode) return;
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.aiming = true;
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.aiming = false;
    });
    addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("mousemove", (e) => {
      if (!this.active || this.freeMode) return;
      this.look(e.movementX, e.movementY);
    });
    addEventListener("keydown", (e) => {
      if (e.code === "Tab") { e.preventDefault(); $("scoreboard").hidden = false; this.renderScores(); }
      if (e.code === "KeyR" && this.active) this.reload();
      if (e.code === "KeyM" && !e.repeat) this.toggleMap();
    });
    addEventListener("keyup", (e) => { if (e.code === "Tab") $("scoreboard").hidden = true; });
  }

  toggleMap() {
    const el = $("bigmap");
    el.hidden = !el.hidden;
  }

  look(dx: number, dy: number) {
    const zoom = 1 - this.weapon.aim * 0.45;
    this.player.look(dx, dy, zoom);
    this.lastLook.dx += dx; this.lastLook.dy += dy;
  }

  reload() {
    if (this.alive && this.weapon.startReload()) SFX.reload();
  }

  get hostId(): string {
    return [this.net.selfId, ...this.net.peers()].sort()[0];
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
    for (const r of D.rd) {
      const vehicle = !PATHS.has(r.c);
      for (let i = 0; i < r.p.length; i += 3) {
        const [x, y] = r.p[i];
        if (r.n) this.streets.push({ x, z: -y, n: r.n });
        if (fallback && vehicle && i % 6 === 0 && ok(x, -y)) this.spawns.push([x, -y]);
      }
    }
  }

  private respawn() {
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
    this.hp = 100;
    this.alive = true;
    this.weapon.ammo = 30;
    this.weapon.reloading = 0;
    this.life++;
    this.blood.stop(this.net.selfId);
    this.sendState();
    if (this.isHost) this.applyRespawn(this.net.selfId, this.life);
    else this.net.send("rs", { life: this.life }, this.hostId);
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

  private onHello(d: { name: string }, from: string) {
    const r = this.remote(from);
    const name = String(d?.name || "Player").slice(0, 16);
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
    this.effects.tracer(o, e, "#ffc070");
    if (d[6]) this.effects.impact(e, new THREE.Vector3(0, 1, 0), d[6] === 2 ? "#9a2a1e" : "#cfc4a8", 4);
    const toShot = o.clone().sub(this.camera.position);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    SFX.shot(toShot.length(), toShot.normalize().dot(right));
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
    if ((d.k === "dmg" || d.k === "kill") && d.by !== CHAV) {
      const v = this.posOf(d.t), from = this.posOf(d.by);
      if (v) {
        this.blood.hit(d.t, v.x, v.z, from?.x ?? v.x, from?.z ?? v.z, !!d.h);
        if (d.k === "kill") this.bodyPool(v.x, v.z, v.yaw, 1);
      }
    }
    if (d.k === "kill") {
      const head = d.h ? " (headshot)" : "";
      this.feed(`${who(d.by)} ${d.by === CHAV ? "battered" : "shot"} ${who(d.t)}${head}`);
      if (d.t === me && d.life === this.life) {
        this.hp = 0;
        this.alive = false;
        this.deadFor = 0;
        this.killer = nameOf(d.by);
        this.firing = false;
      }
      if (d.by === me && d.t !== me) { SFX.kill(); this.toast(`You shot ${nameOf(d.t)}`, 1.5); }
      const r = this.remotes.get(d.t);
      if (r) r.avatar.alive = false;
    }
    if (d.k === "cdmg" || d.k === "ckill") {
      const c = this.chavs.at(d.c), from = this.posOf(d.by);
      if (c && c.gen === d.g) {
        this.blood.hit(c.key, c.x, c.z, from?.x ?? c.x, from?.z ?? c.z, !!d.h);
        if (d.k === "ckill") this.bodyPool(c.x, c.z, c.yaw, -1);
      }
      if (d.k === "ckill") {
        this.chavs.killed(d.c, d.g);
        this.feed(`${who(d.by)} decked a chav${d.h ? " (headshot)" : ""}`);
        if (d.by === me) { SFX.kill(); this.toast("You decked a chav", 1.5); }
      }
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

  private applyHit(from: string, d: { t: string; head: boolean; life: number }) {
    this.catchUpLife(d.t, d.life);
    if (!this.entry(from).alive || d.t === from) return;
    this.hurt(d.t, d.head ? DAMAGE_HEAD : DAMAGE_BODY, from, d.head, d.life);
  }

  /** Take health off a player and tell everyone. by is the shooter's id, or CHAV. */
  private hurt(id: string, amount: number, by: string, head: boolean, life: number) {
    const target = this.entry(id);
    if (!target.alive || target.life !== life) return;
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp <= 0) {
      target.alive = false;
      target.d++;
      if (by !== CHAV) this.entry(by).k++;
      this.broadcastEvent({ k: "kill", t: id, by, h: head, life });
    } else {
      this.broadcastEvent({ k: "dmg", t: id, by, h: head, hp: target.hp, life });
    }
    this.sendScores();
  }

  private applyChavHit(from: string, d: { c: number; g: number; head: boolean }) {
    const shooter = this.entry(from);
    if (!shooter.alive) return;
    const res = this.chavs.damage(d.c, d.g, d.head ? DAMAGE_HEAD : DAMAGE_BODY);
    if (!res) return;
    const at = this.posOf(from);
    if (at) this.chavs.aggro(d.c, from, at.x, at.z);
    this.broadcastEvent({ k: res === "kill" ? "ckill" : "cdmg", c: d.c, g: d.g, by: from, h: d.head });
    if (res === "kill") { shooter.c = (shooter.c ?? 0) + 1; this.sendScores(); }
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
      if (w.ammo === 0 && w.cooldown <= 0 && w.reloading <= 0) { if (w.startReload()) SFX.reload(); }
      return;
    }
    w.fire();
    SFX.shot();
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const spread = w.spread(Math.min(1, p.speed / 5), !p.onGround);
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    // recoil
    p.pitch = Math.min(1.5, p.pitch + 0.011 * (1 - w.aim * 0.4));
    p.yaw += (Math.random() - 0.5) * 0.006;

    const wall = this.map.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, RANGE);
    let maxD = wall ? wall.dist : RANGE;
    let victim: Remote | null = null, head = false;
    for (const r of this.remotes.values()) {
      const h = r.avatar.hit(origin, dir);
      if (h && h.dist < maxD) { maxD = h.dist; victim = r; head = h.head; }
    }
    const chav = this.chavs.hit(origin, dir, maxD);
    if (chav) { maxD = chav.dist; victim = null; head = chav.head; }
    const end = origin.clone().addScaledVector(dir, maxD);
    const muzzle = new THREE.Vector3(0.2, -0.15, -0.9).applyQuaternion(this.camera.quaternion).add(origin);
    this.effects.tracer(muzzle, end);
    let mark = 0;
    if (victim) {
      mark = 2;
      this.effects.impact(end, dir.clone().negate(), "#9a2a1e", 7);
      this.hitT = 0.18;
      $("hitmarker").classList.toggle("head", head);
      SFX.hitMarker(head);
      const claim = { t: victim.id, head, life: victim.life };
      if (this.isHost) this.applyHit(this.net.selfId, claim);
      else this.net.send("hit", claim, this.hostId);
    } else if (chav) {
      mark = 2;
      this.effects.impact(end, dir.clone().negate(), "#9a2a1e", 7);
      this.hitT = 0.18;
      $("hitmarker").classList.toggle("head", head);
      SFX.hitMarker(head);
      const claim = { c: chav.i, g: chav.gen, head };
      if (this.isHost) this.applyChavHit(this.net.selfId, claim);
      else this.net.send("chit", claim, this.hostId);
    } else if (wall) {
      mark = 1;
      const n = new THREE.Vector3(wall.nx, wall.ny, wall.nz);
      const col = wall.kind === "ground" ? "#6b5a3e" : wall.kind === "tree" ? "#5a4630" : "#d8c9a4";
      this.effects.impact(end, n, col, 6);
    }
    const q = (v: number) => Math.round(v * 100) / 100;
    this.net.send("shot", [q(muzzle.x), q(muzzle.y), q(muzzle.z), q(end.x), q(end.y), q(end.z), mark]);
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
    if (this.active && this.alive && (this.firing || this.shootOnce) && !p.sprinting) this.shoot();
    this.shootOnce = false;
    const look = this.lastLook;
    w.update(dt, this.camera, this.aiming && this.alive, p.bob, p.speed, p.sprinting, look.dx, look.dy);
    w.model.visible = this.alive;
    look.dx = look.dy = 0;
    const fov = 72 - w.aim * 27;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }

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
    this.sbT -= dt;
    if (this.sbT <= 0) {
      this.sbT = 2;
      if (this.isHost) this.sendScores();
      else this.net.send("hello", { name: this.name }, this.hostId);   // keeps the host's name list fresh
    }
    this.updateHud(dt);
  }

  // ---- HUD -----------------------------------------------------------------------------------
  private updateHud(dt: number) {
    const w = this.weapon, p = this.player;
    // players who fired in the last two seconds show up as red dots
    const now = performance.now();
    const blips = [...this.remotes.values()].filter((r) => r.avatar.alive && now - r.lastShot < 2000)
      .map((r) => ({ x: r.avatar.x, z: r.avatar.z, colour: "#ff4a3a" }));
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
    $("ammonum").textContent = String(w.ammo);
    $("magfill").style.width = `${(w.ammo / MAG) * 100}%`;
    $("ammo").classList.toggle("low", w.ammo <= 6);
    $("reloadmsg").textContent = w.reloading > 0 ? "Reloading…" : w.ammo === 0 ? "Press R to reload" : w.ammo <= 6 ? "Low ammo" : "";
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
    const n = this.remotes.size + 1;
    $("roominfo").textContent = this.net.kind === "local" && this.room === "SOLO"
      ? "Practice · on your own"
      : `Room ${this.room} · ${n} player${n === 1 ? "" : "s"}${this.isHost ? " · you're hosting" : ""}`;
    this.toastT -= dt;
    $("toast").classList.toggle("show", this.toastT > 0);
    this.placeT -= dt;
    if (this.placeT <= 0) {
      this.placeT = 0.5;
      let best = "", bd = 30;
      for (const s of this.streets) {
        const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
        if (d < bd) { bd = d; best = s.n; }
      }
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
