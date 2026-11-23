import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  addSnowCover,
  seasonUniforms,
  snowOnScene,
  stepSeason,
  winterDriving,
} from '../public/season.js';
import { DrivingSimulation } from '../public/driving-physics.js';
import { straightTestTrack } from '../public/road-profile.js';
import { daylight } from '../public/time-of-day.js';

test('Winter eases in, and snow lies on upward faces of the land, not the car', () => {
  seasonUniforms.winterCover.value = 0;
  for (let i = 0; i < 90; i++) stepSeason(1 / 60, true, 3);
  assert.ok(Math.abs(seasonUniforms.winterCover.value - 0.5) < 0.02, 'Halfway after half the time');
  for (let i = 0; i < 200; i++) stepSeason(1 / 60, true, 3);
  assert.equal(seasonUniforms.winterCover.value, 1);
  const scene = new THREE.Scene(),
    car = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  car.add(body);
  scene.add(roof, car);
  snowOnScene(scene, [car]);
  assert.ok(roof.material.userData.snowCover && !body.material.userData.snowCover);
  const shader = {
    uniforms: {},
    vertexShader: '',
    fragmentShader: 'void main() {\n#include <normal_fragment_maps>\n}',
  };
  roof.material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /snowLying/);
  assert.equal(shader.uniforms.winterCover, seasonUniforms.winterCover);
  addSnowCover(roof.material);
  assert.match(roof.material.customProgramCacheKey(), /snow-cover$/);
  seasonUniforms.winterCover.value = 0;
});

test('Winter light has no summer photograph, and snow takes grip', () => {
  const summer = daylight(13),
    winter = daylight(13, 0, { winter: 1 });
  assert.equal(summer.photo, 1);
  assert.equal(winter.photo, 0);
  assert.ok(winter.ambient > summer.ambient);
  const stop = (scale) => {
    const sim = new DrivingSimulation(undefined, straightTestTrack);
    sim.gripScale = scale;
    sim.reset(25);
    sim.z = 300;
    const x0 = sim.x;
    for (let i = 0; i < 1200 && sim.speed > 0; i++) sim.step(1 / 60, { brake: true });
    return sim.x - x0;
  };
  assert.ok(stop(winterDriving.grip) > stop(1) * 1.3, 'Longer to stop on snow');
});
