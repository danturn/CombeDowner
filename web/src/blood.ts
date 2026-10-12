// Blood: splashes and pools on the ground where people are shot, and bloody footprints and drips
// from anyone who is bleeding. It's only looks: each player makes their own from the host's hit
// events, and it all fades away after a while.
import * as THREE from "three";
import * as TX from "./textures";

const SPLAT_LIFE = 90, PRINT_LIFE = 45;   // seconds on the ground, the last fifth spent fading
const BLEED_PER_HIT = 9, BLEED_MAX = 22;  // seconds of bleeding
const STRIDE = 0.78;                      // metres between footprints

/** Something that can bleed and walk about: a player or a chav. */
export interface Walker { id: string; x: number; y: number; z: number; alive: boolean }

/**
 * Flat decals laid on the ground, all in one instanced mesh. A ring buffer: when it's full the
 * oldest goes. Each one fades out and dries darker on its own.
 */
class DecalLayer {
  readonly mesh: THREE.InstancedMesh;
  private fade: THREE.InstancedBufferAttribute;
  private tile: THREE.InstancedBufferAttribute;
  private born: Float32Array;
  private life: Float32Array;
  private alpha: Float32Array;
  private growing: { i: number; t: number; secs: number; m: THREE.Matrix4 }[] = [];
  private next = 0;
  private used = 0;
  private col = new THREE.Color();

  constructor(scene: THREE.Scene, map: THREE.Texture, private max: number) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.tile = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    geo.setAttribute("aFade", this.fade);
    geo.setAttribute("aTile", this.tile);
    const mat = new THREE.MeshLambertMaterial({
      map, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    });
    // per-decal opacity, and which quarter of the texture atlas to use
    mat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aFade;\nattribute vec2 aTile;\nvarying float vFade;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vMapUv * 0.5 + aTile;\nvFade = aFade;");
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vFade;")
        .replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\ndiffuseColor.a *= vFade;");
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;   // decals are scattered all over the map
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, this.col.setRGB(1, 1, 1));
    this.born = new Float32Array(max);
    this.life = new Float32Array(max);
    this.alpha = new Float32Array(max);
    scene.add(this.mesh);
  }

  /** Lay a decal with the given matrix. tile is 0-3 in the atlas. grow > 0 spreads it out over that many seconds. */
  add(m: THREE.Matrix4, tile: number, alpha: number, life: number, now: number, grow = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.used = Math.min(this.max, this.used + 1);
    this.mesh.count = this.used;
    this.growing = this.growing.filter((g) => g.i !== i);
    if (grow > 0) {
      this.growing.push({ i, t: 0, secs: grow, m: m.clone() });
      this.mesh.setMatrixAt(i, m.clone().multiply(new THREE.Matrix4().makeScale(0.05, 1, 0.05)));
    } else this.mesh.setMatrixAt(i, m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tile.setXY(i, (tile % 2) * 0.5, 0.5 - Math.floor(tile / 2) * 0.5);
    this.tile.needsUpdate = true;
    this.born[i] = now; this.life[i] = life; this.alpha[i] = alpha;
  }

  update(dt: number, now: number) {
    for (let i = 0; i < this.used; i++) {
      const age = now - this.born[i], life = this.life[i];
      this.fade.setX(i, this.alpha[i] * Math.max(0, Math.min(1, (life - age) / (life * 0.2))));
      // fresh blood is bright; it dries to a dark brown over half a minute
      const dry = Math.min(1, age / 30);
      this.mesh.setColorAt(i, this.col.setRGB(1 - dry * 0.45, 1 - dry * 0.3, 1 - dry * 0.3));
    }
    this.fade.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.growing.length) {
      const s = new THREE.Matrix4(), out = new THREE.Matrix4();
      for (const g of this.growing) {
        g.t += dt;
        const k = Math.max(0.05, Math.sqrt(Math.min(1, g.t / g.secs)));   // spreads fast, then slows
        this.mesh.setMatrixAt(g.i, out.copy(g.m).multiply(s.makeScale(k, 1, k)));
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      this.growing = this.growing.filter((g) => g.t < g.secs);
    }
  }
}

interface Bleeder { t: number; x: number; z: number; acc: number; foot: number; drip: number; seen: boolean }

export class Blood {
  private splats: DecalLayer;
  private prints: DecalLayer;
  private bleeders = new Map<string, Bleeder>();
  private clock = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private qy = new THREE.Quaternion();
  private n = new THREE.Vector3();
  private static UP = new THREE.Vector3(0, 1, 0);

  /** surface(x, z) is the height of whatever is drawn on the ground there. */
  constructor(scene: THREE.Scene, private surface: (x: number, z: number) => number) {
    this.splats = new DecalLayer(scene, TX.bloodSplats(), 320);
    this.prints = new DecalLayer(scene, TX.shoePrints(), 480);
  }

  /** A matrix laying a w x l decal flat on the ground at (x, z), its top pointing along heading h. */
  private place(x: number, z: number, h: number, w: number, l: number): THREE.Matrix4 {
    const y = this.surface(x, z), e = 0.3;
    // tilt to the slope of the ground
    this.n.set(this.surface(x - e, z) - this.surface(x + e, z), 2 * e, this.surface(x, z - e) - this.surface(x, z + e)).normalize();
    this.q.setFromUnitVectors(Blood.UP, this.n).multiply(this.qy.setFromAxisAngle(Blood.UP, h));
    return this.m.compose(new THREE.Vector3(x, y + 0.025, z), this.q, new THREE.Vector3(w, 1, l));
  }

  private splat(x: number, z: number, h: number, w: number, l: number, tile: number, alpha = 0.95, grow = 0) {
    this.splats.add(this.place(x, z, h, w, l), tile, alpha, SPLAT_LIFE, this.clock, grow);
  }

  /**
   * Someone at (x, z) was shot from (fromX, fromZ): blood splashes on the ground behind them
   * and they start to bleed.
   */
  hit(id: string, x: number, z: number, fromX: number, fromZ: number, head: boolean) {
    let dx = x - fromX, dz = z - fromZ;
    const dl = Math.hypot(dx, dz);
    if (dl < 1e-3) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= dl; dz /= dl; }
    const h = Math.atan2(-dx, -dz);   // heading pointing away from the shooter
    this.splat(x + dx * 0.2, z + dz * 0.2, Math.random() * 6.3, 0.55, 0.55, Math.random() < 0.5 ? 0 : 3);
    const n = head ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const d = 0.7 + Math.random() * (head ? 2.2 : 1.5), side = (Math.random() - 0.5) * 0.9;
      const s = 0.6 + Math.random() * 0.6;
      this.splat(x + dx * d - dz * side, z + dz * d + dx * side, h + (Math.random() - 0.5) * 0.5, s, s * 1.5, 1 + (i % 2));
    }
    this.bleed(id);
  }

  /** Someone died at (x, z): a pool spreads out under the body. */
  pool(x: number, z: number) {
    this.splat(x, z, Math.random() * 6.3, 1.9 + Math.random() * 0.5, 1.6 + Math.random() * 0.4, 0, 0.97, 7);
  }

  bleed(id: string, secs = BLEED_PER_HIT) {
    let b = this.bleeders.get(id);
    if (!b) this.bleeders.set(id, b = { t: 0, x: NaN, z: NaN, acc: 0, foot: 0, drip: 0, seen: true });
    b.t = Math.min(BLEED_MAX, b.t + secs);
  }

  /** Stop someone bleeding (they respawned, or left). */
  stop(id: string) { this.bleeders.delete(id); }

  update(dt: number, walkers: Walker[]) {
    this.clock += dt;
    for (const b of this.bleeders.values()) b.seen = false;
    for (const w of walkers) {
      const b = this.bleeders.get(w.id);
      if (!b) continue;
      b.seen = true;
      if (!w.alive) { this.bleeders.delete(w.id); continue; }
      b.t -= dt;
      if (b.t <= 0) { this.bleeders.delete(w.id); continue; }
      const k = Math.min(1, b.t / BLEED_PER_HIT);   // how heavily they're bleeding
      const mx = w.x - b.x, mz = w.z - b.z, moved = Math.hypot(mx, mz);
      if (!(moved < 4)) { b.x = w.x; b.z = w.z; b.acc = 0; continue; }   // first sight, or a teleport
      b.x = w.x; b.z = w.z;
      // footprints, alternating feet, toes along the way they're going
      b.acc += moved;
      if (b.acc >= STRIDE && moved > 1e-4 && w.y - this.surface(w.x, w.z) < 0.3) {
        b.acc %= STRIDE;
        b.foot ^= 1;
        const dx = mx / moved, dz = mz / moved, h = Math.atan2(-dx, -dz);
        const side = b.foot ? 0.12 : -0.12;    // right foot to the right of the line
        const px = w.x + dz * -side, pz = w.z + dx * side;
        const tile = b.foot + (k < 0.45 ? 2 : 0);
        this.prints.add(this.place(px, pz, h, 0.34, 0.34), tile, 0.35 + 0.6 * k, PRINT_LIFE, this.clock);
      }
      // drips
      b.drip -= dt;
      if (b.drip <= 0) {
        b.drip = 0.25 + Math.random() * 0.5 / (0.4 + k);
        const s = 0.07 + Math.random() * 0.12 * (0.5 + k);
        this.splat(w.x + (Math.random() - 0.5) * 0.4, w.z + (Math.random() - 0.5) * 0.4, Math.random() * 6.3, s, s, 3, 0.6 + 0.35 * k);
      }
    }
    // anyone no longer around (left the game, or a chav that went away)
    for (const [id, b] of this.bleeders) if (!b.seen) this.bleeders.delete(id);
    this.splats.update(dt, this.clock);
    this.prints.update(dt, this.clock);
  }
}
