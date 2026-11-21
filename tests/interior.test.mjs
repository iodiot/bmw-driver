import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { interiorLayout, isOldSeatTriangle, loft } from '../public/interior.js';

test('Only small triangles in the front-seat region count as the old seats', () => {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // A backrest quad half of the driver seat.
  assert.ok(isOldSeatTriangle(v(-0.3, 0, -0.3), v(-0.4, 0.4, -0.3), v(-0.3, 0, -0.5)));
  assert.ok(isOldSeatTriangle(v(-0.3, 0, 0.3), v(-0.4, 0.4, 0.3), v(-0.3, 0, 0.5)));
  // A large floor triangle through the same region, the B-pillar trim, the
  // dashboard and the rear bench stay.
  assert.ok(!isOldSeatTriangle(v(-1.5, -0.4, -0.5), v(1, -0.4, -0.5), v(-0.2, 0.2, -0.5)));
  assert.ok(!isOldSeatTriangle(v(-0.3, 0.6, -0.64), v(-0.35, 0.7, -0.64), v(-0.25, 0.65, -0.63)));
  assert.ok(!isOldSeatTriangle(v(0.4, 0.3, -0.3), v(0.5, 0.35, -0.3), v(0.45, 0.3, -0.4)));
  assert.ok(!isOldSeatTriangle(v(-1.2, 0.1, -0.3), v(-1.3, 0.4, -0.3), v(-1.2, 0.1, -0.5)));
});

test('Lofted parts are closed, smooth and face outward', () => {
  const rings = [0, 0.5, 1].map((x) =>
    Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * 2 * Math.PI;
      return new THREE.Vector3(x, Math.cos(a), Math.sin(a));
    })
  );
  for (const order of [rings, rings.map((r) => [...r].reverse())]) {
    const geometry = loft(order),
      normal = geometry.attributes.normal,
      position = geometry.attributes.position;
    // A middle-ring vertex: its normal points away from the axis.
    const i = 12 + 3,
      p = new THREE.Vector3().fromBufferAttribute(position, i),
      n = new THREE.Vector3().fromBufferAttribute(normal, i);
    assert.ok(n.dot(new THREE.Vector3(0, p.y, p.z)) > 0.5);
    assert.equal(geometry.index.count, (2 * 12 * 2 + 2 * 12) * 3);
  }
});

test('The new wheel sits where the model had its wheel, sized like the M wheel', () => {
  const { centre, axis, radius, grip } = interiorLayout.wheel;
  assert.ok(centre[2] < 0, 'Left-hand drive: the wheel is on the driver side');
  assert.ok(axis[0] < 0, 'It faces the driver');
  assert.ok(Math.abs(2 * (radius + grip) - 0.375 - 0.037) < 0.04, 'About 375 mm across');
});

test('Seats sit on the model cabin floor; the bench keeps the parcel shelf', async () => {
  const { cabinFloor, isOldBenchTriangle } = await import('../public/interior.js');
  assert.ok(Math.abs(cabinFloor(-0.98) - 0.21) < 1e-9 && Math.abs(cabinFloor(0.6) - 0.11) < 1e-9);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // A rear headrest face is taken; the shelf, the floor sheet and the doors stay.
  assert.ok(
    isOldBenchTriangle(v(-1.2, 0.47, 0.3), v(-1.2, 0.55, 0.3), v(-1.2, 0.5, 0.4), 'Object_53')
  );
  assert.ok(
    !isOldBenchTriangle(v(-1.45, 0.51, 0.2), v(-1.42, 0.51, 0), v(-1.5, 0.52, -0.2), 'Object_53')
  );
  assert.ok(
    !isOldBenchTriangle(v(-0.98, 0.21, 0.7), v(0.6, 0.11, 0.73), v(-0.98, 0.21, 0), 'Object_53')
  );
  assert.ok(
    !isOldBenchTriangle(v(-1.2, 0.4, 0.64), v(-1.3, 0.5, 0.65), v(-1.25, 0.45, 0.63), 'Object_53')
  );
  assert.ok(
    !isOldBenchTriangle(v(-1.2, 0.47, 0.3), v(-1.2, 0.55, 0.3), v(-1.2, 0.5, 0.4), 'Object_9')
  );
});

test('Cluster needles sweep 270° from lower left to lower right', async () => {
  const { dialAngle } = await import('../public/cockpit-cluster.js');
  assert.ok(Math.abs(dialAngle(0, 330) - 0.75 * Math.PI) < 1e-9);
  assert.ok(Math.abs(dialAngle(330, 330) - 2.25 * Math.PI) < 1e-9);
  assert.ok(Math.abs(dialAngle(165, 330) - 1.5 * Math.PI) < 1e-9, 'Half scale points straight up');
  assert.equal(dialAngle(400, 330), dialAngle(330, 330));
});

test('The iDrive map turns with the car: straight ahead is up', async () => {
  const { mapPoint } = await import('../public/centre-display.js');
  for (const heading of [0, 0.4, -1.1]) {
    const car = { x: 100, z: 20, heading };
    const ahead = mapPoint(car, 100 + 50 * Math.cos(heading), 20 - 50 * Math.sin(heading), 1, 0, 0);
    assert.ok(Math.abs(ahead[0]) < 1e-9 && Math.abs(ahead[1] + 50) < 1e-9);
  }
});

test('Door cards replace the flat door panels and keep clear of the seats', async () => {
  const THREE = await import('three');
  const { doorTrim, isOldDoorTriangle } = await import('../public/door-trim.js');
  const { interiorLayout } = await import('../public/interior.js');
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // A panel facing across the car, on the driver's door below the sill.
  assert.ok(
    isOldDoorTriangle(v(-0.3, 0.15, -0.72), v(0.3, 0.15, -0.72), v(0, 0.33, -0.72), 'Object_53')
  );
  assert.ok(
    isOldDoorTriangle(v(-0.3, 0.15, 0.72), v(0.3, 0.15, 0.72), v(0, 0.33, 0.72), 'Object_53')
  );
  // The sill (facing up), the windscreen pillar and other meshes stay.
  assert.ok(
    !isOldDoorTriangle(v(-0.3, 0.39, -0.7), v(0.3, 0.39, -0.7), v(0, 0.39, -0.78), 'Object_53')
  );
  assert.ok(
    !isOldDoorTriangle(v(-0.3, 0.15, -0.72), v(0.3, 0.15, -0.72), v(0, 0.33, -0.72), 'Object_37')
  );
  // The armrest stops short of the seat's side.
  const seatEdge = Math.abs(interiorLayout.seatCentres[0]) + 0.225 + 0.02;
  assert.ok(doorTrim.face - doorTrim.armrest.depth > seatEdge);
  assert.ok(doorTrim.armrest.top < doorTrim.strip && doorTrim.strip < doorTrim.sill);
});

test('The footwells drop below the steering wheel rim and the old floor sheet is cut', async () => {
  const THREE = await import('three');
  const { footwell, consoleLayout, isOldFootwellTriangle } = await import(
    '../public/cabin-floor.js'
  );
  const { interiorLayout, cabinFloor } = await import('../public/interior.js');
  const { centre, axis, radius, grip } = interiorLayout.wheel;
  // Lowest point of the rim, in the wheel's plane.
  const up = new THREE.Vector3(-axis[1], axis[0], 0).normalize();
  if (up.y < 0) up.negate();
  const bottom = new THREE.Vector3(...centre).addScaledVector(up, -(radius + grip));
  assert.ok(bottom.y < cabinFloor(bottom.x), 'The rim reaches below the seat floor');
  assert.ok(bottom.y > footwell.floor + 0.05, 'but clears the dropped footwell');
  assert.ok(bottom.x > footwell.rear && bottom.x < footwell.front);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // One of the model's four floor triangles (facing up), from the rear seat
  // to the dash.
  assert.ok(
    isOldFootwellTriangle(v(-0.98, 0.21, 0), v(0.6, 0.11, 0.73), v(0.6, 0.11, 0), 'Object_53')
  );
  // The dashboard's face, the sill and other meshes stay.
  assert.ok(
    !isOldFootwellTriangle(v(0.58, 0.12, -0.3), v(0.58, 0.22, -0.3), v(0.58, 0.12, 0), 'Object_53')
  );
  assert.ok(
    !isOldFootwellTriangle(v(-0.98, 0.21, 0), v(0.6, 0.11, 0), v(0.6, 0.11, 0.73), 'Object_37')
  );
  // The console fits between the seats.
  const seatInner = Math.abs(interiorLayout.seatCentres[0]) - 0.225;
  assert.ok(consoleLayout.halfWidth <= seatInner);
});

test('The rebuilt dashboard replaces the model dash, recessed behind the instruments', async () => {
  const THREE = await import('three');
  const { dashLayout, isOldDashTriangle } = await import('../public/dashboard.js');
  const { clusterLayout } = await import('../public/cockpit-cluster.js');
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // The model's dash face and top go; the windscreen pillars above it and
  // the floor and other meshes stay.
  assert.ok(isOldDashTriangle(v(0.6, 0.2, 0.3), v(0.62, 0.3, 0.3), v(0.6, 0.2, 0.4), 'Object_53'));
  assert.ok(isOldDashTriangle(v(0.75, 0.41, 0), v(0.85, 0.41, 0), v(0.8, 0.41, 0.1), 'Object_53'));
  assert.ok(
    !isOldDashTriangle(v(0.7, 0.5, 0.7), v(0.75, 0.55, 0.7), v(0.7, 0.55, 0.72), 'Object_53')
  );
  assert.ok(!isOldDashTriangle(v(0.6, 0.2, 0.3), v(0.62, 0.3, 0.3), v(0.6, 0.2, 0.4), 'Object_49'));
  // The instruments' face lies inside the recess's z range.
  const zs = clusterLayout.corners.map((c) => c[2]);
  assert.ok(Math.min(...zs) >= dashLayout.cluster.from - 1e-9);
  assert.ok(Math.max(...zs) <= dashLayout.cluster.to + 1e-9);
  // The centre stack runs from its foot up to the screen and fits between the seats.
  const { bottom, top, width } = dashLayout.stack;
  assert.ok(top[1] > bottom[1] + 0.2 && width < 0.25);
});
