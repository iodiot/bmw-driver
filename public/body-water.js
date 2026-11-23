import * as THREE from 'three';

export class BodyWaterState {
  constructor() {
    this.wetness = 0;
    this.speed = 0;
    this.time = 0;
    this.flow = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
  }

  step(dt, { raining, speed = 0, gravity = new THREE.Vector3(0, -1, 0) }) {
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 15);
    this.time += dt;
    this.speed = THREE.MathUtils.damp(this.speed, Math.max(0, speed), 6, dt);
    const supply = raining ? 0.9 : 0;
    const loss = raining ? 0.02 + 0.00015 * this.speed ** 2 : 0.035 + 0.003 * this.speed;
    const target = supply / (supply + loss);
    this.wetness = target + (this.wetness - target) * Math.exp(-(supply + loss) * dt);
    if (!raining && this.wetness < 0.001) this.wetness = 0;

    const airSpeed = (0.00035 * this.speed ** 2) / (1 + 0.02 * this.speed);
    this.velocity.copy(gravity).multiplyScalar(0.004 + this.wetness * 0.008);
    this.velocity.x -= airSpeed;
    this.flow.addScaledVector(this.velocity, dt);
  }
}

const waterFunctions = `
  uniform float bodyWetness;
  uniform float waterTime;
  uniform float waterWind;
  uniform float waterGlass;
  // Snow instead of rain: flakes that stick rather than beads that run, lit
  // by snowLight (the light falling on the car).
  uniform float bodySnow;
  uniform float snowLight;
  // How dark the night is (0 by day): the glass still gives back the sky's
  // faint glow, and the beads on it glint.
  uniform float nightGlow;
  // Frost on the glass on a winter's morning: the windscreen's (cleared by
  // the defroster from the bottom up) and the other windows'.
  uniform float screenFrost;
  uniform float glassFrost;
  uniform float edgeIce;
  uniform vec3 waterFlow;
  uniform vec3 waterVelocity;
  varying vec3 vWaterPosition;
  varying vec3 vWaterNormal;
  uniform sampler2D windshieldWipeMap;
  uniform float wipeClock;
  uniform vec3 windshieldOrigin;
  uniform vec3 windshieldUp;
  uniform vec4 windshieldBounds;
  varying float vWaterWindscreen;

  float frostHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float frostNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(
      mix(mix(frostHash(i), frostHash(i + vec3(1, 0, 0)), f.x),
          mix(frostHash(i + vec3(0, 1, 0)), frostHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(frostHash(i + vec3(0, 0, 1)), frostHash(i + vec3(1, 0, 1)), f.x),
          mix(frostHash(i + vec3(0, 1, 1)), frostHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  // Feathery ice crystals (ridged noise at four scales), creeping in from
  // the glass's edges: frost as far as screenFrost / glassFrost reach
  // (all of it at 1), and a rim of packed ice (edgeIce) round the edges and
  // in the corners where the wipers do not reach. x: the brightness, y: the
  // cover.
  vec2 glassFrostAt(vec3 p) {
    if (screenFrost + glassFrost + edgeIce < .002) return vec2(0.);
    float ridges = 0., amplitude = .5, scale = 9.;
    for (int i = 0; i < 4; i++) {
      ridges += amplitude * (1. - abs(2. * frostNoise(p * scale + float(i) * 3.7) - 1.));
      scale *= 2.4;
      amplitude *= .5;
    }
    float crystals = pow(ridges / .94, 3.);
    // How far in from the edges (0 at an edge, 1 in the middle), least in
    // the corners.
    float inward, reach, spread = 1.;
    if (vWaterWindscreen > .5) {
      vec2 uv = (vec2(p.z, dot(p - windshieldOrigin, windshieldUp)) - windshieldBounds.xy) /
        windshieldBounds.zw;
      vec2 edge = clamp(min(uv, 1. - uv) * 2., 0., 1.);
      inward = sqrt(edge.x * edge.y);
      reach = screenFrost;
      // (Its outline reaches beyond the glass seen from the seat.)
      spread = 1.6;
    } else {
      inward = clamp(min(p.y - .36, .8 - p.y) / .21, 0., 1.);
      reach = glassFrost;
    }
    float ragged = .22 * (ridges - .5);
    float frost = smoothstep(-.05, .05, reach * 1.15 * spread - inward + ragged) * min(1., reach * 6.);
    float ice = smoothstep(-.04, .04, edgeIce * .3 * spread * spread - inward + ragged * .6) * min(1., edgeIce * 5.);
    float cover = max(frost * (.78 + .22 * crystals), ice * .95);
    return vec2(mix(.75 + .35 * crystals, .95, ice), cover);
  }

  float remainingWindshieldWater(vec3 p) {
    if (waterGlass < .5 || vWaterWindscreen < .5) return 1.;
    vec2 coordinate = vec2(p.z, dot(p - windshieldOrigin, windshieldUp));
    vec2 uv = (coordinate - windshieldBounds.xy) / windshieldBounds.zw;
    float wipedAt = texture2D(windshieldWipeMap, uv).r;
    return mix(.02, 1., smoothstep(0., 2.2, max(0., wipeClock - wipedAt)));
  }

  vec2 beadHash(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                          dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }

  vec2 beadLayer(vec2 coordinate, float spacing, vec2 velocity, bool moving) {
    vec2 cell = floor(coordinate / spacing);
    vec2 random = beadHash(cell);
    vec2 centre = (cell + .25 + random * .5) * spacing;
    vec2 delta = coordinate - centre;
    vec2 direction = velocity / max(length(velocity), .00001);
    if (!moving || length(velocity) < .00001) direction = vec2(0., -1.);
    float along = dot(delta, direction);
    float across = dot(delta, vec2(-direction.y, direction.x));
    float trailSpeed = length(velocity) * mix(.28, .45, waterGlass) + waterGlass * .008;
    float trail = moving ? min(spacing * .18, trailSpeed) : 0.;
    float radius = (mix(.0028, .004, waterGlass) + random.x * .0037) *
                   mix(1., .72, waterWind * float(moving));
    float growth = .85 + .15 * sin(waterTime * .6 + random.y * 6.2831853);
    radius *= growth;
    float tailAxis = along + clamp(-along, 0., trail);
    float distanceToDrop = length(vec2(across, tailAxis)) / radius;
    float aa = max(fwidth(distanceToDrop), .06);
    float edge = 1. - smoothstep(1. - aa, 1. + aa, distanceToDrop);
    float occupancy = smoothstep(random.y - .12, random.y + .12, bodyWetness * .9);
    float tailFade = exp(min(along, 0.) / max(trail * .65, .003));
    float dome = pow(max(0., 1. - distanceToDrop * distanceToDrop), .65);
    return vec2(dome * radius * .22 * tailFade, edge * tailFade) * occupancy;
  }

  vec2 waterOnPlane(vec2 coordinate, vec2 flow, vec2 velocity) {
    vec2 pinned = beadLayer(coordinate, mix(.032, .036, waterGlass), velocity, false);
    vec2 running = beadLayer(coordinate - flow * mix(1., 1.3, waterGlass),
                             mix(.09, .18, waterGlass), velocity, true);
    return mix(pinned, running,
      (mix(.35, .5, waterGlass) + waterWind * mix(.55, .4, waterGlass)) * (1. - bodySnow));
  }

  vec2 bodyWater(vec3 p, vec3 n) {
    if (bodyWetness < .001) return vec2(0.);
    n = normalize(n);
    vec3 tangentFlow = waterFlow - n * dot(waterFlow, n);
    vec3 tangentVelocity = waterVelocity - n * dot(waterVelocity, n);
    vec3 weights = pow(abs(n), vec3(8.));
    weights /= max(dot(weights, vec3(1.)), .0001);
    vec2 result = vec2(0.);
    if (weights.x > .01) result += waterOnPlane(p.zy, tangentFlow.zy, tangentVelocity.zy) * weights.x;
    if (weights.y > .01) result += waterOnPlane(p.xz, tangentFlow.xz, tangentVelocity.xz) * weights.y;
    if (weights.z > .01) result += waterOnPlane(p.xy, tangentFlow.xy, tangentVelocity.xy) * weights.z;
    return result * bodyWetness;
  }

  vec3 waterNormal(vec3 surface, vec3 surfaceNormal, float height) {
    vec3 dx = dFdx(surface), dy = dFdy(surface);
    vec3 r1 = cross(dy, surfaceNormal), r2 = cross(surfaceNormal, dx);
    float determinant = dot(dx, r1);
    vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
    return normalize(max(abs(determinant), .00000001) * surfaceNormal - gradient);
  }
`;

export function setupBodyWater(rig) {
  const state = new BodyWaterState();
  const defaultWipeMap = new THREE.DataTexture(
    new Float32Array([-1000]),
    1,
    1,
    THREE.RedFormat,
    THREE.FloatType
  );
  defaultWipeMap.needsUpdate = true;
  const uniforms = {
    bodyWetness: { value: 0 },
    bodySnow: { value: 0 },
    snowLight: { value: 1 },
    nightGlow: { value: 0 },
    screenFrost: { value: 0 },
    glassFrost: { value: 0 },
    edgeIce: { value: 0 },
    waterTime: { value: 0 },
    waterWind: { value: 0 },
    waterFlow: { value: state.flow },
    waterVelocity: { value: state.velocity },
    windshieldWipeMap: { value: defaultWipeMap },
    wipeClock: { value: 0 },
    windshieldOrigin: { value: new THREE.Vector3() },
    windshieldUp: { value: new THREE.Vector3(0, 1, 0) },
    windshieldBounds: { value: new THREE.Vector4(-0.85, -0.12, 1.7, 1.2) },
  };
  const surfaces = new Map();
  const meshes = [];
  const glassMeshes = [];
  rig.root.updateMatrixWorld(true);
  const inverseBody = rig.body.matrixWorld.clone().invert();
  const point = new THREE.Vector3();

  rig.body.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const glass = mesh.material.name === 'Glass_Parts';
    if (mesh.material.name !== 'M5_F10_Paint' && !glass) return;
    if (glass) {
      mesh.material = mesh.material.clone();
      mesh.material.name = 'Glass with surface water';
      glassMeshes.push(mesh);
    }
    const transform = inverseBody.clone().multiply(mesh.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
    const positions = mesh.geometry.attributes.position;
    const normals = mesh.geometry.attributes.normal;
    const waterPositions = new Float32Array(positions.count * 3);
    const waterNormals = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      point
        .fromBufferAttribute(positions, i)
        .applyMatrix4(transform)
        .toArray(waterPositions, i * 3);
      point
        .fromBufferAttribute(normals, i)
        .applyNormalMatrix(normalMatrix)
        .toArray(waterNormals, i * 3);
    }
    mesh.geometry.setAttribute('waterPosition', new THREE.BufferAttribute(waterPositions, 3));
    mesh.geometry.setAttribute('waterNormal', new THREE.BufferAttribute(waterNormals, 3));
    mesh.geometry.setAttribute(
      'waterWindscreen',
      new THREE.Float32BufferAttribute(new Float32Array(positions.count), 1)
    );
    surfaces.set(mesh.material, glass);
    meshes.push(mesh);
  });

  const finishes = [...surfaces]
    .filter(([, glass]) => !glass)
    .map(([material]) => ({
      material,
      clearcoat: material.clearcoat,
      roughness: material.clearcoatRoughness,
    }));
  for (const [material, glass] of surfaces) {
    const previousCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms, { waterGlass: { value: glass ? 1 : 0 } });
      shader.vertexShader =
        `
        attribute vec3 waterPosition;
        attribute vec3 waterNormal;
        attribute float waterWindscreen;
        varying vec3 vWaterPosition;
        varying vec3 vWaterNormal;
        varying float vWaterWindow;
        varying float vWaterWindscreen;
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vWaterPosition = waterPosition;
        vWaterNormal = waterNormal;
        vWaterWindscreen = waterWindscreen;
        // The same source material also covers the headlamp lenses; keep those dry here.
        vWaterWindow = step(.30, waterPosition.y) * (1. - step(1.4, waterPosition.x));
      `
      );
      shader.fragmentShader =
        'varying float vWaterWindow;\n' + waterFunctions + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        #include <roughnessmap_fragment>
        vec2 surfaceWater = bodyWater(vWaterPosition, vWaterNormal);
        surfaceWater *= mix(1., vWaterWindow, waterGlass);
        surfaceWater *= remainingWindshieldWater(vWaterPosition);
        roughnessFactor = mix(roughnessFactor, mix(.10, .95, bodySnow), surfaceWater.y * .8);
        // Flakes on the paint: white specks lying on the bonnet, roof and boot
        // lid, few holding on the sides.
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.9, .92, .96),
          surfaceWater.y * bodySnow * (1. - waterGlass) * .9 *
          mix(.12, 1., smoothstep(.35, .8, normalize(vWaterNormal).y)));
        diffuseColor.rgb *= 1. - bodyWetness * .025 * (1. - waterGlass);
        diffuseColor.a += (1. - diffuseColor.a) * surfaceWater.y * waterGlass * .3;
      `
      );
      if (glass) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `
          #include <normal_fragment_maps>
          if (surfaceWater.y > .001) normal = waterNormal(-vViewPosition, normal, surfaceWater.x * 1.7);
        `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `
          float waterRim = surfaceWater.y * (1. - smoothstep(.00008, .00065, surfaceWater.x));
          vec3 waterLight = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
          outgoingLight = outgoingLight * (1. - surfaceWater.y * .10) +
                          (waterLight + vec3(.012)) * waterRim * .55 * (1. - bodySnow);
          // Snowflakes on the glass: white and all but opaque.
          float flakes = surfaceWater.y * bodySnow;
          outgoingLight = mix(outgoingLight, vec3(.88, .91, .95) * snowLight, flakes * .9);
          diffuseColor.a = mix(diffuseColor.a, 1., flakes * .85);
          // At night: the sky's faint glow on the glass, more at a glancing
          // angle, so the wipers and the beads read against it; the beads'
          // rims catch it.
          float glance = pow(1. - abs(dot(normalize(vViewPosition), normal)), 3.);
          outgoingLight += vec3(.045, .055, .075) * nightGlow * (.4 + .6 * glance);
          outgoingLight += vec3(.13, .14, .17) * nightGlow * waterRim * (1. - bodySnow);
          // Frost: a white, crystalline film, all but opaque.
          vec2 frost = glassFrostAt(vWaterPosition) * vec2(1., vWaterWindow);
          outgoingLight = mix(outgoingLight, vec3(.88, .92, .97) * snowLight * frost.x, frost.y * .95);
          diffuseColor.a = mix(diffuseColor.a, 1., frost.y * .95);
          #include <opaque_fragment>
        `
        );
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clearcoat_normal_fragment_maps>',
        `
        #include <clearcoat_normal_fragment_maps>
        #ifdef USE_CLEARCOAT
          clearcoatNormal = waterNormal(-vViewPosition, clearcoatNormal, surfaceWater.x);
        #endif
      `
      );
    };
    material.customProgramCacheKey = () => (glass ? 'glass-surface-water' : 'paint-surface-water');
    material.needsUpdate = true;
  }

  // The same water seen from the cabin: the glass's inner faces drawn
  // again with the beads alone, as they look from inside against the sky,
  // each a little dark lens with a dark rim and the light of the sky
  // gathered in its lower half. Shown only from the driver's seat.
  const inside = { value: 0 };
  const insideMaterial = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, waterGlass: { value: 1 }, insideView: inside },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 waterPosition;
      attribute vec3 waterNormal;
      attribute float waterWindscreen;
      varying vec3 vWaterPosition;
      varying vec3 vWaterNormal;
      varying float vWaterWindow;
      varying float vWaterWindscreen;
      void main() {
        vWaterPosition = waterPosition;
        vWaterNormal = waterNormal;
        vWaterWindscreen = waterWindscreen;
        vWaterWindow = step(.30, waterPosition.y) * (1. - step(1.4, waterPosition.x));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader:
      'uniform float insideView;\nvarying float vWaterWindow;\n' +
      waterFunctions +
      `
      void main() {
        if (insideView < .5) discard;
        vec2 water = bodyWater(vWaterPosition, vWaterNormal) * vWaterWindow;
        water *= remainingWindshieldWater(vWaterPosition);
        float cover = water.y;
        vec2 frost = glassFrostAt(vWaterPosition) * vec2(1., vWaterWindow);
        if (cover < .01 && frost.y < .01) discard;
        // Which way the bead's surface slopes on screen: the sky's light
        // gathers where it rises upward (below its middle).
        vec2 slope = vec2(dFdx(water.x), dFdy(water.x));
        float steep = length(slope);
        float lower = steep > 1e-9 ? slope.y / steep : 0.;
        float lit = smoothstep(.1, .9, lower) * steep / (steep + .00004);
        float rim = 1. - smoothstep(.00008, .0006, water.x);
        vec3 colour = mix(vec3(.03, .035, .04), vec3(.82, .86, .9), lit);
        float alpha = cover * (.16 + .42 * rim + .5 * lit);
        // Snowflakes from inside: pale, lit through, nearly opaque.
        colour = mix(colour, vec3(.8, .83, .88) * snowLight * .85, bodySnow);
        alpha = mix(alpha, cover * .85, bodySnow);
        // Frost from inside: the daylight through it, greyer than outside.
        colour = mix(colour, vec3(.8, .84, .89) * snowLight * .9 * frost.x, frost.y);
        alpha = max(alpha, frost.y * .96);
        gl_FragColor = vec4(colour, min(alpha, .92));
        #include <colorspace_fragment>
      }
    `,
  });
  for (const mesh of glassMeshes) {
    const drops = new THREE.Mesh(mesh.geometry, insideMaterial);
    drops.name = 'Glass water inside';
    drops.renderOrder = 6;
    mesh.add(drops);
  }

  const inverseRotation = new THREE.Matrix4();
  const gravity = new THREE.Vector3();
  return {
    state,
    meshes,
    glassMeshes,
    setWipers({ texture, clock, origin, up, bounds }) {
      defaultWipeMap.dispose();
      uniforms.windshieldWipeMap.value = texture;
      uniforms.wipeClock = insideMaterial.uniforms.wipeClock = clock;
      uniforms.windshieldOrigin.value.copy(origin);
      uniforms.windshieldUp.value.copy(up);
      uniforms.windshieldBounds.value.copy(bounds);
    },
    // `cabin`: seen from the driver's seat (the beads show on the inside).
    // `snow` (0–1): it falls as snow; `light`: how bright the light on the
    // car is, for the flakes.
    // `night`: how dark it is (0–1).
    update(dt, { raining, speed, cabin = false, snow = 0, light = 1, night = 0 }) {
      uniforms.bodySnow.value = snow;
      uniforms.nightGlow.value = night;
      uniforms.snowLight.value = light;
      inside.value = cabin ? 1 : 0;
      rig.body.updateWorldMatrix(true, false);
      inverseRotation.extractRotation(rig.body.matrixWorld).invert();
      gravity.set(0, -1, 0).transformDirection(inverseRotation);
      state.step(dt, { raining, speed, gravity });
      uniforms.bodyWetness.value = state.wetness;
      uniforms.waterTime.value = state.time;
      uniforms.waterWind.value = THREE.MathUtils.clamp(state.speed / 36, 0, 1);
      for (const finish of finishes) {
        finish.material.clearcoat = THREE.MathUtils.lerp(finish.clearcoat, 1, state.wetness);
        finish.material.clearcoatRoughness = THREE.MathUtils.lerp(
          finish.roughness,
          0.085,
          state.wetness
        );
      }
      return state.wetness;
    },
    // Frost and ice on the glass in winter. Standing still (or paused) the
    // glass frosts over from its edges in a couple of minutes; driving, the
    // defroster clears the windscreen within half a minute and the heater
    // the other windows in a minute or so. Driving through falling snow
    // packs ice round the glass's edges and in the windscreen's corners,
    // more in a blizzard, which thaws slowly once the snow stops. All of it
    // melts at once out of winter.
    frost: {
      update(dt, { winter = 0, running = false, speed = 0, snowing = false, blizzard = false }) {
        const cold = winter >= 0.5,
          standing = !running || Math.abs(speed) < 0.5;
        const step = (u, rate) => (u.value = THREE.MathUtils.clamp(u.value + rate * dt, 0, 1));
        step(uniforms.screenFrost, !cold ? -0.25 : standing ? 1 / 120 : -1 / 25);
        step(uniforms.glassFrost, !cold ? -0.25 : standing ? 1 / 100 : -1 / 60);
        const ice = cold && snowing && running ? (blizzard ? 1 : 0.6) : 0,
          u = uniforms.edgeIce;
        if (!cold) step(u, -0.25);
        else if (u.value < ice) u.value = Math.min(ice, u.value + dt / 60);
        else if (running) u.value = Math.max(ice, u.value - dt / 150);
        return {
          screen: uniforms.screenFrost.value,
          glass: uniforms.glassFrost.value,
          ice: u.value,
        };
      },
    },
  };
}
