import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Joins the meshes under `root` that never move, and share a material, into
// one mesh per material: the cabin is some two hundred small parts (switches,
// seams, vents), each a draw call of its own every frame. Meshes under
// `keep` (and any with userData.keep, or under a group with it: parts that
// move, like the wipers) stay as they are. Returns the number of
// meshes before and after.
export function mergeStaticMeshes(root, keep = []) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const kept = new Set();
  for (const object of keep) object?.traverse((o) => kept.add(o));
  const groups = new Map();
  let before = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    before++;
    if (
      kept.has(o) ||
      o.userData.keep ||
      o.isInstancedMesh ||
      o.isSkinnedMesh ||
      Array.isArray(o.material) ||
      // Transparent parts are sorted one by one; joined, they would not be.
      o.material.transparent ||
      o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ||
      Object.keys(o.geometry.morphAttributes).length
    )
      return;
    for (let p = o; p && p !== root; p = p.parent) if (!p.visible || p.userData.keep) return;
    const g = o.geometry;
    const layout = Object.entries(g.attributes)
      .map(([name, a]) => `${name}${a.itemSize}${a.normalized ? 'n' : ''}`)
      .sort()
      .join(',');
    const key = [
      o.material.uuid,
      layout,
      g.index ? 'indexed' : 'plain',
      o.castShadow,
      o.receiveShadow,
      o.renderOrder,
      o.frustumCulled,
    ].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  const matrix = new THREE.Matrix4();
  const removed = new Set(),
    added = [];
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone();
      matrix.multiplyMatrices(toRoot, mesh.matrixWorld);
      geometry.applyMatrix4(matrix);
      // A mirrored part's triangles turn the other way: turn them back.
      if (matrix.determinant() < 0) flipWinding(geometry);
      return geometry;
    });
    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!merged) continue;
    const first = meshes[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.name = `Merged ${first.material.name || 'cabin parts'}`;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.frustumCulled = first.frustumCulled;
    for (const m of meshes) removed.add(m);
    added.push(mesh);
  }
  // A joined mesh's own children that stay apart (a headliner laid on a
  // pillar's trim) move to the root, where they stand as before, rather than
  // leaving with it.
  for (const m of removed) {
    for (const child of [...m.children]) if (!removed.has(child)) root.attach(child);
    m.removeFromParent();
  }
  for (const mesh of added) root.add(mesh);
  let after = 0;
  root.traverse((o) => o.isMesh && after++);
  return { before, after };
}

function flipWinding(geometry) {
  if (geometry.index) {
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const t = index[i + 1];
      index[i + 1] = index[i + 2];
      index[i + 2] = t;
    }
    geometry.index.needsUpdate = true;
    return;
  }
  for (const attribute of Object.values(geometry.attributes)) {
    const { array, itemSize } = attribute;
    for (let v = 0; v < attribute.count; v += 3)
      for (let k = 0; k < itemSize; k++) {
        const a = (v + 1) * itemSize + k,
          b = (v + 2) * itemSize + k;
        const t = array[a];
        array[a] = array[b];
        array[b] = t;
      }
    attribute.needsUpdate = true;
  }
}
