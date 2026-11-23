import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  elevationPeriod,
  hills,
  installTerrainLift,
  keepUnlifted,
  maxGrade,
  roadElevation,
  roadGrade,
  terrainGLSL,
} from '../public/terrain.js';
import { DrivingSimulation } from '../public/driving-physics.js';

test('Hills are gentle, smooth and repeat with the sections', () => {
  let steepest = 0,
    low = Infinity,
    high = -Infinity;
  for (let x = 0; x < elevationPeriod; x += 2) {
    const h = roadElevation(x);
    low = Math.min(low, h);
    high = Math.max(high, h);
    steepest = Math.max(steepest, Math.abs(roadGrade(x)));
    // The grade is the height's slope.
    const numeric = (roadElevation(x + 0.01) - roadElevation(x - 0.01)) / 0.02;
    assert.ok(Math.abs(numeric - roadGrade(x)) < 1e-6);
  }
  assert.ok(steepest <= maxGrade + 1e-9, `grade ${steepest}`);
  assert.ok(high - low > 5, 'Real hills, not a ripple');
  assert.ok(Math.abs(roadElevation(123) - roadElevation(123 + elevationPeriod)) < 1e-9);
  assert.ok(Math.abs(roadElevation(-50) - roadElevation(elevationPeriod - 50)) < 1e-9);
  assert.equal(hills.length, 4);
  assert.match(terrainGLSL, /#ifndef TERRAIN_LIFT/);
});

test('Standard shaders are lifted by the land, the car is not', () => {
  installTerrainLift();
  installTerrainLift();
  assert.match(THREE.ShaderChunk.project_vertex, /terrainLift\(liftedPosition\.x\)/);
  assert.equal(THREE.ShaderChunk.common.split('#define TERRAIN_LIFT').length, 2, 'Installed once');
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  body.castShadow = true;
  car.add(body);
  keepUnlifted(car);
  assert.ok('NO_TERRAIN_LIFT' in body.material.defines);
  assert.ok('NO_TERRAIN_LIFT' in body.customDepthMaterial.defines);
});

test('A climb slows a coasting car, a descent speeds it up', () => {
  const coast = (grade) => {
    const sim = new DrivingSimulation(undefined, {
      height: () => 0,
      guardrails: false,
      grade: () => grade,
    });
    sim.reset(25);
    sim.z = 300;
    for (let i = 0; i < 300; i++) sim.step(1 / 60, {});
    return sim.speed;
  };
  const flat = coast(0),
    up = coast(0.04),
    down = coast(-0.04);
  assert.ok(up < flat - 1.5, `up ${up} flat ${flat}`);
  assert.ok(down > flat + 1.5, `down ${down} flat ${flat}`);
});
