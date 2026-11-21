import * as THREE from 'three';

// Dirt on the paint from driving off the asphalt. Dry ground coats the car
// in dust, thickest on the sills, bumpers and lower doors, behind the wheels
// and on the tail where the wake lets it settle, with a light film on the
// roof and bonnet. Wet ground throws dark mud splatter behind the wheels and
// along the sills. Dirt dulls the clear coat; rain slowly washes it off
// (dust sooner than mud), and Restart starts with a clean car.
export const dirtSettings = Object.freeze({
  // Build-up per second at 72 km/h with all four wheels on the surface.
  dust: Object.freeze({ dirt: 0.05, gravel: 0.03, grass: 0.012, asphalt: 0 }),
  mud: Object.freeze({ dirt: 0.07, gravel: 0.025, grass: 0.05, asphalt: 0 }),
  // Seconds for rain to wash off most of each.
  washDust: 45,
  washMud: 150,
});

export class BodyDirtState {
  constructor() {
    this.reset();
  }
  reset() {
    this.dust = 0;
    this.mud = 0;
  }
  // surfaces: what each wheel stands on; wetness: how wet the ground is.
  step(dt, { surfaces = [], speed = 0, wetness = 0, raining = false }) {
    const pace = Math.min(1.5, Math.max(0, (speed - 2) / 18));
    let dust = 0,
      mud = 0;
    for (const surface of surfaces) {
      dust += (dirtSettings.dust[surface] ?? 0) / surfaces.length;
      mud += (dirtSettings.mud[surface] ?? 0) / surfaces.length;
    }
    const wet = Math.min(1, Math.max(0, (wetness - 0.25) / 0.5));
    this.dust += dust * pace * (1 - wet) * (1 - this.dust) * dt;
    this.mud += mud * pace * wet * (1 - this.mud) * dt;
    if (raining) {
      this.dust *= Math.exp(-dt / dirtSettings.washDust);
      this.mud *= Math.exp(-dt / dirtSettings.washMud);
    }
  }
}

// Scratches from guardrails: wear along each side of the body, in columns
// from the tail (x = from) to the nose (x = from + length), one row per side
// (0: left, -z; 1: right, +z). They stay until Restart.
export const scratchLayout = Object.freeze({
  columns: 256,
  from: -2.55,
  length: 5.1,
  // Wear reaches at least this far around the contact point (m)…
  spread: 0.3,
  // …and along the side wherever it is within this gap of the rail (m).
  reach: 0.03,
  // The side's straight part; the bumpers curve away from a rail.
  side: 2.25,
});

// Where a rail contact rubs the body: car-space x and side, and how much
// wear it adds in dt (a hit scratches at once, scraping along wears more).
export function scratchAt(contact, simulation, dt) {
  const c = Math.cos(simulation.heading),
    s = Math.sin(simulation.heading);
  const dx = contact.x - simulation.x,
    dz = contact.z - simulation.z;
  // The car's angle to the rail: nearly parallel, the whole side rubs.
  const railHeading = -Math.atan(contact.railSlope ?? 0),
    angle = Math.atan2(
      Math.sin(simulation.heading - railHeading),
      Math.cos(simulation.heading - railHeading)
    );
  return {
    x: dx * c - dz * s,
    side: dx * s + dz * c > 0 ? 1 : 0,
    wear: Math.min(1, contact.impact * 0.25 + contact.scrape * 0.08 * dt + 0.02),
    angle,
  };
}

// Adds wear to a row of columns: around car-space x, and along the side as
// far as it lies within `reach` of the rail at this angle to it.
export function addScratchWear(row, x, wear, angle = Math.PI / 2) {
  const { columns, from, length, spread, reach, side } = scratchLayout;
  const tilt = Math.abs(Math.sin(angle));
  let changed = false;
  for (let i = 0; i < columns; i++) {
    const cx = from + ((i + 0.5) / columns) * length;
    const near = 1 - Math.abs(cx - x) / spread,
      along = Math.abs(cx) < side ? 1 - (Math.abs(cx - x) * tilt) / reach : 0;
    const falloff = Math.max(near, along);
    if (falloff <= 0) continue;
    const next = Math.min(1, row[i] + wear * falloff);
    if (next !== row[i]) changed = true;
    row[i] = next;
  }
  return changed;
}

// Shader additions for the paint, chained after the water beads (which
// provide the body-space position and normal varyings).
const dirtFunctions = `
  uniform float bodyDust;
  uniform float bodyMud;
  uniform vec4 dirtWheels; // front x, rear x, hub height, |z|
  uniform sampler2D scratchMap;
  uniform vec2 scratchRange; // tail x, length
  float dirtHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float dirtNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(
      mix(mix(dirtHash(i), dirtHash(i + vec3(1, 0, 0)), f.x),
          mix(dirtHash(i + vec3(0, 1, 0)), dirtHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(dirtHash(i + vec3(0, 0, 1)), dirtHash(i + vec3(1, 0, 1)), f.x),
          mix(dirtHash(i + vec3(0, 1, 1)), dirtHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
`;

export function setupBodyDirt(rig, paintMaterials) {
  const state = new BodyDirtState();
  const front = Math.max(...rig.wheels.map((w) => w.x)),
    rear = Math.min(...rig.wheels.map((w) => w.x)),
    hub = rig.wheels[0].y - rig.body.position.y,
    track = Math.abs(rig.wheels[0].z);
  const uniforms = {
    bodyDust: { value: 0 },
    bodyMud: { value: 0 },
    dirtWheels: { value: new THREE.Vector4(front, rear, hub, track) },
    scratchMap: { value: null },
    scratchRange: { value: new THREE.Vector2(scratchLayout.from, scratchLayout.length) },
  };
  // Wear per column and side, uploaded when it changes.
  const { columns } = scratchLayout;
  const wear = [new Float32Array(columns), new Float32Array(columns)];
  const scratchData = new Uint8Array(columns * 2 * 4);
  const scratchMap = new THREE.DataTexture(scratchData, columns, 2);
  scratchMap.magFilter = scratchMap.minFilter = THREE.LinearFilter;
  scratchMap.needsUpdate = true;
  uniforms.scratchMap.value = scratchMap;
  const uploadScratches = () => {
    for (let side = 0; side < 2; side++)
      for (let i = 0; i < columns; i++) {
        const k = (side * columns + i) * 4;
        scratchData[k] = Math.round(wear[side][i] * 255);
        scratchData[k + 3] = 255;
      }
    scratchMap.needsUpdate = true;
  };
  for (const material of paintMaterials) {
    const previousCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = dirtFunctions + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float dirtCover = 0.;
        if (bodyDust + bodyMud > .002) {
          vec3 dp = vWaterPosition;
          vec3 dn = normalize(vWaterNormal);
          // Low on the body, on rear-facing panels at the tail, and on top.
          float low = 1. - smoothstep(-.3, .35, dp.y);
          float tail = smoothstep(-.2, -.8, dn.x) * smoothstep(dirtWheels.y - .3, dirtWheels.y - .9, dp.x) *
            (1. - smoothstep(-.05, .3, dp.y));
          float top = smoothstep(.5, .9, dn.y);
          // A fan of splatter behind each wheel, along its side of the car.
          float side = 1. - smoothstep(.25, .75, abs(abs(dp.z) - dirtWheels.w));
          float below = 1. - smoothstep(dirtWheels.z - .05, dirtWheels.z + .4, dp.y);
          float splash = 0.;
          for (int i = 0; i < 2; i++) {
            float behind = (i == 0 ? dirtWheels.x : dirtWheels.y) - dp.x;
            splash += (1. - smoothstep(.25, .85, abs(behind - .35))) * side * below;
          }
          float coarse = dirtNoise(dp * vec3(9., 11., 9.)),
            fine = dirtNoise(dp * vec3(38., 30., 38.));
          // Dust: a film everywhere it settles, patchy, thickest down low.
          float dustMask = bodyDust * clamp(.06 + 1. * low + .55 * tail + .15 * top + .6 * splash, 0., 1.5);
          float dust = smoothstep(.2, 1.05, dustMask * (.55 + .8 * coarse)) * .7;
          // Mud: blotches and fine speckles thrown up by the tyres.
          float mudMask = bodyMud * clamp(1.1 * low + 1.6 * splash + .3 * tail, 0., 1.8);
          float blotch = smoothstep(.52, .7, mudMask * (.45 + .45 * coarse + .35 * fine));
          // Two octaves on rotated lattices, so speckles are round rather
          // than square.
          const mat3 speckleTurn = mat3(.36, .48, -.8, -.8, .6, 0., .48, .64, .6);
          float grain = .6 * dirtNoise(speckleTurn * dp * 140.) +
            .4 * dirtNoise(speckleTurn * speckleTurn * dp * 230. + 7.3);
          float speckleEdge = .74 - .2 * clamp(mudMask, 0., 1.);
          float speckle = smoothstep(speckleEdge, speckleEdge + .05, grain);
          float mud = max(blotch, speckle * clamp(mudMask * 1.4, 0., 1.)) * clamp(mudMask * 2., 0., 1.);
          // Dust is pale and darkens when wet; mud is lighter than the black
          // paint as it dries, dark and glossy while wet.
          vec3 dustColour = vec3(.33, .28, .2) * mix(1., .55, bodyWetness);
          vec3 mudColour = mix(vec3(.2, .145, .09), vec3(.085, .06, .038), bodyWetness);
          diffuseColor.rgb = mix(diffuseColor.rgb, dustColour, dust);
          diffuseColor.rgb = mix(diffuseColor.rgb, mudColour, mud);
          roughnessFactor = mix(roughnessFactor, .92, max(dust, mud * (1. - bodyWetness * .7)));
          dirtCover = max(dust, mud);
        }
        // Guardrail scratches: a band at the beam's height on the side that
        // touched, fine streaks along the car through the clear coat to grey
        // primer and bare metal where the scrape went deeper.
        if (abs(vWaterNormal.z) > .3) {
          vec3 sp = vWaterPosition;
          float scratchWear = texture2D(scratchMap, vec2((sp.x - scratchRange.x) / scratchRange.y,
            vWaterNormal.z > 0. ? .75 : .25)).r;
          if (scratchWear > .004) {
            // The band's edges wander a little along the car.
            float wander = dirtNoise(vec3(sp.x * 1.7, 2.3, 5.1)) - .5;
            float band = smoothstep(-.18, -.1, sp.y + wander * .05) *
              (1. - smoothstep(.15, .24, sp.y - wander * .05));
            // Long streaks: stretched far along x, thin across, their depth
            // swelling and fading over a metre or two.
            float streakA = dirtNoise(vec3(sp.x * .45, sp.y * 230., 3.1));
            float streakB = dirtNoise(vec3(sp.x * .8 + 7., sp.y * 470., 9.7));
            float swell = dirtNoise(vec3(sp.x * .9 + 2., sp.y * 6., 1.3));
            float depth = (streakA * .6 + streakB * .4) * (.75 + .5 * swell);
            float edge = .72 - .3 * min(scratchWear, 1.);
            float scratch = band * smoothstep(edge, edge + .04, depth) * min(1., scratchWear * 2.);
            vec3 scuff = mix(vec3(.16, .165, .17), vec3(.42, .43, .45), smoothstep(.75, .95, depth));
            diffuseColor.rgb = mix(diffuseColor.rgb, scuff, scratch);
            roughnessFactor = mix(roughnessFactor, .5, scratch);
            dirtCover = max(dirtCover, scratch * .9);
          }
        }`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= 1. - dirtCover;
        #endif`
      );
    };
    const previousKey = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => `${previousKey()}-dirt`;
    material.needsUpdate = true;
  }
  return {
    state,
    reset() {
      state.reset();
      uniforms.bodyDust.value = uniforms.bodyMud.value = 0;
      wear[0].fill(0);
      wear[1].fill(0);
      uploadScratches();
    },
    // A rail contact this step leaves scratches where it rubs.
    scrape(contact, simulation, dt) {
      if (!contact) return;
      const { x, side, wear: amount, angle } = scratchAt(contact, simulation, dt);
      if (addScratchWear(wear[side], x, amount, angle)) uploadScratches();
    },
    get scratches() {
      return wear;
    },
    update(dt, { surfaces, speed, wetness, raining, running = true }) {
      if (running) state.step(dt, { surfaces, speed, wetness, raining });
      uniforms.bodyDust.value = state.dust;
      uniforms.bodyMud.value = state.mud;
      return state;
    },
  };
}
