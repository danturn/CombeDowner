// Figures (cats, naughty boys) are built from lots of little shapes, each in a colour of its own:
// drawn one by one, a figure cost dozens of draws. bake welds the shapes that move together (the
// children of one joint) into as few meshes as it can: the plain-coloured ones into one, painted
// in their own colours, those that cast a shadow into another, and anything with a material of its
// own (glowing eyes, shiny gold) with the rest of its kind. It looks just the same, and it's drawn
// on everyone's screen alike, so it has nothing to do with the network.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const PAINTED = new THREE.MeshLambertMaterial({ vertexColors: true });

const plain = (m: THREE.Material): m is THREE.MeshLambertMaterial => {
  const l = m as THREE.MeshLambertMaterial;
  return l.type === "MeshLambertMaterial" && !l.map && !l.transparent && l.opacity === 1 && l.side === THREE.FrontSide
    && l.emissive.getHex() === 0 && !l.alphaTest && l.visible;
};

/** Weld part's own shapes (its children that are meshes; not its joints) into as few as it can. */
export function bake(part: THREE.Object3D) {
  const groups = new Map<string, THREE.Mesh[]>();
  for (const c of part.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || !m.visible || Array.isArray(m.material) || m.children.length || (m as THREE.InstancedMesh).isInstancedMesh) continue;
    const k = (plain(m.material) ? "paint" : m.material.uuid) + m.castShadow + m.receiveShadow + m.renderOrder;
    groups.get(k)?.push(m) ?? groups.set(k, [m]);
  }
  for (const ms of groups.values()) {
    if (ms.length < 2) continue;
    const painted = plain(ms[0].material as THREE.Material);
    const geos = ms.map((m) => {
      m.updateMatrix();
      const g = (m.geometry.index ? m.geometry : m.geometry.toNonIndexed()).clone().applyMatrix4(m.matrix);
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
      if (painted) {
        const col = (m.material as THREE.MeshLambertMaterial).color, n = g.attributes.position.count, a = new Float32Array(3 * n);
        for (let i = 0; i < n; i++) { a[3 * i] = col.r; a[3 * i + 1] = col.g; a[3 * i + 2] = col.b; }
        g.setAttribute("color", new THREE.BufferAttribute(a, 3));
      }
      return g;
    });
    const merged = geos.every((g) => g.index) || geos.every((g) => !g.index) ? mergeGeometries(geos) : null;
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const one = new THREE.Mesh(merged, painted ? PAINTED : ms[0].material);
    one.castShadow = ms[0].castShadow; one.receiveShadow = ms[0].receiveShadow; one.renderOrder = ms[0].renderOrder;
    one.userData.baked = ms;
    for (const m of ms) part.remove(m);
    part.add(one);
  }
}

/** Put every welded part under root back as the shapes it was made from (for fading a figure out,
 *  where each shape has to be see-through on its own). */
export function unbake(root: THREE.Object3D) {
  const baked: THREE.Mesh[] = [];
  root.traverse((o) => { if (o.userData.baked) baked.push(o as THREE.Mesh); });
  for (const b of baked) {
    const p = b.parent!;
    for (const m of b.userData.baked as THREE.Mesh[]) p.add(m);
    // (paint stuck on it since sits where the part is, the welded mesh being where its part is)
    for (const c of [...b.children]) p.add(c);
    p.remove(b);
    b.geometry.dispose();
  }
}

/** Let go of the welded shapes under root (before it's dressed afresh). */
export function dropBaked(root: THREE.Object3D) {
  root.traverse((o) => { if (o.userData.baked) (o as THREE.Mesh).geometry.dispose(); });
}
