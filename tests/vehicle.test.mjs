import assert from 'node:assert/strict';
import { straightTestTrack } from '../public/road-profile.js';
import fs from 'node:fs';
import * as THREE from '../node_modules/three/build/three.module.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { rigDownloadedCar } from '../public/vehicle-rig.js';
import { DrivingSimulation } from '../public/driving-physics.js';
import { setupBrakeLights } from '../public/brake-lights.js';
import { setupHeadlights } from '../public/headlights.js';
import { exhaustOutlets } from '../public/exhaust.js';
import { setupBodyWater } from '../public/body-water.js';
import { setupWipers, wiperSpecs, wiperPose } from '../public/wipers.js';
import { setupBrakes } from '../public/brakes.js';

// Geometry-only loading in Node: the browser verifies the original textures.
const bytes = fs.readFileSync(new URL('../public/assets/bmw-m5-f10.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12),
  json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binaryOffset = 20 + jsonLength + 8;
json.buffers = [
  {
    byteLength: json.buffers[0].byteLength,
    uri: 'data:application/octet-stream;base64,' + bytes.subarray(binaryOffset).toString('base64'),
  },
];
json.materials = json.materials.map((m) => ({ name: m.name }));
delete json.images;
delete json.textures;
delete json.samplers;
globalThis.ProgressEvent ??= class {
  constructor(type, values) {
    Object.assign(this, { type }, values);
  }
};
const asset = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
let vertexId = 0;
asset.scene.traverse((o) => {
  if (o.isMesh) {
    const n = o.geometry.attributes.position.count;
    o.geometry.setAttribute(
      'sourceVertex',
      new THREE.Float32BufferAttribute(
        Array.from({ length: n }, () => vertexId++),
        1
      )
    );
  }
});
function snapshot(root) {
  root.updateMatrixWorld(true);
  const topology = [],
    vertices = new Map(),
    v = new THREE.Vector3(),
    normal = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry,
      p = g.attributes.position,
      n = g.attributes.normal,
      uv = g.attributes.uv,
      nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < (g.index?.count ?? p.count); i++) {
      const j = g.index ? g.index.getX(i) : i;
      v.fromBufferAttribute(p, j).applyMatrix4(o.matrixWorld);
      normal.fromBufferAttribute(n, j).applyNormalMatrix(nm);
      const id = g.attributes.sourceVertex.getX(j);
      topology.push(id);
      vertices.set(id, [...v.toArray(), ...normal.toArray(), uv.getX(j), uv.getY(j)]);
    }
  });
  const faces = [];
  for (let i = 0; i < topology.length; i += 3) faces.push(topology.slice(i, i + 3).join(','));
  return { faces: faces.sort(), vertices };
}
const original = new THREE.Group();
original.rotation.y = -Math.PI / 2;
original.add(asset.scene.clone(true));
original.updateMatrixWorld(true);
let box = new THREE.Box3().setFromObject(original);
original.scale.setScalar(4.91 / (box.max.x - box.min.x));
original.updateMatrixWorld(true);
box = new THREE.Box3().setFromObject(original);
original.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
const before = snapshot(original),
  rig = rigDownloadedCar(asset.scene),
  after = snapshot(rig.root);
const tailpipeMesh = rig.root.getObjectByName('Object_43');
rig.root.updateMatrixWorld(true);
const tailpipeVertex = new THREE.Vector3();
for (const outlet of exhaustOutlets) {
  const centre = new THREE.Vector3(...outlet);
  let nearest = Infinity;
  for (let i = 0; i < tailpipeMesh.geometry.attributes.position.count; i++) {
    tailpipeVertex
      .fromBufferAttribute(tailpipeMesh.geometry.attributes.position, i)
      .applyMatrix4(tailpipeMesh.matrixWorld);
    nearest = Math.min(nearest, tailpipeVertex.distanceTo(centre));
  }
  assert.ok(nearest < 0.012, 'Exhaust emitter must match the actual tailpipe opening');
}
assert.deepEqual(after.faces, before.faces, 'Triangle topology and winding must be preserved');
assert.equal(after.vertices.size, before.vertices.size);
for (const [id, expected] of before.vertices) {
  const actual = after.vertices.get(id);
  for (let k = 0; k < 8; k++)
    assert.ok(
      Math.abs(actual[k] - expected[k]) < 1e-6,
      'Vertex positions, normals and UVs must be preserved within floating-point precision'
    );
}
const frontMaterial = rig.root.getObjectByName('Object_27').material;
const oldFrontIntensity = frontMaterial.emissiveIntensity;
const lightSource = rig.root.getObjectByName('Object_29').material;
// A sentinel texture verifies that cloning keeps the source LED map.
lightSource.emissiveMap = new THREE.Texture();
const lights = setupBrakeLights(rig),
  litGeometry = snapshot(rig.root);
assert.deepEqual(
  litGeometry.faces,
  after.faces,
  'Splitting rear lamps preserves triangle topology'
);
for (const [id, expected] of after.vertices)
  assert.deepEqual(
    litGeometry.vertices.get(id),
    expected,
    'Splitting rear lamps preserves positions, UVs and normals'
  );
assert.equal(lights.lamps.length, 2);
for (const lamp of lights.lamps) {
  assert.notEqual(lamp.material, frontMaterial);
  assert.equal(lamp.material.emissiveMap, lightSource.emissiveMap);
  assert.equal(lamp.geometry.index.count / 3, 40);
}
for (let i = 0; i < 30; i++) lights.update(1 / 60, true);
for (const lamp of lights.lamps)
  assert.ok(Math.abs(lamp.material.emissiveIntensity - lights.brake) < 1e-5);
assert.equal(
  frontMaterial.emissiveIntensity,
  oldFrontIntensity,
  'Brakes must not affect front headlights'
);
for (let i = 0; i < 30; i++) lights.update(1 / 60, false);
for (const lamp of lights.lamps)
  assert.ok(Math.abs(lamp.material.emissiveIntensity - lights.rest) < 1e-5);
console.log(
  'Brake lights: both rear lamps brighten and release, original LED mask retained, front lights unchanged.'
);
const headlights = setupHeadlights(rig);
headlights.setNight(false);
assert.equal(headlights.lit, false);
assert.equal(headlights.beams.visible, true, 'Unlit beams stay in the scene: no recompiles');
const dayIntensity = headlights.lens.material.emissiveIntensity;
headlights.setNight(true);
assert.equal(headlights.lit, true);
assert.ok(headlights.lens.material.emissiveIntensity > dayIntensity);
const projectors = headlights.beams.children.filter((o) => o.isSpotLight);
assert.equal(projectors.length, 2);
for (const light of projectors) {
  assert.ok(light.intensity > 0 && light.distance >= 40);
  assert.ok(light.target.position.x > light.position.x);
  assert.ok(light.target.position.y < light.position.y);
}
for (let i = 0; i < 30; i++) lights.update(1 / 60, false, true);
assert.ok(lights.lamps[0].material.emissiveIntensity > lights.rest);
for (let i = 0; i < 30; i++) lights.update(1 / 60, true, true);
assert.ok(Math.abs(lights.lamps[0].material.emissiveIntensity - lights.brake) < 1e-5);
headlights.setNight(false);
assert.equal(headlights.lit, false);
assert.equal(headlights.beams.visible, true, 'Unlit beams stay in the scene: no recompiles');
assert.equal(headlights.lens.material.emissiveIntensity, dayIntensity);
console.log(
  'Night: low beams aim down the road, switch off in daylight and preserve brake priority.'
);
const surfaceWater = setupBodyWater(rig);
assert.equal(surfaceWater.glassMeshes.length, 1, 'The source glass mesh must receive rain beads');
const glassPoints = surfaceWater.glassMeshes[0].geometry.attributes.waterPosition;
const windows = { windshield: 0, rear: 0, left: 0, right: 0, headlamps: 0 };
for (let i = 0; i < glassPoints.count; i++) {
  const x = glassPoints.getX(i),
    y = glassPoints.getY(i),
    z = glassPoints.getZ(i);
  const windowMask = y >= 0.3 && x < 1.4;
  if (x > 1.8) {
    assert.equal(windowMask, false);
    windows.headlamps++;
  }
  if (!windowMask) continue;
  if (x > 0.2 && Math.abs(z) < 0.5) windows.windshield++;
  if (x < -1.2 && Math.abs(z) < 0.5) windows.rear++;
  if (z > 0.75 && x > -1.1 && x < 0.5) windows.left++;
  if (z < -0.75 && x > -1.1 && x < 0.5) windows.right++;
}
assert.ok(
  Object.values(windows).every((count) => count > 0),
  'Wet-glass coverage must include front, rear and both sides while excluding headlamp lenses'
);
console.log(
  'Glass water: windshield, rear glass and both sides covered; headlamp lenses excluded.'
);
const glassGeometry = surfaceWater.glassMeshes[0].geometry;
const glassBefore = glassGeometry.attributes.position.array.slice();
const wipers = setupWipers(rig, surfaceWater);
const edgeCounts = new Map();
for (const triangle of wipers.surface.triangles) {
  for (let i = 0; i < 3; i++) {
    const ends = [triangle.uv[i], triangle.uv[(i + 1) % 3]];
    const key = ends
      .map((p) =>
        p
          .toArray()
          .map((v) => v.toFixed(5))
          .join(',')
      )
      .sort()
      .join(':');
    const edge = edgeCounts.get(key) ?? { ends, count: 0 };
    edge.count++;
    edgeCounts.set(key, edge);
  }
}
const boundary = [...edgeCounts.values()].filter((e) => e.count === 1);
function distanceToSegment(p, a, b) {
  const delta = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(delta) / delta.lengthSq(), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(delta, t));
}
for (let i = 0; i <= 200; i++) {
  const poses = wiperSpecs.map((spec) => wiperPose(spec, i / 200));
  for (const p of poses) {
    for (let j = 0; j <= 28; j++) {
      const uv = p.a.clone().lerp(p.b, j / 28);
      const contact = wipers.surface.sample(uv);
      assert.ok(contact, 'Every blade point must stay on the front glass for the entire stroke');
      const clearance = Math.min(...boundary.map(({ ends }) => distanceToSegment(uv, ...ends)));
      assert.ok(clearance > 0.012, 'Blade width must clear the glass border and pillars');
      const rubber = wipers.surface.sample(uv, 0.0014);
      assert.ok(Math.abs(rubber.point.distanceTo(contact.point) - 0.0014) < 1e-8);
    }
  }
  const [a, b] = poses;
  const distances = [
    distanceToSegment(a.a, b.a, b.b),
    distanceToSegment(a.b, b.a, b.b),
    distanceToSegment(b.a, a.a, a.b),
    distanceToSegment(b.b, a.a, a.b),
  ];
  const cross = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  assert.ok(
    cross(a.a, a.b, b.a) * cross(a.a, a.b, b.b) >= 0 ||
      cross(b.a, b.b, a.a) * cross(b.a, b.b, a.b) >= 0,
    'Blades must not intersect'
  );
  assert.ok(Math.min(...distances) > 0.03, 'Blades must stay separated throughout the stroke');
}
const marker = glassGeometry.attributes.waterWindscreen;
for (let i = 0; i < marker.count; i++)
  assert.equal(
    marker.getX(i),
    Number(wipers.surface.vertexIds.has(i)),
    'Only the front glass can be cleared; rear, side and headlamp glass remain untouched'
  );
const sampleWindshield = wipers.surface.sample.bind(wipers.surface);
let runtimeSamples = 0;
wipers.surface.sample = (...args) => {
  runtimeSamples++;
  return sampleWindshield(...args);
};
for (let i = 0; i < 70; i++) {
  wipers.update(1 / 60, { raining: true, speed: 20 });
  // The two bottom profile corners straddle the rubber's contact centre.
  for (const assembly of wipers.group.children) {
    const positions = assembly.children[2].geometry.attributes.position;
    for (let j = 0; j < positions.count; j += 4) {
      const centre = new THREE.Vector3().fromBufferAttribute(positions, j);
      centre.add(new THREE.Vector3().fromBufferAttribute(positions, j + 3)).multiplyScalar(0.5);
      const contact = sampleWindshield(wipers.surface.project(centre), 0.0014);
      assert.ok(
        contact && centre.distanceTo(contact.point) < 0.002,
        'Interpolated rubber must follow the glass within 2 mm throughout the stroke'
      );
    }
  }
}
assert.equal(runtimeSamples, 0, 'Rain frames must not resample windshield triangles');
assert.ok(wipers.motion.active && wipers.motion.sweep > 0);
assert.ok(
  wipers.mask.data.some((v) => v > 0),
  'The moving blades must write the cleaning mask'
);
const rainClock = wipers.mask.clock.value;
for (let i = 0; i < 180; i++) wipers.update(1 / 60, { raining: false, speed: 0 });
assert.equal(wipers.motion.active, false);
assert.equal(wipers.motion.sweep, 0);
assert.equal(
  wipers.mask.clock.value,
  rainClock,
  'Drops cannot regrow on cleared glass without rain'
);
wipers.group.traverse((part) => {
  if (part.isMesh) {
    assert.ok([...part.geometry.attributes.position.array].every(Number.isFinite));
    assert.ok([...part.geometry.attributes.normal.array].every(Number.isFinite));
  }
});
assert.deepEqual(
  glassGeometry.attributes.position.array,
  glassBefore,
  'Wipers preserve the imported glass'
);
console.log(
  'Wipers: 201 full-stroke positions clear the glass borders; blades stay separate, wipe only front glass, and park.'
);
assert.equal(rig.wheels.length, 4);
assert.equal(
  rig.wheels.reduce((sum, w) => sum + w.triangles, 0),
  4032
);
for (const w of rig.wheels) {
  assert.equal(w.triangles, 1008);
  assert.ok(Math.abs(w.y - w.r) < 1e-5);
  assert.ok(w.spin.children[0].geometry.attributes.uv);
  w.spin.rotation.z = Math.PI / 2;
}
rig.root.updateMatrixWorld(true);
for (const w of rig.wheels) {
  const b = new THREE.Box3().setFromObject(w.mount),
    c = b.getCenter(new THREE.Vector3());
  assert.ok(c.distanceTo(w.mount.position) < 1e-5, 'Wheel rotates around its hub');
}
console.log(
  'Geometry: 11944 triangles and original normals/UVs preserved; four centred wheels, 1008 triangles each.'
);
const originalWheels = rig.wheels.map((w) => ({
  geometry: w.spin.children[0].geometry,
  positions: w.spin.children[0].geometry.attributes.position.array.slice(),
  material: w.spin.children[0].material,
}));
const brakeSystem = setupBrakes(rig);
for (const assembly of brakeSystem.assemblies) {
  const { wheel, rotor, caliper, spec, scale, index } = assembly;
  assert.equal(rotor.parent, wheel.spin, 'Rotor rotates with its wheel');
  assert.equal(
    caliper.parent,
    wheel.mount,
    'Caliper follows suspension/steering and never wheel spin'
  );
  assert.equal(wheel.spin.children[0].geometry, originalWheels[index].geometry);
  assert.deepEqual(
    wheel.spin.children[0].geometry.attributes.position.array,
    originalWheels[index].positions
  );
  assert.equal(wheel.spin.children[0].material, originalWheels[index].material);
  assert.ok(
    (spec.diameter / 2 + 0.03) * scale < wheel.r * 0.7,
    'Caliper and rotor fit inside the rim barrel'
  );
  rig.root.updateMatrixWorld(true);
  const fixedMatrix = caliper.matrixWorld.clone();
  const oldPoint = new THREE.Vector3(0.15, 0, 0).applyMatrix4(rotor.matrixWorld);
  wheel.spin.rotation.z += 0.7;
  rig.root.updateMatrixWorld(true);
  assert.deepEqual(caliper.matrixWorld.elements, fixedMatrix.elements);
  assert.ok(
    new THREE.Vector3(0.15, 0, 0).applyMatrix4(rotor.matrixWorld).distanceTo(oldPoint) > 0.02
  );
  wheel.mount.position.y += 0.03;
  if (wheel.front) wheel.mount.rotation.y = 0.2;
  rig.root.updateMatrixWorld(true);
  assert.ok(!caliper.matrixWorld.equals(fixedMatrix), 'Caliper must move with the wheel upright');
  wheel.mount.position.y -= 0.03;
  wheel.mount.rotation.y = 0;
}
const blueCaliper = brakeSystem.assemblies[0].caliper.children[0].material;
const originalBlue = blueCaliper.color.getHex();
for (let i = 0; i < 600; i++) brakeSystem.update(1 / 60, { energy: 15000, speed: 50 });
assert.ok(brakeSystem.assemblies[0].metal.emissiveIntensity > 0);
assert.equal(blueCaliper.color.getHex(), originalBlue, 'Heat cannot recolor the blue calipers');
assert.equal(blueCaliper.emissive.getHex(), 0);
assert.equal(
  brakeSystem.assemblies[0].rotor
    .getObjectByName('Unheated aluminium disc hat')
    .material.emissive.getHex(),
  0
);
brakeSystem.reset();
assert.ok(brakeSystem.assemblies.every((a) => a.metal.emissiveIntensity === 0));
console.log(
  'Brakes: four drilled vented rotors, fixed blue calipers, steering/suspension attachment and original wheels preserved.'
);
for (const speed of [30, 60, 160]) {
  const results = [];
  for (const fps of [30, 60, 144]) {
    const s = new DrivingSimulation(rig.wheels, straightTestTrack);
    s.speed = speed / 3.6;
    let compression = 0,
      extension = 0,
      independent = false;
    const steps = Math.ceil((130 / s.speed) * fps);
    for (let i = 0; i < steps; i++) {
      s.step(1 / fps, {});
      assert.ok(
        [s.heave, s.roll, s.pitch, ...s.wheels.map((w) => w.offset)].every(Number.isFinite)
      );
      compression = Math.max(compression, ...s.wheels.map((w) => w.compression));
      extension = Math.max(extension, ...s.wheels.map((w) => -w.compression));
      independent ||= Math.abs(s.wheels[0].offset - s.wheels[1].offset) > 0.005;
    }
    assert.ok(compression > 0.02 && compression < 0.07);
    assert.ok(extension < 0.16);
    assert.ok(independent);
    const before = JSON.stringify(s);
    s.step(1, {}, false);
    assert.equal(JSON.stringify(s), before);
    results.push({
      fps,
      compressionMM: +(compression * 1000).toFixed(1),
      extensionMM: +(extension * 1000).toFixed(1),
    });
  }
  console.log(speed + ' km/h', results);
}
const s = new DrivingSimulation(rig.wheels, straightTestTrack);
for (let i = 0; i < 60; i++) s.step(1 / 60, { left: true });
assert.ok(s.steer > 0.2 && s.roll > 0 && s.z < 0);
const angles = rig.wheels.map((w) =>
  w.front ? Math.atan(Math.tan(s.steer) / (1 + (w.z * Math.tan(s.steer)) / s.wheelbase)) : 0
);
assert.ok(angles[1] > angles[0] && angles[0] > 0);
assert.equal(angles[2], 0);
assert.equal(angles[3], 0);
const previous = s.speed;
for (let i = 0; i < 60; i++) s.step(1 / 60, { brake: true });
assert.ok(s.speed < previous);
s.reset();
assert.equal(s.wheels.length, 4);
assert.equal(s.wheelbase, rig.wheels[0].x - rig.wheels[2].x);
console.log('Independent suspension, pause, steering geometry, braking and reset passed.');
