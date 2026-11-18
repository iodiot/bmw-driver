import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setupRain } from '../public/rain.js';
import { setupRoad } from '../public/road.js';
import { roadHeight } from '../public/road-profile.js';
import { cloudDrift, createSky, positionCelestialLight } from '../public/environment.js';

const sky = createSky();
const celestialLight = new THREE.DirectionalLight();
const savedDrift = cloudDrift.value;
for (const isNight of [false, true]) {
  const direction = sky.material.uniforms[isNight ? 'moonDirection' : 'sunDirection'].value;
  assert.ok(Math.abs(direction.length() - 1) < 1e-12);
  for (const anchor of [new THREE.Vector3(), new THREE.Vector3(12000, 0, -700)]) {
    for (const drift of [0, 0.8, 3.2]) {
      cloudDrift.value = drift;
      positionCelestialLight(celestialLight, anchor, isNight);
      const towardLight = celestialLight.position
        .clone()
        .sub(celestialLight.target.position)
        .normalize();
      assert.ok(
        towardLight.distanceTo(direction) < 1e-12,
        'Direct light and the visible celestial source must share a world direction regardless of travel or cloud motion'
      );
      assert.ok(celestialLight.target.position.distanceTo(anchor) < 1e-12);
      const incident = towardLight.clone().negate();
      const reflected = incident.reflect(new THREE.Vector3(0, 1, 0));
      assert.ok(
        reflected.y > 0 &&
          new THREE.Vector2(reflected.x, reflected.z)
            .add(new THREE.Vector2(direction.x, direction.z))
            .length() < 1e-12,
        'The wet-road specular ray must reflect the actual sky-source direction'
      );
    }
  }
}
cloudDrift.value = savedDrift;
sky.geometry.dispose();
sky.material.dispose();

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
for (const mesh of [drops, ripples]) {
  assert.ok(mesh.geometry.isInstancedBufferGeometry, 'Weather must stay GPU-instanced');
  assert.equal(mesh.geometry.attributes.position.count, 4, 'Instances share a single quad');
  const seeds = mesh.geometry.attributes.rainSeed;
  const version = seeds.version;
  rain.update(1 / 60, camera, state, true);
  assert.equal(
    seeds.version,
    version,
    'Particle animation must not upload per-drop state each frame'
  );
}
assert.equal(drops.geometry.instanceCount, 9600);
assert.equal(ripples.geometry.instanceCount, 900);
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
