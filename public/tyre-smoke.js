import * as THREE from 'three';
import { puffMaterial } from './dust.js';

// White tyre smoke when rubber slides on dry asphalt: in a drift, a hard
// slide or wheelspin. It billows out from the tyre beside the wheel arch,
// hangs in the air, spreads and drifts up. Wet asphalt makes little (the
// water cools the rubber); loose ground none (it throws dust instead).
export const smokeSettings = Object.freeze({
  capacity: 520,
  // Puffs per second from one tyre at full slide.
  rate: 70,
  // Axle slip angle (rad) where smoke starts, and where it is at its
  // thickest: a real slide or drift, not a brisk lane change.
  slipFrom: 0.13,
  slipFull: 0.32,
  colour: Object.freeze([0.8, 0.81, 0.84]),
  // Half-size of the body in car space (x along, z across): puffs inside it
  // are hidden, so smoke never shows through the bodywork.
  body: Object.freeze({ along: 2.45, across: 0.93, height: 1.42 }),
});

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Puffs per second from one wheel.
export function smokeRate(wheel, { speed = 0, tractionLoss = 0, wet = false } = {}) {
  if (!wheel?.contact || wheel.surface !== 'asphalt') return 0;
  const slide = smooth(smokeSettings.slipFrom, smokeSettings.slipFull, wheel.slip ?? 0);
  // Wheelspin: the driven rear tyres losing traction.
  const spin = wheel.x < 0 ? smooth(0.4, 0.9, tractionLoss) : 0;
  const amount = Math.max(slide * smooth(4, 12, speed), spin * smooth(1, 4, speed));
  return smokeSettings.rate * amount * (wet ? 0.15 : 1);
}

// How far a point at car-space (along, across, height) is outside the
// body's box (negative inside).
export function bodyGap(along, across, height) {
  const { body } = smokeSettings;
  return Math.max(
    Math.abs(along) - body.along,
    Math.abs(across) - body.across,
    height - body.height
  );
}

export function setupTyreSmoke(scene) {
  const { capacity, colour } = smokeSettings;
  const position = new Float32Array(capacity * 3),
    colours = new Float32Array(capacity * 3),
    size = new Float32Array(capacity),
    alpha = new Float32Array(capacity);
  for (let i = 0; i < capacity; i++) colours.set(colour, i * 3);
  const geometry = new THREE.BufferGeometry();
  const attribute = (array, n) =>
    new THREE.BufferAttribute(array, n).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute('size', attribute(size, 1));
  geometry.setAttribute('alpha', attribute(alpha, 1));
  const { material, uniforms } = puffMaterial();
  const points = new THREE.Points(geometry, material);
  points.name = 'Tyre smoke';
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.visible = false;
  scene.add(points);
  const particles = Array.from({ length: capacity }, () => ({
    life: 1,
    span: 1,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
  }));
  let next = 0,
    active = 0;
  const pending = new Map();
  return {
    points,
    get active() {
      return active;
    },
    reset() {
      for (const p of particles) p.life = p.span;
      pending.clear();
    },
    update(
      dt,
      simulation,
      { running = true, wet = false, viewportHeight = 800, camera, light = 1 } = {}
    ) {
      dt = Math.min(dt, 1 / 15);
      if (camera)
        uniforms.pixelScale.value = (viewportHeight / 2) * camera.projectionMatrix.elements[5];
      uniforms.light.value = light;
      if (!simulation) return;
      const c = Math.cos(simulation.heading),
        s = Math.sin(simulation.heading);
      if (running) {
        const vx = c * simulation.speed - s * simulation.lateralVelocity,
          vz = -(s * simulation.speed + c * simulation.lateralVelocity);
        for (const w of simulation.wheels) {
          const rate = smokeRate(w, {
            speed: Math.hypot(simulation.speed, simulation.lateralVelocity),
            tractionLoss: simulation.tractionLoss,
            wet,
          });
          const key = w.x * 10 + w.z;
          let due = (pending.get(key) ?? 0) + rate * dt;
          // At the tyre's outer face, where smoke rolls out of the arch.
          const side = Math.sign(w.z) || 1;
          const ex = w.x - 0.15,
            ez = w.z + side * 0.12;
          const wx = simulation.x + c * ex + s * ez,
            wz = simulation.z - s * ex + c * ez;
          while (due >= 1) {
            const p = particles[next];
            next = (next + 1) % capacity;
            // Out sideways and dragged along by the car's wake at first.
            const outward = 0.6 + Math.random() * 1.2;
            Object.assign(p, {
              life: 0,
              span: 2.2 + Math.random() * 2,
              x: wx + (Math.random() - 0.5) * 0.25,
              y: 0.2 + Math.random() * 0.15,
              z: wz + (Math.random() - 0.5) * 0.25,
              vx: vx * (0.35 + 0.2 * Math.random()) + s * side * outward,
              vy: 0.3 + Math.random() * 0.5,
              vz: vz * (0.35 + 0.2 * Math.random()) + c * side * outward,
            });
            due--;
          }
          pending.set(key, due);
        }
      }
      active = 0;
      for (let i = 0; i < capacity; i++) {
        const p = particles[i];
        if (running) p.life += dt;
        const t = p.life / p.span;
        if (t >= 1) {
          alpha[i] = 0;
          size[i] = 0;
          continue;
        }
        active++;
        if (running) {
          const drag = Math.exp(-1.4 * dt);
          p.vx *= drag;
          p.vz *= drag;
          p.vy = p.vy * drag + 0.15 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
        }
        position.set([p.x, p.y, p.z], i * 3);
        const dx = p.x - simulation.x,
          dz = p.z - simulation.z;
        const gap = bodyGap(dx * c - dz * s, dx * s + dz * c, p.y);
        // Hidden inside the body, and kept small close to it, so no puff
        // reaches across the bodywork.
        size[i] = Math.min(0.5 + 4.6 * Math.sqrt(t), 0.35 + 2.5 * Math.max(0, gap));
        // Rising as it spreads, so a puff's lower edge does not cut into the
        // road; thin at first, thickest a moment later, fading slowly.
        position[i * 3 + 1] = Math.max(p.y, size[i] * 0.32);
        alpha[i] = 0.36 * Math.min(1, t * 4) * Math.pow(1 - t, 1.6) * smooth(0, 0.25, gap);
      }
      points.visible = active > 0;
      if (active > 0)
        for (const name of ['position', 'size', 'alpha'])
          geometry.attributes[name].needsUpdate = true;
    },
  };
}
