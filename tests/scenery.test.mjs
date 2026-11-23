import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadsideLayout, wBeamProfile } from '../public/roadside.js';
import { contactShadowSize, drawContactShadow } from '../public/contact-shadow.js';
import { paintFlakes, addPaintFlakes, refineWheelMaterial } from '../public/car-materials.js';
import { wheelLayout } from '../public/driving-physics.js';
import { celestialDirections } from '../public/environment.js';

test('Guardrails stand clear of the carriageway and shoulder, on a fixed post grid', () => {
  const edgeLine = 5.4,
    shoulder = 6.25;
  assert.ok(roadsideLayout.railOffset - 0.05 > shoulder, 'Rail face is beyond the gravel shoulder');
  assert.ok(roadsideLayout.railOffset > edgeLine + 1.5);
  assert.equal(roadsideLayout.span % roadsideLayout.postSpacing, 0);
  const profile = wBeamProfile();
  assert.equal(profile[0][1], 0);
  assert.ok(Math.abs(profile.at(-1)[1] - roadsideLayout.railHeight) < 1e-9);
  // A W-beam: two ridges and flat bands between them.
  const depths = profile.map(([d]) => d);
  const middle = (depths.length - 1) / 2;
  assert.ok(Math.max(...depths) > 0.04 && depths[0] < 1e-9 && depths[middle] < 1e-9);
});

test('Contact shadow covers the car footprint and darkens each tyre contact', () => {
  assert.ok(contactShadowSize.length > 4.91 && contactShadowSize.width > 1.9);
  const calls = { ellipses: [], rects: 0 };
  const ctx = {
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    fill() {},
    roundRect() {
      calls.rects++;
    },
    ellipse(x, y) {
      calls.ellipses.push([x, y]);
    },
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  drawContactShadow(ctx, wheelLayout, contactShadowSize, 10);
  assert.equal(calls.rects, 1);
  assert.equal(calls.ellipses.length, 4);
  const w = contactShadowSize.length * 10,
    h = contactShadowSize.width * 10;
  for (const [x, y] of calls.ellipses) assert.ok(x > 0 && x < w && y > 0 && y < h);
});

test('Paint flakes sit under an untouched clear coat; wheels split rubber and alloy', () => {
  const shader = () => ({
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader:
      '#include <common>\n#include <normal_fragment_maps>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>',
  });
  const paint = {};
  addPaintFlakes(paint);
  const p = shader();
  paint.onBeforeCompile(p);
  assert.match(p.fragmentShader, /normal = normalize\(normal \+ tilt/);
  assert.doesNotMatch(p.fragmentShader, /clearcoatNormal/);
  assert.match(p.vertexShader, /vFlakePosition = position \* length\(modelMatrix\[0\]\.xyz\)/);
  assert.ok(paintFlakes.cell > 0.0005 && paintFlakes.cell < 0.002);
  const wheel = {};
  refineWheelMaterial(wheel);
  const w = { ...shader(), uniforms: {} };
  wheel.onBeforeCompile(w);
  assert.match(w.fragmentShader, /roughnessFactor = mix\(wheelRough, \.92, rubber\)/);
  assert.match(w.fragmentShader, /metalnessFactor = mix\(wheelMetal, 0\., rubber\)/);
  assert.equal(w.uniforms.wheelMetal.value, 0.7, 'Silver alloy by default');
});

test('The sun light points where the sun is in the sky photograph', () => {
  const sun = celestialDirections.sun;
  assert.ok(Math.abs(sun.length() - 1) < 1e-9);
  const elevation = (Math.asin(sun.y) * 180) / Math.PI;
  assert.ok(Math.abs(elevation - 43) < 1.5, `sun elevation ${elevation.toFixed(1)}°`);
});
