import * as THREE from 'three';

// Outlet centres measured on the imported model, just beyond each metal rim.
export const exhaustOutlets = [
  [-2.434, 0.299, 0.461],
  [-2.417, 0.298, 0.561],
  [-2.434, 0.299, -0.461],
  [-2.417, 0.298, -0.561],
];

export class ExhaustSimulation {
  constructor(random = Math.random, capacity = 512) {
    this.random = random;
    this.particles = Array.from({ length: capacity }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      age: Infinity,
      life: 1,
      opacity: 0,
      size: 0,
      strength: 0,
      seed: 0,
    }));
    this.reset();
  }

  reset() {
    this.cursor = 0;
    this.accumulator = 0;
    this.load = 0.2;
    this.previousOutlets = null;
    for (const particle of this.particles) {
      particle.age = Infinity;
      particle.opacity = 0;
    }
  }

  step(dt, { outlets, direction, vehicleVelocity, throttle = 0.2, enabled = true }) {
    if (!enabled || dt <= 0) return;
    dt = Math.min(dt, 1 / 15);
    if (!this.previousOutlets) this.previousOutlets = outlets.map((p) => p.clone());
    const steps = Math.ceil(dt * 120);
    const h = dt / steps;
    const speed = vehicleVelocity.length();

    for (let step = 0; step < steps; step++) {
      this.load = THREE.MathUtils.damp(this.load, throttle, 5, h);
      for (const p of this.particles) {
        if (p.age >= p.life) continue;
        p.age += h;
        if (p.age >= p.life) {
          p.opacity = 0;
          continue;
        }
        const drag = Math.exp(-1.5 * h);
        p.velocity.x = 0.08 + (p.velocity.x - 0.08) * drag;
        p.velocity.z = 0.1 + (p.velocity.z - 0.1) * drag;
        p.velocity.y += (0.28 + 0.07 * Math.sin(p.seed + p.age * 5)) * h;
        p.velocity.x += Math.sin(p.seed + p.age * 7) * 0.12 * h;
        p.velocity.z += Math.cos(p.seed * 1.3 + p.age * 6) * 0.18 * h;
        p.position.addScaledVector(p.velocity, h);
        const t = p.age / p.life;
        p.size = 0.045 + 0.48 * Math.pow(t, 1.3);
        p.opacity = p.strength * THREE.MathUtils.smoothstep(p.age, 0, 0.06) * Math.pow(1 - t, 1.7);
      }

      // Four small jets merge into a translucent wake, rather than a dark smoke trail.
      this.accumulator += (42 + this.load * 28) * h;
      while (this.accumulator >= 1) {
        this.accumulator -= 1;
        const fraction = (step + 1) / steps;
        for (let i = 0; i < outlets.length; i++) {
          const p = this.particles[this.cursor];
          this.cursor = (this.cursor + 1) % this.particles.length;
          p.position.lerpVectors(this.previousOutlets[i], outlets[i], fraction);
          p.position.y += (this.random() - 0.5) * 0.012;
          p.velocity.copy(vehicleVelocity).addScaledVector(direction, 0.85 + this.load * 2.6);
          p.velocity.y += 0.04 + this.random() * 0.06;
          p.velocity.z += (this.random() - 0.5) * 0.12;
          p.age = 0;
          p.life = 1.15 + this.random() * 0.5;
          p.seed = this.random() * 1000;
          p.size = 0.045;
          p.opacity = 0;
          p.strength = (0.05 + this.load * 0.035) / (1 + speed * 0.025);
        }
      }
    }
    outlets.forEach((p, i) => this.previousOutlets[i].copy(p));
  }
}

export function setupExhaust(scene, rig) {
  const simulation = new ExhaustSimulation();
  const count = simulation.particles.length;
  const geometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geometry.index = quad.index;
  geometry.attributes.position = quad.attributes.position;
  geometry.attributes.uv = quad.attributes.uv;
  const positions = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const sizes = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  const opacities = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  const seeds = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  for (const attribute of [positions, sizes, opacities, seeds])
    attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('particlePosition', positions);
  geometry.setAttribute('particleSize', sizes);
  geometry.setAttribute('particleOpacity', opacities);
  geometry.setAttribute('particleSeed', seeds);
  geometry.instanceCount = count;

  const dayColor = new THREE.Color(0xb9c1c6);
  const nightColor = new THREE.Color(0x73839a);
  const material = new THREE.ShaderMaterial({
    uniforms: { vaporColor: { value: dayColor.clone() } },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      attribute vec3 particlePosition;
      attribute float particleSize;
      attribute float particleOpacity;
      attribute float particleSeed;
      varying vec2 vUv;
      varying float vOpacity;
      varying float vSeed;

      void main() {
        float angle = particleSeed;
        mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        vec4 viewPosition = viewMatrix * vec4(particlePosition, 1.);
        viewPosition.xy += rotation * position.xy * particleSize;
        gl_Position = projectionMatrix * viewPosition;
        vUv = uv;
        vOpacity = particleOpacity;
        vSeed = particleSeed;
      }
    `,
    fragmentShader: `
      uniform vec3 vaporColor;
      varying vec2 vUv;
      varying float vOpacity;
      varying float vSeed;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }

      void main() {
        vec2 p = (vUv - .5) * 2.;
        float detail = noise(vUv * 4. + vSeed) * .65 +
                       noise(vUv * 9. + vSeed * 1.7) * .35;
        float radius = length(p + .10 * vec2(sin(vSeed), cos(vSeed)));
        float edge = 1. - smoothstep(.12 + detail * .1, 1., radius);
        float alpha = vOpacity * edge * edge * (.55 + detail * .45);
        if (alpha < .0001) discard;
        gl_FragColor = vec4(vaporColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const smoke = new THREE.Mesh(geometry, material);
  smoke.name = 'Exhaust vapor';
  smoke.frustumCulled = false;
  scene.add(smoke);

  const localOutlets = exhaustOutlets.map(([x, y, z]) => new THREE.Vector3(x, y - 0.55, z));
  const outlets = localOutlets.map(() => new THREE.Vector3());
  const direction = new THREE.Vector3();
  const vehicleVelocity = new THREE.Vector3();

  return {
    reset() {
      simulation.reset();
      opacities.array.fill(0);
      opacities.needsUpdate = true;
    },
    update(dt, state, { enabled, accelerate, brake, night }) {
      rig.body.updateWorldMatrix(true, false);
      localOutlets.forEach((p, i) => outlets[i].copy(p).applyMatrix4(rig.body.matrixWorld));
      direction.set(-1, 0, 0).transformDirection(rig.body.matrixWorld);
      vehicleVelocity.set(
        state.speed * Math.cos(state.heading),
        0,
        -state.speed * Math.sin(state.heading)
      );
      simulation.step(dt, {
        outlets,
        direction,
        vehicleVelocity,
        throttle: accelerate ? 1 : brake ? 0.04 : 0.2 + state.speed / 150,
        enabled,
      });
      let active = 0;
      simulation.particles.forEach((p, i) => {
        positions.setXYZ(i, p.position.x, p.position.y, p.position.z);
        sizes.setX(i, p.size);
        opacities.setX(i, p.opacity);
        seeds.setX(i, p.seed);
        if (p.opacity > 0) active++;
      });
      for (const attribute of [positions, sizes, opacities, seeds]) attribute.needsUpdate = true;
      material.uniforms.vaporColor.value.copy(night ? nightColor : dayColor);
      return active;
    },
  };
}
