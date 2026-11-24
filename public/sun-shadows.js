import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Sun shadows for things standing beside the road, far outside the sun's
// shadow map (which covers only a few metres round the car): each is drawn
// again, flattened onto the ground along the sun's direction, translucent
// and dark. The stencil marks where shadow has been laid, so parts that
// overlap in the projection (and the traffic's shadows, which do the same)
// darken it only once.

// The projection onto the ground (y = h) along `sun` (pointing toward the
// sun), kept off the horizon so shadows stay a sensible length.
export function sunProjection(sun, target = new THREE.Matrix4(), h = 0.02) {
  const y = Math.max(0.22, sun.y);
  const kx = sun.x / y,
    kz = sun.z / y;
  return target.set(1, -kx, 0, kx * h, 0, 0, 0, h, 0, -kz, 1, kz * h, 0, 0, 0, 1);
}

export function shadowMaterial(name) {
  return new THREE.MeshBasicMaterial({
    name,
    color: 0x000000,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    // Flat or added on: one pass for both faces (three otherwise draws
    // a double-sided transparent material twice, re-checking its program
    // each time).
    forceSinglePass: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
}

// How dark the shadows are for the sun's `strength` (0–1).
export const shadowOpacity = (strength) => 0.5 * Math.max(0, Math.min(1, strength));

// The shadow of a group's meshes (in its own frame), added to the scene. Its
// `update(sun, strength)` lays it under the group as it stands now, on the
// ground (or `height` above it, on a paved slab).
// `select` picks the meshes that cast it (by default all but those marked
// noShadow).
export function groupShadow(
  scene,
  group,
  name,
  { height = 0.02, select = (o) => !o.userData.noShadow } = {}
) {
  group.updateMatrixWorld(true);
  const toGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const pieces = [];
  group.traverse((o) => {
    if (!o.isMesh || o.material?.transparent || !select(o)) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(toGroup, o.matrixWorld)
    );
    for (const key of Object.keys(g.attributes)) if (key !== 'position') g.deleteAttribute(key);
    pieces.push(g);
  });
  const material = shadowMaterial(name);
  const mesh = new THREE.Mesh(mergeGeometries(pieces, false), material);
  for (const g of pieces) g.dispose();
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  const projection = new THREE.Matrix4();
  return {
    mesh,
    update(sun, strength) {
      mesh.visible = Boolean(sun) && strength > 0.02;
      if (!mesh.visible) return;
      material.opacity = shadowOpacity(strength);
      group.updateMatrixWorld();
      mesh.matrix.multiplyMatrices(sunProjection(sun, projection, height), group.matrixWorld);
      mesh.matrixWorld.copy(mesh.matrix);
    },
  };
}
