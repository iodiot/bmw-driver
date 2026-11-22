import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  structureLayout,
  nearestOccurrence,
  tunnelCover,
  bridgeShade,
  tunnelProfile,
  structuresGLSL,
  setupRoadStructures,
} from '../public/road-structures.js';
import { roadBranch, roadCenterZ, guardrailOffset } from '../public/road-profile.js';

const { period, tunnel, bridge, bridges, signs } = structureLayout;

test('Structures repeat with the country road and keep clear of it', () => {
  assert.equal(period, roadBranch.period);
  assert.equal(nearestOccurrence(100, 1720), 1720 - period);
  assert.equal(nearestOccurrence(1500, 1720), 1720);
  assert.equal(nearestOccurrence(1720 + period * 3 + 900, 1720), 1720 + period * 3);
  // The branch leaves at 300 m and is back on the main road 1200 m later.
  const branchEnd = roadBranch.start + 2 * roadBranch.diverge + roadBranch.length;
  for (const u of [...bridges, tunnel.from, tunnel.to])
    assert.ok(u > branchEnd + 100 && u < period + roadBranch.start - 100, `${u} m is clear`);
  for (const u of bridges)
    assert.ok(
      u + bridge.width < tunnel.from - 100 || u > tunnel.to + 100,
      'bridges stand in the open'
    );
});

test('Signs stand before what they announce', () => {
  const at = (kind) => signs.find((s) => s.kind === kind).at;
  assert.ok(at('tunnel') < tunnel.from && tunnel.from - at('tunnel') < 500);
  const limits = signs.filter((s) => s.kind === 'limit');
  assert.ok(limits[0].at < tunnel.from && limits[0].value === 100);
  assert.ok(limits[1].at > tunnel.to && limits[1].value === 120);
  const exit = signs.find((s) => s.kind === 'exit');
  assert.equal(period + roadBranch.start - exit.at, exit.distance);
});

test('The tunnel is dark inside, lit at its mouths and only between its walls', () => {
  const mid = (tunnel.from + tunnel.to) / 2;
  assert.equal(tunnelCover(mid, 0), 1);
  assert.equal(tunnelCover(mid + period * 2, -3.6), 1, 'every section has one');
  assert.equal(tunnelCover(tunnel.from - 5, 0), 0);
  assert.equal(tunnelCover(tunnel.to + 5, 0), 0);
  const mouth = tunnelCover(tunnel.from + tunnel.daylight / 2, 0);
  assert.ok(mouth > 0.2 && mouth < 0.8, 'daylight fades in over the first metres');
  assert.equal(tunnelCover(mid, 30), 0, 'the hill outside is not under cover');
  // Its walls stand outside the guardrails, with the kerb beyond them.
  const profile = tunnelProfile();
  const lowest = Math.min(
    ...profile.filter(([, y]) => y > 0.2 && y < 2).map(([lat]) => Math.abs(lat))
  );
  assert.ok(lowest > guardrailOffset + 0.1);
  const crown = Math.max(...profile.map(([, y]) => y));
  assert.ok(crown >= tunnel.crown - 0.1 && crown > 4.8, 'room for lorries');
});

test("A bridge's shadow falls under its deck at noon and moves with the sun", () => {
  const x = bridges[0],
    z = roadCenterZ(x);
  const overhead = new THREE.Vector2(0, 0);
  assert.equal(bridgeShade(x, z, overhead), 1);
  assert.equal(bridgeShade(x + 30, roadCenterZ(x + 30), overhead), 0);
  assert.equal(bridgeShade(x, z + bridge.halfSpan + 5, overhead), 0, 'beyond its ends');
  // Sun low in the west-ish (toward −x): the shadow falls toward +x.
  const evening = new THREE.Vector2(-1.5, 0);
  const h = bridge.clearance + bridge.deck / 2;
  assert.ok(bridgeShade(x, z, evening) < 0.01);
  assert.equal(bridgeShade(x + 1.5 * h, roadCenterZ(x + 1.5 * h), evening), 1);
});

test('The road shader has the same structures', () => {
  for (const name of [
    'tunnelCover',
    'tunnelFloor',
    'bridgeShade',
    'tunnelLamps',
    'roadCenterSlope',
  ])
    assert.match(structuresGLSL, new RegExp(`\\b${name}\\(`));
  assert.match(structuresGLSL, /uniform vec2 structureSunShift/);
});

test('Structures are placed at the nearest occurrence as the car drives on', () => {
  const scene = new THREE.Scene();
  const structures = setupRoadStructures(scene);
  structures.update(1650, new THREE.Vector3(0.3, 0.8, 0.2).normalize());
  const overpasses = structures.group.children.filter((o) => o.name === 'Overpass');
  assert.equal(overpasses.length, bridges.length);
  assert.equal(overpasses[0].position.x, 1720);
  assert.ok(Math.abs(overpasses[0].position.z - roadCenterZ(1720)) < 1e-9);
  const lining = structures.group.getObjectByName('Tunnel lining');
  lining.geometry.computeBoundingBox();
  assert.ok(Math.abs(lining.geometry.boundingBox.min.x - tunnel.from) < 0.01);
  structures.update(1650 + period, new THREE.Vector3(0, 1, 0));
  assert.equal(overpasses[0].position.x, 1720 + period);
  lining.geometry.computeBoundingBox();
  assert.ok(Math.abs(lining.geometry.boundingBox.min.x - (tunnel.from + period)) < 0.01);
  // Only the overpass decks (onto the car beneath) and the signs cast
  // shadow-map shadows; the road shades itself under the rest.
  structures.group.traverse((o) => {
    if (o.isMesh)
      assert.equal(
        o.castShadow,
        o.name === 'Overpass deck' || o.parent.name.startsWith('Sign'),
        o.name
      );
  });
});
