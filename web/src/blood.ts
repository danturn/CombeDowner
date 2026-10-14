// Blood, or paint: splashes and pools on the ground where people are shot, and footprints and drips
// from anyone who is bleeding. By default it's paintball (gore.ts): splats in the shooter's colour,
// on the ground, on walls where a shot lands, and painted footprints from whoever got splattered.
// Blood is the secret setting. It's only looks: each player makes their own from the host's hit
// events and the shots they see, and it all fades away after a while.
import * as THREE from "three";
import { gore } from "./gore";
import * as TX from "./textures";

const SPLAT_LIFE = 90, PRINT_LIFE = 45;   // seconds on the ground, the last fifth spent fading
const BLEED_PER_HIT = 12, BLEED_MAX = 30; // seconds of bleeding
const DRIP_PAINT = 4;                     // seconds of wet paint dripping off someone splattered
const STRIDE = 0.78;                      // metres between footprints

/** Something that can bleed and walk about: a player or a naughty boy. */
export interface Walker { id: string; x: number; y: number; z: number; alive: boolean }

/**
 * Flat decals laid on the ground, all in one instanced mesh. A ring buffer: when it's full the
 * oldest goes. Each one fades out on its own; blood dries darker as it goes, paint keeps its
 * colour.
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
  private tint: Float32Array;
  private col = new THREE.Color();

  constructor(scene: THREE.Scene, map: THREE.Texture, private max: number, private dries: boolean) {
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
    this.mesh.visible = false;   // nothing laid yet
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, this.col.setRGB(1, 1, 1));
    this.born = new Float32Array(max);
    this.life = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.tint = new Float32Array(max * 3).fill(1);
    scene.add(this.mesh);
  }

  /** Lay a decal with the given matrix. tile is 0-3 in the atlas. grow > 0 spreads it out over that many seconds. tint colours a white texture. */
  add(m: THREE.Matrix4, tile: number, alpha: number, life: number, now: number, grow = 0, tint?: THREE.Color) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.used = Math.min(this.max, this.used + 1);
    this.mesh.count = this.used;
    this.mesh.visible = true;
    this.tint[i * 3] = tint?.r ?? 1; this.tint[i * 3 + 1] = tint?.g ?? 1; this.tint[i * 3 + 2] = tint?.b ?? 1;
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
      const dry = this.dries ? Math.min(1, age / 30) : 0, t = this.tint;
      this.mesh.setColorAt(i, this.col.setRGB(t[i * 3] * (1 - dry * 0.45), t[i * 3 + 1] * (1 - dry * 0.3), t[i * 3 + 2] * (1 - dry * 0.3)));
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

/** paint: the colour they're covered in, or null for blood. */
interface Bleeder { t: number; x: number; z: number; acc: number; foot: number; drip: number; seen: boolean; paint: THREE.Color | null }

export class Blood {
  private splats: DecalLayer;
  private prints: DecalLayer;
  private paints: DecalLayer;
  private paintPrints: DecalLayer;
  private bleeders = new Map<string, Bleeder>();
  private clock = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private qy = new THREE.Quaternion();
  private n = new THREE.Vector3();
  private static UP = new THREE.Vector3(0, 1, 0);

  /** surface(x, z) is the height of whatever is drawn on the ground there. */
  constructor(scene: THREE.Scene, private surface: (x: number, z: number) => number) {
    this.splats = new DecalLayer(scene, TX.bloodSplats(), 320, true);
    this.prints = new DecalLayer(scene, TX.shoePrints(), 480, true);
    this.paints = new DecalLayer(scene, TX.paintSplats(), 400, false);
    this.paintPrints = new DecalLayer(scene, TX.shoePrints("rgba(255, 255, 255, 0.95)"), 480, false);
  }

  /** A matrix laying a w x l decal flat on the ground at (x, z), its top pointing along heading h. */
  private place(x: number, z: number, h: number, w: number, l: number): THREE.Matrix4 {
    const y = this.surface(x, z), e = 0.3;
    // tilt to the slope of the ground
    this.n.set(this.surface(x - e, z) - this.surface(x + e, z), 2 * e, this.surface(x, z - e) - this.surface(x, z + e)).normalize();
    this.q.setFromUnitVectors(Blood.UP, this.n).multiply(this.qy.setFromAxisAngle(Blood.UP, h));
    return this.m.compose(new THREE.Vector3(x, y + 0.025, z), this.q, new THREE.Vector3(w, 1, l));
  }

  /** A splat on the ground: blood, or paint of the given colour. */
  private splat(x: number, z: number, h: number, w: number, l: number, tile: number, alpha = 0.95, grow = 0, paint: THREE.Color | null = null) {
    if (paint) this.paints.add(this.place(x, z, h, w, l), tile, alpha, SPLAT_LIFE, this.clock, grow, paint);
    else this.splats.add(this.place(x, z, h, w, l), tile, alpha, SPLAT_LIFE, this.clock, grow);
  }

  /**
   * Someone at (x, z) was shot from (fromX, fromZ): blood splashes on the ground behind them
   * and they start to bleed. In paintball, paint is the shooter's colour: it splashes the same
   * way and drips off them for a few seconds. Without a paint colour (a cat's claws, a punch)
   * there's nothing to see in paintball.
   */
  hit(id: string, x: number, z: number, fromX: number, fromZ: number, head: boolean, paint: string | null = null) {
    const p = gore() ? null : paint ? new THREE.Color(paint) : undefined;
    if (p === undefined) return;
    let dx = x - fromX, dz = z - fromZ;
    const dl = Math.hypot(dx, dz);
    if (dl < 1e-3) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= dl; dz /= dl; }
    const h = Math.atan2(-dx, -dz);   // heading pointing away from the shooter
    this.splat(x + dx * 0.2, z + dz * 0.2, Math.random() * 6.3, 0.55, 0.55, Math.random() < 0.5 ? 0 : 3, 0.95, 0, p);
    // blood goes further and wider than paint, and a headshot throws it all over
    const n = p ? (head ? 3 : 2) : head ? 6 : 4, far = p ? 1 : head ? 1.6 : 1.3;
    for (let i = 0; i < n; i++) {
      const d = 0.7 + Math.random() * (head ? 2.2 : 1.5) * far, side = (Math.random() - 0.5) * 0.9 * far;
      const s = (0.6 + Math.random() * 0.6) * (p ? 1 : 1.2);
      this.splat(x + dx * d - dz * side, z + dz * d + dx * side, h + (Math.random() - 0.5) * 0.5, s, s * 1.5, 1 + (i % 2), 0.95, 0, p);
    }
    this.bleed(id, p ? DRIP_PAINT : BLEED_PER_HIT, p);
  }

  /** Someone died at (x, z): a pool spreads out under the body (in paintball, a big splat of the winner's colour). */
  pool(x: number, z: number, paint: string | null = null) {
    if (gore()) this.splat(x, z, Math.random() * 6.3, 2.6 + Math.random() * 0.6, 2.2 + Math.random() * 0.5, 0, 0.97, 9);
    else if (paint) this.splat(x, z, Math.random() * 6.3, 1.5 + Math.random() * 0.4, 1.5 + Math.random() * 0.4, 0, 0.97, 0.4, new THREE.Color(paint));
  }

  /**
   * A splat on whatever's at p, facing out along normal n: a paintball's burst (paint given, in
   * paintball), or with blood on (paint null), blood up a wall behind someone who was shot; big
   * for a headshot or the sniper.
   */
  mark(p: THREE.Vector3, n: THREE.Vector3, paint: string | null, big = false) {
    if (gore() === !!paint) return;
    this.n.copy(n).normalize();
    this.q.setFromUnitVectors(Blood.UP, this.n).multiply(this.qy.setFromAxisAngle(Blood.UP, Math.random() * 6.3));
    const at = p.clone().addScaledVector(this.n, 0.02);
    if (paint) {
      const s = 0.8 + Math.random() * 0.35;   // the splat's drops reach well past its middle
      this.paints.add(this.m.compose(at, this.q, new THREE.Vector3(s, 1, s)), Math.random() < 0.7 ? 0 : 3, 0.95, SPLAT_LIFE, this.clock, 0.08, new THREE.Color(paint));
    } else {
      const s = big ? 1.6 + Math.random() * 0.6 : 0.9 + Math.random() * 0.5;
      this.splats.add(this.m.compose(at, this.q, new THREE.Vector3(s, 1, s * 1.3)), big ? 0 : 1 + Math.floor(Math.random() * 2), 0.95, SPLAT_LIFE, this.clock, 0.12);
    }
  }

  bleed(id: string, secs = BLEED_PER_HIT, paint: THREE.Color | null = null) {
    let b = this.bleeders.get(id);
    if (!b) this.bleeders.set(id, b = { t: 0, x: NaN, z: NaN, acc: 0, foot: 0, drip: 0, seen: true, paint });
    b.paint = paint;
    b.t = Math.min(paint ? DRIP_PAINT * 2 : BLEED_MAX, b.t + secs);
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
      const k = Math.min(1, b.t / (b.paint ? DRIP_PAINT : BLEED_PER_HIT));   // how heavily they're bleeding (or dripping)
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
        if (b.paint) this.paintPrints.add(this.place(px, pz, h, 0.34, 0.34), tile, 0.35 + 0.6 * k, PRINT_LIFE, this.clock, 0, b.paint);
        else this.prints.add(this.place(px, pz, h, 0.34, 0.34), tile, 0.35 + 0.6 * k, PRINT_LIFE, this.clock);
      }
      // drips
      b.drip -= dt;
      if (b.drip <= 0) {
        b.drip = 0.25 + Math.random() * 0.5 / (0.4 + k);
        const s = 0.07 + Math.random() * 0.12 * (0.5 + k);
        this.splat(w.x + (Math.random() - 0.5) * 0.4, w.z + (Math.random() - 0.5) * 0.4, Math.random() * 6.3, s, s, 3, 0.6 + 0.35 * k, 0, b.paint);
      }
    }
    // anyone no longer around (left the game, or a naughty boy that went away)
    for (const [id, b] of this.bleeders) if (!b.seen) this.bleeders.delete(id);
    this.splats.update(dt, this.clock);
    this.prints.update(dt, this.clock);
    this.paints.update(dt, this.clock);
    this.paintPrints.update(dt, this.clock);
  }
}
