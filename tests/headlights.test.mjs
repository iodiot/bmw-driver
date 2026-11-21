import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { setupHeadlights } from '../public/headlights.js';
import { lowBeamProfile, lowBeamSettings } from '../public/headlight-profile.js';
import { setupRain } from '../public/rain.js';

function fixture() {
  const root = new THREE.Group(),
    body = new THREE.Group();
  body.position.y = 0.55;
  root.add(body);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  lens.name = 'Object_27';
  body.add(lens);
  const rig = { root, body };
  return { rig, headlights: setupHeadlights(rig) };
}
function sampleWorld(light, pattern, point) {
  light.shadow.updateMatrices(light);
  const uv = point.clone().applyMatrix4(light.shadow.matrix);
  if (uv.x < 0 || uv.x >= 1 || uv.y < 0 || uv.y >= 1 || uv.z < 0 || uv.z >= 1) return 0;
  const x = Math.floor(uv.x * pattern.image.width),
    y = Math.floor(uv.y * pattern.image.height);
  return THREE.DataUtils.fromHalfFloat(pattern.image.data[(y * pattern.image.width + x) * 4]);
}

test('Low beams have a dark upper field, a right-side rise and soft foreground spill', () => {
  for (const horizontal of [-0.4, -0.2, 0, 0.2, 0.4]) {
    assert.equal(lowBeamProfile(horizontal, 0.04), 0, 'Above-cutoff rays must not light the sky');
    assert.ok(lowBeamProfile(horizontal, -0.12) > 0);
  }
  assert.equal(lowBeamProfile(-0.2, 0.008), 0);
  assert.ok(lowBeamProfile(0.2, 0.008) > 0.01, 'Right-hand traffic gets a raised roadside cutoff');
  assert.ok(lowBeamProfile(0, -0.25) > lowBeamProfile(0, -0.6));
  assert.ok(
    lowBeamProfile(0, -0.6) < 0.001,
    'Near-field light must taper before the projector edge'
  );
  for (let x = -0.8; x <= 0.8; x += 0.02)
    for (let y = -0.8; y <= 0.8; y += 0.02)
      assert.ok(lowBeamProfile(x, y) >= 0 && lowBeamProfile(x, y) <= 1);
});

test('The projected pattern lands on the road, keeps the right-side rise and shares one static HDR map', () => {
  const { rig, headlights } = fixture();
  rig.root.updateMatrixWorld(true);
  const light = headlights.projectors[0],
    pattern = headlights.pattern;
  const origin = light.getWorldPosition(new THREE.Vector3());
  const near = sampleWorld(light, pattern, origin.clone().add(new THREE.Vector3(5, -origin.y, 0))),
    ahead = sampleWorld(light, pattern, origin.clone().add(new THREE.Vector3(12, -origin.y, 0)));
  assert.ok(near > 0.005, 'The near road still receives light');
  assert.ok(ahead > 0.3 && ahead > 10 * near, 'Most light reaches the road ahead, not the bumper');
  assert.equal(sampleWorld(light, pattern, origin.clone().add(new THREE.Vector3(10, 1, 0))), 0);
  const left = sampleWorld(light, pattern, origin.clone().add(new THREE.Vector3(10, 0, -2)));
  const right = sampleWorld(light, pattern, origin.clone().add(new THREE.Vector3(10, 0, 2)));
  assert.ok(
    right > left + 0.01,
    'The real projection must illuminate the vehicle right, not mirror the pattern'
  );
  // One texture row spans this much road 15 m ahead: coarse rows showed as
  // bands across the lit road.
  const lampHeight = origin.y,
    rowAngle = (2 * Math.tan(lowBeamSettings.angle)) / pattern.image.height;
  assert.ok((rowAngle * (15 ** 2 + lampHeight ** 2)) / lampHeight < 0.3, 'No visible bands');
  assert.equal(
    pattern.type,
    THREE.HalfFloatType,
    'Dark falloffs must not become visible 8-bit contour bands'
  );
  const version = pattern.version;
  for (const projector of headlights.projectors) {
    assert.equal(projector.map, pattern);
    assert.equal(projector.castShadow, false, 'The beam shape must not add shadow render passes');
  }
  for (let i = 0; i < 180; i++) headlights.update(1 / 60);
  assert.equal(pattern.version, version, 'The profile texture is uploaded once');
  const rain = setupRain(new THREE.Scene());
  rain.setHeadlights(headlights);
  for (const mesh of rain.group.children) {
    assert.equal(mesh.material.uniforms.lowBeamPattern.value, pattern);
    assert.equal(mesh.material.uniforms.lowBeamLeft.value, headlights.projectors[0].shadow.matrix);
  }
});

test('Levelling preserves projector locations while settling the aim after body pitch and roll', () => {
  const { rig, headlights } = fixture();
  rig.root.position.set(50, 0, -30);
  rig.root.rotation.y = 0.7;
  rig.body.rotation.set(0.04, 0, 0.06);
  const positions = headlights.projectors.map((light) => light.position.clone());
  for (let i = 0; i < 180; i++) headlights.update(1 / 60);
  rig.root.updateMatrixWorld(true);
  headlights.projectors.forEach((light, i) => {
    assert.ok(light.position.distanceTo(positions[i]) < 1e-12);
    const direction = light.target
      .getWorldPosition(new THREE.Vector3())
      .sub(light.getWorldPosition(new THREE.Vector3()))
      .normalize();
    const expectedY = -lowBeamSettings.downwardSlope / Math.hypot(1, lowBeamSettings.downwardSlope);
    assert.ok(Math.abs(direction.y - expectedY) < 1e-6);
  });
  headlights.setNight(false);
  assert.equal(headlights.lit, false);
  assert.equal(headlights.beams.visible, true, 'Unlit beams stay in the scene: no recompiles');
  headlights.setNight(true);
  assert.equal(headlights.lit, true);
});
