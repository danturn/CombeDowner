// The drone's views (drone.ts), for looking over the map's scenery: C (Circle on a controller, or a tap
// on the view's name on the drone's screen) goes round them.
//
//   Normal       the game as it is
//   Clay         everything plain white, shaded as if lit from over your shoulder, with no textures,
//                so the shapes show for themselves
//   Outlines     clay with a dark line wherever the surface turns or one thing stands in front of
//                another, as in a drawing
//   Wireframe    every triangle as lines, on a dark ground
//   What's what  each kind of thing in its own colour (kinds.ts): the lidar's ground, the streets,
//                the buildings the map build makes, the set pieces, the landmarks, walls and fences,
//                plants, water and the rest, with a key on the drone's screen
//
// They're lit the same at any time of day (a picture of a lit ball, drawn here, that each surface
// takes its shade from by the way it faces you), the sky and the force field are left out, and the
// fog fades to the plain background, so night or day the shapes read the same. Each is put on just
// for the drawing of a frame and taken off straight after (before and after, round post.ts), so
// nothing else in the game ever sees a changed material, and squares that load in are covered at once.
//
// Nothing here goes over the network: it's only what your own screen shows.
import * as THREE from "three";
import { KINDS, kindOf, type Kind } from "./kinds";

export type LookId = "normal" | "clay" | "lines" | "wire" | "kinds";
export const LOOKS: { id: LookId; name: string }[] = [
  { id: "normal", name: "Normal" }, { id: "clay", name: "Clay" }, { id: "lines", name: "Outlines" },
  { id: "wire", name: "Wireframe" }, { id: "kinds", name: "What's what" },
];

const LIGHT_BG = new THREE.Color("#cdd5dc"), DARK_BG = new THREE.Color("#0e1216"), WIRE = "#8fe3ff";

let lit: THREE.Texture | null = null;
/** A ball lit from above and to the left, white to grey: every surface's shade, by which way it faces you. */
function litBall(): THREE.Texture {
  if (lit) return lit;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#6a6a6a"; g.fillRect(0, 0, 128, 128);
  const r = g.createRadialGradient(46, 38, 4, 64, 64, 64);
  r.addColorStop(0, "#ffffff"); r.addColorStop(0.45, "#e2e2e2"); r.addColorStop(0.85, "#a4a4a4"); r.addColorStop(1, "#7a7a7a");
  g.fillStyle = r; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
  lit = new THREE.CanvasTexture(c);
  lit.colorSpace = THREE.SRGBColorSpace;
  return lit;
}

export class Looks {
  private i = 0;
  private clay: THREE.MeshMatcapMaterial | null = null;
  private wire: THREE.MeshBasicMaterial | null = null;
  private byKind = new Map<Kind, THREE.MeshMatcapMaterial>();
  // what before() changed, for after() to put back
  private bg: THREE.Color | THREE.Texture | null = null;
  private fogCol = new THREE.Color();
  private hidden: THREE.Object3D[] = [];
  private swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  private on = false;

  get id(): LookId { return LOOKS[this.i].id; }
  get name(): string { return LOOKS[this.i].name; }

  /** On to the next view (or back, by -1). */
  next(by = 1) { this.i = (this.i + by + LOOKS.length) % LOOKS.length; }

  /** Just before the frame's drawn: put the view on. */
  before(scene: THREE.Scene) {
    const id = this.id;
    if (id === "normal") return;
    this.on = true;
    const bg = id === "wire" ? DARK_BG : LIGHT_BG;
    this.bg = scene.background as THREE.Color | THREE.Texture | null;
    scene.background = bg;
    const fog = scene.fog as THREE.Fog | THREE.FogExp2 | null;
    if (fog) { this.fogCol.copy(fog.color); fog.color.copy(bg); }
    // the sky and the force field would only be in the way
    for (const o of scene.children) if (o.visible && (o.userData.kind === "sky" || o.userData.kind === "field")) { o.visible = false; this.hidden.push(o); }
    if (id === "kinds") {
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const k = kindOf(m);
        if (k === "sky" || k === "field") { m.visible = false; this.hidden.push(m); return; }
        const mat = this.kindMat(k);
        this.swapped.push([m, m.material]);
        m.material = Array.isArray(m.material) ? m.material.map(() => mat) : mat;
      });
    } else if (id === "wire") {
      scene.overrideMaterial = this.wire ??= new THREE.MeshBasicMaterial({ color: WIRE, wireframe: true });
    } else {
      scene.overrideMaterial = this.clay ??= new THREE.MeshMatcapMaterial({ color: "#ffffff", matcap: litBall(), side: THREE.DoubleSide });
    }
  }

  /** Straight after the frame's drawn: take it off again. */
  after(scene: THREE.Scene) {
    if (!this.on) return;
    this.on = false;
    scene.background = this.bg;
    const fog = scene.fog as THREE.Fog | THREE.FogExp2 | null;
    if (fog) fog.color.copy(this.fogCol);
    scene.overrideMaterial = null;
    for (const o of this.hidden) o.visible = true;
    for (const [m, mat] of this.swapped) m.material = mat;
    this.hidden.length = this.swapped.length = 0;
  }

  private kindMat(k: Kind): THREE.MeshMatcapMaterial {
    let m = this.byKind.get(k);
    if (!m) this.byKind.set(k, (m = new THREE.MeshMatcapMaterial({ color: KINDS[k].col, matcap: litBall(), side: THREE.DoubleSide })));
    return m;
  }
}
