import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setupRain } from '../public/rain.js';
import { setupRoad } from '../public/road.js';
import { roadHeight } from '../public/road-profile.js';

const scene = new THREE.Scene();
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(),
  new THREE.MeshPhysicalMaterial({ map: new THREE.Texture(), color: 0xc8c8c8 })
);
ground.name = 'Asphalt ground';
scene.add(ground);
const road = setupRoad(scene);
const rain = setupRain(scene);
const camera = new THREE.PerspectiveCamera();
camera.position.set(4, 2, 6);
const state = { x: 0, z: 0, heading: 0, heave: 0.02, pitch: 0.01, roll: 0 };
const heights = [12, 36, 49, 90].map((x) => roadHeight(x, 0.81));

for (const night of [false, true]) {
  for (const enabled of [false, true, false]) {
    rain.setEnabled(enabled);
    road.setRain(enabled);
    rain.update(1 / 60, camera, state, night);
    assert.equal(rain.group.visible, enabled);
    for (const mesh of rain.group.children) {
      assert.equal(mesh.material.uniforms.night.value, Number(night));
      assert.ok(mesh.material.uniforms.cameraVelocity.value.toArray().every(Number.isFinite));
    }
    assert.equal(ground.material.clearcoat, enabled ? 1 : 0);
    assert.equal(ground.material.roughness, enabled ? 0.38 : 1);
    assert.deepEqual(
      [12, 36, 49, 90].map((x) => roadHeight(x, 0.81)),
      heights
    );
  }
}
assert.equal(ground.material.color.getHex(), 0xc8c8c8);
assert.equal(ground.material.bumpScale, 0.003);
rain.setEnabled(true);
for (let i = 0; i < 1800; i++) {
  camera.position.x += 0.5;
  state.x += 0.5;
  rain.update(1 / 60, camera, state, true);
}
const [drops, ripples] = rain.group.children;
assert.equal(drops.geometry.instanceCount, 4800);
assert.equal(ripples.geometry.instanceCount, 512);
assert.equal(rain.group.children.length, 2);
const time = drops.material.uniforms.rainTime.value;
rain.setEnabled(false);
rain.update(1 / 60, camera, state, true);
assert.equal(drops.material.uniforms.rainTime.value, time);
assert.equal(drops.material.uniforms.night.value, 1, 'Disabling rain must retain night lighting');
camera.position.x = -1000;
rain.update(1 / 60, camera, state, true);
assert.equal(
  drops.material.uniforms.cameraVelocity.value.length(),
  0,
  'Resetting the camera must not make giant streaks'
);
console.log(
  'Weather: independent day/night and rain states, wet/dry restoration, stable particle counts and unchanged road contact passed.'
);
