import * as THREE from 'three';

// Working door mirrors. The model's mirror glass is chrome triangles in each
// mirror head; they are replaced by one flat glass of the same outline that
// shows a live rear view. Like real (convex) door mirrors, the view is wide:
// a camera at the glass looks back along the car, turned slightly outward,
// so the mirror shows the lanes behind and a sliver of the car's own flank
// whatever the viewing position.
export const mirrorSearch = Object.freeze({
  material: 'Chrome',
  // Body-space box around each mirror head (x forward, y up, |z| outward).
  box: { minX: 0.45, maxX: 0.75, minY: 0.35, maxY: 0.55, minZ: 0.86, maxZ: 1.12 },
});

// Splits rear-facing triangles of the mirror heads by side, in body space.
export function findMirrorGlass(body) {
  body.updateMatrixWorld(true);
  const toBody = new THREE.Matrix4().copy(body.matrixWorld).invert();
  const sides = { left: [], right: [] },
    found = new Map(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    matrix = new THREE.Matrix4();
  const { box } = mirrorSearch;
  body.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material?.name !== mirrorSearch.material) return;
    matrix.multiplyMatrices(toBody, mesh.matrixWorld);
    const position = mesh.geometry.attributes.position,
      index = mesh.geometry.index,
      count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
      a.fromBufferAttribute(position, ids[0]).applyMatrix4(matrix);
      b.fromBufferAttribute(position, ids[1]).applyMatrix4(matrix);
      c.fromBufferAttribute(position, ids[2]).applyMatrix4(matrix);
      const cx = (a.x + b.x + c.x) / 3,
        cy = (a.y + b.y + c.y) / 3,
        cz = (a.z + b.z + c.z) / 3;
      if (cx < box.minX || cx > box.maxX || cy < box.minY || cy > box.maxY) continue;
      if (Math.abs(cz) < box.minZ || Math.abs(cz) > box.maxZ) continue;
      new THREE.Triangle(a, b, c).getNormal(normal);
      if (!found.has(mesh)) found.set(mesh, { glass: [], edge: [] });
      // All chrome in the mirror head is glass: the flat part faces rearward,
      // the curved rim turns sideways. Both become part of the flat mirror,
      // so it fills the whole opening.
      sides[cz > 0 ? 'left' : 'right'].push({
        points: [a.clone(), b.clone(), c.clone()],
        rear: normal.x < -0.5,
      });
      found.get(mesh).glass.push(i);
    }
  });
  return { ...sides, found };
}

// Splits a mesh's triangles in one pass over its original index: the glass
// is dropped (the flat mirror replaces it) and the bevel is returned for a
// dark, matte edge mesh; everything else stays.
function splitMirrorTriangles(mesh, glassStarts, edgeStarts) {
  const geometry = mesh.geometry,
    index = geometry.index,
    count = index ? index.count : geometry.attributes.position.count;
  const vertex = (i) => (index ? index.getX(i) : i);
  const glass = new Set(glassStarts),
    edge = new Set(edgeStarts),
    kept = [],
    bevel = [];
  for (let i = 0; i < count; i += 3) {
    if (glass.has(i)) continue;
    (edge.has(i) ? bevel : kept).push(vertex(i), vertex(i + 1), vertex(i + 2));
  }
  geometry.setIndex(kept);
  return bevel;
}

// A flat geometry in the mirror's plane (local +z is the mirror normal) and
// the transform that places it on the body.
export function mirrorPlane(triangles) {
  const centre = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    edge = new THREE.Vector3();
  let points = 0;
  for (const { points: triangle, rear } of triangles) {
    for (const p of triangle) {
      centre.add(p);
      points++;
    }
    // The flat, rear-facing glass sets the mirror's plane.
    if (!rear) continue;
    const area = new THREE.Triangle(...triangle);
    area.getNormal(edge);
    normal.addScaledVector(edge, area.getArea());
  }
  centre.divideScalar(points);
  normal.normalize();
  const xAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize(),
    yAxis = new THREE.Vector3().crossVectors(normal, xAxis);
  const positions = [];
  for (const { points: triangle } of triangles)
    for (const p of triangle) {
      edge.subVectors(p, centre);
      positions.push(edge.dot(xAxis), edge.dot(yAxis), 0);
    }
  // Texture coordinates over the glass's extent. The rear view is flipped
  // left to right, as a mirror shows it.
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
  }
  const uvs = [];
  for (let i = 0; i < positions.length; i += 3)
    uvs.push((maxX - positions[i]) / (maxX - minX), (positions[i + 1] - minY) / (maxY - minY));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xAxis, yAxis, normal)
  );
  // A hair in front of the chrome, so the reflection covers it cleanly.
  return {
    geometry,
    position: centre.addScaledVector(normal, 0.0015),
    quaternion,
    normal,
    aspect: (maxX - minX) / (maxY - minY),
  };
}

// Rear view: horizontal field of view, outward turn and downward tilt.
export const mirrorView = Object.freeze({ fov: 42, outward: 9, down: 3 });

// Direction a mirror camera looks, in body space (x forward, y up, z left):
// backward, turned outward to the mirror's side and tilted slightly down.
export function mirrorDirection(side) {
  const yaw = (mirrorView.outward * Math.PI) / 180,
    pitch = (mirrorView.down * Math.PI) / 180;
  return new THREE.Vector3(
    -Math.cos(yaw) * Math.cos(pitch),
    -Math.sin(pitch),
    side * Math.sin(yaw) * Math.cos(pitch)
  );
}

let renderingMirror = false;

export function setupMirrors(rig, { resolution = 512 } = {}) {
  const { found, ...sides } = findMirrorGlass(rig.body);
  const mirrors = [];
  const bevel = new THREE.MeshStandardMaterial({
    name: 'Mirror glass edge',
    color: 0x16191c,
    metalness: 0.2,
    roughness: 0.45,
  });
  for (const [mesh, { glass, edge }] of found) {
    const edgeIndex = splitMirrorTriangles(mesh, glass, edge);
    if (!edgeIndex.length) continue;
    const geometry = mesh.geometry.clone();
    geometry.setIndex(edgeIndex);
    const edgeMesh = new THREE.Mesh(geometry, bevel);
    edgeMesh.name = 'Door mirror glass edges';
    mesh.add(edgeMesh);
  }
  for (const [name, triangles] of Object.entries(sides)) {
    if (triangles.length < 2) continue;
    const { geometry, position, quaternion, normal, aspect } = mirrorPlane(triangles);
    const target = new THREE.WebGLRenderTarget(resolution, Math.round(resolution / aspect), {
      type: THREE.HalfFloatType,
    });
    // Mirror glass reflects a little less than all the light.
    const mirror = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ map: target.texture, color: 0xd8dadc, fog: false })
    );
    mirror.name = `Door mirror ${name}`;
    mirror.position.copy(position);
    mirror.quaternion.copy(quaternion);
    rig.body.add(mirror);
    const side = name === 'left' ? 1 : -1,
      horizontal = (mirrorView.fov * Math.PI) / 180;
    const camera = new THREE.PerspectiveCamera(
      (2 * Math.atan(Math.tan(horizontal / 2) / aspect) * 180) / Math.PI,
      aspect,
      0.05,
      // Fog hides the road long before this; a nearer far plane culls more.
      300
    );
    camera.name = `Door mirror ${name} camera`;
    // Just behind the glass, looking back along the car.
    camera.position.copy(position).addScaledVector(normal, 0.01);
    const direction = mirrorDirection(side);
    camera.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(
        camera.position,
        camera.position.clone().add(direction),
        new THREE.Vector3(0, 1, 0)
      )
    );
    rig.body.add(camera);
    // Render the rear view when the mirror itself is about to be drawn, so a
    // mirror off screen costs nothing.
    // Each mirror updates every other frame, the two in turn, so together
    // they cost one extra scene render per frame instead of two.
    const turn = mirrors.length;
    let draws = 0;
    mirror.onBeforeRender = (renderer, scene) => {
      if (renderingMirror) return;
      if ((draws++ + turn) % 2) return;
      renderingMirror = true;
      const previousTarget = renderer.getRenderTarget(),
        shadowUpdate = renderer.shadowMap.autoUpdate,
        xr = renderer.xr.enabled;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      mirror.visible = false;
      camera.updateMatrixWorld();
      renderer.setRenderTarget(target);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, camera);
      mirror.visible = true;
      renderer.xr.enabled = xr;
      renderer.shadowMap.autoUpdate = shadowUpdate;
      renderer.setRenderTarget(previousTarget);
      renderingMirror = false;
    };
    mirrors.push(mirror);
  }
  return { mirrors };
}
