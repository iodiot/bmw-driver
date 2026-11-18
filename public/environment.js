import * as THREE from 'three';

// Shared by the visible clouds and their environment reflection.
export const cloudDrift = { value: 0 };
export const celestialDirections = {
  sun: new THREE.Vector3(0.45, 0.72, 0.3).normalize(),
  moon: new THREE.Vector3(-0.75, 0.17, -0.64).normalize(),
};

export function positionCelestialLight(light, anchor, isNight) {
  const direction = isNight ? celestialDirections.moon : celestialDirections.sun;
  light.target.position.copy(anchor);
  light.position.copy(anchor).addScaledVector(direction, 10);
  light.target.updateMatrixWorld();
}

export function createSky(night = { value: 0 }, rain = { value: 0 }) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: {
        cloudDrift,
        night,
        rain,
        sunDirection: { value: celestialDirections.sun },
        moonDirection: { value: celestialDirections.moon },
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
        uniform vec3 sunDirection;
        uniform vec3 moonDirection;
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

        void main() {
          vec3 d = normalize(dir);
          float h = max(d.y, 0.);
          vec3 color = mix(vec3(.78, .88, .98), vec3(.15, .43, .82), pow(h, .40));
          vec3 dusk = mix(vec3(.13, .16, .23), vec3(.025, .045, .10), pow(h, .40));
          color = mix(color, dusk, night);
          vec3 overcast = mix(vec3(.48, .54, .61), vec3(.22, .28, .35), pow(h, .40));
          color = mix(color, overcast, rain * (1. - night));
          color *= mix(vec3(1.), vec3(.85, .83, .80), rain * night);
          float c = cos(cloudDrift), s = sin(cloudDrift);
          vec3 p = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z) * 6.5;
          p.y *= 2.;
          float cloud = smoothstep(.49, .68, fbm(p)) * smoothstep(.03, .20, h);
          cloud = mix(cloud, (.25 + .7 * smoothstep(.2, .65, fbm(p))) *
                      smoothstep(.02, .15, h), rain);
          vec3 white = mix(vec3(.69, .74, .80), vec3(1.), fbm(p + 5.));
          white = mix(white, white * vec3(.28, .32, .42), night);
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
          gl_FragColor = vec4(color, 1.);
        }
      `,
    })
  );
  sky.name = 'Cloud sky sphere';
  sky.frustumCulled = false;
  return sky;
}

export function setupEnvironment(scene, renderer, sun) {
  const night = { value: 0 };
  const rain = { value: 0 };
  const sky = createSky(night, rain);
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
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 4, bottom: -4, near: 0.1, far: 20 });
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.003;
  sun.intensity = 3;
  const env = new THREE.Scene();
  env.add(sky.clone());
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflections = new Map([['0-0', pmrem.fromScene(env, 0.03, 0.1, 600)]]);
  scene.environment = reflections.get('0-0').texture;
  const origin = new THREE.Vector3();
  let reflectionAge = 0;
  let currentReflection = '0-0';
  positionCelestialLight(sun, origin, false);
  return {
    setWeather(isNight, isRain) {
      night.value = isNight ? 1 : 0;
      rain.value = isRain ? 1 : 0;
      const key = `${Number(isNight)}-${Number(isRain)}`;
      // Each independent day/night and dry/rain combination has one cached reflection.
      if (!reflections.has(key)) reflections.set(key, pmrem.fromScene(env, 0.03, 0.1, 600));
      scene.environment = reflections.get(key).texture;
      currentReflection = key;
      reflectionAge = 0;
      scene.environmentIntensity = isNight ? 0.8 : 1;
      if (scene.fog) {
        const horizon = isNight
          ? isRain
            ? [0.1105, 0.1328, 0.184]
            : [0.13, 0.16, 0.23]
          : isRain
            ? [0.48, 0.54, 0.61]
            : [0.78, 0.88, 0.98];
        scene.fog.color.setRGB(...horizon);
        scene.fog.near = isRain ? 42 : 100;
        scene.fog.far = isRain ? 145 : 260;
      }
    },
    update(dt, camera, anchor = origin) {
      cloudDrift.value += dt * 0.012;
      // Rotate only the cloud coordinates in the sky shader. Rotating the entire
      // reflection map would also move the moon away from its visible position.
      scene.environmentRotation.set(0, 0, 0);
      reflectionAge += dt;
      if (reflectionAge >= 8) {
        const previous = reflections.get(currentReflection);
        const refreshed = pmrem.fromScene(env, 0.03, 0.1, 600);
        reflections.set(currentReflection, refreshed);
        scene.environment = refreshed.texture;
        previous.dispose();
        reflectionAge = 0;
      }
      positionCelestialLight(sun, anchor, night.value > 0.5);
      sky.position.copy(camera.position);
    },
  };
}
