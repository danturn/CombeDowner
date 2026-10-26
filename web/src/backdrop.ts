// The mountains on the skyline. Past the fog (view.ts) nothing of the map is drawn, which in Bath
// is as it should be, but where the ground round a map rises into real mountains (Cape Town's Table
// Mountain, Devil's Peak, Lion's Head and Signal Hill) they're the whole view, and a city that
// fades out under a white sky a kilometre off isn't the place. So on a map whose ground rises far
// enough from its lowest to its highest, the wider map's terrain is drawn once more, coarsely, as
// one mesh beyond the fog: lit by the same sun and sky, and lost into a haze much lighter than the
// street fog the further off it is, so the mountains stand on the skyline as blue-grey shapes from
// anywhere on the map, however short the draw distance. Bath's hills aren't high enough for it to
// be worth drawing (?backdrop=1 draws it anyway, ?backdrop=0 never).
//
// It's drawn straight after the sky with a depth range of its own, out to 60 km, then the depth is
// wiped so the world draws over it as if it weren't there; the near part, which the world covers,
// is left out as the player moves. Nothing here goes over the network.
import * as THREE from "three";
import type { GameMap } from "./map";

const RELIEF = 400;
const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
const CELLS = touch ? 120 : 160;
const NEAR = 10, FAR = 60000;
const REBUILD = 150;     // metres the player moves before the cells to draw are worked out again
const ROCK = new THREE.Color("#8a877f"), WATER = new THREE.Color("#46718a");

export interface Backdrop {
  /** Follow the player, the sun and the fog; dark: how far into a tunnel they are (0 to 1). */
  update(px: number, pz: number, dark: number): void;
}

export function buildBackdrop(map: GameMap, scene: THREE.Scene, palette: THREE.Color[], earth: THREE.Color,
  sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight): Backdrop | null {
  const asked = typeof location !== "undefined" ? new URLSearchParams(location.search).get("backdrop") : null;
  if (asked === "0") return null;
  const W = map.wide, T = map.d.t;
  let x0: number, y0: number, x1: number, y1: number;
  let height: (x: number, y: number) => number, kind: (x: number, y: number) => number;
  if (W) {
    x0 = W.x0; y0 = W.y0; x1 = W.x0 + (W.nx - 1) * W.dx; y1 = W.y0 + (W.ny - 1) * W.dx;
    height = (x, y) => W.ground(x, -y);
    kind = (x, y) => W.k[Math.min(W.ny - 1, Math.max(0, Math.round((y - W.y0) / W.dx))) * W.nx + Math.min(W.nx - 1, Math.max(0, Math.round((x - W.x0) / W.dx)))];
  } else if (T.nx > 1) {
    x0 = T.x0; y0 = T.y0; x1 = T.x0 + (T.nx - 1) * T.dx; y1 = T.y0 + (T.ny - 1) * T.dy;
    height = (x, y) => map.ground(x, -y);
    kind = () => 0;
  } else return null;

  const step = Math.max(x1 - x0, y1 - y0) / CELLS;
  const nx = Math.floor((x1 - x0) / step) + 1, ny = Math.floor((y1 - y0) / step) + 1;
  // the sea, which the ground under it is levelled off at: the level most of the water pieces have
  // (the sea comes in many pieces, all at one level)
  const count = new Map<number, number>();
  for (const w of W?.wp ?? map.d.wp ?? []) if (Number.isFinite(w.z)) count.set(w.z, (count.get(w.z) ?? 0) + 1);
  const sea = count.size ? [...count].sort((a, b) => b[1] - a[1])[0][0] - map.z0 : -Infinity;
  // (each point is the ground just there: taking the highest round it kept the peaks but stood the
  // backdrop up above the world's own ground where the two meet)
  const H = new Float32Array(nx * ny), wet = new Uint8Array(nx * ny);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let h = height(Math.min(x1, x0 + i * step), Math.min(y1, y0 + j * step));
    if (!Number.isFinite(h)) h = 0;
    if (h <= sea + 0.3) { h = sea; wet[j * nx + i] = 1; }
    H[j * nx + i] = h;
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  if (hi - lo < RELIEF && asked !== "1") return null;
  // the land runs down to the sea (or the lowest ground) in the last few points before the edge of
  // the data, rather than stopping in a wall that would show from a mountain top (no further in, or
  // it would take the top off a mountain near the edge, as Table Mountain is)
  const floor = Math.max(sea, lo), EDGE = step * 3;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const e = Math.min(i, j, nx - 1 - i, ny - 1 - j) * step, k = j * nx + i;
    if (e < EDGE) { const t = e / EDGE; H[k] = floor + (H[k] - floor) * t * t * (3 - 2 * t); if (t === 0 && sea > -Infinity) wet[k] = 1; }
  }

  const at = (i: number, j: number) => H[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  // and past it, where there's a sea, the sea goes on to the horizon: four more points at the end
  const NV = nx * ny + 4;
  const pos = new Float32Array(NV * 3), nor = new Float32Array(NV * 3), col = new Float32Array(NV * 3);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b], k) => {
    const v = nx * ny + k;
    pos.set([mx + a * 40000, sea > -Infinity ? sea - 0.5 : floor - 50, -(my + b * 40000)], v * 3);
    nor.set([0, 1, 0], v * 3);
    col.set([WATER.r, WATER.g, WATER.b], v * 3);
  });
  const c = new THREE.Color();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = j * nx + i, x = x0 + i * step, y = y0 + j * step;
    pos.set([x, H[v], -y], v * 3);
    const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * step), gn = (at(i, j + 1) - at(i, j - 1)) / (2 * step);
    const l = Math.hypot(gx, 1, gn), slope = Math.hypot(gx, gn);
    nor.set([-gx / l, 1 / l, gn / l], v * 3);
    if (wet[v]) c.copy(WATER);
    else {
      c.copy(palette[kind(x, y)] ?? palette[0]);
      c.lerp(earth, Math.min(0.75, Math.max(0, (slope - 0.45) * 1.4)));
      // cliffs and crags are bare rock
      c.lerp(ROCK, Math.min(0.9, Math.max(0, (slope - 0.6) * 1.5)));
    }
    col.set([c.r, c.g, c.b], v * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const cells = (nx - 1) * (ny - 1), idx = new THREE.BufferAttribute(NV > 65535 ? new Uint32Array(cells * 6 + 6) : new Uint16Array(cells * 6 + 6), 1);
  idx.setUsage(THREE.DynamicDrawUsage);
  geo.setIndex(idx);

  const U = {
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() },
    skyCol: { value: new THREE.Color() }, groundCol: { value: new THREE.Color() },
    haze: { value: new THREE.Color() }, fogFar: { value: 900 }, cut: { value: 800 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, vertexColors: true, fog: false,
    vertexShader: `uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 skyCol; uniform vec3 groundCol;
      varying vec3 vCol; varying vec3 vW; varying float vDepth;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0), mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        // a depth range of its own, from ${NEAR} m to ${FAR / 1000} km, whatever the camera's
        gl_Position.z = mv.z * ${(-(FAR + NEAR) / (FAR - NEAR)).toFixed(6)} - ${((2 * FAR * NEAR) / (FAR - NEAR)).toFixed(4)};
        // lit as the world's ground is (a Lambert surface under the sun and the sky)
        vec3 hemi = mix(groundCol, skyCol, 0.5 + 0.5 * normal.y);
        vCol = color * (sunCol * max(dot(normal, sunDir), 0.0) + hemi) / 3.14159;
        vW = wp.xyz;
        vDepth = -mv.z;
      }`,
    fragmentShader: `uniform vec3 haze; uniform float fogFar; uniform float cut;
      varying vec3 vCol; varying vec3 vW; varying float vDepth;
      void main(){
        if (vDepth < cut) discard;
        // the air's own haze, light even kilometres off, which turns what's far off blue before it
        // fades it into the sky; and where it meets the world, part way into the street fog, so the
        // two don't part sharply (all the way made white cut-outs of the mountains against the sky)
        float h = 0.06 + 0.8 * (1.0 - exp(-distance(vW, cameraPosition) / 14000.0));
        vec3 c = mix(vCol, vCol * vec3(0.74, 0.88, 1.25), smoothstep(0.0, 0.35, h));
        h = max(h, 0.6 * (1.0 - smoothstep(fogFar, fogFar * 1.3 + 250.0, vDepth)));
        gl_FragColor = vec4(mix(c, haze, h), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "backdrop";
  mesh.frustumCulled = false;
  // after the sky (-1), before everything else; then the world's depth starts afresh
  mesh.renderOrder = -0.5;
  mesh.onAfterRender = (r) => r.clearDepth();
  mesh.matrixAutoUpdate = false;
  geo.computeBoundingSphere();
  scene.add(mesh);

  // only the cells past the world's edge are drawn, worked out again as the player moves
  let bx = Infinity, bz = Infinity, bCut = 0;
  const keep = (px: number, pz: number, cut: number) => {
    const a = idx.array, py = -pz, r = cut - step * 1.5 - REBUILD;
    let n = 0;
    if (sea > -Infinity) { const v = nx * ny; a[n++] = v; a[n++] = v + 1; a[n++] = v + 2; a[n++] = v + 1; a[n++] = v + 3; a[n++] = v + 2; }
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (Math.hypot(x0 + (i + 0.5) * step - px, y0 + (j + 0.5) * step - py) < r) continue;
      const p = j * nx + i, q = p + 1, s = p + nx, t = s + 1;
      a[n++] = p; a[n++] = q; a[n++] = s; a[n++] = q; a[n++] = t; a[n++] = s;
    }
    geo.setDrawRange(0, n);
    idx.needsUpdate = true;
    mesh.visible = n > 0;
    bx = px; bz = pz; bCut = cut;
  };

  const fog = scene.fog as THREE.Fog;
  const tmp = new THREE.Vector3();
  return {
    update(px, pz, dark) {
      const cut = fog.far * 0.9;
      if (Math.hypot(px - bx, pz - bz) > REBUILD || Math.abs(cut - bCut) > 20) keep(px, pz, cut);
      mesh.visible = dark < 0.5 && geo.drawRange.count > 0;
      U.cut.value = cut; U.fogFar.value = fog.far;
      U.haze.value.copy(fog.color);
      U.sunDir.value.copy(tmp.subVectors(sun.position, sun.target.position).normalize());
      U.sunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
      U.skyCol.value.copy(hemi.color).multiplyScalar(hemi.intensity);
      U.groundCol.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity);
    },
  };
}
