// Snapshots: a little picture of somewhere in the world, taken with the game's own renderer from a
// camera put wherever it's wanted, and inked like an old explorer's sketch (sepia, a dark edge and
// a paper border). The treasure trail (trail.ts) uses one as a picture clue: the view from near the
// tin, to recognise. Taking one draws the scene once more into a corner of the screen just before
// the frame is drawn over it, so it costs one extra small render and nothing after.
//
// Who decides what: nobody. Each player takes their own pictures; nothing goes over the network.
import * as THREE from "three";

let renderer: THREE.WebGLRenderer | null = null;
/** The game's renderer, handed over once at the start (main.ts). */
export function useRenderer(r: THREE.WebGLRenderer) { renderer = r; }

const _v = new THREE.Vector4(), _s = new THREE.Vector4();

/**
 * A w by h picture of the scene from (x, y, z), looking towards (lx, ly, lz), as a canvas; or null
 * if there's no renderer or it couldn't be read back. Call it before the frame is drawn.
 */
export function snapshot(scene: THREE.Scene, x: number, y: number, z: number, lx: number, ly: number, lz: number, w = 160, h = 100, far = 900): HTMLCanvasElement | null {
  const r = renderer;
  if (!r) return null;
  const cam = new THREE.PerspectiveCamera(62, w / h, 0.1, far);
  cam.position.set(x, y, z);
  cam.lookAt(lx, ly, lz);
  cam.updateMatrixWorld();
  const pr = r.getPixelRatio(), el = r.domElement;
  const pw = Math.floor(w * pr), ph = Math.floor(h * pr);
  if (el.width < pw || el.height < ph) return null;
  const target = r.getRenderTarget(), test = r.getScissorTest();
  r.getViewport(_v); r.getScissor(_s);
  try {
    r.setRenderTarget(null);
    r.setViewport(0, 0, w, h); r.setScissor(0, 0, w, h); r.setScissorTest(true);
    r.clear();
    r.render(scene, cam);
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    const g = out.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(el, 0, el.height - ph, pw, ph, 0, 0, w, h);
    ink(g, w, h);
    return out;
  } catch {
    return null;
  } finally {
    r.setScissorTest(test); r.setScissor(_s); r.setViewport(_v); r.setRenderTarget(target);
  }
}

/** Sepia, a few tones, darker towards the edges, and a paper border: an old sketch of the place. */
function ink(g: CanvasRenderingContext2D, w: number, h: number) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4;
    let l = (d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11) / 255;
    l = Math.min(1, Math.max(0, (l - 0.5) * 1.25 + 0.55));
    l = Math.round(l * 6) / 6;                                   // a few tones, like a print
    const ex = (i / w - 0.5) * 2, ey = (j / h - 0.5) * 2;
    l *= 1 - 0.35 * Math.max(0, ex * ex + ey * ey - 0.35);       // darker at the corners
    d[k] = 40 + l * 205; d[k + 1] = 28 + l * 185; d[k + 2] = 18 + l * 140;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = "#e9dcb6"; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
  g.strokeStyle = "#5a4326"; g.lineWidth = 1; g.strokeRect(3.5, 3.5, w - 7, h - 7);
}
