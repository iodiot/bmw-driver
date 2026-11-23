import * as THREE from 'three';
import { roadProfileGLSL } from './road-profile.js';

function rainGeometry(count) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.attributes.position = quad.attributes.position;
  geometry.attributes.uv = quad.attributes.uv;
  const seeds = new Float32Array(count * 3);
  let seed = 5317;
  for (let i = 0; i < seeds.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    seeds[i] = seed / 4294967296;
  }
  geometry.setAttribute('rainSeed', new THREE.InstancedBufferAttribute(seeds, 3));
  geometry.instanceCount = count;
  return geometry;
}

export function setupRain(scene) {
  const unlitPattern = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  unlitPattern.needsUpdate = true;
  const uniforms = {
    rainTime: { value: 0 },
    // 0…1: how hard it rains, for rain that sets in and eases off.
    rainAmount: { value: 1 },
    // 0…1: how far the camera is under cover (in the tunnel), no rain there.
    shelter: { value: 0 },
    night: { value: 0 },
    cameraVelocity: { value: new THREE.Vector3() },
    vehiclePosition: { value: new THREE.Vector3() },
    vehicleForward: { value: new THREE.Vector2(1, 0) },
    bodyLean: { value: new THREE.Vector3() },
    rainColor: { value: new THREE.Color(0xe1edf5) },
    lowBeamPattern: { value: unlitPattern },
    lowBeamLeft: { value: new THREE.Matrix4() },
    lowBeamRight: { value: new THREE.Matrix4() },
  };
  const common = `
    attribute vec3 rainSeed;
    uniform float rainTime;
    uniform vec3 cameraVelocity;
    uniform vec3 vehiclePosition;
    uniform vec2 vehicleForward;
    uniform vec3 bodyLean;
    uniform sampler2D lowBeamPattern;
    uniform mat4 lowBeamLeft;
    uniform mat4 lowBeamRight;
    ${roadProfileGLSL}

    vec2 localToCar(vec2 worldPosition) {
      vec2 delta = worldPosition - vehiclePosition.xz;
      return vec2(dot(delta, vehicleForward),
                  dot(delta, vec2(-vehicleForward.y, vehicleForward.x)));
    }

    float projectedBeam(vec3 worldPosition, mat4 projector) {
      vec4 p = projector * vec4(worldPosition, 1.);
      if (p.w <= 0.) return 0.;
      vec3 uv = p.xyz / p.w;
      if (any(lessThan(uv, vec3(0.))) || any(greaterThan(uv, vec3(1.)))) return 0.;
      return texture2D(lowBeamPattern, uv.xy).r;
    }

    float headlightVisibility(vec3 worldPosition) {
      float beam = max(projectedBeam(worldPosition, lowBeamLeft),
                       projectedBeam(worldPosition, lowBeamRight));
      float reach = 1. - smoothstep(25., 70., distance(worldPosition, vehiclePosition));
      return clamp(beam * reach * 2., 0., 1.);
    }
  `;

  const streakMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader:
      common +
      `
      varying vec2 vUv;
      varying float vVisibility;
      varying float vBeam;

      void main() {
        float fallSpeed = 10. + rainSeed.z * 5.;
        vec2 drift = vec2(.7, .22) * rainTime;
        // Keep more drops close enough to read at the normal driving-camera distance.
        vec2 offset = mod(rainSeed.xz * 48. + drift - cameraPosition.xz + 24., 48.) - 24.;
        vec3 drop = vec3(cameraPosition.x + offset.x,
                         fract(rainSeed.y - rainTime * fallSpeed / 16.) * 16.,
                         cameraPosition.z + offset.y);
        vec3 velocity = vec3(.7, -fallSpeed, .22) - cameraVelocity;
        // Heights above the land, drawn lifted by it (see terrain.js).
        vec3 dropWorld = drop + vec3(0., terrainLift(drop.x), 0.);
        vec4 head = viewMatrix * vec4(dropWorld, 1.);
        vec4 tail = viewMatrix * vec4(dropWorld - velocity * .020, 1.);
        vec2 axis = normalize(tail.xy - head.xy + vec2(.00001));
        vec2 sideways = vec2(axis.y, -axis.x);
        vec4 viewPosition = mix(head, tail, uv.y);
        viewPosition.xy += sideways * position.x * max(.007, -head.z * .0016);
        gl_Position = projectionMatrix * viewPosition;

        vec2 local = localToCar(drop.xz);
        float roof = local.x > -1.3 && local.x < .75 ? 1.43 : .96;
        roof += bodyLean.x + bodyLean.y * local.x - bodyLean.z * local.y;
        float sheltered = abs(local.x) < 2.45 && abs(local.y) < .9 && drop.y < roof ? 1. : 0.;
        vVisibility = (1. - smoothstep(18., 24., length(offset))) *
                      smoothstep(.8, 1.8, distance(dropWorld, cameraPosition)) *
                      smoothstep(0., .15, drop.y - roadHeight(drop.xz)) *
                      (1. - smoothstep(14., 16., drop.y)) * (1. - sheltered);
        vBeam = headlightVisibility(dropWorld);
        vUv = uv;
      }
    `,
    fragmentShader: `
      uniform float night;
      uniform float rainAmount;
      uniform float shelter;
      uniform vec3 rainColor;
      varying vec2 vUv;
      varying float vVisibility;
      varying float vBeam;

      void main() {
        float crossSection = 1. - smoothstep(.16, .5, abs(vUv.x - .5));
        float ends = smoothstep(0., .12, vUv.y) * (1. - smoothstep(.7, 1., vUv.y));
        float alpha = crossSection * ends * vVisibility * mix(.60, .38 + vBeam * .42, night) *
          rainAmount * (1. - shelter);
        if (alpha < .001) discard;
        vec3 color = mix(rainColor, vec3(1., .93, .82), vBeam * night * .85);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });

  const splashMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader:
      common +
      `
      varying vec2 vUv;
      varying float vVisibility;
      varying float vBeam;

      void main() {
        float cycle = rainTime * (1.5 + rainSeed.z) + rainSeed.y;
        float age = fract(cycle);
        vec2 hit = fract(rainSeed.xz + floor(cycle) * vec2(.371, .613)) * 36.;
        vec2 offset = mod(hit - cameraPosition.xz + 18., 36.) - 18.;
        vec2 centre = cameraPosition.xz + offset;
        vec2 horizontal = centre + vec2(position.x, -position.y) * (.06 + age * .36);
        vec3 worldPosition = vec3(horizontal.x, roadHeight(horizontal) + .008 + terrainLift(horizontal.x), horizontal.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.);
        vec2 local = localToCar(centre);
        float sheltered = abs(local.x) < 2.5 && abs(local.y) < 1. ? 1. : 0.;
        vVisibility = (1. - age) * (1. - age) * smoothstep(0., .08, age) *
                      (1. - smoothstep(14., 18., length(offset))) * (1. - sheltered);
        vBeam = headlightVisibility(worldPosition);
        vUv = uv;
      }
    `,
    fragmentShader: `
      uniform float night;
      uniform float rainAmount;
      uniform float shelter;
      uniform vec3 rainColor;
      varying vec2 vUv;
      varying float vVisibility;
      varying float vBeam;

      void main() {
        float radius = length((vUv - .5) * 2.);
        float ring = 1. - smoothstep(.04, .15, abs(radius - .72));
        float alpha = ring * vVisibility * mix(.32, .18 + vBeam * .32, night) * rainAmount * (1. - shelter);
        if (alpha < .001) discard;
        gl_FragColor = vec4(mix(rainColor, vec3(1., .93, .82), night * vBeam), alpha);
        #include <colorspace_fragment>
      }
    `,
  });

  const group = new THREE.Group();
  group.name = 'Rain and road splashes';
  group.visible = false;
  const drops = new THREE.Mesh(rainGeometry(9600), streakMaterial);
  const splashes = new THREE.Mesh(rainGeometry(900), splashMaterial);
  drops.name = 'Falling rain';
  splashes.name = 'Rain ripples';
  drops.frustumCulled = splashes.frustumCulled = false;
  group.add(drops, splashes);
  scene.add(group);
  const previousCamera = new THREE.Vector3();
  let cameraReady = false,
    target = 0,
    fadeTime = 0,
    wasEnabled = false;
  const dayColor = new THREE.Color(0xe1edf5);
  const nightColor = new THREE.Color(0xa2bdd5);

  return {
    group,
    setHeadlights({ pattern, projectors }) {
      unlitPattern.dispose();
      uniforms.lowBeamPattern.value = pattern;
      uniforms.lowBeamLeft.value = projectors[0].shadow.matrix;
      uniforms.lowBeamRight.value = projectors[1].shadow.matrix;
    },
    // Turns rain on or off at once, or over `fade` seconds: the drops thin
    // out or thicken while the rest of the weather has already changed.
    // `amount` above 1 is a downpour.
    setEnabled(enabled, fade = 0, amount = 1) {
      target = enabled ? amount : 0;
      fadeTime = fade;
      if (enabled) group.visible = true;
      if (fade <= 0) {
        uniforms.rainAmount.value = target;
        group.visible = enabled;
      } else if (enabled && !wasEnabled) uniforms.rainAmount.value = 0;
      wasEnabled = enabled;
    },
    setShelter(amount) {
      uniforms.shelter.value = amount;
    },
    update(dt, camera, state, isNight) {
      if (fadeTime > 0) {
        const amount = uniforms.rainAmount;
        const step = Math.min(dt, 1 / 15) / fadeTime;
        amount.value +=
          Math.sign(target - amount.value) * Math.min(step, Math.abs(target - amount.value));
        if (amount.value === 0 && target === 0) group.visible = false;
      }
      if (group.visible) uniforms.rainTime.value += Math.min(dt, 1 / 15);
      uniforms.night.value = isNight ? 1 : 0;
      uniforms.rainColor.value.copy(isNight ? nightColor : dayColor);
      const velocity = uniforms.cameraVelocity.value;
      if (cameraReady && dt > 0 && previousCamera.distanceTo(camera.position) < 8) {
        velocity.subVectors(camera.position, previousCamera).divideScalar(dt).clampLength(0, 60);
      } else velocity.set(0, 0, 0);
      previousCamera.copy(camera.position);
      cameraReady = true;
      uniforms.vehiclePosition.value.set(state?.x ?? 0, 0, state?.z ?? 0);
      uniforms.vehicleForward.value.set(
        Math.cos(state?.heading ?? 0),
        -Math.sin(state?.heading ?? 0)
      );
      uniforms.bodyLean.value.set(state?.heave ?? 0, state?.pitch ?? 0, state?.roll ?? 0);
    },
  };
}
