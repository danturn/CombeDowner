// The lights that are dark most of the time: the street lamps' pools of light by day, the
// headlights' and torches' beams, a firework's flash, the bonfire. They stay in the scene so the
// number of lights never changes, but while every one of them is dark they are left out of the
// drawing: otherwise every lit surface works through each of them for every pixel, and every draw
// hands their settings over again, for no light at all.
//
// They go and come back all together, so each material only ever has two versions of its shader,
// one with them and one without. Switching between those makes the browser build the version it
// hasn't got, which would stall a frame at dusk (or when someone switches a torch on), so every
// material drawn is given its other version beforehand, in the background as new ones come into
// view, and the switch itself only picks between two versions already built.
//
// Nothing here goes over the network: each player's machine decides for itself what to draw.
import * as THREE from "three";

type Darkable = THREE.PointLight | THREE.SpotLight;

const lightsOf = new WeakMap<THREE.Object3D, Darkable[]>();

/** Lights in scene that are dark at intensity 0, to be left out of the drawing while they all are. */
export function darkable(scene: THREE.Object3D, ...lights: Darkable[]) {
  let all = lightsOf.get(scene);
  if (!all) lightsOf.set(scene, (all = []));
  all.push(...lights);
}

type Lit = THREE.MeshLambertMaterial | THREE.MeshPhongMaterial | THREE.MeshStandardMaterial | THREE.MeshToonMaterial | THREE.ShaderMaterial;
/** The materials whose shaders depend on the lights (as three decides it). */
function usesLights(m: THREE.Material): m is Lit {
  const a = m as THREE.Material & Record<string, unknown>;
  return !!(a.isMeshLambertMaterial || a.isMeshToonMaterial || a.isMeshPhongMaterial || a.isMeshStandardMaterial || a.isShadowMaterial || (a.isShaderMaterial && a.lights));
}

const SCAN_EVERY = 1;     // seconds between looks for materials that haven't both versions yet
const WARM_PER_FRAME = 4; // newly built shaders readied for use each frame

export class Unlit {
  private scanT = 0;
  private both = new WeakSet<THREE.Material>();
  private warm = new WeakSet<object>();

  constructor(private renderer: THREE.WebGLRenderer) {}

  /** Before drawing scene with camera: leave the dark lights out if they all are, and get ready for them changing. */
  frame(scene: THREE.Scene, camera: THREE.Camera, dt: number) {
    const lights = lightsOf.get(scene);
    if (!lights) return;
    const want = lights.some((l) => l.intensity > 0);
    for (const l of lights) if (l.visible !== want) l.visible = want;
    if ((this.scanT -= dt) <= 0) {
      this.scanT = SCAN_EVERY;
      this.prepare(scene, camera, lights, want);
    }
    this.warmUp();
  }

  /** Build the other version (with the dark lights, or without) of every lit material drawn last frame that hasn't got it. */
  private prepare(scene: THREE.Scene, camera: THREE.Camera, lights: Darkable[], shown: boolean) {
    const list = this.renderer.renderLists.get(scene, 0);
    const objects: THREE.Object3D[] = [], materials = new Set<THREE.Material>();
    for (const items of [list.opaque, list.transmissive, list.transparent]) {
      for (const it of items) {
        const m = it.material;
        if (!it.object || !usesLights(m) || this.both.has(m)) continue;
        objects.push(it.object);
        materials.add(m);
      }
    }
    if (!objects.length) return;
    // three's compile takes the lights from scene and the things to build for from what it's given
    const some = { traverse: (f: (o: THREE.Object3D) => void) => objects.forEach(f), traverseVisible: () => {} } as unknown as THREE.Object3D;
    for (const l of lights) l.visible = !shown;
    try {
      this.renderer.compile(some, camera, scene);
    } catch (e) {
      // not worth losing frames over: the switch will build them when it comes, as it always did
      console.warn("couldn't build the shaders for the lights ahead of time:", e);
    } finally {
      for (const l of lights) l.visible = shown;
    }
    for (const m of materials) this.both.add(m);
  }

  /** A shader is checked and its settings looked up the first time it's drawn with, which waits on
   *  the graphics card; do that now for a few just built, once the card has finished them, rather
   *  than all at once at the switch. */
  private warmUp() {
    let n = 0;
    for (const p of (this.renderer.info.programs ?? []) as (THREE.WebGLProgram & { isReady(): boolean })[]) {
      if (this.warm.has(p)) continue;
      if (!p.isReady()) { if (++n >= WARM_PER_FRAME) return; continue; }
      p.getUniforms();
      this.warm.add(p);
      if (++n >= WARM_PER_FRAME) return;
    }
  }
}
