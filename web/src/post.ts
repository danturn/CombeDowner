// The final look: the world and the weapon render into a multisampled buffer at a low
// resolution (about 540 lines), get tone mapped, then pass through a retro grade: punchier colour
// and contrast, squeezed onto a limited palette with an ordered dither, like a 90s shooter's 256
// colours but without the mud. The frame is blown up by a whole number of screen pixels, so every
// pixel is a crisp, even square. The HUD is HTML on top, so it stays sharp.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const RetroShader = {
  uniforms: { tDiffuse: { value: null }, pixel: { value: 1 }, size: { value: new THREE.Vector2(1, 1) }, grade: { value: 1 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float pixel; uniform vec2 size; uniform float grade; varying vec2 vUv;
    // 4x4 ordered (Bayer) dither threshold, 0 to 1
    float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    void main(){
      // each screen pixel takes the middle of the low-res pixel it falls in
      vec2 px = floor(gl_FragCoord.xy / pixel);
      vec3 c = texture2D(tDiffuse, (px + 0.5) / size).rgb;
      if (grade < 0.5) { gl_FragColor = vec4(c, 1.0); return; }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = clamp(mix(vec3(l), c, 1.2), 0.0, 1.0);          // more saturated
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);           // a little more contrast
      c *= vec3(1.02, 1.0, 0.97);                          // warm, sunny
      float levels = 26.0;
      c = floor(c * levels + bayer4(px)) / levels;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Post {
  private composer: EffectComposer;
  private worldPass: RenderPass;
  private weaponPass: RenderPass;
  // the gun in your hands has a camera of its own that follows the main one, with a near edge close
  // enough for the gun however far the main camera's near edge is pushed out to see a long way (view.ts)
  private weaponCam = new THREE.PerspectiveCamera(72, 1, 0.02, 50);
  private retro: ShaderPass;

  /** retro: the colour grade; lowRes: draw at about 540 lines rather than full resolution. */
  constructor(private renderer: THREE.WebGLRenderer, private camera: THREE.PerspectiveCamera, retro: boolean, private lowRes: boolean) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.worldPass = new RenderPass(new THREE.Scene(), camera);
    this.weaponPass = new RenderPass(new THREE.Scene(), this.weaponCam);
    this.weaponPass.clear = false;
    this.weaponPass.clearDepth = true;
    this.retro = new ShaderPass(RetroShader);
    this.retro.uniforms.grade.value = retro ? 1 : 0;
    for (const p of [this.worldPass, this.weaponPass, new OutputPass(), this.retro]) this.composer.addPass(p);
  }

  setSize() {
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    // a whole number of screen pixels per game pixel, as near 540 lines as that allows
    const f = this.lowRes ? Math.max(1, Math.round(buf.y / 540)) : 1;
    const w = Math.ceil(buf.x / f), h = Math.ceil(buf.y / f);
    this.composer.setPixelRatio(1);
    this.composer.setSize(w, h);
    this.retro.uniforms.pixel.value = f;
    this.retro.uniforms.size.value.set(w, h);
  }

  render(world: THREE.Scene, weapon: THREE.Scene | null) {
    this.worldPass.scene = world;
    this.weaponPass.enabled = !!weapon;
    if (weapon) {
      this.weaponPass.scene = weapon;
      const c = this.camera, w = this.weaponCam;
      c.updateMatrixWorld();
      w.position.copy(c.position); w.quaternion.copy(c.quaternion);
      if (w.fov !== c.fov || w.aspect !== c.aspect || w.zoom !== c.zoom) { w.fov = c.fov; w.aspect = c.aspect; w.zoom = c.zoom; w.updateProjectionMatrix(); }
    }
    this.composer.render();
  }
}
