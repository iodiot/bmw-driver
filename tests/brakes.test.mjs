import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { BrakeHeatState, brakeGlow } from '../public/brake-heat.js';
import { createRotorPlate, brakeSpecifications } from '../public/brakes.js';
import { DrivingSimulation } from '../public/driving-physics.js';
import { m5Specifications } from '../public/powertrain.js';

function stop(initialSpeed, fps = 60, heat = new BrakeHeatState()) {
  const sim = new DrivingSimulation();
  sim.reset(initialSpeed / 3.6);
  let peak = 20;
  while (sim.speed > 0) {
    const previous = sim.brakeEnergy;
    sim.step(1 / fps, { brake: true });
    heat.step(1 / fps, { energy: sim.brakeEnergy - previous, speed: sim.speed });
    peak = Math.max(peak, heat.discs[0].surface);
  }
  return { sim, heat, peak };
}

test('Brake heat follows actual lost kinetic energy; normal stops do not glow', () => {
  for (const speed of [30, 100, 250]) {
    const { sim, heat, peak } = stop(speed);
    const kinetic = 0.5 * m5Specifications.mass * (speed / 3.6) ** 2;
    assert.ok(Math.abs(sim.brakeEnergy - kinetic) < 1e-6);
    assert.equal(heat.discs[0].surface, heat.discs[1].surface);
    assert.equal(heat.discs[2].surface, heat.discs[3].surface);
    assert.ok(heat.discs[0].surface > heat.discs[2].surface, 'Front rotors absorb more brake work');
    if (speed <= 100)
      assert.equal(brakeGlow(peak), 0, 'Ordinary low-speed braking cannot glow orange');
    if (speed === 250)
      assert.ok(brakeGlow(peak) > 0, 'A very hard high-speed stop should show a hot friction ring');
  }
  const parked = new DrivingSimulation();
  parked.reset(0);
  for (let i = 0; i < 600; i++) parked.step(1 / 60, { brake: true });
  assert.equal(parked.brakeEnergy, 0, 'Holding the pedal at rest cannot create heat');
  const coast = new DrivingSimulation();
  coast.reset(40);
  for (let i = 0; i < 240; i++) coast.step(1 / 60, {});
  assert.equal(coast.brakeEnergy, 0, 'Coasting and engine braking must not heat the discs');
});

test('Hot discs retain heat, cool progressively, and respond to airflow and rain', () => {
  const base = stop(250).heat;
  const before = base.discs[0].surface;
  const make = () => {
    const heat = new BrakeHeatState();
    heat.discs = structuredClone(base.discs);
    return heat;
  };
  const still = make(),
    moving = make(),
    rain = make();
  for (let i = 0; i < 30 * 60; i++) {
    still.step(1 / 60, {});
    moving.step(1 / 60, { speed: 60 });
    rain.step(1 / 60, { speed: 60, raining: true });
  }
  assert.ok(still.discs[0].surface < before && still.discs[0].surface > 20);
  assert.ok(moving.discs[0].surface < still.discs[0].surface);
  assert.ok(rain.discs[0].surface < moving.discs[0].surface);
  const repeated = stop(250, 60, base);
  assert.ok(repeated.peak > before, 'Repeated braking accumulates heat');
  assert.ok(brakeGlow(repeated.peak) > brakeGlow(before));
  // Grip-limited stops take longer and shed more heat than the former fixed
  // 15 m/s² deceleration. Repeated high-speed stops must still glow strongly.
  assert.ok(brakeGlow(repeated.peak) > 0.35);
  repeated.heat.reset();
  assert.ok(repeated.heat.discs.every((d) => d.surface === 20 && d.core === 20));
  const peaks = [30, 60, 144].map((fps) => stop(250, fps).peak);
  assert.ok(
    Math.max(...peaks) - Math.min(...peaks) < 2,
    'Heating must be stable across frame rates'
  );
});

test('All drilled holes are genuine open geometry on both mirrored rotors', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ray = new THREE.Raycaster();
  for (const spec of Object.values(brakeSpecifications))
    for (const side of [-1, 1]) {
      const geometry = createRotorPlate(spec, side),
        mesh = new THREE.Mesh(geometry, material);
      mesh.updateMatrixWorld(true);
      for (const { centre } of geometry.userData.drilledHoles) {
        ray.set(new THREE.Vector3(centre.x, centre.y, 0.1), new THREE.Vector3(0, 0, -1));
        assert.equal(
          ray.intersectObject(mesh, false).length,
          0,
          'A drilling cannot be painted over a solid disc'
        );
      }
      const angle = Math.PI / 12,
        radius = (spec.diameter / 2 + spec.innerRadius) / 2;
      ray.set(
        new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.1),
        new THREE.Vector3(0, 0, -1)
      );
      assert.ok(
        ray.intersectObject(mesh, false).length > 0,
        'The friction ring between drillings remains solid'
      );
      assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
      geometry.dispose();
    }
  material.dispose();
});
