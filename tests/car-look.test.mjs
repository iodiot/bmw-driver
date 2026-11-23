import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  applyLook,
  defaultLook,
  loadLook,
  paints,
  saveLook,
  wheelFinishes,
  wheelUniforms,
} from '../public/car-look.js';
import { rearGlowStrength } from '../public/rear-glow.js';

function memory() {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) };
}

test('Paint and wheels are chosen, applied and remembered', () => {
  const storage = memory();
  assert.deepEqual(loadLook(storage), defaultLook);
  saveLook({ paint: 'imola-red', wheels: 'black' }, storage);
  assert.deepEqual(loadLook(storage), { paint: 'imola-red', wheels: 'black' });
  saveLook({ paint: 'nonsense', wheels: 'bronze' }, storage);
  assert.equal(loadLook(storage).paint, defaultLook.paint, 'Unknown paint falls back');
  const material = new THREE.MeshPhysicalMaterial();
  const { paint } = applyLook([material], { paint: 'frozen-grey', wheels: 'bronze' });
  assert.equal(paint.name, 'Frozen Grey (matt)');
  assert.ok(material.clearcoatRoughness > 0.4, 'Matt clear coat');
  assert.equal(`#${material.color.getHexString()}`, '#5e6266');
  assert.equal(wheelUniforms.wheelTint.value.getHex(), 0xa47a42);
  assert.equal(new Set(paints.map((p) => p.id)).size, paints.length);
  assert.equal(new Set(wheelFinishes.map((w) => w.id)).size, wheelFinishes.length);
});

test('Reversing lamps light the road behind only after dark', () => {
  assert.equal(rearGlowStrength(0, 1, 0), 0);
  assert.equal(rearGlowStrength(1, 0, 0), 0, 'Nothing while not reversing');
  assert.ok(rearGlowStrength(1, 1, 0) > 0.9);
  assert.ok(rearGlowStrength(1, 0) > 0.3, 'Tail lamps glow at rest');
});
