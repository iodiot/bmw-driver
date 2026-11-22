import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { mergeStaticMeshes } from '../public/merge-static.js';

test('Still parts sharing a material become one mesh in the same place; kept parts stay', () => {
  const root = new THREE.Group();
  root.position.set(5, 1, 0);
  const leather = new THREE.MeshStandardMaterial(),
    chrome = new THREE.MeshStandardMaterial();
  const box = () => new THREE.BoxGeometry(1, 1, 1);
  const a = new THREE.Mesh(box(), leather);
  a.position.set(2, 0, 0);
  // A mirrored copy, as the left and right door cards are.
  const b = new THREE.Mesh(box(), leather);
  b.position.set(-2, 0, 0);
  b.scale.set(-1, 1, 1);
  const c = new THREE.Mesh(box(), chrome);
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(box(), leather);
  wheel.add(rim);
  root.add(a, b, c, wheel);
  const before = new THREE.Box3().setFromObject(root);
  const { before: n0, after: n1 } = mergeStaticMeshes(root, [wheel]);
  assert.equal(n0, 4);
  assert.equal(n1, 3, 'the two leather parts became one; chrome and the wheel stay');
  assert.equal(rim.parent, wheel);
  assert.equal(c.parent, root);
  const after = new THREE.Box3().setFromObject(root);
  assert.ok(before.min.distanceTo(after.min) < 1e-6 && before.max.distanceTo(after.max) < 1e-6);
  // Every face of the merged mesh still faces outward.
  const merged = root.children.find((o) => o.name.startsWith('Merged'));
  const g = merged.geometry,
    p = g.attributes.position,
    index = g.index.array;
  const v = [0, 1, 2].map(() => new THREE.Vector3());
  const centre = new THREE.Vector3();
  for (let i = 0; i < index.length; i += 3) {
    v.forEach((vec, k) => vec.fromBufferAttribute(p, index[i + k]));
    const normal = new THREE.Vector3()
      .subVectors(v[1], v[0])
      .cross(new THREE.Vector3().subVectors(v[2], v[0]));
    const faceCentre = new THREE.Vector3().add(v[0]).add(v[1]).add(v[2]).divideScalar(3);
    centre.set(faceCentre.x > 0 ? 2 : -2, 0, 0);
    assert.ok(normal.dot(faceCentre.sub(centre)) > 0, 'outward');
  }
});

test('Parts under a group marked to keep (the wipers) are never joined', () => {
  const root = new THREE.Group();
  const black = new THREE.MeshStandardMaterial();
  const wipers = new THREE.Group();
  wipers.userData.keep = true;
  const arms = [0, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), black));
  wipers.add(...arms);
  const trim = [0, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), black));
  root.add(wipers, ...trim);
  const { before, after } = mergeStaticMeshes(root);
  assert.equal(before, 4);
  assert.equal(after, 3, 'the two trim parts became one; the arms stay');
  for (const arm of arms) assert.equal(arm.parent, wipers);
});
