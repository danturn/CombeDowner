// A neon shop sign for the outside of a house: dark board, glowing tube lettering, a soft halo and a coloured light.
import * as THREE from "three";

const FONT = "'Arial Black', 'Arial Rounded MT Bold', 'Helvetica Neue', Arial, sans-serif";

export function neonSign(text: string, colour: string): { group: THREE.Group; update(t: number): void; dispose(): void } {
  const group = new THREE.Group();
  const H = 0.85;
  const W = Math.max(1.4, Math.min(5, 0.6 + text.length * 0.28));
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => { disposables.push(o); return o; };

  // backing board and a thin frame lip
  const boardMat = track(new THREE.MeshLambertMaterial({ color: "#14121a" }));
  const board = new THREE.Mesh(track(new THREE.BoxGeometry(W, H, 0.06)), boardMat);
  board.position.set(0, H / 2, 0);
  const lipMat = track(new THREE.MeshLambertMaterial({ color: "#2a2730" }));
  const lipGeo = track(new THREE.BoxGeometry(W + 0.06, 0.04, 0.08));
  const lipTop = new THREE.Mesh(lipGeo, lipMat);
  lipTop.position.set(0, H, 0);
  const lipBot = new THREE.Mesh(lipGeo, lipMat);
  lipBot.position.set(0, 0, 0);
  group.add(board, lipTop, lipBot);

  // two little brackets at the top
  const metal = track(new THREE.MeshLambertMaterial({ color: "#6a6760" }));
  const bracketGeo = track(new THREE.BoxGeometry(0.05, 0.16, 0.05));
  for (const s of [-1, 1]) {
    const br = new THREE.Mesh(bracketGeo, metal);
    br.position.set(s * (W / 2 - 0.2), H + 0.08, -0.02);
    group.add(br);
  }

  // the tubes, drawn on a canvas
  const ch = 256;
  const cw = Math.round((ch * W) / H);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext("2d");
  if (g) {
    // bold upright letters rather than script: the game draws at about 540 lines, where thin joined-up
    // writing turns to mush
    let size = 150;
    g.font = `900 ${size}px ${FONT}`;
    // fit the letters and their tube (a fifth of the letter height either side) inside the board
    const mw = g.measureText(text).width;
    const maxW = cw * 0.9;
    if (mw * 1.08 + size * 0.2 > maxW) size = Math.floor(maxW / ((mw * 1.08) / size + 0.2));
    size = Math.min(size, Math.floor(ch * 0.55));
    g.font = `900 ${size}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineCap = "round";
    const x = cw / 2, y = ch / 2 + size * 0.04;
    // a fat coloured tube with a glow, then the letters filled in white-hot over it
    g.shadowColor = colour;
    g.shadowBlur = 30;
    g.strokeStyle = colour;
    g.lineWidth = Math.max(8, size * 0.2);
    g.strokeText(text, x, y);
    g.shadowBlur = 12;
    g.strokeText(text, x, y);
    g.shadowBlur = 4;
    g.shadowColor = "#ffffff";
    g.fillStyle = colour;
    g.fillText(text, x, y);
    g.shadowBlur = 0;
    g.globalAlpha = 0.4;
    g.fillStyle = "#ffffff";
    g.fillText(text, x, y);
    g.globalAlpha = 1;
  }
  const tex = track(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace;
  const textMat = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  const textPlane = new THREE.Mesh(track(new THREE.PlaneGeometry(W, H)), textMat);
  textPlane.position.set(0, H / 2, 0.035);
  group.add(textPlane);

  // soft halo: a glow on the board behind the tubes (a plain blur, so it never doubles the letters)
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 128; glowCanvas.height = 64;
  const gg = glowCanvas.getContext("2d");
  if (gg) {
    const grad = gg.createRadialGradient(64, 32, 4, 64, 32, 64);
    grad.addColorStop(0, "rgba(255,255,255,0.8)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    gg.setTransform(1, 0, 0, 0.5, 0, 16);
    gg.fillStyle = grad; gg.fillRect(0, 0, 128, 128);
  }
  const glowTex = track(new THREE.CanvasTexture(glowCanvas));
  const haloMat = track(new THREE.MeshBasicMaterial({
    map: glowTex, color: colour, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending,
    toneMapped: false, depthWrite: false,
  }));
  const halo = new THREE.Mesh(track(new THREE.PlaneGeometry(W * 1.25, H * 1.6)), haloMat);
  halo.position.set(0, H / 2, 0.032);
  group.add(halo);

  const light = new THREE.PointLight(colour, 6, 8, 2);
  light.position.set(0, H / 2, 0.6);
  group.add(light);

  // flicker: steady with a faint hum, and a stutter every few seconds
  let nextStutter = 2 + Math.random() * 3;
  let stutterEnd = 0;
  let seed = Math.random() * 100;
  const update = (t: number) => {
    let k = 1 + Math.sin(t * 100) * 0.015 + Math.sin(t * 7.3 + seed) * 0.02;
    if (t >= nextStutter) {
      stutterEnd = t + 0.25 + Math.random() * 0.3;
      nextStutter = stutterEnd + 3 + Math.random() * 5;
      seed = Math.random() * 100;
    }
    if (t < stutterEnd) {
      // on/off chatter while the stutter lasts
      const on = Math.sin(t * 60 + seed) + Math.sin(t * 37 + seed * 2) > -0.4;
      k *= on ? 0.85 : 0.2;
    }
    textMat.opacity = Math.min(1, k);
    haloMat.opacity = 0.35 * k * k;
    light.intensity = 6 * k;
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
    group.remove(...group.children);
  };
  return { group, update, dispose };
}
