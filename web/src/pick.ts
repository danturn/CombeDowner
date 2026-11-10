// What's under the crosshair, as drawn: for the drone's "what's what" view (drone.ts, looks.ts),
// which names and outlines the thing you're looking at. Every mesh near the middle of the view is
// drawn once more into a single pixel, each in a colour that's its own number (and, for a model
// drawn many times over, like trees and people, which copy of it), and that pixel is read back
// without holding up the frame. Only what reaches that one pixel is drawn, so it costs little; the
// drone asks a few times a second. Lines, points and flat pictures are left out, and so are the sky
// and the force field.
//
// Nothing here goes over the network: it's only what your own screen shows.
import * as THREE from "three";
import { kindOf } from "./kinds";

/** What the crosshair's on: the mesh, and which copy of it for a model drawn many times over (-1 if not). */
export interface Picked { mesh: THREE.Mesh; instance: number }

// each mesh's number in the red and green, which copy (plus one) in the blue and alpha
const VERT = `
  uniform vec2 id;
  varying vec4 vId;
  void main() {
    vec3 transformed = position;
    vec4 mvPosition = vec4(transformed, 1.0);
    float inst = 0.0;
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
      inst = float(gl_InstanceID) + 1.0;
    #endif
    mvPosition = modelViewMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;
    vId = vec4(id, floor(inst / 256.0) / 255.0, mod(inst, 256.0) / 255.0);
  }`;
const FRAG = `varying vec4 vId; void main() { gl_FragColor = vId; }`;

export class Picker {
  private target = new THREE.WebGLRenderTarget(1, 1, { samples: 0 });
  private mats: THREE.ShaderMaterial[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4();
  private buf = new Uint8Array(4);
  private clear = new THREE.Color();

  /** The material that draws the mesh in slot i (slots count from 1: 0 is nothing). */
  private mat(i: number): THREE.ShaderMaterial {
    let m = this.mats[i];
    if (!m) {
      this.mats[i] = m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
        uniforms: { id: { value: new THREE.Vector2(((i >> 8) & 255) / 255, (i & 255) / 255) } } });
      m.toneMapped = false;
    }
    return m;
  }

  /** What's in the middle of the view, drawn now and read back when the graphics card has it. */
  async pick(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera): Promise<Picked | null> {
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(2, Math.round(size.x)), h = Math.max(2, Math.round(size.y));
    cam.setViewOffset(w, h, Math.floor(w / 2), Math.floor(h / 2), 1, 1);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const slots: THREE.Mesh[] = [null as unknown as THREE.Mesh];
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    const hidden: THREE.Object3D[] = [];
    const bg = scene.background, fog = scene.fog, alpha = r.getClearAlpha(), shadows = r.shadowMap.needsUpdate;
    r.shadowMap.needsUpdate = false;   // (the shadows wait for the real frame)
    r.getClearColor(this.clear);
    try {
      scene.traverseVisible((o) => {
        const k = o.userData.kind;
        if (k === "sky" || k === "field" || k === "overlay") { o.visible = false; hidden.push(o); return; }
        const m = o as THREE.Mesh;
        if ((m as unknown as THREE.Line).isLine || (m as unknown as THREE.Points).isPoints || (m as unknown as THREE.Sprite).isSprite) { o.visible = false; hidden.push(o); return; }
        if (!m.isMesh) return;
        if (m.frustumCulled && !this.frustum.intersectsObject(m)) return;
        const kind = kindOf(m);
        if (kind === "sky" || kind === "field") { o.visible = false; hidden.push(o); return; }
        if (slots.length >= 65535) return;
        const mat = this.mat(slots.length);
        slots.push(m);
        swapped.push([m, m.material]);
        m.material = Array.isArray(m.material) ? m.material.map(() => mat) : mat;
      });
      scene.background = null; scene.fog = null;
      r.setClearColor(0x000000, 0);
      const was = r.getRenderTarget();
      r.setRenderTarget(this.target);
      r.clear();
      r.render(scene, cam);
      r.setRenderTarget(was);
    } finally {
      for (const [m, mat] of swapped) m.material = mat;
      for (const o of hidden) o.visible = true;
      scene.background = bg; scene.fog = fog;
      r.setClearColor(this.clear, alpha);
      r.shadowMap.needsUpdate = shadows;
      cam.clearViewOffset();
      cam.updateProjectionMatrix();
    }
    await r.readRenderTargetPixelsAsync(this.target, 0, 0, 1, 1, this.buf);
    const [a, b, c, d] = this.buf, slot = a * 256 + b, inst = c * 256 + d - 1;
    const mesh = slots[slot];
    return mesh ? { mesh, instance: (mesh as THREE.InstancedMesh).isInstancedMesh ? inst : -1 } : null;
  }

  dispose() { this.target.dispose(); for (const m of this.mats) m?.dispose(); this.mats.length = 0; }
}
