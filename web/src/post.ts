// The final look: the world and the weapon render into a multisampled buffer, get tone mapped,
// then pass through a retro grade: punchier colour and contrast, squeezed onto a limited
// palette with an ordered dither, like a 90s shooter's 256 colours but without the mud.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const RetroShader = {
  uniforms: { tDiffuse: { value: null }, pixel: { value: 1 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float pixel; varying vec2 vUv;
    // 4x4 ordered (Bayer) dither threshold, 0 to 1
    float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = clamp(mix(vec3(l), c, 1.2), 0.0, 1.0);          // more saturated
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);           // a little more contrast
      c *= vec3(1.02, 1.0, 0.97);                          // warm, sunny
      float levels = 26.0;
      c = floor(c * levels + bayer4(gl_FragCoord.xy / pixel)) / levels;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Post {
  private composer: EffectComposer;
  private worldPass: RenderPass;
  private weaponPass: RenderPass;
  private retro: ShaderPass;

  constructor(private renderer: THREE.WebGLRenderer, camera: THREE.Camera, retro: boolean) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.worldPass = new RenderPass(new THREE.Scene(), camera);
    this.weaponPass = new RenderPass(new THREE.Scene(), camera);
    this.weaponPass.clear = false;
    this.weaponPass.clearDepth = true;
    this.retro = new ShaderPass(RetroShader);
    this.retro.enabled = retro;
    for (const p of [this.worldPass, this.weaponPass, new OutputPass(), this.retro]) this.composer.addPass(p);
  }

  setSize(w: number, h: number) {
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    // the dither works in blocks of about one CSS pixel, so it shows on dense screens too
    this.retro.uniforms.pixel.value = Math.max(1, Math.round(pr));
  }

  render(world: THREE.Scene, weapon: THREE.Scene | null) {
    this.worldPass.scene = world;
    this.weaponPass.enabled = !!weapon;
    if (weapon) this.weaponPass.scene = weapon;
    this.composer.render();
  }
}
