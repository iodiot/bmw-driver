import * as THREE from 'three';
import { roundedBlock } from './door-trim.js';

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

// The F10's interior mirror glass, centred: a straight lower edge, a top
// edge arched over the middle and ends leaning in toward the top, with
// tight lower corners and broad upper ones (after photographs of part
// 51169320305).
export function f10MirrorOutline(w, h) {
  const a = w / 2,
    b = -h / 2,
    t = h / 2,
    end = t - 0.16 * h;
  const v = (x, y) => new THREE.Vector2(x, y);
  const right = [
    ...new THREE.LineCurve(v(0, b), v(a - 0.2 * h, b)).getPoints(1),
    ...new THREE.QuadraticBezierCurve(v(a - 0.2 * h, b), v(a, b), v(a - 0.01 * h, b + 0.24 * h))
      .getPoints(8)
      .slice(1),
    // The end, turning smoothly into the arch.
    ...new THREE.CubicBezierCurve(
      v(a - 0.01 * h, b + 0.24 * h),
      v(a - 0.03 * h, b + 0.55 * h),
      v(a - 0.19 * h, end - 0.11 * h),
      v(a - 0.55 * h, end)
    )
      .getPoints(10)
      .slice(1),
    ...new THREE.QuadraticBezierCurve(v(a - 0.55 * h, end), v(a * 0.45, t), v(0, t))
      .getPoints(16)
      .slice(1),
  ];
  const left = right
    .slice(1, -1)
    .reverse()
    .map((p) => v(-p.x, p.y));
  return new THREE.Shape([...right, ...left]);
}

// The model's angular rear-view mirror housing and stem, in its interior
// mesh, replaced by a smooth one.
export function isOldRearMirrorTriangle(a, b, c, meshName) {
  if (meshName !== 'Object_53') return false;
  const x = (a.x + b.x + c.x) / 3,
    y = (a.y + b.y + c.y) / 3,
    z = Math.abs((a.z + b.z + c.z) / 3);
  return x > 0.35 && x < 0.56 && y > 0.59 && y < 0.725 && z < 0.14;
}
const mirrorFar = 700;
// Frames between updates of each door mirror. Seen close, from the driver's
// seat, they update every other frame (the two in turn, one extra scene
// render per frame); small in the chase view, every eighth.
let mirrorInterval = 2;
export function setMirrorInterval(frames) {
  mirrorInterval = Math.max(2, Math.round(frames));
}

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
      // As far as the main camera: the sky sphere (630 m) lies beyond a
      // nearer plane, which left the sky black in the mirror.
      mirrorFar
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
      if ((draws++ + turn) % mirrorInterval) return;
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

// The rear-view mirror inside, in the model's mirror housing (whose glass
// side is open). The glass sits on the housing's rear face and shows the view
// straight back through the rear window, as a mirror aimed by the driver
// does. The model's cabin is low, so from the mirror itself the rear
// headrests and bench would fill the view: its camera sits behind them, at
// the rear window. It draws only while in view (from the driver's seat),
// every third frame.
export const rearViewMirror = Object.freeze({
  centre: Object.freeze([0.372, 0.63, 0]),
  camera: Object.freeze([-1, 0.66, 0]),
  // Glass size; a thin black rim runs round it.
  width: 0.255,
  height: 0.066,
  rim: 0.005,
  // Where its stem meets the roof lining.
  mount: Object.freeze([0.43, 0.728]),
  fov: 15,
  down: 3,
});

export function setupRearViewMirror(rig, { resolution = 384 } = {}) {
  const { width, height, centre, fov, down } = rearViewMirror;
  const aspect = width / height;
  const target = new THREE.WebGLRenderTarget(resolution, Math.round(resolution / aspect), {
    type: THREE.HalfFloatType,
  });
  const geometry = new THREE.ShapeGeometry(f10MirrorOutline(width, height));
  // Uvs across the glass, reversed left to right as a mirror shows it.
  const position = geometry.attributes.position,
    uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, 0.5 - position.getX(i) / width, 0.5 + position.getY(i) / height);
  const mirror = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ map: target.texture, color: 0xcfd2d5, fog: false })
  );
  mirror.name = 'Rear-view mirror';
  const centrePoint = new THREE.Vector3(...centre);
  mirror.position.copy(centrePoint);
  // Facing the driver (backward, -x).
  mirror.rotation.y = -Math.PI / 2;
  rig.body.add(mirror);
  // Its smooth housing behind the glass, the stem and the base on the roof
  // lining: always shown (only the glass's reflection is limited to the
  // driver's view).
  const plastic = new THREE.MeshStandardMaterial({
    name: 'Mirror housing',
    color: 0x111215,
    roughness: 0.45,
  });
  // The housing: the glass outline with a rounded rim, its back domed.
  const depth = 0.02,
    back = 0.012;
  const housingGeometry = new THREE.ExtrudeGeometry(f10MirrorOutline(width, height), {
    depth,
    bevelEnabled: true,
    bevelSize: rearViewMirror.rim,
    bevelThickness: back,
    bevelSegments: 5,
    curveSegments: 4,
  });
  // Its face just behind the glass (local +z faces the driver).
  housingGeometry.translate(0, 0, -(depth + back + 0.0015));
  const housing = new THREE.Mesh(housingGeometry, plastic);
  housing.position.copy(centrePoint);
  housing.rotation.y = -Math.PI / 2;
  housing.name = 'Rear-view mirror housing';
  const [mx, my] = rearViewMirror.mount;
  const stemFrom = new THREE.Vector3(centre[0] + 0.028, centre[1] + 0.03, 0),
    stemTo = new THREE.Vector3(mx, my - 0.008, 0);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.01, stemFrom.distanceTo(stemTo), 14),
    plastic
  );
  stem.position.copy(stemFrom).add(stemTo).multiplyScalar(0.5);
  stem.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    stemTo.clone().sub(stemFrom).normalize()
  );
  stem.name = 'Rear-view mirror stem';
  const base = new THREE.Mesh(roundedBlock(0.075, 0.02, 0.09, 0.008), plastic);
  base.position.set(mx, my, 0);
  base.name = 'Rear-view mirror base';
  rig.body.add(housing, stem, base);
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.05, mirrorFar);
  camera.name = 'Rear-view mirror camera';
  camera.position.fromArray(rearViewMirror.camera);
  const pitch = (down * Math.PI) / 180;
  camera.lookAt(
    camera.position.clone().add(new THREE.Vector3(-Math.cos(pitch), -Math.sin(pitch), 0))
  );
  rig.body.add(camera);
  let draws = 0;
  mirror.onBeforeRender = (renderer, scene) => {
    if (renderingMirror || draws++ % 3) return;
    renderingMirror = true;
    const previousTarget = renderer.getRenderTarget(),
      shadowUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    mirror.visible = false;
    camera.updateMatrixWorld();
    renderer.setRenderTarget(target);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, camera);
    mirror.visible = true;
    renderer.shadowMap.autoUpdate = shadowUpdate;
    renderer.setRenderTarget(previousTarget);
    renderingMirror = false;
  };
  return { mirror, camera };
}
