import * as THREE from 'three';

// The downloaded asset groups all four wheels into one textured mesh.
// Split that mesh without changing the original GLB, UVs or authored normals.
export function rigDownloadedCar(source) {
  const normalized = new THREE.Group();
  normalized.add(source);
  normalized.rotation.y = -Math.PI / 2;
  normalized.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(normalized);
  normalized.scale.setScalar(4.91 / (box.max.x - box.min.x));
  normalized.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(normalized);
  const centre = box.getCenter(new THREE.Vector3());
  normalized.position.set(-centre.x, -box.min.y, -centre.z);
  normalized.updateMatrixWorld(true);
  const wheelMesh = source.getObjectByName('Object_45');
  if (!wheelMesh?.isMesh) throw new Error('Wheel geometry was not found in the model.');
  const baked = wheelMesh.geometry.clone().applyMatrix4(wheelMesh.matrixWorld);
  const pos = baked.getAttribute('position'),
    index = baked.index;
  const triangles = [[], [], [], []],
    v = new THREE.Vector3();
  const count = index?.count ?? pos.count;
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
    let x = 0,
      z = 0;
    for (const id of ids) {
      x += pos.getX(id);
      z += pos.getZ(id);
    }
    triangles[(x > 0 ? 0 : 2) + (z > 0 ? 0 : 1)].push(...ids);
  }
  const names = ['Steering_Left', 'Steering_Right', 'Rear_mount_Left', 'Rear_mount_Right'];
  const root = new THREE.Group();
  root.name = 'BMW M5 F10 driving rig';
  const body = new THREE.Group();
  body.name = 'Suspended body';
  body.position.y = 0.55;
  root.add(body);
  const wheels = triangles.map((ids, i) => {
    if (!ids.length) throw new Error('Unable to separate all four wheels.');
    const geometry = new THREE.BufferGeometry();
    // Copy all vertex attributes, including the original texture coordinates.
    for (const [name, attribute] of Object.entries(baked.attributes)) {
      const values = new attribute.array.constructor(ids.length * attribute.itemSize);
      for (let j = 0; j < ids.length; j++)
        for (let k = 0; k < attribute.itemSize; k++)
          values[j * attribute.itemSize + k] = attribute.array[ids[j] * attribute.itemSize + k];
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized)
      );
    }
    geometry.computeBoundingBox();
    const hub = geometry.boundingBox.getCenter(v).clone(),
      size = geometry.boundingBox.getSize(new THREE.Vector3());
    const radius = (size.x + size.y) / 4;
    if (radius < 0.2 || radius > 0.4 || size.z > 0.4)
      throw new Error('Unexpected wheel dimensions.');
    geometry.translate(-hub.x, -hub.y, -hub.z);
    geometry.computeBoundingSphere();
    const mount = new THREE.Group();
    mount.name = names[i];
    mount.position.copy(hub);
    root.add(mount);
    const spin = new THREE.Group();
    spin.name = 'Wheel_spin_' + names[i];
    mount.add(spin);
    const mesh = new THREE.Mesh(geometry, wheelMesh.material);
    mesh.name = names[i] + '_geometry';
    spin.add(mesh);
    return {
      name: names[i],
      x: hub.x,
      y: hub.y,
      z: hub.z,
      r: radius,
      mount,
      spin,
      front: i < 2,
      triangles: ids.length / 3,
    };
  });
  wheelMesh.removeFromParent();
  baked.dispose();
  body.add(normalized);
  normalized.position.y -= 0.55;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  return { root, body, wheels, dimensions: box.getSize(new THREE.Vector3()) };
}
