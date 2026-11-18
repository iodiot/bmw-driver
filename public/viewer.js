import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupEnvironment } from './environment.js';
import { setupRoad } from './road.js';
import { DrivingSimulation } from './driving-physics.js';
import { rigDownloadedCar } from './vehicle-rig.js';
import { setupBrakeLights } from './brake-lights.js';
import { setupHeadlights } from './headlights.js';
import { setupExhaust } from './exhaust.js';
import { setupRain } from './rain.js';
import { setupBodyWater } from './body-water.js';
import { setupWipers } from './wipers.js';
import { setupBrakes } from './brakes.js';
import { RenderQuality } from './render-quality.js';

const $ = (s) => document.querySelector(s);
document.body.dataset.capture = String(new URLSearchParams(location.search).get('capture') === '1');
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
const renderQuality = new RenderQuality(devicePixelRatio);
renderer.setPixelRatio(renderQuality.resize(innerWidth, innerHeight));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.addEventListener('pointerdown', () =>
  renderer.domElement.focus({ preventScroll: true })
);
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.05, 600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotateSpeed = 0.6;
controls.minDistance = 1;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI / 2 - 0.025;
const ambient = new THREE.HemisphereLight(0xdceeff, 0x243246, 1);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(4, 6, 2);
scene.add(sun);
scene.add(sun.target);
// Diffuse sky fill must not create a second, unrelated moonlike reflection.
const fill = new THREE.HemisphereLight(0xa0caff, 0x243246, 1);
fill.position.set(-2, 2, -4);
scene.add(fill);
const environment = setupEnvironment(scene, renderer, sun),
  road = setupRoad(scene);
const rain = setupRain(scene);
road.update(0, 0);
const input = {},
  held = new Set(),
  materials = new Set(),
  up = new THREE.Vector3(0, 1, 0);
let rig,
  sim,
  brakeLights,
  headlights,
  exhaust,
  bodyWater,
  wipers,
  brakes,
  nightMode = false,
  rainMode = false,
  driving = false,
  telemetryTime = 0;
const peaks = { compression: 0, extension: 0, roll: 0, pitch: 0, ground: 0 };
function resetView() {
  const x = sim?.x ?? 0,
    z = sim?.z ?? 0,
    heading = sim?.heading ?? 0;
  if (rig && new URLSearchParams(location.search).get('detail') === 'brakes') {
    const wheel = rig.wheels.find((w) => w.front && w.z > 0);
    const target = new THREE.Vector3(wheel.x, wheel.y, wheel.z).applyAxisAngle(up, heading);
    target.add(new THREE.Vector3(x, 0, z));
    const distance = 1.25 / Math.min(1, camera.aspect);
    const offset = new THREE.Vector3(distance * 0.18, distance * 0.07, distance).applyAxisAngle(
      up,
      heading
    );
    camera.position.copy(target).add(offset);
    controls.target.copy(target);
    controls.update();
    return;
  }
  const offset = new THREE.Vector3(4.8, 1.9, 5.6).applyAxisAngle(up, heading);
  camera.position.set(x, 0, z).add(offset);
  controls.target.set(x, 0.75, z);
  controls.update();
}
resetView();
$('#orbit').onchange = (e) => {
  controls.autoRotate = e.target.checked;
};
$('#wireframe').onchange = (e) => {
  for (const m of materials) m.wireframe = e.target.checked;
};
function applyWeather() {
  renderQuality.reset();
  environment.setWeather(nightMode, rainMode);
  road.setRain(rainMode);
  rain.setEnabled(rainMode);
  ambient.intensity = nightMode ? 0.6 : rainMode ? 1.05 : 1;
  ambient.color.set(nightMode ? 0x8da8df : 0xdceeff);
  sun.intensity = nightMode ? (rainMode ? 0.36 : 0.55) : rainMode ? 0.75 : 3;
  sun.color.set(nightMode ? 0xb6c9ff : 0xffffff);
  fill.intensity = nightMode ? 0.35 : rainMode ? 0.7 : 1;
  headlights?.setNight(nightMode);
  document.body.dataset.night = String(nightMode);
  document.body.dataset.rain = String(rainMode);
  document.body.dataset.lowBeams = String(Boolean(nightMode && headlights));
}
$('#night').onchange = (e) => {
  nightMode = e.target.checked;
  applyWeather();
};
$('#rain').onchange = (e) => {
  rainMode = e.target.checked;
  applyWeather();
};
applyWeather();
function clearInput() {
  held.clear();
  for (const k of Object.keys(input)) input[k] = false;
}
function setDriving(value) {
  driving = Boolean(value && sim);
  clearInput();
  $('#pause').textContent = driving ? 'Pause' : 'Drive';
  $('#pause').setAttribute('aria-pressed', String(driving));
}
$('#pause').onclick = () => setDriving(!driving);
function restart(x = 0) {
  if (!sim) return;
  sim.reset();
  exhaust.reset();
  brakes.reset();
  sim.x = x;
  rig.wheels.forEach((w) => {
    w.spin.rotation.z = 0;
    w.mount.rotation.y = 0;
  });
  for (const k of Object.keys(peaks)) peaks[k] = 0;
  rig.root.position.set(x, 0, 0);
  rig.root.rotation.set(0, 0, 0);
  resetView();
  setDriving(true);
}
$('#restart').onclick = () => restart();
const actions = {
  ArrowUp: 'accelerate',
  ArrowDown: 'brake',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'accelerate',
  KeyS: 'brake',
  KeyA: 'left',
  KeyD: 'right',
};
addEventListener('keydown', (e) => {
  if (e.target.matches('input,textarea,select')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) setDriving(!driving);
    return;
  }
  const action = actions[e.code];
  if (action) {
    e.preventDefault();
    held.add(e.code);
    input[action] = true;
  }
});
addEventListener('keyup', (e) => {
  const action = actions[e.code];
  if (action) {
    e.preventDefault();
    held.delete(e.code);
    input[action] = Object.keys(actions).some((k) => actions[k] === action && held.has(k));
  }
});
addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setDriving(false);
  renderQuality.reset();
});
new GLTFLoader().load(
  './assets/bmw-m5-f10.glb',
  (g) => {
    try {
      g.scene.traverse((o) => {
        if (o.isMesh && o.material.name === 'M5_F10_Paint') {
          o.material.color.set(0x11151b);
          o.material.metalness = 0.5;
          o.material.roughness = 0.32;
          o.material.clearcoat = 0.85;
          o.material.clearcoatRoughness = 0.16;
        }
      });
      rig = rigDownloadedCar(g.scene);
      scene.add(rig.root);
      sim = new DrivingSimulation(rig.wheels);
      brakeLights = setupBrakeLights(rig);
      headlights = setupHeadlights(rig);
      headlights.setNight(nightMode);
      exhaust = setupExhaust(scene, rig);
      bodyWater = setupBodyWater(rig);
      wipers = setupWipers(rig, bodyWater);
      brakes = setupBrakes(rig);
      document.body.dataset.waterGlassMeshes = String(bodyWater.glassMeshes.length);
      document.body.dataset.lowBeams = String(nightMode);
      document.body.dataset.paint = 'Black Sapphire Metallic (475)';
      let triangles = 0;
      rig.root.traverse((o) => {
        if (o.isMesh) {
          triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
        }
      });
      Object.assign(document.body.dataset, {
        loaded: 'true',
        triangles: String(triangles),
        wheels: String(rig.wheels.length),
        wheelTriangles: String(rig.wheels.reduce((n, w) => n + w.triangles, 0)),
        dimensions: rig.dimensions
          .toArray()
          .map((x) => x.toFixed(3))
          .join(','),
        layout: JSON.stringify(sim.layout.map(({ name, x, y, z, r }) => ({ name, x, y, z, r }))),
      });
      $('#status').hidden = true;
      resetView();
      document.querySelectorAll('button').forEach((b) => (b.disabled = false));
      setDriving(new URLSearchParams(location.search).get('paused') !== '1');
    } catch (e) {
      $('#status').textContent = 'Unable to prepare model: ' + e.message;
      document.body.dataset.error = e.message;
      console.error(e);
    }
  },
  undefined,
  (e) => {
    $('#status').textContent = 'Unable to load model: ' + e.message;
  }
);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(renderQuality.resize(innerWidth, innerHeight));
  renderer.setSize(innerWidth, innerHeight);
});
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const frameDt = clock.getDelta();
  const dt = Math.min(frameDt, 1 / 15);
  if (sim && !document.hidden) {
    const ratio = renderQuality.update(frameDt);
    if (Math.abs(renderer.getPixelRatio() - ratio) > 0.001) renderer.setPixelRatio(ratio);
  }
  if (sim) {
    const oldHeading = sim.heading,
      previousBrakeEnergy = sim.brakeEnergy,
      oldPosition = rig.root.position.clone();
    sim.step(dt, input, driving);
    rig.root.position.set(sim.x, 0, sim.z);
    rig.root.rotation.y = sim.heading;
    const movement = rig.root.position.clone().sub(oldPosition),
      offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(up, sim.heading - oldHeading);
    controls.target.add(movement);
    camera.position.copy(controls.target).add(offset);
    rig.body.position.y = 0.55 + sim.heave;
    rig.body.rotation.set(sim.roll, 0, sim.pitch);
    for (let i = 0; i < rig.wheels.length; i++) {
      const w = rig.wheels[i],
        state = sim.wheels[i];
      w.mount.position.y = w.y + state.offset;
      w.mount.rotation.y = w.front
        ? Math.atan(Math.tan(sim.steer) / (1 + (w.z * Math.tan(sim.steer)) / sim.wheelbase))
        : 0;
      if (driving) {
        const a = w.mount.rotation.y,
          speed = (sim.speed + sim.yawRate * w.z) * Math.cos(a) + sim.yawRate * w.x * Math.sin(a);
        w.spin.rotation.z = (w.spin.rotation.z - (speed / w.r) * dt) % (2 * Math.PI);
      }
      peaks.compression = Math.max(peaks.compression, state.compression);
      peaks.extension = Math.max(peaks.extension, -state.compression);
      peaks.ground = Math.max(peaks.ground, Math.abs(state.ground));
    }
    peaks.roll = Math.max(peaks.roll, Math.abs(sim.roll));
    peaks.pitch = Math.max(peaks.pitch, Math.abs(sim.pitch));
    road.update(sim.x, sim.z);
    const lights = brakeLights.update(dt, Boolean(input.brake), nightMode);
    brakes.update(dt, {
      energy: sim.brakeEnergy - previousBrakeEnergy,
      speed: driving ? sim.speed : 0,
      raining: rainMode,
    });
    document.body.dataset.brakeTemperatures = brakes.heat.discs
      .map((d) => d.surface.toFixed(1))
      .join(',');
    wipers.update(dt, { raining: rainMode, speed: driving ? sim.speed : 0 });
    document.body.dataset.wiperSweep = wipers.motion.sweep.toFixed(4);
    document.body.dataset.wipersActive = String(wipers.motion.active);
    document.body.dataset.bodyWetness = bodyWater
      .update(dt, {
        raining: rainMode,
        speed: driving ? sim.speed : 0,
      })
      .toFixed(4);
    const exhaustParticles = exhaust.update(dt, sim, {
      enabled: driving,
      accelerate: input.accelerate,
      brake: input.brake,
      night: nightMode,
    });
    document.body.dataset.exhaustParticles = String(exhaustParticles);
    document.body.dataset.braking = String(lights.braking);
    document.body.dataset.brakeIntensity = lights.intensity.toFixed(4);
    telemetryTime += dt;
    if (telemetryTime > 0.1) {
      telemetryTime = 0;
      $('#speed').textContent = Math.round(sim.speed * 3.6) + ' km/h';
      $('#gear').textContent = 'D' + sim.powertrain.gear;
      $('#travel').textContent =
        sim.wheels.map((w) => Math.round(w.compression * 1000)).join(' / ') + ' mm';
      Object.assign(document.body.dataset, {
        driving: String(driving),
        speed: sim.speed.toFixed(4),
        gear: String(sim.powertrain.gear),
        engineRpm: sim.powertrain.rpm.toFixed(0),
        transmission: '7-speed M DCT',
        steering: sim.steer.toFixed(5),
        roll: sim.roll.toFixed(5),
        pitch: sim.pitch.toFixed(5),
        heave: sim.heave.toFixed(5),
        distance: sim.distance.toFixed(4),
        vehicleX: sim.x.toFixed(4),
        vehicleZ: sim.z.toFixed(4),
        wheelOffsets: sim.wheels.map((w) => w.offset.toFixed(5)).join(','),
        wheelGround: sim.wheels.map((w) => w.ground.toFixed(5)).join(','),
        wheelAngles: rig.wheels.map((w) => w.spin.rotation.z.toFixed(5)).join(','),
        wheelSteering: rig.wheels.map((w) => w.mount.rotation.y.toFixed(5)).join(','),
        peaks: JSON.stringify(peaks),
      });
    }
  }
  controls.update(dt);
  rain.update(dt, camera, sim, nightMode);
  document.body.dataset.orbit = String(controls.autoRotate);
  document.body.dataset.cameraAzimuth = controls.getAzimuthalAngle().toFixed(4);
  environment.update(dt, camera, rig?.root.position);
  renderer.render(scene, camera);
});
