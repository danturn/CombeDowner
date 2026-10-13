// Map markers: any player can tag one spot, by tapping the full map or by pressing G while looking
// at it, and everyone in the game sees it. Each marker is a pin in its owner's colour on the
// minimap and the full map, a column of light standing up from the spot in the streets, and a pip
// on the compass strip across the top of the screen saying which way it is and how far.
//
// Who decides what: each player owns their own marker (one each; a new one moves it). They send it
// to everyone when they set or clear it, and again to anyone who joins, so a newcomer sees the
// markers already up. A marker goes when its owner leaves. Older pages don't know the message
// and simply don't show it.
import * as THREE from "three";
import { pinIcon } from "./minimap";

/** One player's marker, in scene coordinates. */
export interface Marker { x: number; y: number; z: number; colour: string; name: string; mine: boolean }

const BEAM = 70;       // metres tall: tall enough to see over the roofs from the next street
const FOV = Math.PI;   // the compass strip spans this much of the horizon, centred on where you face

export class Markers {
  private all = new Map<string, { x: number; y: number; z: number; view: THREE.Group; mat: THREE.MeshBasicMaterial[] }>();

  constructor(private scene: THREE.Scene) {}

  get size() { return this.all.size; }
  has(id: string) { return this.all.has(id); }
  at(id: string) { return this.all.get(id); }

  /** Put id's marker at scene (x, y, z), in their colour (moving it if they had one). */
  set(id: string, x: number, y: number, z: number, colour: string) {
    this.clear(id);
    const view = new THREE.Group(), mat: THREE.MeshBasicMaterial[] = [];
    const glow = (opacity: number) => {
      const m = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
      mat.push(m);
      return m;
    };
    // a thin bright core inside a wider faint column, open at both ends
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, BEAM, 6, 1, true), glow(0.85));
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, BEAM, 10, 1, true), glow(0.22));
    core.position.y = halo.position.y = BEAM / 2;
    // and a ring on the ground
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.6, 24), glow(0.7));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
    view.add(core, halo, ring);
    view.position.set(x, y, z);
    view.renderOrder = 2;
    this.scene.add(view);
    this.all.set(id, { x, y, z, view, mat });
  }

  clear(id: string) {
    const m = this.all.get(id);
    if (!m) return;
    this.scene.remove(m.view);
    m.view.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    m.mat.forEach((x) => x.dispose());
    this.all.delete(id);
  }

  /** The markers to draw, with their owners' names and colours. */
  list(self: string, who: (id: string) => { name: string; colour: string }): Marker[] {
    return [...this.all].map(([id, m]) => ({ x: m.x, y: m.y, z: m.z, mine: id === self, ...who(id) }));
  }

  /** The columns pulse gently, and fade as you get close so they don't blind you. */
  update(t: number, cx: number, cz: number) {
    for (const m of this.all.values()) {
      const near = Math.min(1, Math.max(0.25, Math.hypot(m.x - cx, m.z - cz) / 40));
      const pulse = 0.85 + 0.15 * Math.sin(t * 2.4);
      m.mat[0].opacity = 0.85 * near * pulse;
      m.mat[1].opacity = 0.22 * near * pulse;
      m.mat[2].opacity = 0.5 + 0.25 * Math.sin(t * 3.1);
    }
  }
}

/** How far, in words: "45 m", "1.2 km". */
function far(d: number) {
  return d < 1000 ? `${Math.round(d / 5) * 5} m` : `${(d / 1000).toFixed(d < 10000 ? 1 : 0)} km`;
}

const LETTERS: [number, string][] = [[0, "N"], [45, "NE"], [90, "E"], [135, "SE"], [180, "S"], [225, "SW"], [270, "W"], [315, "NW"]];

/**
 * The compass strip along the top of the screen: the way you face in the middle, half the horizon
 * either side, and a pin for each marker at its bearing with how far away it is. A marker behind
 * you sits at the end of the strip nearest to it, with an arrow saying turn that way.
 * (x, z) is where you are in the scene and yaw the way you face.
 */
export function drawCompass(c: HTMLCanvasElement, x: number, z: number, yaw: number, markers: Marker[]) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
  if (!W || !H) return;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, W, H);
  const heading = -yaw;                       // clockwise from north, in radians
  const mid = W / 2, pxPerRad = W / FOV;
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const band = 22 * dpr;                      // the strip itself; the pins' distances hang below it

  // the strip: dark, fading out at both ends
  const bg = g.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, "rgba(14,16,18,0)"); bg.addColorStop(0.12, "rgba(14,16,18,0.72)");
  bg.addColorStop(0.88, "rgba(14,16,18,0.72)"); bg.addColorStop(1, "rgba(14,16,18,0)");
  g.fillStyle = bg; g.fillRect(0, 0, W, band);

  // ticks every 15 degrees, with the points of the compass
  g.textAlign = "center"; g.textBaseline = "middle";
  for (let deg = 0; deg < 360; deg += 15) {
    const off = wrap((deg * Math.PI) / 180 - heading);
    if (Math.abs(off) > FOV / 2) continue;
    const px = mid + off * pxPerRad, fade = 1 - Math.abs(off) / (FOV / 2);
    const letter = LETTERS.find(([d]) => d === deg)?.[1];
    if (letter) {
      g.globalAlpha = 0.25 + 0.75 * fade;
      g.font = `700 ${(letter.length === 1 ? 15 : 12) * dpr}px "Barlow Condensed", system-ui, sans-serif`;
      g.fillStyle = letter === "N" ? "#ff7a5c" : "#f4f1ea";
      g.fillText(letter, px, band / 2 + 1 * dpr);
    } else {
      g.globalAlpha = 0.2 + 0.5 * fade;
      g.fillStyle = "#f4f1ea";
      g.fillRect(px - 0.5 * dpr, band * 0.32, 1 * dpr, band * 0.36);
    }
  }
  g.globalAlpha = 1;
  // where you're facing
  g.fillStyle = "#ffdd00";
  g.beginPath(); g.moveTo(mid - 5 * dpr, 0); g.lineTo(mid + 5 * dpr, 0); g.lineTo(mid, 6 * dpr); g.closePath(); g.fill();

  // the markers, furthest first so the nearest sit on top
  const seen = markers.map((m) => {
    const dx = m.x - x, dz = m.z - z;
    return { m, d: Math.hypot(dx, dz), off: wrap(Math.atan2(dx, -dz) - heading) };
  }).sort((a, b) => b.d - a.d);
  g.font = `700 ${11 * dpr}px "Barlow Condensed", system-ui, sans-serif`;
  g.lineJoin = "round";
  const edge = FOV / 2 - 0.06;
  for (const { m, d, off } of seen) {
    const behind = Math.abs(off) > edge, side = Math.sign(off) || 1;
    const px = mid + (behind ? side * edge : off) * pxPerRad;
    pinIcon(g, px, band - 3 * dpr, 1.05 * dpr, m.colour, m.mine);
    if (behind) {
      // an arrow beside it: turn this way
      const ax = px - side * 11 * dpr, ay = band / 2;
      g.fillStyle = m.colour;
      g.beginPath(); g.moveTo(ax + side * 4 * dpr, ay); g.lineTo(ax - side * 2 * dpr, ay - 5 * dpr); g.lineTo(ax - side * 2 * dpr, ay + 5 * dpr); g.closePath(); g.fill();
    }
    const label = far(d);
    g.strokeStyle = "rgba(14,16,18,0.9)"; g.lineWidth = 3 * dpr;
    g.strokeText(label, px, band + 7 * dpr);
    g.fillStyle = m.colour;
    g.fillText(label, px, band + 7 * dpr);
  }
}
