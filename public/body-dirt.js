import * as THREE from 'three';

// Dirt on the paint from driving off the asphalt. Dry ground coats the car
// in dust, thickest on the sills, bumpers and lower doors, behind the wheels
// and on the tail where the wake lets it settle, with a light film on the
// roof and bonnet. Wet ground throws dark mud splatter behind the wheels and
// along the sills. Dirt dulls the clear coat; rain slowly washes it off
// (dust sooner than mud), and Restart starts with a clean car. In winter the
// road's snow and slush cake the car as it drives, snowing or not: a grey
// film of slush along the sills, clumps of snow behind the wheels and on the
// tail, and snow packed onto the tyres and the rims' edges; it thaws once
// winter is over.
export const dirtSettings = Object.freeze({
  // Build-up per second at 72 km/h with all four wheels on the surface.
  dust: Object.freeze({ dirt: 0.05, gravel: 0.03, grass: 0.012, asphalt: 0 }),
  mud: Object.freeze({ dirt: 0.07, gravel: 0.025, grass: 0.05, asphalt: 0 }),
  // Seconds for rain to wash off most of each.
  washDust: 45,
  washMud: 150,
  // Snow and slush per second at 72 km/h in winter (more off the asphalt),
  // and seconds to thaw most of it once winter is over.
  slush: Object.freeze({ asphalt: 0.03, dirt: 0.05, gravel: 0.05, grass: 0.06 }),
  thaw: 20,
});

export class BodyDirtState {
  constructor() {
    this.reset();
  }
  reset() {
    this.dust = 0;
    this.mud = 0;
    this.slush = 0;
  }
  // surfaces: what each wheel stands on; wetness: how wet the ground is.
  // winter: how far the season has turned (0–1).
  step(dt, { surfaces = [], speed = 0, wetness = 0, raining = false, winter = 0 }) {
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
    let slush = 0;
    for (const surface of surfaces) slush += (dirtSettings.slush[surface] ?? 0) / surfaces.length;
    this.slush += slush * pace * winter * (1 - this.slush) * dt;
    if (winter < 0.5) this.slush *= Math.exp(-dt / dirtSettings.thaw);
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
  // …or, hitting a car or a building, only this far: it touches at one
  // place, not along a rail.
  hitSpread: 0.55,
  // …and along the side wherever it is within this gap of the rail (m).
  reach: 0.03,
  // The side's straight part; the bumpers curve away from a rail.
  side: 2.25,
});

// Where a rail contact rubs the body: car-space x and side, and how much
// wear it adds in dt (a hit scratches at once, scraping along wears more).
// A car or a building (`contact.traffic`) marks only round where it
// touched: lying along the road like the car does not make it a rail
// down the whole side.
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
  const local = Boolean(contact.traffic);
  return {
    x: dx * c - dz * s,
    side: dx * s + dz * c > 0 ? 1 : 0,
    wear: Math.min(1, contact.impact * 0.25 + contact.scrape * 0.08 * dt + 0.02),
    angle: local ? Math.PI / 2 : angle,
    spread: local ? scratchLayout.hitSpread : scratchLayout.spread,
  };
}

// Adds wear to a row of columns: around car-space x, and along the side as
// far as it lies within `reach` of the rail at this angle to it.
export function addScratchWear(row, x, wear, angle = Math.PI / 2, spread = scratchLayout.spread) {
  const { columns, from, length, reach, side } = scratchLayout;
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

// Dents where the car hit something hard: the body pushed in round the
// point it struck, deeper and wider the harder the knock; another knock
// close by deepens the same dent. Up to `count` stay till Restart.
export const dentLayout = Object.freeze({
  count: 8,
  // A knock harder than this (m/s into it) dents the body.
  from: 2.5,
  // Depth (m) and radius (m) for a knock of v m/s, and the most of each.
  depth: (v) => Math.min(0.08, 0.015 + 0.005 * v),
  radius: (v) => Math.min(0.75, 0.3 + 0.025 * v),
  deepest: 0.11,
  // A knock this near a dent (m) adds to it.
  merge: 0.35,
});

// Where on the body (body space: x forward, y up, z right) a contact
// struck, and the dent it leaves; null for a scrape too light to dent.
export function dentFrom(contact, simulation) {
  if (!contact || contact.impact < dentLayout.from) return null;
  const c = Math.cos(simulation.heading),
    s = Math.sin(simulation.heading);
  const dx = contact.x - simulation.x,
    dz = contact.z - simulation.z;
  const along = dx * c - dz * s,
    across = dx * s + dz * c;
  // Nose or tail first: the bumper; otherwise the side it came from.
  const end = Math.abs(along) > 2 && Math.abs(across) < 0.85;
  return {
    x: end ? Math.sign(along) * 2.45 : Math.max(-2.3, Math.min(2.3, along)),
    y: end ? -0.1 : -0.05,
    z: end ? Math.max(-0.75, Math.min(0.75, across)) : Math.sign(across || 1) * 0.92,
    depth: dentLayout.depth(contact.impact) * (end ? 0.7 : 1),
    // (The bumper's dents tighter: it wraps round, and a wide one reached
    // the lamps and the grille.)
    radius: dentLayout.radius(contact.impact) * (end ? 0.7 : 1),
  };
}
// Adds a dent to the list (merging it into one close by); true if changed.
export function addDent(dents, dent) {
  if (!dent) return false;
  const near = dents.find(
    (d) => Math.hypot(d.x - dent.x, d.y - dent.y, d.z - dent.z) < dentLayout.merge
  );
  if (near) {
    near.depth = Math.min(dentLayout.deepest, near.depth + dent.depth * 0.6);
    near.radius = Math.max(near.radius, dent.radius);
    return true;
  }
  dents.push(dent);
  if (dents.length > dentLayout.count) dents.shift();
  return true;
}

// Shader additions for the paint, chained after the water beads (which
// provide the body-space position and normal varyings).
const dirtFunctions = `
  uniform float bodyDust;
  uniform float bodyMud;
  uniform float bodySlush;
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
    bodySlush: { value: 0 },
    dirtWheels: { value: new THREE.Vector4(front, rear, hub, track) },
    scratchMap: { value: null },
    scratchRange: { value: new THREE.Vector2(scratchLayout.from, scratchLayout.length) },
    dentAt: {
      value: Array.from({ length: dentLayout.count }, () => new THREE.Vector4(0, -9, 0, 0.1)),
    },
    dentDepth: { value: new Array(dentLayout.count).fill(0) },
  };
  // The dents, and each paint vertex's way in: its normal turned inward, in
  // its mesh's own units for a metre of the body's.
  const dents = [];
  const uploadDents = () => {
    for (let i = 0; i < dentLayout.count; i++) {
      const d = dents[i];
      uniforms.dentAt.value[i].set(d?.x ?? 0, d?.y ?? -9, d?.z ?? 0, d?.radius ?? 0.1);
      uniforms.dentDepth.value[i] = d?.depth ?? 0;
    }
  };
  rig.body.updateMatrixWorld(true);
  const inverseBody = rig.body.matrixWorld.clone().invert(),
    scale = new THREE.Vector3();
  rig.body.traverse((mesh) => {
    if (!mesh.isMesh || !paintMaterials.includes(mesh.material)) return;
    if (mesh.geometry.attributes.dentInward) return;
    scale.setFromMatrixScale(inverseBody.clone().multiply(mesh.matrixWorld));
    const k = 3 / (scale.x + scale.y + scale.z);
    const normals = mesh.geometry.attributes.normal;
    const inward = new Float32Array(normals.count * 3);
    for (let i = 0; i < normals.count; i++) {
      inward[i * 3] = -normals.getX(i) * k;
      inward[i * 3 + 1] = -normals.getY(i) * k;
      inward[i * 3 + 2] = -normals.getZ(i) * k;
    }
    mesh.geometry.setAttribute('dentInward', new THREE.BufferAttribute(inward, 3));
  });
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
      // Dents: each paint vertex within one's reach pushed in along its
      // normal, most at its middle (a little, for the silhouette); the
      // shading follows the dent's own smooth shape worked out at each
      // pixel, as a bump map does, with a faint crumple in the metal (the
      // body's triangles are too large to shade it by their faces).
      const dentField = `
        uniform vec4 dentAt[${dentLayout.count}];
        uniform float dentDepth[${dentLayout.count}];
        float dentAmount(vec3 p, float crumple) {
          float dent = 0.;
          for (int i = 0; i < ${dentLayout.count}; i++) {
            float r = length(p - dentAt[i].xyz) / dentAt[i].w;
            float fall = clamp(1. - r * r, 0., 1.);
            dent = max(dent, dentDepth[i] * fall * fall * (1. + crumple));
          }
          return dent;
        }
      `;
      shader.vertexShader =
        dentField +
        `attribute vec3 dentInward;
        ` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed += dentInward * dentAmount(waterPosition, 0.) * .35;`
        );
      shader.fragmentShader =
        dentField +
        `vec3 dentBump(vec3 at, vec3 n, float h) {
          vec3 sx = dFdx(at), sy = dFdy(at);
          vec3 r1 = cross(sy, n), r2 = cross(n, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
          return normalize(abs(det) * n - grad);
        }
        ` +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float dentCrumple = (dirtNoise(vWaterPosition * 5.) - .5) * .45 +
          (dirtNoise(vWaterPosition * 11. + 3.1) - .5) * .2;
        float dentHeight = -dentAmount(vWaterPosition, dentCrumple);
        bool dentHere = dentHeight < -.0004;
        // (Derivatives taken everywhere, outside any branch.)
        vec3 dentNormal = dentBump(-vViewPosition, normal, dentHeight);
        if (dentHere) normal = dentNormal;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clearcoat_normal_fragment_maps>',
        `#include <clearcoat_normal_fragment_maps>
        #ifdef USE_CLEARCOAT
          vec3 dentCoat = dentBump(-vViewPosition, clearcoatNormal, dentHeight);
          if (dentHere) clearcoatNormal = dentCoat;
        #endif`
      );
      shader.fragmentShader = dirtFunctions + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float dirtCover = 0.;
        if (bodyDust + bodyMud + bodySlush > .002) {
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
          // Winter: a grey film of slush down low, white clumps of snow
          // where the wheels throw it.
          float slushMask = bodySlush * clamp(1.1 * low + 1.5 * splash + .3 * tail, 0., 1.6);
          float film = clamp(slushMask, 0., 1.) * low * .5 * (.6 + .4 * coarse);
          // Specks only low on the body and behind the wheels, few and soft.
          float snowEdge = .82 - .08 * clamp(slushMask, 0., 1.);
          float clumps = max(
            smoothstep(snowEdge, snowEdge + .06, grain) * clamp(slushMask, 0., 1.) *
              max(low, splash) * .7,
            smoothstep(.68, .8, slushMask * (.4 + .45 * coarse + .3 * fine)) * low);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.4, .39, .37), film);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.78, .8, .83), clumps);
          roughnessFactor = mix(roughnessFactor, .85, max(film, clumps));
          dirtCover = max(dirtCover, max(film, clumps));
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
    material.customProgramCacheKey = () => `${previousKey()}-dirt-dents`;
    material.needsUpdate = true;
  }
  // Snow packed onto the tyres and the rims' edges, turning with them.
  const wheelMaterials = new Set();
  for (const wheel of rig.wheels)
    wheel.spin.traverse((o) => {
      if (o.isMesh) for (const m of [o.material].flat()) wheelMaterials.add(m);
    });
  for (const material of wheelMaterials) {
    if (!material.isMeshStandardMaterial) continue;
    const previousCompile = material.onBeforeCompile,
      previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile?.call(material, shader, renderer);
      shader.uniforms.bodySlush = uniforms.bodySlush;
      shader.uniforms.wheelRadius = { value: rig.wheels[0].r };
      shader.vertexShader =
        'varying vec3 vWheelPosition;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvWheelPosition = position;'
        );
      shader.fragmentShader =
        'varying vec3 vWheelPosition;\nuniform float bodySlush;\nuniform float wheelRadius;\n' +
        dirtFunctions.replace(/uniform[^;]*;/g, '') +
        shader.fragmentShader.replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
          if (bodySlush > .002) {
            float rim = length(vWheelPosition.xy) / wheelRadius;
            // A few clumps in the tread, not a white ring round the tyre.
            float packed = bodySlush * smoothstep(.82, .96, rim) *
              dirtNoise(vWheelPosition * vec3(9., 9., 4.));
            float snowOn = smoothstep(.42, .6, packed) * .85;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.8, .82, .86), snowOn);
            roughnessFactor = mix(roughnessFactor, .9, snowOn);
            metalnessFactor = mix(metalnessFactor, 0., snowOn);
          }`
        );
    };
    material.customProgramCacheKey = () =>
      `${previousKey ? previousKey.call(material) : ''}-wheel-snow`;
    material.needsUpdate = true;
  }
  return {
    state,
    reset() {
      state.reset();
      uniforms.bodyDust.value = uniforms.bodyMud.value = uniforms.bodySlush.value = 0;
      wear[0].fill(0);
      wear[1].fill(0);
      uploadScratches();
      dents.length = 0;
      uploadDents();
    },
    // A rail contact this step leaves scratches where it rubs.
    scrape(contact, simulation, dt) {
      if (!contact) return;
      const { x, side, wear: amount, angle, spread } = scratchAt(contact, simulation, dt);
      if (addScratchWear(wear[side], x, amount, angle, spread)) uploadScratches();
      if (addDent(dents, dentFrom(contact, simulation))) uploadDents();
    },
    get dents() {
      return dents;
    },
    get scratches() {
      return wear;
    },
    update(dt, { surfaces, speed, wetness, raining, winter = 0, running = true }) {
      if (running) state.step(dt, { surfaces, speed, wetness, raining, winter });
      // (It thaws standing still too.)
      else if (winter < 0.5) state.slush *= Math.exp(-dt / dirtSettings.thaw);
      uniforms.bodyDust.value = state.dust;
      uniforms.bodyMud.value = state.mud;
      uniforms.bodySlush.value = state.slush;
      return state;
    },
  };
}
