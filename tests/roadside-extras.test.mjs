import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  polePlaces,
  powerLineGaps,
  powerLineLayout,
  setupPowerLines,
  wirePoint,
} from '../public/power-lines.js';
import { busStopLayout, setupBusStops } from '../public/bus-stops.js';
import { structureLayout } from '../public/road-structures.js';
import { branchOffset, roadBranch, roadCenterZ } from '../public/road-profile.js';

test('Power poles stand evenly, none by the overpasses or the tunnel', () => {
  const places = polePlaces();
  assert.ok(places.length > 20, `${places.length} poles`);
  for (const u of places)
    for (const [a, b] of powerLineGaps()) assert.ok(u <= a || u >= b, `pole at ${u}`);
  const { from, to } = structureLayout.tunnel;
  assert.ok(!places.some((u) => u > from - 200 && u < to + 150));
  // Wires sag at mid-span by the set amount.
  const a = new THREE.Vector3(0, 8, 0),
    b = new THREE.Vector3(62, 8, 0);
  assert.ok(Math.abs(wirePoint(a, b, 0.5, 1.1).y - 6.9) < 1e-9);
  assert.equal(wirePoint(a, b, 0, 1.1).y, 8);
});

test('Poles and wires are laid round the car, wires not across a gap', () => {
  const lines = setupPowerLines(new THREE.Scene());
  lines.update(600);
  assert.ok(lines.poles.count >= 18);
  const m = new THREE.Matrix4();
  lines.poles.getMatrixAt(0, m);
  const x = m.elements[12],
    z = m.elements[14];
  assert.ok(Math.abs(z - (roadCenterZ(x) + powerLineLayout.lateral)) < 1e-3);
  const drawn = lines.wires.geometry.drawRange.count;
  assert.ok(drawn > 0 && drawn % 2 === 0);
});

test('The bus stop stands beside the country road', () => {
  const stops = setupBusStops(new THREE.Scene());
  stops.update(950);
  const p = stops.group.position;
  assert.equal(p.x, busStopLayout.at);
  const lateral = p.z - roadCenterZ(p.x);
  assert.ok(
    Math.abs(lateral - (branchOffset(p.x) + roadBranch.halfWidth + busStopLayout.setback)) < 1e-6
  );
  assert.ok(lateral > 40, 'Across the country road from the motorway');
});
