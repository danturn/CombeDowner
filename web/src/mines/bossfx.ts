// What everyone sees of a boss's moves (bosses.ts sends them as "bfx" events): telegraphs on the floor
// that fill up until the blow lands, and the blow itself. Rings where a slam or a pounce will come down,
// a strip down the line of a charge or a breath of fire, a cone of steam, the cavern's edge flooding, ice
// spikes running across the floor, ledgers flung in an arc. Flat glowing decals and sprites only.
import * as THREE from "three";
import { glow } from "./art";

type Style = "dust" | "water" | "fire" | "ice" | "ghost";
const TELL: Record<Style, number> = { dust: 0xffa030, water: 0x50d0ff, fire: 0xffc830, ice: 0x90e0ff, ghost: 0x80ff90 };
const BITS: Record<Style, { c: number; add: boolean; up: number; size: number }> = {
  dust: { c: 0xa89a80, add: false, up: 1.5, size: 0.9 },
  water: { c: 0xd8ecf4, add: false, up: 2.2, size: 1.1 },
  fire: { c: 0xff8a30, add: true, up: 2.6, size: 0.9 },
  ice: { c: 0xc8f0ff, add: true, up: 1.8, size: 0.6 },
  ghost: { c: 0x90ffb0, add: true, up: 1.6, size: 0.8 },
};

interface Q {
  ground(x: number, z: number): number;
  mob(id: number): { x: number; z: number; yaw: number; y: number } | null;
  who(id: string): { x: number; z: number } | null;
}
type Item = ((dt: number) => boolean) & { id?: number; objs?: THREE.Object3D[] };
interface Bit { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; grow: number; a: number; drag: number }

/** The direction a yaw faces (as the monsters use it). */
const fwd = (a: number) => new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));

export class BossFx {
  readonly group = new THREE.Group();
  private items: Item[] = [];
  private bits: Bit[] = [];
  private tex = glow();
  private spikeGeo = new THREE.ConeGeometry(0.32, 1.6, 5).translate(0, 0.8, 0);
  private spikeMat = new THREE.MeshLambertMaterial({ color: 0xbfe6ff, emissive: 0x2a5070, flatShading: true, transparent: true });
  private ledgerGeo = new THREE.BoxGeometry(0.34, 0.08, 0.46);
  private ledgerMat = new THREE.MeshLambertMaterial({ color: 0x3a2418, emissive: 0x0a2a10 });
  private blockGeo = new THREE.DodecahedronGeometry(0.42, 0);
  private blockMat = new THREE.MeshLambertMaterial({ color: 0x8a5a38, emissive: 0x802a08, flatShading: true });

  constructor(private q: Q) {}

  private decalMat(s: Style, o: number) {
    return new THREE.MeshBasicMaterial({ color: TELL[s], transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  private flat(g: THREE.BufferGeometry, m: THREE.Material, x: number, z: number, dy = 0.05) {
    const o = new THREE.Mesh(g, m);
    g.rotateX(-Math.PI / 2);
    o.position.set(x, this.q.ground(x, z) + dy, z);
    o.renderOrder = 2;
    this.group.add(o);
    return o;
  }
  private drop(...os: THREE.Mesh[]) {
    for (const o of os) {
      this.group.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }

  /** A spray of sprites: dust, steam, embers, frost, ghost-light. */
  private burst(x: number, y: number, z: number, s: Style, n: number, spread: number, up = 1) {
    const b = BITS[s];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      this.bit(new THREE.Vector3(x + Math.cos(a) * r, y + 0.2, z + Math.sin(a) * r),
        new THREE.Vector3(Math.cos(a) * (0.6 + Math.random() * 2), b.up * up * (0.5 + Math.random()), Math.sin(a) * (0.6 + Math.random() * 2)), s, 0.5 + Math.random() * 0.7);
    }
  }
  private bit(p: THREE.Vector3, v: THREE.Vector3, s: Style, life: number, size = 1, drag = 1.5) {
    if (this.bits.length > 500) return;
    const b = BITS[s];
    const m = new THREE.SpriteMaterial({ map: this.tex, color: b.c, transparent: true, depthWrite: false, blending: b.add ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: b.add ? 0.9 : 0.55 });
    const sp = new THREE.Sprite(m);
    sp.position.copy(p);
    sp.scale.setScalar(b.size * size * 0.5);
    this.group.add(sp);
    this.bits.push({ s: sp, v, life, max: life, grow: b.size * size, a: m.opacity, drag });
  }

  add(ev: Record<string, unknown>) {
    const n = (k: string) => Number(ev[k]) || 0;
    const s = (ev.s as Style) in TELL ? (ev.s as Style) : "dust";
    if (ev.fx === "cancel") {
      // the boss was staggered: its telegraphs go
      this.items = this.items.filter((f) => {
        if (f.id !== n("id")) return true;
        for (const o of f.objs ?? []) this.group.remove(o);
        return false;
      });
      return;
    }
    const was = new Set(this.group.children), from = this.items.length;
    this.addFx(ev, n, s);
    const objs = this.group.children.filter((o) => !was.has(o) && !(o as THREE.Sprite).isSprite);
    for (const f of this.items.slice(from)) { f.id = n("id"); f.objs = objs; }
  }

  private addFx(ev: Record<string, unknown>, n: (k: string) => number, s: Style) {
    switch (ev.fx) {
      case "ring": this.ring(n("x"), n("z"), n("r"), n("t"), s); break;
      case "cone": this.cone(n("id"), n("x"), n("z"), n("a"), n("l"), n("h"), n("t"), s, !!ev.follow); break;
      case "line": this.line(n("id"), n("x"), n("z"), n("a"), n("l"), n("w"), n("t"), s, !!ev.follow); break;
      case "wave": this.wave(n("x"), n("z"), n("r"), n("t"), n("d"), s); break;
      case "edge": this.edge(n("x"), n("z"), n("r0"), n("r1"), n("t"), n("d"), s); break;
      case "steam": case "breath": this.spray(n("id"), ev.fx === "steam", n("l"), n("h"), n("d"), s); break;
      case "spikes": this.spikes(n("x"), n("z"), n("a"), n("l"), n("t"), n("v")); break;
      case "throw": this.throwIt(n("x0"), n("z0"), n("x"), n("z"), n("r"), n("t"), s); break;
      case "curse": this.curse(String(ev.to), n("t"), n("r"), s); break;
      case "blink": this.burst(n("x0"), this.q.ground(n("x0"), n("z0")) + 0.6, n("z0"), s, 26, 0.8, 0.8); this.burst(n("x"), this.q.ground(n("x"), n("z")) + 0.6, n("z"), s, 26, 0.8, 0.8); break;
      case "puff": this.burst(n("x"), this.q.ground(n("x"), n("z")), n("z"), s, 18, 0.7); break;
    }
  }

  /** A ring on the floor that fills from the middle; when it's full, the blow lands there. */
  private ring(x: number, z: number, r: number, t: number, s: Style) {
    const om = this.decalMat(s, 0.9), fm = this.decalMat(s, 0.22), hm = this.decalMat(s, 0.35);
    const outline = this.flat(new THREE.RingGeometry(Math.max(0.05, r - 0.14), r, 48), om, x, z, 0.06);
    const fill = this.flat(new THREE.CircleGeometry(r, 40), fm, x, z, 0.05);
    const hatch = this.flat(new THREE.RingGeometry(r * 0.15, r * 0.22, 32), hm, x, z, 0.055);
    let at = 0, end = Math.max(0.05, t);
    this.items.push((dt) => {
      at += dt;
      if (at < end) {
        const k = at / end;
        fill.scale.setScalar(Math.max(0.02, k));
        fm.opacity = 0.16 + 0.22 * k;
        om.opacity = 0.55 + 0.45 * Math.abs(Math.sin(at * (6 + 14 * k)));
        hatch.scale.setScalar(1 + k * 3.6);
        hm.opacity = 0.35 * (1 - k);
        return true;
      }
      if (at - dt < end) { this.burst(x, this.q.ground(x, z), z, s, Math.round(10 + r * 8), r * 0.9); fill.scale.setScalar(1); }
      const f = (at - end) / 0.35;
      fm.opacity = 0.7 * (1 - f); om.opacity = 1 - f;
      outline.scale.setScalar(1 + f * 0.25);
      if (f < 1) return true;
      this.drop(outline, fill, hatch);
      return false;
    });
  }

  /** A cone in front of a monster (it may turn with it). */
  private cone(id: number, x: number, z: number, a: number, l: number, h: number, t: number, s: Style, follow: boolean) {
    const g = new THREE.CircleGeometry(l, 24, Math.PI / 2 - h, h * 2);
    const om = this.decalMat(s, 0.8), fm = this.decalMat(s, 0.25);
    const fill = this.flat(g, fm, x, z);
    const edgeG = new THREE.RingGeometry(l - 0.15, l, 24, 1, Math.PI / 2 - h, h * 2);
    const outline = this.flat(edgeG, om, x, z, 0.06);
    let at = 0;
    const place = () => {
      const m = follow ? this.q.mob(id) : null;
      const px = m ? m.x : x, pz = m ? m.z : z, yaw = m ? m.yaw : a;
      for (const o of [fill, outline]) { o.position.set(px, this.q.ground(px, pz) + 0.05, pz); o.rotation.y = yaw; }
    };
    this.items.push((dt) => {
      at += dt;
      place();
      const k = Math.min(1, at / Math.max(0.05, t));
      fill.scale.setScalar(Math.max(0.02, k));
      om.opacity = 0.5 + 0.5 * Math.abs(Math.sin(at * (6 + 12 * k)));
      fm.opacity = 0.15 + 0.25 * k;
      if (at < t + 0.15) return true;
      this.drop(fill, outline);
      return false;
    });
  }

  /** A strip down the floor from a monster: a charge, a beam, a breath of fire. */
  private line(id: number, x: number, z: number, a: number, l: number, w: number, t: number, s: Style, follow: boolean) {
    const g = new THREE.PlaneGeometry(w, l).translate(0, l / 2, 0);
    const fm = this.decalMat(s, 0.25), om = this.decalMat(s, 0.8);
    const fill = this.flat(g, fm, x, z);
    // its edges: strips down each side and across the far end
    const edge = new THREE.Group();
    for (const [sx, sz, px, pz] of [[0.16, l, -w / 2, -l / 2], [0.16, l, w / 2, -l / 2], [w, 0.16, 0, -l]]) {
      const sg = new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2);
      const o = new THREE.Mesh(sg, om);
      o.position.set(px, 0.01, pz);
      o.renderOrder = 2;
      edge.add(o);
    }
    this.group.add(edge);
    // chevrons running down it, to show which way it's coming
    const cg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w * 0.35, 0, 0.3), new THREE.Vector3(0, 0, -0.3), new THREE.Vector3(w * 0.35, 0, 0.3)]);
    const chev: THREE.Line[] = [];
    for (let k = 0; k < Math.max(2, Math.floor(l / 2.2)); k++) {
      const c = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: TELL[s], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.group.add(c);
      chev.push(c);
    }
    let at = 0;
    this.items.push((dt) => {
      at += dt;
      const m = follow ? this.q.mob(id) : null;
      const px = m ? m.x : x, pz = m ? m.z : z, yaw = m ? m.yaw : a, y = this.q.ground(px, pz) + 0.05;
      fill.position.set(px, y, pz); fill.rotation.y = yaw;
      edge.position.set(px, y + 0.01, pz); edge.rotation.y = yaw;
      const k = Math.min(1, at / Math.max(0.05, t)), d = fwd(yaw);
      fill.scale.set(1, 1, Math.max(0.02, k));
      fm.opacity = 0.14 + 0.26 * k;
      om.opacity = 0.5 + 0.5 * Math.abs(Math.sin(at * (6 + 12 * k)));
      chev.forEach((c, n) => {
        const u = ((n + at * 2.5) / chev.length) % 1;
        c.position.set(px + d.x * u * l, y + 0.02, pz + d.z * u * l);
        c.rotation.y = yaw;
      });
      if (at < t + 0.15) return true;
      this.group.remove(edge, ...chev);
      edge.children.forEach((o) => (o as THREE.Mesh).geometry.dispose());
      chev.forEach((c) => (c.material as THREE.Material).dispose());
      cg.dispose(); om.dispose();
      this.drop(fill);
      return false;
    });
  }

  /** The edge of a shockwave is marked; then it rolls out to it. */
  private wave(x: number, z: number, r: number, t: number, d: number, s: Style) {
    const om = this.decalMat(s, 0.8), wm = this.decalMat(s, 0.7);
    const outline = this.flat(new THREE.RingGeometry(r - 0.2, r, 64), om, x, z, 0.06);
    const band = this.flat(new THREE.RingGeometry(0.85, 1, 64), wm, x, z, 0.07);
    band.visible = false;
    let at = 0;
    this.items.push((dt) => {
      at += dt;
      if (at < t) { om.opacity = 0.4 + 0.6 * Math.abs(Math.sin(at * (5 + 10 * at / t))); return true; }
      const k = (at - t) / Math.max(0.05, d);
      band.visible = true;
      const rr = Math.max(0.3, r * k);
      band.scale.setScalar(rr);
      wm.opacity = 0.9 * (1 - k * 0.5);
      om.opacity = 0.6 * (1 - k);
      const y = this.q.ground(x, z);
      for (let n = 0; n < 4; n++) {
        const a = Math.random() * Math.PI * 2;
        this.bit(new THREE.Vector3(x + Math.cos(a) * rr, y + 0.2, z + Math.sin(a) * rr), new THREE.Vector3(Math.cos(a) * 1.5, 1.2 + Math.random(), Math.sin(a) * 1.5), s, 0.5);
      }
      if (k < 1) return true;
      this.drop(outline, band);
      return false;
    });
  }

  /** The cavern's edge floods (scalding water, frost...) from r0 out: get into the middle. */
  private edge(x: number, z: number, r0: number, r1: number, t: number, d: number, s: Style) {
    const om = this.decalMat(s, 0.8);
    const outline = this.flat(new THREE.RingGeometry(r0 - 0.25, r0, 72), om, x, z, 0.12);
    const wm = new THREE.MeshLambertMaterial({ color: 0x3a6a78, emissive: 0x18404a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const water = this.flat(new THREE.RingGeometry(r0, r1, 72, 2), wm, x, z, 0.02);
    const y0 = water.position.y;
    let at = 0;
    this.items.push((dt) => {
      at += dt;
      const rise = Math.min(1, at / Math.max(0.1, t)), fall = at > t + d ? (at - t - d) / 0.8 : 0;
      wm.opacity = 0.75 * rise * (1 - fall);
      water.position.y = y0 + 0.4 * rise * (1 - fall);
      om.opacity = (0.5 + 0.5 * Math.abs(Math.sin(at * 7))) * (1 - fall);
      outline.position.y = water.position.y + 0.04;
      // steam and spray off the hot water
      if (at > t * 0.5 && fall === 0) for (let n = 0; n < 3; n++) {
        const a = Math.random() * Math.PI * 2, rr = r0 + Math.random() * (r1 - r0);
        this.bit(new THREE.Vector3(x + Math.cos(a) * rr, water.position.y + 0.2, z + Math.sin(a) * rr), new THREE.Vector3(0, 1 + Math.random(), 0), s, 1.0, 1.4);
      }
      if (fall < 1) return true;
      this.drop(outline, water);
      return false;
    });
  }

  /** Steam or fire pouring out of a monster in front of it, turning as it turns. */
  private spray(id: number, steam: boolean, l: number, h: number, d: number, s: Style) {
    let at = 0;
    this.items.push((dt) => {
      at += dt;
      const m = this.q.mob(id);
      if (!m || at > d) return false;
      const y = m.y + (steam ? 1.6 : 1.2), speed = steam ? 9 : 12;
      for (let n = 0; n < 4; n++) {
        const a = m.yaw + (Math.random() - 0.5) * (steam ? h * 2 : 0.18);
        const v = fwd(a).multiplyScalar(speed * (0.8 + Math.random() * 0.4));
        v.y = steam ? 0.6 + Math.random() : (Math.random() - 0.6) * 0.8;
        this.bit(new THREE.Vector3(m.x, y, m.z).addScaledVector(fwd(m.yaw), 1.4), v, s, l / speed, steam ? 2.2 : 1.6, 0.2);
      }
      return true;
    });
  }

  /** Ice spikes bursting up one after another along a line. */
  private spikes(x: number, z: number, a: number, l: number, t: number, v: number) {
    this.line(-1, x, z, a, l, 1.8, t, "ice", false);
    const d = fwd(a), spikes: { o: THREE.Mesh; at: number }[] = [];
    for (let u = 1.2; u < l; u += 1.3) {
      const o = new THREE.Mesh(this.spikeGeo, this.spikeMat);
      const px = x + d.x * u + (Math.random() - 0.5) * 0.6, pz = z + d.z * u + (Math.random() - 0.5) * 0.6;
      o.position.set(px, this.q.ground(px, pz), pz);
      o.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 6, (Math.random() - 0.5) * 0.5);
      o.scale.set(1, 0.01, 1);
      o.visible = false;
      this.group.add(o);
      spikes.push({ o, at: t + u / v });
    }
    let at = 0;
    this.items.push((dt) => {
      at += dt;
      let live = false;
      for (const sp of spikes) {
        const k = at - sp.at;
        if (k < 0) { live = true; continue; }
        if (!sp.o.visible) { sp.o.visible = true; this.burst(sp.o.position.x, sp.o.position.y, sp.o.position.z, "ice", 4, 0.4); }
        const up = Math.min(1, k / 0.08), down = k > 1.2 ? (k - 1.2) / 0.4 : 0;
        sp.o.scale.set(1, Math.max(0.01, (0.8 + 0.6 * ((sp.at * 13) % 1)) * up * (1 - down)), 1);
        if (down < 1) live = true;
      }
      if (live) return true;
      for (const sp of spikes) this.group.remove(sp.o);
      return false;
    });
  }

  /** Something flung in an arc (a ledger, a burning block) to come down in a marked ring. */
  private throwIt(x0: number, z0: number, x: number, z: number, r: number, t: number, s: Style) {
    this.ring(x, z, r, t, s);
    const o = new THREE.Mesh(s === "fire" ? this.blockGeo : this.ledgerGeo, s === "fire" ? this.blockMat : this.ledgerMat);
    this.group.add(o);
    const y0 = this.q.ground(x0, z0) + 1.8, y1 = this.q.ground(x, z) + 0.2;
    const spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    let at = 0;
    this.items.push((dt) => {
      at += dt;
      const k = Math.min(1, at / Math.max(0.1, t));
      o.position.set(x0 + (x - x0) * k, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 3, z0 + (z - z0) * k);
      o.rotation.set(spin.x * at, spin.y * at, spin.z * at);
      if (Math.random() < 0.6) this.bit(o.position.clone(), new THREE.Vector3(0, 0.3, 0), s, 0.4, 0.6, 3);
      if (k < 1) return true;
      this.group.remove(o);
      return false;
    });
  }

  /** A curse mark that follows someone about, then settles (the host then sends a ring where it lands). */
  private curse(to: string, t: number, r: number, s: Style) {
    const om = this.decalMat(s, 0.9), fm = this.decalMat(s, 0.2);
    const outline = this.flat(new THREE.RingGeometry(r - 0.12, r, 5, 1), om, 0, 0, 0.07);
    const inner = this.flat(new THREE.RingGeometry(r * 0.45, r * 0.55, 5, 1), fm, 0, 0, 0.07);
    const sm = new THREE.SpriteMaterial({ map: this.tex, color: TELL[s], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const mark = new THREE.Sprite(sm);
    this.group.add(mark);
    let at = 0;
    const end = Math.max(0.1, t - 0.6);
    this.items.push((dt) => {
      at += dt;
      const p = this.q.who(to);
      if (p && at < end) {
        const y = this.q.ground(p.x, p.z) + 0.07;
        outline.position.set(p.x, y, p.z); inner.position.set(p.x, y, p.z);
        mark.position.set(p.x, y + 2.6 + Math.sin(at * 4) * 0.1, p.z);
      }
      outline.rotation.y = at * 1.5; inner.rotation.y = -at * 2.5;
      om.opacity = 0.5 + 0.5 * Math.abs(Math.sin(at * 5));
      mark.scale.setScalar(0.6 + 0.2 * Math.sin(at * 9));
      sm.opacity = 0.9;
      if (at < end) return true;
      this.group.remove(mark); sm.dispose();
      this.drop(outline, inner);
      return false;
    });
  }

  update(dt: number) {
    this.items = this.items.filter((f) => f(dt));
    for (let k = this.bits.length - 1; k >= 0; k--) {
      const b = this.bits[k];
      b.life -= dt;
      b.s.position.addScaledVector(b.v, dt);
      b.v.multiplyScalar(Math.max(0, 1 - dt * b.drag));
      const f = 1 - b.life / b.max;
      b.s.scale.setScalar(b.grow * (0.5 + f));
      (b.s.material as THREE.SpriteMaterial).opacity = b.a * Math.min(1, (1 - f) * 2);
      if (b.life <= 0) { this.group.remove(b.s); (b.s.material as THREE.Material).dispose(); this.bits.splice(k, 1); }
    }
  }

  /** Drop everything (a new level). */
  clear() {
    this.items = [];
    for (const b of this.bits) { this.group.remove(b.s); (b.s.material as THREE.Material).dispose(); }
    this.bits = [];
    for (const o of [...this.group.children]) this.group.remove(o);
  }
}
