import * as THREE from 'three';
import { Kit } from './build-kit.js';
import { oncoming, roadCenterZ, roadCenterSlope } from './road-profile.js';
import { structureLayout } from './road-structures.js';

// Foxes in the winter fields: red foxes trotting about on their own errands,
// head low, changing their minds, stopping to listen for mice under the snow
// and now and then leaping up to dive nose first into it. One that the car
// comes close to bolts away from it. Only in winter, a few round the car:
// those left far behind turn up again ahead.
export const foxRules = Object.freeze({
  count: 3,
  // Trotting and bolting speeds (m/s).
  trot: 3.2,
  bolt: 8,
  // Where they roam: lateral bands either side of the road (clear of the
  // motorway, the country road and the village), and how far ahead of the
  // car one turns up.
  // (On the route the left band lies beyond the oncoming carriageway.)
  bands: Object.freeze([
    Object.freeze(oncoming ? [-60, -26] : [-45, -10]),
    Object.freeze([10, 30]),
  ]),
  // Never nearer the road's centre line than this (the guardrails and the
  // gravel strips end within 8 m), nor nearer the country road.
  verge: 8.5,
  // Nor on the oncoming carriageway, on the route.
  oncoming: oncoming ? [-24, -6] : null,
  countryRoad: 34,
  ahead: Object.freeze([70, 260]),
  behind: 160,
  // The car closer than this sends one running (a car passing on the road
  // does not).
  wary: 11,
});

// Places a fox may not roam: over the tunnel and on the bridges' embankments.
export function foxCanBe(x) {
  const { period, bridges, tunnel } = structureLayout;
  const u = ((x % period) + period) % period;
  if (u > tunnel.from - 120 && u < tunnel.to + 120) return false;
  return bridges.every((b) => Math.abs(u - b) > 45);
}

function seeded(n) {
  let seed = 7919 + n * 104729;
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// The fox's parts, each in its own frame: x forward, y up, z to the right,
// the body's hips at the origin.
function foxParts() {
  const orange = 0xc65a22,
    white = 0xf2ede4,
    dark = 0x2a1d15;
  const blob = (kit, r, sx, sy, sz, x, y, z, colour) =>
    kit.add(
      new THREE.SphereGeometry(r, 10, 8),
      colour,
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion(),
        new THREE.Vector3(sx, sy, sz)
      )
    );
  const body = new Kit();
  blob(body, 1, 0.37, 0.115, 0.1, 0.02, 0.37, 0, orange);
  blob(body, 1, 0.13, 0.11, 0.1, 0.24, 0.38, 0, orange);
  blob(body, 1, 0.1, 0.08, 0.075, 0.27, 0.33, 0, white);
  blob(body, 1, 0.2, 0.05, 0.07, 0.05, 0.28, 0, white);
  const head = new Kit();
  blob(head, 1, 0.085, 0.07, 0.07, 0, 0, 0, orange);
  blob(head, 1, 0.06, 0.035, 0.045, 0.05, -0.035, 0, white);
  const snout = new THREE.ConeGeometry(0.038, 0.17, 8);
  snout.rotateZ(-Math.PI / 2);
  head.add(snout, orange, new THREE.Matrix4().setPosition(0.14, -0.015, 0));
  blob(head, 1, 0.016, 0.014, 0.016, 0.225, -0.015, 0, dark);
  for (const z of [-0.04, 0.04]) {
    const ear = new THREE.ConeGeometry(0.032, 0.095, 6);
    head.add(ear, dark, new THREE.Matrix4().makeRotationX(z * 3).setPosition(-0.015, 0.085, z));
  }
  const tail = new Kit();
  blob(tail, 1, 0.24, 0.085, 0.085, -0.2, 0, 0, orange);
  blob(tail, 1, 0.07, 0.065, 0.065, -0.42, 0, 0, white);
  const leg = new THREE.CylinderGeometry(0.019, 0.015, 0.3, 6);
  leg.translate(0, -0.15, 0);
  const legs = new Kit().add(leg, dark);
  return {
    body: body.geometry(),
    head: head.geometry(),
    tail: tail.geometry(),
    leg: legs.geometry(),
  };
}

function shadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
  g.addColorStop(0, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

export function setupFoxes(scene) {
  const parts = foxParts();
  const fur = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  // (No snow on their backs.)
  fur.userData.snowCover = true;
  const shade = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    depthWrite: false,
  });
  shade.userData.snowCover = true;
  const shadowShape = new THREE.PlaneGeometry(0.9, 0.4);
  shadowShape.rotateX(-Math.PI / 2);
  const random = seeded(3);
  const foxes = Array.from({ length: foxRules.count }, () => {
    const root = new THREE.Group();
    root.name = 'Fox';
    const body = new THREE.Mesh(parts.body, fur);
    const head = new THREE.Mesh(parts.head, fur);
    head.position.set(0.4, 0.45, 0);
    const tail = new THREE.Mesh(parts.tail, fur);
    tail.position.set(-0.32, 0.38, 0);
    const legs = [
      [0.24, -0.06],
      [0.24, 0.06],
      [-0.22, -0.06],
      [-0.22, 0.06],
    ].map(([x, z]) => {
      const l = new THREE.Mesh(parts.leg, fur);
      l.position.set(x, 0.3, z);
      return l;
    });
    const shadow = new THREE.Mesh(shadowShape, shade);
    shadow.position.y = 0.02;
    root.add(body, head, tail, ...legs, shadow);
    root.visible = false;
    scene.add(root);
    return {
      root,
      head,
      tail,
      legs,
      shadow,
      x: 0,
      lat: 0,
      heading: 0,
      mode: 'trot',
      time: 0,
      until: 0,
      phase: random() * 10,
      placed: false,
    };
  });

  // A new place ahead of the car (x along the road).
  const place = (fox, x) => {
    for (let tries = 0; tries < 20; tries++) {
      const [a, b] = foxRules.ahead;
      const u = x + a + random() * (b - a);
      if (!foxCanBe(u)) continue;
      const band = foxRules.bands[random() < 0.75 ? 0 : 1];
      fox.x = u;
      fox.lat = band[0] + random() * (band[1] - band[0]);
      fox.heading = random() * Math.PI * 2;
      fox.mode = 'trot';
      fox.time = 0;
      fox.until = 3 + random() * 5;
      fox.placed = true;
      return;
    }
  };

  const bandOf = (lat) => foxRules.bands.find(([a, b]) => lat > a - 3 && lat < b + 3);
  return {
    foxes,
    // `x`, `z`: the car; `winter` (0–1) the season.
    update(dt, x, z, winter) {
      const show = winter >= 0.5;
      for (const fox of foxes) {
        fox.root.visible = show;
        if (!show) {
          fox.placed = false;
          continue;
        }
        if (!fox.placed || fox.x < x - foxRules.behind || fox.x > x + 400 || !foxCanBe(fox.x))
          place(fox, x);
        fox.time += dt;
        const fz = roadCenterZ(fox.x) + fox.lat;
        const away = Math.hypot(fox.x - x, fz - z);
        // The car close by: off at full tilt, away from it.
        if (away < foxRules.wary && fox.mode !== 'bolt') {
          fox.mode = 'bolt';
          fox.time = 0;
          fox.until = 3;
          fox.heading = Math.atan2(-(fz - z), fox.x - x);
        }
        let speed = 0,
          hop = 0,
          headDip = 0;
        if (fox.mode === 'trot' || fox.mode === 'bolt') {
          speed = fox.mode === 'bolt' ? foxRules.bolt : foxRules.trot;
          // A busy, wandering line, steered back into its band.
          fox.heading += (Math.sin(fox.time * 0.9 + fox.phase) * 0.6 + (random() - 0.5) * 0.8) * dt;
          const band = bandOf(fox.lat);
          if (!band || fox.lat < band[0] || fox.lat > band[1]) {
            const goal = band ? (band[0] + band[1]) / 2 : foxRules.bands[0][1] - 20;
            const want = Math.atan2(-(goal - fox.lat), 0.6);
            fox.heading +=
              Math.atan2(Math.sin(want - fox.heading), Math.cos(want - fox.heading)) * dt;
          }
          headDip = fox.mode === 'bolt' ? 0.05 : 0.12;
          if (fox.time > fox.until) {
            fox.time = 0;
            if (fox.mode === 'bolt' || random() < 0.4) {
              fox.mode = 'trot';
              fox.until = 3 + random() * 6;
            } else {
              fox.mode = random() < 0.55 ? 'listen' : 'pounce';
              fox.until = fox.mode === 'listen' ? 1.5 + random() * 2 : 1.1;
            }
          }
        } else if (fox.mode === 'listen') {
          // Still, head cocked down at the snow.
          headDip = 0.35;
          if (fox.time > fox.until) {
            fox.mode = random() < 0.5 ? 'pounce' : 'trot';
            fox.time = 0;
            fox.until = fox.mode === 'pounce' ? 1.1 : 3 + random() * 5;
          }
        } else if (fox.mode === 'pounce') {
          // Up in an arc and nose first into the snow.
          const t = Math.min(1, fox.time / 0.8);
          speed = t < 1 ? 2.2 : 0;
          hop = Math.sin(Math.PI * t) * 0.9;
          headDip = t < 0.5 ? -0.2 : 0.7;
          if (fox.time > fox.until) {
            fox.mode = 'trot';
            fox.time = 0;
            fox.until = 3 + random() * 5;
          }
        }
        // Moving along the heading (x along the road, lat across it).
        fox.x += Math.cos(fox.heading) * speed * dt;
        fox.lat -= Math.sin(fox.heading) * speed * dt;
        // It turns back at the verge (and short of the country road).
        if (foxRules.oncoming && fox.lat > foxRules.oncoming[0] && fox.lat < foxRules.oncoming[1]) {
          fox.lat = foxRules.oncoming[0];
          fox.heading = -fox.heading;
        }
        const sideOf = Math.sign(fox.lat) || -1;
        if (Math.abs(fox.lat) < foxRules.verge || (sideOf > 0 && fox.lat > foxRules.countryRoad)) {
          fox.lat =
            sideOf * THREE.MathUtils.clamp(Math.abs(fox.lat), foxRules.verge, foxRules.countryRoad);
          fox.heading = -fox.heading;
        }
        const wz = roadCenterZ(fox.x) + fox.lat;
        fox.root.position.set(fox.x, hop, wz);
        // (Its heading is along the road's curve; the world's turns with it.)
        const slope = roadCenterSlope(fox.x);
        fox.root.rotation.set(
          0,
          Math.atan2(Math.sin(fox.heading) - slope * Math.cos(fox.heading), Math.cos(fox.heading)),
          fox.mode === 'pounce' ? Math.cos(Math.PI * Math.min(1, fox.time / 0.8)) * 0.6 : 0
        );
        // Legs at a trot (diagonal pairs together), tucked up in a leap.
        const stride = fox.phase + fox.time * (speed > 0 ? speed * 3.2 : 0);
        fox.legs.forEach((leg, i) => {
          const pair = i === 0 || i === 3 ? 0 : Math.PI;
          leg.rotation.z =
            hop > 0.05 ? (i < 2 ? -0.9 : 0.9) : speed > 0 ? Math.sin(stride + pair) * 0.5 : 0;
        });
        fox.root.position.y += speed > 0 && hop === 0 ? Math.abs(Math.sin(stride)) * 0.025 : 0;
        fox.head.rotation.z = -headDip - (speed > 0 ? Math.sin(stride * 2) * 0.04 : 0);
        fox.head.position.y = 0.45 - headDip * 0.12;
        fox.tail.rotation.z =
          (fox.mode === 'bolt' ? 0.1 : -0.25) + Math.sin(fox.time * 3 + fox.phase) * 0.08;
        fox.tail.rotation.y = Math.sin(fox.time * 2.1 + fox.phase) * 0.15;
        fox.shadow.position.y = 0.02 - fox.root.position.y;
        fox.shadow.scale.setScalar(1 - hop * 0.5);
      }
    },
  };
}
