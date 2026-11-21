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

// Black wheel-arch liners. The model has none, so when a wheel dropped into
// a hollow the gap above the tyre showed the grass behind the car. Each liner
// is an open arc behind the tyre with a wall on its inner side, fixed to the
// body like the arch itself.
// Undertray panels (from x, to x, half width) in body space, kept between
// the tyres, and their height (the body sits 0.55 m up in the rig).
export const archLinerLayout = Object.freeze({
  underbody: Object.freeze([Object.freeze([-2.25, 2.2, 0.6]), Object.freeze([-1.05, 1.05, 0.88])]),
});
const underbodyHeight = -0.37;
export function addArchLiners(rig) {
  const material = new THREE.MeshStandardMaterial({
    name: 'Wheel arch liner',
    color: 0x0b0b0c,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  // Radians below the horizontal at the front and back of the arc: the arch
  // lip ends about there, so a longer arc showed as a black plate beside the
  // tyre, below the bodywork.
  const reach = 0.1;
  const liners = rig.wheels.map((w) => {
    const side = Math.sign(w.z) || 1,
      radius = w.r + 0.045,
      width = 0.24;
    const group = new THREE.Group();
    group.name = `Arch liner ${w.name}`;
    // Body space: the body sits 0.55 m up in the rig.
    group.position.set(w.x, w.y - 0.55, w.z - side * 0.04);
    const arc = new THREE.Mesh(
      new THREE.CylinderGeometry(
        radius,
        radius,
        width,
        28,
        1,
        true,
        Math.PI / 2 - reach,
        Math.PI + 2 * reach
      ).rotateX(Math.PI / 2),
      material
    );
    const wall = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 28, -reach, Math.PI + 2 * reach),
      material
    );
    wall.position.z = -side * (width / 2);
    // They close the arches for the sun too: open arches let light through
    // under the car, a bright crescent in its shadow by each wheel.
    arc.castShadow = wall.castShadow = true;
    group.add(arc, wall);
    rig.body.add(group);
    return group;
  });
  // The model has no floor pan, so its shadow had gaps where sunlight passed
  // under the sills and between the wheels. A black undertray, between the
  // tyres and inside the sills, closes it and darkens the underside seen
  // from a low camera.
  const { underbody } = archLinerLayout;
  const under = new THREE.Group();
  under.name = 'Undertray';
  for (const [fromX, toX, halfWidth] of underbody) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(toX - fromX, halfWidth * 2), material);
    plate.rotation.x = -Math.PI / 2;
    plate.position.set((fromX + toX) / 2, underbodyHeight, 0);
    plate.castShadow = true;
    plate.name = 'Undertray panel';
    under.add(plate);
  }
  // Light still slipped through the gaps round the tyres into the shadow, a
  // thin bright arc by each wheel. A shadow-only plate over the car's whole
  // footprint closes them: it writes no colour or depth, so it is never
  // seen, but the shadow pass draws it.
  const blocker = new THREE.Mesh(
    new THREE.PlaneGeometry(4.7, 1.8),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  );
  blocker.rotation.x = -Math.PI / 2;
  // Low, near the real car's ground clearance, so little light slips under
  // the sills from the side.
  blocker.position.set(-0.03, -0.45, 0);
  blocker.castShadow = true;
  blocker.name = 'Shadow blocker';
  under.add(blocker);
  rig.body.add(under);
  return { liners, under };
}

// The rear window's heating grid: thin dark lines across the glass with a
// bus bar down each side, on its inner face, as on the real car. Laid on a
// copy of the glass's own triangles (body space), seen faintly from outside
// and from the cabin.
export const rearDefroster = Object.freeze({
  // The rear window's extent on the model.
  from: Object.freeze({ x: -1.95, y: 0.47, z: 0.68 }),
  to: Object.freeze({ x: -1.15, y: 0.8 }),
  lines: 15,
  opacity: 0.55,
});

function defrosterTexture() {
  const width = 256,
    height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.strokeStyle = '#fff';
  // Heating lines from just above the bottom edge to below the third brake
  // light, between the bus bars.
  g.lineWidth = 2;
  for (let i = 0; i < rearDefroster.lines; i++) {
    const y = height * (0.16 + (0.66 * i) / (rearDefroster.lines - 1));
    g.beginPath();
    g.moveTo(width * 0.06, y);
    g.lineTo(width * 0.94, y);
    g.stroke();
  }
  g.lineWidth = 5;
  for (const x of [0.06, 0.94]) {
    g.beginPath();
    g.moveTo(width * x, height * 0.14);
    g.lineTo(width * x, height * 0.84);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

export function addRearDefroster(rig) {
  const glass = rig.body.getObjectByName('Object_49');
  if (!glass?.isMesh) return null;
  rig.body.updateMatrixWorld(true);
  const toBody = new THREE.Matrix4()
    .copy(rig.body.matrixWorld)
    .invert()
    .multiply(glass.matrixWorld);
  const position = glass.geometry.attributes.position,
    index = glass.geometry.index,
    count = index ? index.count : position.count;
  const { from, to } = rearDefroster;
  const points = [],
    uvs = [],
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    normal = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
    a.fromBufferAttribute(position, ids[0]).applyMatrix4(toBody);
    b.fromBufferAttribute(position, ids[1]).applyMatrix4(toBody);
    c.fromBufferAttribute(position, ids[2]).applyMatrix4(toBody);
    new THREE.Triangle(a, b, c).getNormal(normal);
    const cx = (a.x + b.x + c.x) / 3,
      cy = (a.y + b.y + c.y) / 3;
    // Rear-facing glass behind the C-pillars.
    if (cx > -1.2 || cy < 0.4 || Math.abs(normal.x) < 0.3) continue;
    // On the inner face: a couple of millimetres into the car.
    const inward = normal.x < 0 ? normal.clone().negate() : normal.clone();
    for (const p of [a, b, c]) {
      const q = p.clone().addScaledVector(inward, 0.003);
      points.push(q.x, q.y, q.z);
      uvs.push((q.z + from.z) / (2 * from.z), (q.y - from.y) / (to.y - from.y));
    }
  }
  if (!points.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      name: 'Rear window heating grid',
      color: 0x1d1611,
      alphaMap: defrosterTexture(),
      transparent: true,
      opacity: rearDefroster.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  mesh.name = 'Rear window heating grid';
  mesh.renderOrder = 2;
  rig.body.add(mesh);
  return mesh;
}
