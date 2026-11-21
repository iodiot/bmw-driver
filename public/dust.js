import * as THREE from 'three';

// Dust thrown up by the rear wheels off the asphalt: soft billows that stay
// behind the car, grow, rise a little and thin out. Dry dirt raises the most,
// gravel less, grass hardly any; wet ground none.
export const dustSettings = Object.freeze({
  capacity: 420,
  // Particles per second per wheel at full rate (25 m/s and above).
  rate: Object.freeze({ dirt: 55, gravel: 30, grass: 3, asphalt: 0 }),
  // Car-space x of the rear bumper: dust starts behind it and stays faint
  // and small close to the body, so the camera-facing puffs never cut
  // through the car.
  rear: -2.45,
  // Dust is paler than the ground it comes from.
  colour: Object.freeze({
    dirt: Object.freeze([0.8, 0.71, 0.58]),
    gravel: Object.freeze([0.78, 0.76, 0.72]),
    grass: Object.freeze([0.66, 0.64, 0.52]),
    asphalt: Object.freeze([0.5, 0.5, 0.5]),
  }),
});

// Emission per second for one wheel on a surface at a speed, dry or wet.
export function dustRate(surface, speed, wetness = 0) {
  const base = dustSettings.rate[surface] ?? 0;
  return base * Math.min(1, Math.max(0, (speed - 2) / 23)) * Math.max(0, 1 - wetness * 1.5);
}

export function setupDust(scene) {
  const { capacity, colour } = dustSettings;
  const position = new Float32Array(capacity * 3),
    colours = new Float32Array(capacity * 3),
    size = new Float32Array(capacity),
    alpha = new Float32Array(capacity);
  const geometry = new THREE.BufferGeometry();
  const attribute = (array, n) =>
    new THREE.BufferAttribute(array, n).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute(position, 3));
  geometry.setAttribute('color', attribute(colours, 3));
  geometry.setAttribute('size', attribute(size, 1));
  geometry.setAttribute('alpha', attribute(alpha, 1));
  const uniforms = { pixelScale: { value: 800 }, light: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float size;
      attribute float alpha;
      attribute vec3 color;
      uniform float pixelScale;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * view;
        gl_PointSize = size * pixelScale / max(-view.z, .1);
        vAlpha = alpha;
        vColor = color;
      }
    `,
    fragmentShader: `
      uniform float light;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        float r = length(gl_PointCoord - .5) * 2.;
        float a = vAlpha * (1. - smoothstep(.2, 1., r));
        if (a < .003) discard;
        gl_FragColor = vec4(vColor * light, a);
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'Wheel dust';
  points.frustumCulled = false;
  points.renderOrder = 4;
  scene.add(points);
  // All particles start spent.
  const particles = Array.from({ length: capacity }, () => ({
    life: 1,
    span: 1,
    colour: colour.dirt,
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
  function emit(x, z, vx, vz, surface) {
    const p = particles[next];
    next = (next + 1) % capacity;
    Object.assign(p, {
      life: 0,
      span: 1.6 + Math.random() * 1.6,
      x: x + (Math.random() - 0.5) * 0.3,
      y: 0.15 + Math.random() * 0.15,
      z: z + (Math.random() - 0.5) * 0.3,
      // Kicked up off the tyre and caught in the car's wake, which drags
      // it along at first, so the cloud hangs just behind the car.
      vx: vx * (0.55 + 0.2 * Math.random()) + (Math.random() - 0.5) * 1.5,
      vy: 0.4 + Math.random() * 0.8,
      vz: vz * (0.55 + 0.2 * Math.random()) + (Math.random() - 0.5) * 1.5,
      colour: colour[surface],
    });
  }
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
      { running = true, wetness = 0, viewportHeight = 800, camera, light = 1 } = {}
    ) {
      dt = Math.min(dt, 1 / 15);
      if (camera)
        uniforms.pixelScale.value = (viewportHeight / 2) * camera.projectionMatrix.elements[5];
      uniforms.light.value = light;
      if (running && simulation) {
        const c = Math.cos(simulation.heading),
          s = Math.sin(simulation.heading);
        const vx = c * simulation.speed - s * simulation.lateralVelocity,
          vz = -(s * simulation.speed + c * simulation.lateralVelocity);
        for (const w of simulation.wheels) {
          if (w.x > 0 || !w.contact) continue;
          const rate = dustRate(
            w.surface,
            Math.hypot(simulation.speed, simulation.lateralVelocity),
            wetness
          );
          if (rate <= 0) continue;
          const key = w.x * 10 + w.z;
          let due = (pending.get(key) ?? 0) + rate * dt;
          // Behind the bumper, in line with the wheel.
          const ex = dustSettings.rear - 0.25;
          const wx = simulation.x + c * ex + s * w.z,
            wz = simulation.z - s * ex + c * w.z;
          while (due >= 1) {
            emit(wx, wz, vx, vz, w.surface);
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
          // Air drag slows the throw; the cloud drifts up slowly.
          const drag = Math.exp(-1.1 * dt);
          p.vx *= drag;
          p.vz *= drag;
          p.vy = p.vy * drag + 0.12 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
        }
        position.set([p.x, p.y, p.z], i * 3);
        colours.set(p.colour, i * 3);
        size[i] = 0.5 + 3 * Math.sqrt(t);
        alpha[i] = 0.5 * Math.min(1, t * 8) * (1 - t) * (1 - t);
        if (simulation) {
          // Distance behind the bumper: puffs close to the car are kept
          // small and faint, so none reaches into the body.
          const along =
            (p.x - simulation.x) * Math.cos(simulation.heading) -
            (p.z - simulation.z) * Math.sin(simulation.heading);
          const behind = dustSettings.rear - along;
          size[i] = Math.min(size[i], 0.3 + 1.4 * Math.max(0, behind));
          alpha[i] *= Math.min(1, Math.max(0, (behind - 0.1) / 1.4));
        }
      }
      points.visible = active > 0;
      if (active > 0)
        for (const name of ['position', 'color', 'size', 'alpha'])
          geometry.attributes[name].needsUpdate = true;
    },
  };
}
