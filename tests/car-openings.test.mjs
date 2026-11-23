import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carOpenings, cutTriangle, splitPolygon } from '../public/car-openings.js';

const area = (polygon) => {
  let total = 0;
  for (let i = 1; i < polygon.length - 1; i++) {
    const [a, b, c] = [polygon[0].p, polygon[i].p, polygon[i + 1].p];
    const u = b.map((v, k) => v - a[k]),
      w = c.map((v, k) => v - a[k]);
    const cross = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    total += Math.hypot(...cross) / 2;
  }
  return total;
};
const vertex = (x, y, z) => ({ p: [x, y, z], a: [x, y, z, 1] });

test('a plane splits a triangle into two pieces of the same total area', () => {
  const triangle = [vertex(0, 0, 0), vertex(2, 0, 0), vertex(0, 2, 0)];
  const [inner, outer] = splitPolygon(triangle, [1, 0, 0, 0.5]);
  assert.ok(Math.abs(area(inner) + area(outer) - area(triangle)) < 1e-9);
  // Attributes are interpolated along with the position.
  for (const v of [...inner, ...outer]) assert.deepEqual(v.a.slice(0, 3), v.p);
});

test("a door's skin goes with the door and the rest stays, nothing lost", () => {
  const openings = Object.entries(carOpenings);
  // A triangle on the left side straddling the front door's rear edge.
  const triangle = [vertex(-0.6, 0.1, -0.92), vertex(0.2, 0.1, -0.92), vertex(-0.2, 0.5, -0.88)];
  const pieces = cutTriangle(triangle, openings);
  const owners = new Set(pieces.map(([owner]) => owner));
  assert.ok(owners.has('frontLeft') && owners.has('rearLeft'));
  const total = pieces.reduce((sum, [, polygon]) => sum + area(polygon), 0);
  assert.ok(Math.abs(total - area(triangle)) < 1e-9);
  // The seats and the cabin's middle stay put.
  const seat = [vertex(-0.2, 0.1, -0.3), vertex(0.2, 0.1, -0.3), vertex(0, 0.4, -0.3)];
  assert.deepEqual(new Set(cutTriangle(seat, openings).map(([o]) => o)), new Set([null]));
  // The bonnet's top and the boot lid's.
  const hood = [vertex(1.5, 0.38, -0.2), vertex(1.8, 0.36, 0.2), vertex(1.6, 0.37, 0)];
  assert.deepEqual(new Set(cutTriangle(hood, openings).map(([o]) => o)), new Set(['bonnet']));
  const lid = [vertex(-2.1, 0.49, -0.2), vertex(-2.3, 0.48, 0.2), vertex(-2.2, 0.49, 0)];
  assert.deepEqual(new Set(cutTriangle(lid, openings).map(([o]) => o)), new Set(['boot']));
});
