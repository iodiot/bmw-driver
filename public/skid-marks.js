import * as THREE from 'three';
import { routeUniforms } from './route.js';
import { roadHeight, roadProfileGLSL } from './road-profile.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const fadeEnd = 65;

export function brakingMarkStrength(wheel, state, { enabled, braking, raining }) {
  if (!enabled || !wheel.contact || state.speed < 2 || wheel.load < wheel.staticLoad * 0.12)
    return 0;
  const hardBraking =
    braking && (state.brakePressure ?? 1) >= 0.88 && state.speed >= 45 / 3.6
      ? THREE.MathUtils.smoothstep(-state.acceleration, raining ? 4.8 : 8.8, raining ? 5.5 : 10.2)
      : 0;
  const lateralScrub =
    THREE.MathUtils.smoothstep(wheel.slip ?? 0, 0.065, 0.18) * 0.8 * (braking ? hardBraking : 1);
  const speed = THREE.MathUtils.smoothstep(state.speed, 2, 8);
  const load = clamp(wheel.load / wheel.staticLoad, 0.2, 1.5);
  return Math.max(hardBraking, lateralScrub) * speed * load * (raining ? 0.085 : 0.25);
}

export function setupSkidMarks(scene, layout, capacity = 8192) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.attributes.position = quad.attributes.position;
  geometry.attributes.uv = quad.attributes.uv;
  const fields = { markStart: 2, markEnd: 2, markWidth: 1, markBirth: 1, markStrength: 2 };
  const fieldEntries = Object.entries(fields);
  const attributes = {};
  for (const [name, size] of fieldEntries) {
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
    attributes[name] = attribute;
  }
  geometry.instanceCount = 0;
  const uniforms = {
    ...routeUniforms,
    markClock: { value: 0 },
    wetRoad: { value: 0 },
    vehicleXZ: { value: new THREE.Vector2() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
    vertexShader: `
      attribute vec2 markStart;
      attribute vec2 markEnd;
      attribute float markWidth;
      attribute float markBirth;
      attribute vec2 markStrength;
      uniform float markClock;
      uniform vec2 vehicleXZ;
      varying vec2 vUv;
      varying vec2 vSurface;
      varying float vStrength;
      varying float vAge;
      ${roadProfileGLSL}
      void main() {
        vUv = uv;
        vAge = markClock - markBirth;
        vStrength = mix(markStrength.x, markStrength.y, uv.y);
        vec2 range = (markStart + markEnd) * .5 - cameraPosition.xz;
        if (vAge > ${fadeEnd}. || dot(range, range) > 10201. || markStrength.x + markStrength.y < .001) {
          gl_Position = vec4(2., 2., 2., 1.);
          return;
        }
        vec2 direction = normalize(markEnd - markStart + vec2(.000001, 0.));
        vec2 sideways = vec2(-direction.y, direction.x);
        vec2 p = mix(markStart, markEnd, uv.y) + sideways * (uv.x - .5) * markWidth;
        float localHeight = roadHeight(p) * (1. - smoothstep(45., 60., length(p - vehicleXZ)));
        vec3 worldPosition = vec3(p.x, localHeight - .002 + terrainLift(p.x), p.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.);
        vSurface = p;
      }
    `,
    fragmentShader: `
      uniform float wetRoad;
      varying vec2 vUv;
      varying vec2 vSurface;
      varying float vStrength;
      varying float vAge;
      void main() {
        float aa = max(fwidth(vUv.x), .012);
        float edge = 1. - smoothstep(.38 - aa, .5 + aa, abs(vUv.x - .5));
        float grooves = .76 + .24 * smoothstep(-.4, .4, sin(vUv.x * 31.4159));
        float grain = .9 + .1 * sin(dot(vSurface, vec2(112.7, 83.1)));
        grain = mix(grain, .9, smoothstep(.025, .15, length(fwidth(vSurface))));
        float fade = 1. - smoothstep(35., ${fadeEnd}., vAge);
        float distanceFade = 1. - smoothstep(55., 100., distance(vSurface, cameraPosition.xz));
        float alpha = vStrength * edge * grooves * grain * fade * distanceFade * mix(1., .5, wetRoad);
        if (alpha < .001) discard;
        gl_FragColor = vec4(vec3(0.), alpha);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Tyre braking marks';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.visible = false;
  scene.add(mesh);
  const previous = layout.map(() => ({ valid: false, x: 0, z: 0, strength: 0 }));
  let cursor = 0,
    count = 0,
    latestBirth = -Infinity;

  function emit(x1, z1, x2, z2, width, strength1, strength2) {
    attributes.markStart.setXY(cursor, x1, z1);
    attributes.markEnd.setXY(cursor, x2, z2);
    attributes.markWidth.setX(cursor, width);
    attributes.markBirth.setX(cursor, uniforms.markClock.value);
    attributes.markStrength.setXY(cursor, strength1, strength2);
    cursor = (cursor + 1) % capacity;
    count = Math.min(count + 1, capacity);
    latestBirth = uniforms.markClock.value;
  }
  return {
    mesh,
    geometry,
    get count() {
      return count;
    },
    warmup(renderer, camera, scene) {
      const visible = mesh.visible,
        instances = geometry.instanceCount;
      // One clipped zero-strength instance also initializes the GPU buffers and
      // draw pipeline, which compileAsync alone does not prepare.
      mesh.visible = true;
      geometry.instanceCount = Math.max(1, instances);
      try {
        renderer.render(scene, camera);
      } finally {
        mesh.visible = visible;
        geometry.instanceCount = instances;
      }
    },
    reset() {
      cursor = count = 0;
      latestBirth = -Infinity;
      uniforms.markClock.value = 0;
      previous.forEach((p) => {
        p.valid = false;
      });
      geometry.instanceCount = 0;
      mesh.visible = false;
    },
    update(dt, state, options) {
      if (!state || dt <= 0) return;
      uniforms.markClock.value += Math.min(dt, 1 / 15);
      uniforms.wetRoad.value = options.raining ? 1 : 0;
      uniforms.vehicleXZ.value.set(state.x, state.z);
      const firstWritten = cursor;
      let written = 0;
      const c = Math.cos(state.heading),
        s = Math.sin(state.heading);
      for (let i = 0; i < state.wheels.length; i++) {
        const wheel = state.wheels[i],
          old = previous[i];
        const x = state.x + c * wheel.x + s * wheel.z;
        const z = state.z - s * wheel.x + c * wheel.z;
        const strength = brakingMarkStrength(wheel, state, options);
        const distance = Math.hypot(x - old.x, z - old.z);
        const contact = options.enabled && wheel.contact && wheel.load > wheel.staticLoad * 0.12;
        const continuous = old.valid && contact && distance < Math.max(3, state.speed * dt * 2 + 1);
        if (
          continuous &&
          distance > 0.025 &&
          state.speed > 1 &&
          Math.max(strength, old.strength) > 0.001
        ) {
          const steps = Math.ceil(distance / 0.18);
          const width = wheel.x > 0 ? 0.23 : 0.255;
          for (let j = 0; j < steps; j++) {
            const a = j / steps,
              b = (j + 1) / steps;
            const ax = THREE.MathUtils.lerp(old.x, x, a),
              az = THREE.MathUtils.lerp(old.z, z, a);
            const bx = THREE.MathUtils.lerp(old.x, x, b),
              bz = THREE.MathUtils.lerp(old.z, z, b);
            // Deposit on asphalt, with gaps over obstacles and holes rather than
            // rubber stripes painted across open air or the raised rubber pads.
            const surface = Math.max(Math.abs(roadHeight(ax, az)), Math.abs(roadHeight(bx, bz)));
            const asphalt = 1 - THREE.MathUtils.smoothstep(surface, 0.003, 0.012);
            if (asphalt < 0.05) continue;
            emit(
              ax,
              az,
              bx,
              bz,
              width,
              THREE.MathUtils.lerp(old.strength, strength, a) * asphalt,
              THREE.MathUtils.lerp(old.strength, strength, b) * asphalt
            );
            written++;
          }
        }
        old.x = x;
        old.z = z;
        old.strength = strength;
        old.valid = contact;
      }
      if (written) {
        // Only newly written slots are uploaded, at most two contiguous ring ranges.
        for (const [name, size] of fieldEntries) {
          const attribute = attributes[name];
          attribute.clearUpdateRanges();
          if (written >= capacity) attribute.addUpdateRange(0, capacity * size);
          else if (firstWritten + written <= capacity)
            attribute.addUpdateRange(firstWritten * size, written * size);
          else {
            attribute.addUpdateRange(firstWritten * size, (capacity - firstWritten) * size);
            attribute.addUpdateRange(0, cursor * size);
          }
          attribute.needsUpdate = true;
        }
        geometry.instanceCount = count;
      }
      mesh.visible = count > 0 && uniforms.markClock.value - latestBirth < fadeEnd;
    },
  };
}
