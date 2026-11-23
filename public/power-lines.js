import * as THREE from 'three';
import { oncoming, roadCenterZ, roadCenterSlope } from './road-profile.js';
import { structureLayout } from './road-structures.js';
import { shadowMaterial, shadowOpacity, sunProjection } from './sun-shadows.js';

// A 10 kV overhead line in the field left of the motorway, as along roads
// all over Ukraine: tapered reinforced-concrete poles about 60 m apart, a
// steel crossarm with two pin insulators and a third on the pole's top,
// and three wires sagging between them. The line leaves the road before
// each overpass and the tunnel's cutting (and comes back after), ending at
// a pole each time.
export const powerLineLayout = Object.freeze({
  // (Beyond the oncoming carriageway on the route.)
  lateral: oncoming ? -34 : -22,
  spacing: 62,
  // Pole height above ground, the crossarm's height and half its length.
  height: 9.2,
  arm: 8.35,
  armHalf: 0.85,
  // Wires' sag at mid-span (m) and the samples per span.
  sag: 1.1,
  samples: 10,
  // Poles are drawn this far ahead and behind the car.
  reach: 700,
});

// Stretches of each 3 km section with no line: round the overpasses and
// the tunnel's cutting and hill.
export function powerLineGaps() {
  const { bridges, tunnel } = structureLayout;
  return [...bridges.map((b) => [b - 95, b + 95]), [tunnel.from - 280, tunnel.to + 220]];
}

// Pole positions in a section (distance into it): evenly spaced, none in
// the gaps.
export function polePlaces() {
  const { period } = structureLayout;
  const { spacing } = powerLineLayout;
  const gaps = powerLineGaps();
  const places = [];
  for (let u = spacing / 2; u < period; u += spacing)
    if (!gaps.some(([a, b]) => u > a && u < b)) places.push(u);
  return places;
}

// Where the wires hang between two attachment points: a parabola close to
// the true catenary for this sag.
export function wirePoint(a, b, t, sag) {
  return new THREE.Vector3()
    .lerpVectors(a, b, t)
    .setY(a.y + (b.y - a.y) * t - 4 * sag * t * (1 - t));
}

// One pole with its crossarm and insulators, as one geometry with vertex
// colours: concrete, galvanised steel and pale porcelain.
function poleGeometry() {
  const { height, arm, armHalf } = powerLineLayout;
  const parts = [];
  const add = (geometry, colour) => {
    const g = geometry.toNonIndexed();
    const c = new THREE.Color(colour);
    const colours = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colours.length; i += 3) colours.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    parts.push(g);
  };
  // The concrete pole: rectangular, tapering toward the top.
  const pole = new THREE.CylinderGeometry(0.1, 0.17, height, 4, 1);
  pole.rotateY(Math.PI / 4);
  pole.scale(1, 1, 0.72);
  pole.translate(0, height / 2, 0);
  add(pole, 0x9c9a94);
  // The crossarm across the line (along z), with its two braces.
  const bar = new THREE.BoxGeometry(0.07, 0.07, armHalf * 2);
  bar.translate(0, arm, 0);
  add(bar, 0x55595c);
  for (const side of [-1, 1]) {
    const brace = new THREE.BoxGeometry(0.035, 0.75, 0.035);
    brace.rotateX(side * 0.75);
    brace.translate(0.02, arm - 0.27, side * 0.25);
    add(brace, 0x55595c);
  }
  // Pin insulators: on each end of the arm and on top of the pole.
  for (const [y, z] of [
    [arm + 0.04, -armHalf + 0.08],
    [arm + 0.04, armHalf - 0.08],
    [height + 0.02, 0.06],
  ]) {
    const pin = new THREE.CylinderGeometry(0.012, 0.012, 0.12, 5);
    pin.translate(0, y + 0.06, z);
    add(pin, 0x55595c);
    const bell = new THREE.CylinderGeometry(0.035, 0.06, 0.13, 8);
    bell.translate(0, y + 0.16, z);
    add(bell, 0xd9dcd6);
  }
  const merged = new THREE.BufferGeometry();
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  for (const name of ['position', 'normal', 'color']) {
    const array = new Float32Array(count * 3);
    let offset = 0;
    for (const g of parts) {
      array.set(g.attributes[name].array, offset);
      offset += g.attributes[name].array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, 3));
  }
  return merged;
}

// Wire attachment points on a pole, in its own frame (x along the line, z
// across it).
export const wireMounts = Object.freeze([
  [powerLineLayout.arm + 0.24, -powerLineLayout.armHalf + 0.08],
  [powerLineLayout.arm + 0.24, powerLineLayout.armHalf - 0.08],
  [powerLineLayout.height + 0.14, 0.06],
]);

export function setupPowerLines(scene) {
  const { lateral, reach, samples, sag } = powerLineLayout;
  const { period } = structureLayout;
  const places = polePlaces();
  // Enough poles for the stretch either side of the car.
  const capacity = Math.ceil((2 * reach) / powerLineLayout.spacing) + 4;
  const poles = new THREE.InstancedMesh(
    poleGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }),
    capacity
  );
  poles.name = 'Power line poles';
  poles.frustumCulled = false;
  poles.count = 0;
  scene.add(poles);
  // The wires: thin dark lines, re-laid as the car moves on.
  const maxSegments = capacity * wireMounts.length * samples;
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(maxSegments * 2 * 3), 3).setUsage(
      THREE.DynamicDrawUsage
    )
  );
  const wires = new THREE.LineSegments(
    wireGeometry,
    new THREE.LineBasicMaterial({ color: 0x2b2e31, transparent: true, opacity: 0.85 })
  );
  wires.name = 'Power line wires';
  wires.frustumCulled = false;
  scene.add(wires);
  // Their shadows across the field: the poles and wires again, flattened
  // along the sun (see sun-shadows.js).
  const poleShadowMaterial = shadowMaterial('Power line pole shadows');
  const poleShadows = new THREE.InstancedMesh(poles.geometry, poleShadowMaterial, capacity);
  poleShadows.instanceMatrix = poles.instanceMatrix;
  const wireShadowMaterial = new THREE.LineBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const wireShadows = new THREE.LineSegments(wireGeometry, wireShadowMaterial);
  for (const [m, name] of [
    [poleShadows, 'Power line pole shadows'],
    [wireShadows, 'Power line wire shadows'],
  ]) {
    m.name = name;
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    m.renderOrder = 2;
    scene.add(m);
  }
  const projection = new THREE.Matrix4();
  const matrix = new THREE.Matrix4(),
    rotation = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    one = new THREE.Vector3(1, 1, 1);
  let laidAt = Infinity;
  // A pole's place and heading at x along the road.
  const standAt = (x) => {
    const heading = -Math.atan(roadCenterSlope(x));
    return { x, z: roadCenterZ(x) + lateral, heading };
  };
  const mount = (pole, [y, across]) => {
    const c = Math.cos(pole.heading),
      s = Math.sin(pole.heading);
    // Across the line is the road's sideways direction (z rotated).
    return new THREE.Vector3(pole.x + s * across, y, pole.z + c * across);
  };
  return {
    poles,
    wires,
    // Lays the poles and wires round x (re-laid every 40 m of travel), and
    // their shadows for the sun (`sun` toward it, `strength` 0–1).
    update(x, sun = null, strength = 0) {
      const shadows = Boolean(sun) && strength > 0.02;
      poleShadows.visible = wireShadows.visible = shadows;
      if (shadows) {
        sunProjection(sun, projection);
        for (const m of [poleShadows, wireShadows]) {
          m.matrix.copy(projection);
          m.matrixWorld.copy(projection);
        }
        poleShadowMaterial.opacity = shadowOpacity(strength);
        wireShadowMaterial.opacity = 0.6 * shadowOpacity(strength);
      }
      if (Math.abs(x - laidAt) < 40) return;
      laidAt = x;
      const stands = [];
      const first = Math.floor((x - reach) / period),
        last = Math.floor((x + reach) / period);
      for (let k = first; k <= last; k++)
        for (const u of places) {
          const at = k * period + u;
          if (Math.abs(at - x) <= reach) stands.push({ ...standAt(at), u, k });
        }
      stands.sort((a, b) => a.x - b.x);
      poles.count = poleShadows.count = Math.min(capacity, stands.length);
      for (let i = 0; i < poles.count; i++) {
        const p = stands[i];
        rotation.setFromAxisAngle(up, p.heading);
        matrix.compose(new THREE.Vector3(p.x, 0, p.z), rotation, one);
        poles.setMatrixAt(i, matrix);
      }
      poles.instanceMatrix.needsUpdate = true;
      // Wires between neighbouring poles of one run (not across a gap).
      const positions = wireGeometry.attributes.position.array;
      let n = 0;
      for (let i = 0; i + 1 < poles.count; i++) {
        const a = stands[i],
          b = stands[i + 1];
        if (b.x - a.x > powerLineLayout.spacing * 1.5) continue;
        for (const m of wireMounts) {
          const pa = mount(a, m),
            pb = mount(b, m);
          let previous = pa;
          for (let j = 1; j <= samples; j++) {
            const next = wirePoint(pa, pb, j / samples, sag);
            if (n + 6 > positions.length) break;
            positions.set([previous.x, previous.y, previous.z, next.x, next.y, next.z], n);
            n += 6;
            previous = next;
          }
        }
      }
      wireGeometry.setDrawRange(0, n / 3);
      wireGeometry.attributes.position.needsUpdate = true;
      if (globalThis.document) document.body.dataset.powerPoles = String(poles.count);
    },
    // For a capture: places them now, wherever the car last was.
    reset() {
      laidAt = Infinity;
    },
  };
}
