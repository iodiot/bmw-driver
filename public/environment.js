import * as THREE from 'three';
import { daylight } from './time-of-day.js';

// Shared by the visible clouds and their environment reflection.
export const cloudDrift = { value: 0 };
export const celestialDirections = {
  // Matches the sun in the clear-day sky photograph (43° elevation).
  sun: new THREE.Vector3(0.591, 0.683, 0.43).normalize(),
  moon: new THREE.Vector3(-0.75, 0.17, -0.64).normalize(),
};

// The sun at an elevation (degrees), on the photographed sun's bearing.
export function sunDirectionAt(elevation, target = new THREE.Vector3()) {
  const { x, z } = celestialDirections.sun,
    flat = Math.hypot(x, z),
    e = (elevation * Math.PI) / 180;
  return target.set((x / flat) * Math.cos(e), Math.sin(e), (z / flat) * Math.cos(e));
}

// Places a directional light: night (moon) or day (sun) for a boolean, or
// along a given direction.
export function positionCelestialLight(light, anchor, isNight) {
  const direction =
    typeof isNight === 'boolean'
      ? isNight
        ? celestialDirections.moon
        : celestialDirections.sun
      : isNight;
  light.target.position.copy(anchor);
  // Far enough up the light's path to take in an overpass's deck above the
  // car, even with the sun low.
  light.position.copy(anchor).addScaledVector(direction, 40);
  light.target.updateMatrixWorld();
}

// Clear-day sky photograph: Poly Haven's CC0 "Sunflowers" panorama from the
// zenith to 5.98° below the horizon (4096 × 1092 JPEG), so the real
// fields and tree lines on its horizon close the scene's horizon.
export const photoSkyBelowHorizon = (5.9766 * Math.PI) / 180;
export const photoSky = { value: null };
export const photoSkyMix = { value: 0 };

// Fog, a storm and a lightning flash, shared by the sky and its reflection.
export const skyWeather = {
  fog: { value: 0 },
  storm: { value: 0 },
  winter: { value: 0 },
  flash: { value: 0 },
  // The fog's colour as displayed (sRGB), which the sky fades to.
  fogColor: { value: new THREE.Vector3(0.82, 0.83, 0.82) },
};

export function createSky(night = { value: 0 }, rain = { value: 0 }, sunset = { value: 0 }) {
  const sky = new THREE.Mesh(
    // Far beyond the visible road; the photograph's own fields continue past it.
    new THREE.SphereGeometry(630, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: {
        cloudDrift,
        night,
        rain,
        photoSky,
        photoSkyMix,
        sunDirection: { value: celestialDirections.sun.clone() },
        sunset,
        moonDirection: { value: celestialDirections.moon },
        ...skyWeather,
      },
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 dir;

        void main() {
          dir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        }
      `,
      fragmentShader: `
        uniform float cloudDrift;
        uniform float night;
        uniform float rain;
        uniform sampler2D photoSky;
        uniform float photoSkyMix;
        uniform vec3 sunDirection;
        uniform float sunset;
        uniform vec3 moonDirection;
        uniform float fog;
        uniform float storm;
        uniform float winter;
        uniform float flash;
        uniform vec3 fogColor;
        varying vec3 dir;

        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }

        float noise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3. - 2. * f);
          return mix(
            mix(
              mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
              mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x),
              f.y
            ),
            mix(
              mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
              mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x),
              f.y
            ),
            f.z
          );
        }

        float fbm(vec3 p) {
          float v = 0., a = .55;
          for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p = p * 2.06 + vec3(4.1, 8.2, 2.3);
            a *= .5;
          }
          return v;
        }

        // Equirectangular lookup of the photograph, which spans from the zenith
        // to a few degrees below the horizon; lower rows hold its last row.
        // Its clouds drift with the procedural ones: above the horizon the
        // panorama is read turned by the drift angle, and a few degrees up it
        // cross-fades from the still photograph, so the fields and tree lines
        // stay put and the clouds move as one layer (a second lookup only in
        // that band).
        vec3 photoColor(vec3 d) {
          float u = atan(d.z, d.x) * .15915494 + .5;
          float below = 0.104311;
          float v = clamp((asin(clamp(d.y, -1., 1.)) + below) / (1.57079633 + below), .001, .999);
          float moving = smoothstep(.035, .14, d.y);
          vec3 drifting = texture2D(photoSky, vec2(u + cloudDrift * .15915494, v)).rgb;
          if (moving >= 1.) return drifting;
          return mix(texture2D(photoSky, vec2(u, v)).rgb, drifting, moving);
        }

        void main() {
          vec3 d = normalize(dir);
          // Sky colours are display values. Decode them to linear and let
          // three.js encode the output: unchanged on screen, and correct when
          // the sky is rendered into mirrors and reflection maps.
          if (photoSkyMix > .999) {
            gl_FragColor = sRGBTransferEOTF(vec4(photoColor(d), 1.));
            #include <colorspace_fragment>
            return;
          }
          float h = max(d.y, 0.);
          vec3 color = mix(vec3(.78, .88, .98), vec3(.15, .43, .82), pow(h, .40));
          vec3 dusk = mix(vec3(.13, .16, .23), vec3(.025, .045, .10), pow(h, .40));
          color = mix(color, dusk, night);
          vec3 overcast = mix(vec3(.48, .54, .61), vec3(.22, .28, .35), pow(h, .40));
          color = mix(color, overcast, rain * (1. - night));
          color *= mix(vec3(1.), vec3(.85, .83, .80), rain * night);
          // Sunset and dawn: a warm band on the horizon, strongest toward the sun.
          vec3 sunFlat = normalize(vec3(sunDirection.x, 0., sunDirection.z));
          float toward = max(dot(normalize(vec3(d.x, 0., d.z) + vec3(1e-5)), sunFlat), 0.);
          float band = exp(-h * 6.);
          color = mix(color, vec3(1., .5, .22), sunset * band * (.3 + .7 * toward * toward) * .8);
          float c = cos(cloudDrift), s = sin(cloudDrift);
          vec3 p = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z) * 6.5;
          p.y *= 2.;
          float density = fbm(p);
          float cloud = smoothstep(.49, .68, density) * smoothstep(.03, .20, h);
          cloud = mix(cloud, (.25 + .7 * smoothstep(.2, .65, density)) *
                      smoothstep(.02, .15, h), rain);
          vec3 white = mix(vec3(.69, .74, .80), vec3(1.), fbm(p + 5.));
          white = mix(white, white * vec3(.28, .32, .42), night);
          white = mix(white, white * vec3(1., .72, .56), sunset * .7);
          white = mix(white, mix(vec3(.48, .52, .57), vec3(.13, .16, .21), night), rain * .85);
          color = mix(color, white, cloud * .93);
          float glow = pow(max(dot(d, sunDirection), 0.), 280.);
          color += vec3(1., .88, .63) * glow * .8 * (1. - night) * (1. - rain * .95);

          float moonDot = max(dot(d, moonDirection), 0.);
          float moonDisc = smoothstep(cos(.017), cos(.015), moonDot);
          color += vec3(.22, .29, .45) * pow(moonDot, 950.) * .22 * night;
          if (moonDisc > 0.) {
            float detail = .68 + .32 * fbm(d * 160.);
            vec3 moonColor = vec3(.90, .94, 1.) * detail;
            color = mix(color, moonColor, moonDisc * night * (1. - cloud * .45) * (1. - rain * .35));
          }
          if (photoSkyMix > .001) color = mix(color, photoColor(d), photoSkyMix);
          // Winter: a pale, cold sky, whitest low down.
          if (winter > .001) {
            vec3 cold = mix(vec3(.84, .88, .93), vec3(.58, .68, .82), pow(h, .5));
            cold = mix(cold, cold * vec3(.32, .36, .48), night);
            color = mix(color, cold, winter * .6 * (1. - storm));
          }
          // A thunderstorm: low, heavy cloud, darkest overhead, lit from
          // within by lightning.
          if (storm > .001) {
            float heavy = fbm(p * .55 + vec3(0., 0., cloudDrift * 3.));
            vec3 slate = mix(vec3(.30, .33, .38), vec3(.11, .12, .15), smoothstep(.0, .6, h));
            slate *= .75 + .5 * heavy;
            // A blizzard instead: a white-out, greyer overhead.
            vec3 whiteout = mix(vec3(.86, .89, .93), vec3(.68, .72, .79), smoothstep(.0, .6, h));
            slate = mix(slate, whiteout * (.94 + .12 * heavy), winter);
            slate = mix(slate, slate * vec3(.35, .38, .48), night);
            color = mix(color, slate, storm);
            color += vec3(.8, .84, 1.) * flash * (.6 + 1.4 * heavy) * (.5 + .5 * smoothstep(0., .5, h));
          }
          // Morning fog: the sky is the fog, with the sun a pale disc in it.
          if (fog > .001) {
            float veil = fog * mix(1., .82, smoothstep(.0, .9, h) * (1. - fog));
            color = mix(color, fogColor, veil);
            float toSun = max(dot(d, sunDirection), 0.);
            color += vec3(1., .96, .88) * (smoothstep(cos(.045), cos(.035), toSun) * .5 +
                     pow(toSun, 24.) * .25) * fog * (1. - night) * step(0., sunDirection.y);
          }
          gl_FragColor = sRGBTransferEOTF(vec4(color, 1.));
          #include <colorspace_fragment>
        }
      `,
    })
  );
  sky.name = 'Cloud sky sphere';
  // Opaque surfaces fill depth first, so sky noise is shaded only in visible sky pixels.
  sky.renderOrder = 1000;
  sky.frustumCulled = false;
  return sky;
}

// `refresh`: seconds between captures of the sky's reflection while it
// changes (longer on phones).
export function setupEnvironment(scene, renderer, sun, { refresh = 1.5 } = {}) {
  const night = { value: 0 };
  const sunset = { value: 0 };
  const rain = { value: 0 };
  const sky = createSky(night, rain, sunset);
  scene.add(sky);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'),
    pixels = ctx.createImageData(512, 512);
  let seed = 8137;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const r = (seed >>> 0) / 4294967295;
    let v = 52 + r * 35;
    if (r > 0.985) v += 45;
    pixels.data[i] = v;
    pixels.data[i + 1] = v + 2;
    pixels.data[i + 2] = v + 4;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const asphalt = new THREE.CanvasTexture(canvas);
  asphalt.colorSpace = THREE.SRGBColorSpace;
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.repeat.set(200, 200);
  asphalt.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshPhysicalMaterial({
      map: asphalt,
      bumpMap: asphalt,
      bumpScale: 0.009,
      roughness: 1,
      metalness: 0,
      color: 0xc8c8c8,
      clearcoat: 0,
      clearcoatRoughness: 0.12,
    })
  );
  road.name = 'Asphalt ground';
  road.rotation.x = -Math.PI / 2;
  road.position.y = -0.003;
  road.receiveShadow = true;
  scene.add(road);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 4, bottom: -4, near: 0.1, far: 60 });
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.003;
  sun.intensity = 3;
  // The photograph is shown and reflected only in clear daylight. Its pixels
  // are output as stored, so it needs no colour conversion or mipmaps (which
  // would also seam where the longitude wraps).
  let photoReady = false,
    clearDay = true,
    photoTarget = 1,
    lightDirection = celestialDirections.sun;
  new THREE.TextureLoader().load(
    new URL('./assets/sky/sky-day.jpg', import.meta.url).href,
    (texture) => {
      texture.colorSpace = THREE.NoColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.wrapS = THREE.RepeatWrapping;
      photoSky.value = texture;
      photoReady = true;
      if (clearDay) {
        photoSkyMix.value = photoTarget;
        refreshCurrent();
      }
    }
  );
  const env = new THREE.Scene();
  env.add(sky.clone());
  const pmrem = new THREE.PMREMGenerator(renderer);
  const capture = new THREE.WebGLCubeRenderTarget(256, {
    type: THREE.HalfFloatType,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
  });
  const captureCamera = new THREE.CubeCamera(0.1, 800, capture);
  // Cloud drift at the last capture. Between captures the reflection is turned
  // by the drift since then, so reflected clouds move as smoothly as the sky.
  let capturedDrift = cloudDrift.value;
  let capturedPhoto = -1;
  const refreshReflection = (target) => {
    captureCamera.update(renderer, env);
    capturedDrift = cloudDrift.value;
    capturedPhoto = photoSkyMix.value;
    return pmrem.fromCubemap(capture.texture, target);
  };
  const reflections = new Map([['0-0', refreshReflection()]]);
  const refreshCurrent = () => refreshReflection(reflections.get(currentReflection));
  scene.environment = reflections.get('0-0').texture;
  const origin = new THREE.Vector3();
  let reflectionAge = 0;
  let currentReflection = '0-0';
  positionCelestialLight(sun, origin, false);
  return {
    // The scene at a time of day (see time-of-day.js), dry or wet.
    // `isRain`: true or false, or how far rain has set in (0 to 1).
    // `weather`: how far fog and a storm have set in (0 to 1), and a
    // lightning flash's brightness.
    setConditions(light, isRain, { fog = 0, storm = 0, flash = 0, winter = 0 } = {}) {
      const wet = Math.max(0, Math.min(1, Number(isRain)));
      skyWeather.fog.value = fog;
      skyWeather.storm.value = storm;
      skyWeather.winter.value = winter;
      skyWeather.flash.value = flash;
      night.value = light.darkness;
      rain.value = wet;
      sunset.value = light.sunset;
      clearDay = light.photo > 0;
      photoTarget = light.photo;
      photoSkyMix.value = photoReady ? light.photo : 0;
      sunDirectionAt(light.elevation, sky.material.uniforms.sunDirection.value);
      lightDirection = light.sunUp
        ? sky.material.uniforms.sunDirection.value
        : celestialDirections.moon;
      const key = `${Number(light.night)}-${Number(wet > 0.5)}-${Number(fog > 0.5)}${Number(storm > 0.5)}${Number(winter > 0.5)}`;
      // One cached reflection per dark/light and dry/wet combination; it is
      // refreshed as the sky changes.
      if (key !== currentReflection) {
        if (!reflections.has(key)) reflections.set(key, refreshReflection());
        scene.environment = reflections.get(key).texture;
        currentReflection = key;
        reflectionAge = 1;
      }
      // A fully photographed sky is static: refresh once when it settles.
      if (photoSkyMix.value > 0.999 && capturedPhoto !== photoSkyMix.value) reflectionAge = 1;
      scene.environmentIntensity = 1 - 0.2 * light.darkness;
      if (scene.fog) {
        // three.js mixes fog in display values after tone mapping, and the sky
        // (photograph or shader) is output as display values too. Each value is
        // that sky's horizon colour in sRGB, so fogged ground meets it cleanly.
        const mixRGB = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
        let horizon = mixRGB(
          mixRGB([0.78, 0.88, 0.98], [0.13, 0.16, 0.23], light.darkness),
          mixRGB([0.48, 0.54, 0.61], [0.1105, 0.1328, 0.184], light.darkness),
          wet
        );
        horizon = mixRGB(horizon, [0.86, 0.56, 0.38], light.sunset * 0.45);
        // The photograph's horizon: distant fields and tree lines.
        horizon = mixRGB(horizon, [0.45, 0.46, 0.3], photoSkyMix.value);
        // A storm's horizon is dark under its clouds, and flashes with them;
        // a blizzard's is white.
        horizon = mixRGB(
          horizon,
          mixRGB(
            mixRGB([0.3, 0.33, 0.38], [0.86, 0.89, 0.93], winter),
            [0.1, 0.11, 0.14],
            light.darkness
          ),
          storm
        );
        horizon = horizon.map((v) => v + 0.8 * flash);
        // Winter's haze is white over the snow.
        horizon = mixRGB(
          horizon,
          mixRGB([0.84, 0.88, 0.93], [0.13, 0.15, 0.2], light.darkness),
          winter * 0.6 * (1 - storm)
        );
        // Morning fog: light grey, warm in a low sun, dark at night.
        const mist = mixRGB(
          mixRGB([0.84, 0.85, 0.84], [0.92, 0.84, 0.74], light.sunset * 0.6),
          [0.14, 0.15, 0.17],
          light.darkness
        );
        skyWeather.fogColor.value.set(...mist);
        horizon = mixRGB(horizon, mist, fog);
        scene.fog.color.setRGB(...horizon, THREE.SRGBColorSpace);
        // Clear daylight sees the fields fade gradually up to the tree line.
        const near = 80 + 20 * light.darkness * (1 - photoSkyMix.value),
          far = 900 * photoSkyMix.value + (600 - 340 * light.darkness) * (1 - photoSkyMix.value);
        // Rain closes the view in as it sets in.
        let fogNear = near + (42 - near) * wet,
          fogFar = far + (145 - far) * wet;
        // A storm's rain closes it further; a morning fog to a hundred metres
        // or so.
        fogNear += (24 - fogNear) * storm;
        fogFar += (115 - fogFar) * storm;
        // (three.js eases linear fog in with a smoothstep; starting it behind
        // the camera makes it thicken with distance as real fog does, about
        // half gone at 30 m and nothing seen past 70.)
        fogNear += (-10 - fogNear) * fog;
        fogFar += (68 - fogFar) * fog;
        scene.fog.near = fogNear;
        scene.fog.far = fogFar;
      }
    },
    // Plain day or night, as before the time of day.
    setWeather(isNight, isRain) {
      this.setConditions(daylight(isNight ? 23 : 13, isRain), isRain);
    },
    update(dt, camera, anchor = origin) {
      cloudDrift.value += dt * 0.012;
      // The sky shader turns only its cloud coordinates. Between captures, turn
      // the reflection by the same drift so reflected clouds glide instead of
      // jumping; a capture every 1.5 s (each a cube render and its filtering,
      // a visible cost when it came twice a second) keeps the sun and moon
      // within about 1° of their places. The photographed sky is static, so
      // its reflection never needs a refresh.
      if (photoSkyMix.value > 0.999 && capturedPhoto === photoSkyMix.value)
        scene.environmentRotation.set(0, 0, 0);
      else {
        reflectionAge += dt;
        if (reflectionAge >= refresh) {
          // Reuse both the capture cube and the filtered target. Reallocating and
          // disposing GPU textures here caused periodic driver stalls.
          refreshReflection(reflections.get(currentReflection));
          reflectionAge = 0;
        }
        scene.environmentRotation.set(0, cloudDrift.value - capturedDrift, 0);
      }
      positionCelestialLight(sun, anchor, lightDirection);
      sky.position.copy(camera.position);
    },
  };
}
