import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupEnvironment } from './environment.js';
import { setupRoad } from './road.js';
import { setupRoadside } from './roadside.js';
import { DrivingSimulation } from './driving-physics.js';
import { rigDownloadedCar, addArchLiners, addRearDefroster } from './vehicle-rig.js';
import { setupBrakeLights } from './brake-lights.js';
import { setupHeadlights } from './headlights.js';
import { setupExhaust } from './exhaust.js';
import { setupRain } from './rain.js';
import { setupBodyWater } from './body-water.js';
import { setupWipers } from './wipers.js';
import { setupBrakes } from './brakes.js';
import { RenderQuality } from './render-quality.js';
import { setupInstruments } from './instruments.js';
import { setupSuspensionDisplay } from './suspension-display.js';
import { GearShiftShake } from './shift-shake.js';
import { setupVehicleAudio } from './vehicle-audio.js';
import { setupSkidMarks } from './skid-marks.js';
import { setupLicensePlates } from './license-plates.js';
import { setupContactShadow } from './contact-shadow.js';
import { refineCarMaterials } from './car-materials.js';
import { laneKeepingSteer, nearestLane, curveSpeed, bumpSpeed } from './lane-keeping.js';
import { setupSparks } from './sparks.js';
import { setupMinimap } from './minimap.js';
import { setMirrorInterval, setupMirrors, setupRearViewMirror } from './mirrors.js';
import { createWeatherCycle, weatherCycle } from './weather-cycle.js';
import { daylight, dayCycle, wrapHours } from './time-of-day.js';
import { setupDayBar } from './day-bar.js';
import { setupRearGlow } from './rear-glow.js';
import { setupInterior } from './interior.js';
import { setAmbientLight } from './door-trim.js';
import { SeatCamera, cameraViews, nextCameraView, viewFov } from './camera-views.js';
import { setupCockpitCluster } from './cockpit-cluster.js';
import { setupCentreDisplay } from './centre-display.js';
import { setupDust } from './dust.js';
import { setupTyreSmoke } from './tyre-smoke.js';
import { TurnSignals, highBeamWanted, setupSignalLamps } from './signals.js';
import { readPad, setupTouchControls } from './touch-controls.js';
import { setupBodyDirt } from './body-dirt.js';
import { roadLateral, guardrailsEnabled, surfaceRoughness } from './road-profile.js';

const $ = (s) => document.querySelector(s);
const instruments = setupInstruments($('#instruments'));
const suspensionDisplay = setupSuspensionDisplay($('#suspension-display'));
const minimap = setupMinimap($('#minimap'));
const shiftShake = new GearShiftShake();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const vehicleAudio = setupVehicleAudio({
  sound: $('#sound'),
  volume: $('#volume'),
  status: $('#audio-status'),
});
const settings = $('#settings');
settings.addEventListener('toggle', () => {
  if (settings.open) clearInput();
});
document.addEventListener('pointerdown', (e) => {
  if (settings.open && !settings.contains(e.target)) settings.open = false;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settings.open) {
    settings.open = false;
    settings.querySelector('summary').focus();
  }
});
document.body.dataset.capture = String(new URLSearchParams(location.search).get('capture') === '1');
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
const renderQuality = new RenderQuality(devicePixelRatio);
renderer.setPixelRatio(renderQuality.resize(innerWidth, innerHeight));
// Khronos PBR Neutral keeps material colours true (deep black paint, natural
// grass) without ACES hue shifts or AgX's washed-out blacks.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.addEventListener('pointerdown', () =>
  renderer.domElement.focus({ preventScroll: true })
);
// A longer, photographic lens (about 58 mm full-frame equivalent). Camera
// distances scale with it, so framing stays the same with flatter perspective.
const cameraFov = 34,
  lensScale = Math.tan((46 * Math.PI) / 360) / Math.tan((cameraFov * Math.PI) / 360);
const camera = new THREE.PerspectiveCamera(cameraFov, innerWidth / innerHeight, 0.05, 700);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotateSpeed = 0.6;
controls.minDistance = 1;
controls.maxDistance = 22;
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
const roadside = guardrailsEnabled ? setupRoadside(scene) : null;
const sparks = setupSparks(scene);
const dust = setupDust(scene);
const tyreSmoke = setupTyreSmoke(scene);
// Turn signals (Q, E) and the high-beam assistant (H switches it off and on).
const signals = new TurnSignals();
let signalLamps,
  highBeamAssistOn = true;
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
  bodyDirt,
  wipers,
  brakes,
  skidMarks,
  licensePlates,
  contactShadow,
  rearGlow,
  interior,
  cockpitCluster,
  centreDisplay,
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
    const distance = (1.25 * lensScale) / Math.min(1, camera.aspect);
    const offset = new THREE.Vector3(distance * 0.18, distance * 0.07, distance).applyAxisAngle(
      up,
      heading
    );
    camera.position.copy(target).add(offset);
    controls.target.copy(target);
    controls.update();
    return;
  }
  const offset = new THREE.Vector3(4.8, 1.9, 5.6)
    .multiplyScalar(Math.max(1, 0.9 / camera.aspect) * lensScale)
    .applyAxisAngle(up, heading);
  camera.position.set(x, 0, z).add(offset);
  controls.target.set(x, 0.75, z);
  controls.update();
}
resetView();
// Camera view: the orbiting chase camera, the driver's seat or the bonnet.
// Every visit starts with the chase camera, from behind the car.
const seatCamera = new SeatCamera();
let cameraView = 'chase';
function applyCameraFov() {
  camera.fov = viewFov(cameraView, camera.aspect) ?? cameraFov;
  camera.near = cameraView === 'chase' ? 0.05 : 0.02;
  camera.updateProjectionMatrix();
}
// The rear-view mirror renders only from the driver's seat; the door
// mirrors update less often when small, in the chase view.
let rearViewMirror = null;
function applyMirrors() {
  if (rearViewMirror) rearViewMirror.mirror.visible = cameraView === 'driver';
  setMirrorInterval(cameraView === 'chase' ? 4 : 2);
}
function setCameraView(view) {
  cameraView = view;
  controls.enabled = view === 'chase';
  seatCamera.reset();
  applyCameraFov();
  if (view === 'chase') resetView();
  document.body.dataset.cameraView = view;
  dayBar.setCamera(view, cameraViews[view].label);
  applyMirrors();
}
// In the seat or on the bonnet, dragging turns the driver's head.
let lookPointer = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (cameraView === 'chase' || e.button !== 0) return;
  lookPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (lookPointer?.id !== e.pointerId) return;
  seatCamera.drag(e.clientX - lookPointer.x, e.clientY - lookPointer.y, innerHeight, camera.fov);
  lookPointer.x = e.clientX;
  lookPointer.y = e.clientY;
});
const endLook = (e) => {
  if (lookPointer?.id === e.pointerId) lookPointer = null;
};
renderer.domElement.addEventListener('pointerup', endLook);
renderer.domElement.addEventListener('pointercancel', endLook);
renderer.domElement.addEventListener('dblclick', () => seatCamera.reset());
$('#orbit').onchange = (e) => {
  controls.autoRotate = e.target.checked;
};
$('#wireframe').onchange = (e) => {
  for (const m of materials) m.wireframe = e.target.checked;
};
// Rain comes and goes by itself unless the driver turns that off.
const weather = createWeatherCycle();
// Time of day: it runs a full day in dayCycle.minutesPerDay real minutes and
// sets the sky, light and fog continuously; lamps switch at dusk and dawn.
let timeOfDay = dayCycle.start,
  timeRunning = true,
  lowBeamsOn = false,
  light = daylight(timeOfDay, rainMode);
// Discrete changes: rain on or off, night-time lamps and materials.
let roadRain = null;
function applyWeather(fade = 0) {
  renderQuality.reset();
  // Wet asphalt rebuilds the road material: only when the rain changes, not
  // when the lamps switch at dusk.
  if (roadRain !== rainMode) road.setRain((roadRain = rainMode));
  rain.setEnabled(rainMode, fade);
  headlights?.setNight(lowBeamsOn);
  licensePlates?.setNight(nightMode);
  contactShadow?.setNight(nightMode);
  // Compile hidden tyre trails when lighting changes, before the first slide
  // makes them visible. The first on-road compilation otherwise caused a hitch.
  if (skidMarks)
    renderer
      .compileAsync(skidMarks.mesh, camera, scene)
      .then(() => skidMarks.warmup(renderer, camera, scene))
      .catch(console.error);
  $('#night').checked = nightMode;
  $('#rain').checked = rainMode;
  document.body.dataset.night = String(nightMode);
  document.body.dataset.rain = String(rainMode);
  document.body.dataset.lowBeams = String(Boolean(lowBeamsOn && headlights));
}
// Continuous changes for the current time and weather.
function applyDaylight() {
  light = daylight(timeOfDay, rainMode);
  environment.setConditions(light, rainMode);
  ambient.intensity = light.ambient;
  ambient.color.setRGB(...light.ambientColour);
  sun.intensity = light.direct;
  sun.color.setRGB(...light.directColour);
  fill.intensity = light.fill;
  document.body.dataset.timeOfDay = timeOfDay.toFixed(3);
  dayBar.update(light, { running: timeRunning, raining: rainMode });
  if (light.night !== nightMode || light.lowBeams !== lowBeamsOn) {
    nightMode = light.night;
    lowBeamsOn = light.lowBeams;
    applyWeather();
  }
}
function setTimeOfDay(hours) {
  timeOfDay = wrapHours(hours);
  applyDaylight();
}
function setRain(value, fade = 0) {
  rainMode = value;
  applyWeather(fade);
  applyDaylight();
}
const dayBar = setupDayBar($('#day-bar'), {
  setTime: setTimeOfDay,
  toggleRain() {
    weather.set(!rainMode);
    setRain(!rainMode);
  },
  toggleRunning() {
    timeRunning = !timeRunning;
    applyDaylight();
  },
  restart: () => restart(),
  toggleSound: () => vehicleAudio.toggle(),
  nextCamera: () => setCameraView(nextCameraView(cameraView)),
});
setCameraView(cameraView);
$('#night').onchange = (e) => {
  setTimeOfDay(e.target.checked ? dayCycle.presets.night : dayCycle.presets.day);
};
$('#rain').onchange = (e) => {
  weather.set(e.target.checked);
  setRain(e.target.checked);
};
applyWeather();
applyDaylight();
// Keys held, kept apart from `input`, which also takes the touch pedals and
// a gamepad each frame.
const keyInput = {};
function clearInput() {
  held.clear();
  for (const k of Object.keys(input)) input[k] = false;
  for (const k of Object.keys(keyInput)) keyInput[k] = false;
}
const touchBox = document.createElement('div');
touchBox.className = 'touch-controls';
document.body.append(touchBox);
const touch = setupTouchControls(touchBox, {
  onDrive: () => {
    autopilot = false;
  },
});
let padPrevious = [];
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
  cameraFollowHeading = 0;
  keptLane = null;
  autopilot = true;
  shiftShake.reset(sim.powertrain.gear);
  instruments.reset();
  exhaust.reset();
  brakes.reset();
  skidMarks.reset();
  sparks.reset();
  dust.reset();
  tyreSmoke.reset();
  signals.reset();
  bodyDirt?.reset();
  minimap.reset();
  sim.x = x;
  rig.wheels.forEach((w) => {
    w.spin.rotation.z = 0;
    w.mount.rotation.y = 0;
  });
  for (const k of Object.keys(peaks)) peaks[k] = 0;
  rig.root.position.set(x, 0, 0);
  rig.root.rotation.set(0, 0, 0);
  seatCamera.reset();
  if (cameraView === 'chase') resetView();
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
  // Driving keys work wherever focus is, except while typing; Space still
  // presses a focused button.
  if (e.target.closest?.('input,textarea,select')) return;
  const onControl = e.target.closest?.('button,summary,a');
  if (e.code === 'Space') {
    if (onControl) return;
    e.preventDefault();
    if (!e.repeat) setDriving(!driving);
    return;
  }
  if (e.code === 'KeyR' && !e.repeat && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    restart();
    return;
  }
  if (['KeyQ', 'KeyE', 'KeyH'].includes(e.code) && !e.repeat && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    if (e.code === 'KeyH') highBeamAssistOn = !highBeamAssistOn;
    else signals.toggle(e.code === 'KeyQ' ? 'left' : 'right');
    return;
  }
  if (e.code === 'KeyC' && !e.repeat && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    setCameraView(nextCameraView(cameraView));
    return;
  }
  if (e.code === 'KeyM' && !e.repeat && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    vehicleAudio.toggle();
    return;
  }
  const action = actions[e.code];
  if (action) {
    e.preventDefault();
    held.add(e.code);
    keyInput[action] = true;
    // Any driving key hands full control to the driver until Restart.
    autopilot = false;
  }
});
addEventListener('keyup', (e) => {
  const action = actions[e.code];
  if (action) {
    e.preventDefault();
    held.delete(e.code);
    keyInput[action] = Object.keys(actions).some((k) => actions[k] === action && held.has(k));
  }
});
addEventListener('blur', clearInput);
// Away from the tab the car stops; back on it, it drives on.
let pausedByHiding = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && driving) {
    setDriving(false);
    pausedByHiding = true;
  } else if (!document.hidden && pausedByHiding) {
    pausedByHiding = false;
    setDriving(true);
  }
  renderQuality.reset();
});
new GLTFLoader().load(
  './assets/bmw-m5-f10.glb',
  async (g) => {
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
      addArchLiners(rig);
      addRearDefroster(rig);
      refineCarMaterials(rig.root);
      scene.add(rig.root);
      sim = new DrivingSimulation(rig.wheels);
      skidMarks = setupSkidMarks(scene, sim.layout);
      brakeLights = setupBrakeLights(rig);
      headlights = setupHeadlights(rig);
      signalLamps = setupSignalLamps(rig);
      rain.setHeadlights(headlights);
      headlights.setNight(lowBeamsOn);
      exhaust = setupExhaust(scene, rig);
      bodyWater = setupBodyWater(rig);
      bodyDirt = setupBodyDirt(rig, [
        ...new Set(
          bodyWater.meshes.map((m) => m.material).filter((m) => m.name === 'M5_F10_Paint')
        ),
      ]);
      wipers = setupWipers(rig, bodyWater);
      brakes = setupBrakes(rig);
      licensePlates = setupLicensePlates(rig);
      setupMirrors(rig);
      rearViewMirror = setupRearViewMirror(rig);
      applyMirrors();
      interior = setupInterior(rig);
      cockpitCluster = setupCockpitCluster(rig);
      centreDisplay = setupCentreDisplay(rig);
      for (const name of ['Dashboard trim band', 'Dashboard chrome line'])
        interior.occlude(centreDisplay.group.getObjectByName(name));
      licensePlates.setNight(nightMode);
      contactShadow = setupContactShadow(scene, sim.layout);
      contactShadow.setNight(nightMode);
      rearGlow = setupRearGlow(scene);
      document.body.dataset.waterGlassMeshes = String(bodyWater.glassMeshes.length);
      document.body.dataset.lowBeams = String(lowBeamsOn);
      document.body.dataset.paint = 'Black Sapphire Metallic (475)';
      let triangles = 0;
      rig.root.traverse((o) => {
        if (o.isMesh) {
          triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
        }
      });
      // Compile and upload what first appears later (the rear-view mirror,
      // turn signals, dust and smoke, the beam patterns) now, so none of it
      // stalls a frame when it first shows.
      const later = [];
      scene.traverse((o) => {
        if (
          !o.visible &&
          (o.name.startsWith('Turn signal') ||
            ['Rear-view mirror', 'Wheel dust', 'Tyre smoke'].includes(o.name))
        )
          later.push(o);
      });
      for (const o of later) o.visible = true;
      await renderer.compileAsync(scene, camera);
      for (const o of later) o.visible = false;
      applyMirrors();
      renderer.initTexture(headlights.pattern);
      renderer.initTexture(headlights.highPattern);
      skidMarks.warmup(renderer, camera, scene);
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
  applyCameraFov();
  renderer.setPixelRatio(renderQuality.resize(innerWidth, innerHeight));
  renderer.setSize(innerWidth, innerHeight);
});
const clock = new THREE.Clock();
const frameMovement = new THREE.Vector3();
const frameCameraOffset = new THREE.Vector3();
// Taking the wheel swings the chase camera round behind the car, as in a
// driving game, over a second or so; dragging the view stops the swing.
const chaseBehind = new THREE.Vector3(),
  swingFrom = new THREE.Spherical(),
  swingTo = new THREE.Spherical();
let chaseSwing = false,
  wasAutopilot = true;
controls.addEventListener('start', () => {
  chaseSwing = false;
});
// The self-driving cruise speed: 90 km/h.
const autopilotSpeed = 25;
let cameraFollowHeading = 0,
  keptLane = null,
  autopilot = true;
renderer.setAnimationLoop(() => {
  const frameDt = clock.getDelta();
  const dt = Math.min(frameDt, 1 / 15);
  if (sim && !document.hidden) {
    const ratio = renderQuality.update(frameDt);
    if (Math.abs(renderer.getPixelRatio() - ratio) > 0.001) renderer.setPixelRatio(ratio);
  }
  if ($('#weather-cycle').checked && !document.hidden && weather.update(dt))
    setRain(weather.raining, weatherCycle.fade);
  if (timeRunning && !document.hidden) {
    timeOfDay = wrapHours(timeOfDay + (dt * 24) / (dayCycle.minutesPerDay * 60));
    applyDaylight();
  }
  if (sim) {
    const previousBrakeEnergy = sim.brakeEnergy,
      oldX = rig.root.position.x,
      oldZ = rig.root.position.z;
    // Keys, touch pedals and a gamepad together. Any of them hands control
    // to the driver.
    const pad = readPad(navigator.getGamepads?.().find(Boolean), padPrevious);
    if (pad) {
      padPrevious = pad.buttons;
      if (pad.camera) setCameraView(nextCameraView(cameraView));
      if (pad.signalLeft) signals.toggle('left');
      if (pad.signalRight) signals.toggle('right');
      if (pad.restart) restart();
      if (pad.pause) setDriving(!driving);
    }
    input.accelerate = Boolean(keyInput.accelerate || touch.accelerate || pad?.accelerate);
    input.brake = Boolean(keyInput.brake || touch.brake || pad?.brake);
    input.left = Boolean(keyInput.left);
    input.right = Boolean(keyInput.right);
    input.steerAxis = touch.steer || pad?.steer || 0;
    if (touch.accelerate || touch.brake || pad?.accelerate || pad?.brake || input.steerAxis)
      autopilot = false;
    // Self-driving after page load and Restart: the car keeps its lane through
    // the curves. Once the driver presses any driving key, steering is fully
    // manual with no assistance.
    if (autopilot && driving) {
      keptLane ??= nearestLane(roadLateral(sim.x, sim.z));
      input.steerAngle = laneKeepingSteer(sim, keptLane);
      // Cruise at motorway pace, easing off for the bends and speed bumps.
      input.cruiseSpeed = Math.min(
        autopilotSpeed,
        curveSpeed(sim.x, keptLane, { lateral: rainMode ? 2.5 : 3.5 }),
        bumpSpeed(sim.x)
      );
    } else {
      keptLane = null;
      delete input.steerAngle;
      delete input.cruiseSpeed;
    }
    document.body.dataset.autopilot = String(autopilot);
    sim.step(dt, input, driving, { raining: rainMode });
    shiftShake.update(dt, sim.powertrain.gear, {
      enabled: driving && !reducedMotion.matches,
      accelerate: Boolean(input.accelerate),
      brake: Boolean(input.brake),
      speed: sim.speed,
    });
    rig.root.position.set(sim.x, 0, sim.z);
    rig.root.rotation.y = sim.heading;
    const movement = frameMovement.set(sim.x - oldX, 0, sim.z - oldZ),
      offset = frameCameraOffset.subVectors(camera.position, controls.target);
    const courseHeading = sim.heading + sim.slipAngle * 0.75;
    const headingError = Math.atan2(
      Math.sin(courseHeading - cameraFollowHeading),
      Math.cos(courseHeading - cameraFollowHeading)
    );
    const cameraTurn = headingError * (1 - Math.exp(-dt / 0.3));
    cameraFollowHeading += cameraTurn;
    offset.applyAxisAngle(up, cameraTurn);
    controls.target.add(movement);
    if (wasAutopilot && !autopilot && cameraView === 'chase') chaseSwing = true;
    wasAutopilot = autopilot;
    if (chaseSwing && cameraView === 'chase') {
      const scale = Math.max(1, 0.9 / camera.aspect) * lensScale;
      chaseBehind.set(-6.2 * scale, 1.75 * scale, 0).applyAxisAngle(up, courseHeading);
      swingFrom.setFromVector3(offset);
      swingTo.setFromVector3(chaseBehind);
      const k = 1 - Math.exp(-dt / 0.45);
      const turn = Math.atan2(
        Math.sin(swingTo.theta - swingFrom.theta),
        Math.cos(swingTo.theta - swingFrom.theta)
      );
      swingFrom.theta += turn * k;
      swingFrom.phi += (swingTo.phi - swingFrom.phi) * k;
      swingFrom.radius += (swingTo.radius - swingFrom.radius) * k;
      offset.setFromSpherical(swingFrom);
      if (
        Math.abs(turn) < 0.004 &&
        Math.abs(swingTo.phi - swingFrom.phi) < 0.004 &&
        Math.abs(swingTo.radius - swingFrom.radius) < 0.02
      )
        chaseSwing = false;
    }
    camera.position.copy(controls.target).add(offset);
    rig.body.position.y = 0.55 + sim.heave;
    rig.body.rotation.set(sim.roll, 0, sim.pitch);
    headlights.setHighBeam(
      highBeamWanted({
        night: lowBeamsOn,
        speed: sim.speed,
        raining: rainMode,
        enabled: highBeamAssistOn,
      })
    );
    headlights.update(dt);
    // The stalk cancels by itself when the driver steers back; the
    // self-driving car switches its signals itself.
    const relay = signals.step(dt, sim.steer, { autoCancel: !autopilot });
    if (relay) vehicleAudio.tick(relay === 'on');
    signalLamps.update(signals);
    instruments.setLamps({
      left: signals.lit && signals.side === 'left',
      right: signals.lit && signals.side === 'right',
      high: headlights.high,
    });
    document.body.dataset.signal = signals.side ?? 'none';
    document.body.dataset.highBeam = String(headlights.high);
    for (let i = 0; i < rig.wheels.length; i++) {
      const w = rig.wheels[i],
        state = sim.wheels[i];
      // The bumps off the asphalt exist only in the physics (the visible
      // ground is flat there), so wheels are drawn on the visible ground:
      // the body still rides the bumps, the tyres never sink into the grass.
      const c = Math.cos(sim.heading),
        s = Math.sin(sim.heading);
      const bump = surfaceRoughness(sim.x + c * w.x + s * w.z, sim.z - s * w.x + c * w.z);
      w.mount.position.y = w.y + state.offset - bump;
      w.mount.rotation.y = w.front
        ? Math.atan(Math.tan(sim.steer) / (1 + (w.z * Math.tan(sim.steer)) / sim.wheelbase))
        : 0;
      if (driving) {
        const a = w.mount.rotation.y,
          speed =
            (sim.speed + sim.yawRate * w.z) * Math.cos(a) +
            (sim.lateralVelocity + sim.yawRate * w.x) * Math.sin(a);
        w.spin.rotation.z = (w.spin.rotation.z - (speed / w.r) * dt) % (2 * Math.PI);
      }
      peaks.compression = Math.max(peaks.compression, state.compression);
      peaks.extension = Math.max(peaks.extension, -state.compression);
      peaks.ground = Math.max(peaks.ground, Math.abs(state.ground));
    }
    peaks.roll = Math.max(peaks.roll, Math.abs(sim.roll));
    peaks.pitch = Math.max(peaks.pitch, Math.abs(sim.pitch));
    road.update(sim.x, sim.z);
    contactShadow.update(sim);
    sparks.update(dt, driving ? sim.railContact : null, driving);
    dust.update(dt, sim, {
      running: driving,
      wetness: sim.tyres.wetness,
      viewportHeight: renderer.domElement.height,
      camera,
      light: 1 - 0.85 * light.darkness,
    });
    tyreSmoke.update(dt, sim, {
      running: driving,
      wet: sim.tyres.wetness > 0.3,
      viewportHeight: renderer.domElement.height,
      camera,
      light: 1 - 0.8 * light.darkness,
    });
    document.body.dataset.tyreSmoke = String(tyreSmoke.active);
    document.body.dataset.railContact = String(Boolean(driving && sim.railContact));
    document.body.dataset.sparks = String(sparks.active);
    roadside?.update(sim.x);
    skidMarks.update(dt, sim, {
      enabled: driving,
      braking: Boolean(input.brake),
      raining: rainMode,
    });
    const lights = brakeLights.update(dt, Boolean(input.brake), nightMode);
    // Tail lamps light the road behind at dusk and night, more when braking.
    rearGlow.update(sim, light.darkness, lights.intensity / brakeLights.brake);
    interior.update(sim);
    interior.setDaylight(1 - light.darkness);
    // Ambient lighting comes up with the dusk.
    setAmbientLight(Math.max(0, (light.darkness - 0.35) / 0.4));
    cockpitCluster.update(dt, sim, nightMode);
    centreDisplay.update(dt, sim, { hours: timeOfDay, raining: rainMode, night: nightMode });
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
    if (driving) bodyDirt.scrape(sim.railContact, sim, dt);
    const dirt = bodyDirt.update(dt, {
      surfaces: sim.wheels.map((w) => w.surface),
      speed: sim.speed,
      wetness: sim.tyres.wetness,
      raining: rainMode,
      running: driving,
    });
    document.body.dataset.bodyDust = dirt.dust.toFixed(3);
    document.body.dataset.bodyMud = dirt.mud.toFixed(3);
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
      Object.assign(document.body.dataset, {
        driving: String(driving),
        speed: sim.speed.toFixed(4),
        gear: String(sim.powertrain.gear),
        engineRpm: sim.powertrain.rpm.toFixed(0),
        transmission: '7-speed M DCT',
        shiftShakeCount: String(shiftShake.events),
        shiftShakeKind: shiftShake.lastKind,
        shiftShakeStrength: shiftShake.lastStrength.toFixed(3),
        skidMarkSegments: String(skidMarks.mesh.visible ? skidMarks.count : 0),
        slipAngle: sim.slipAngle.toFixed(5),
        lateralVelocity: sim.lateralVelocity.toFixed(4),
        tractionLoss: sim.tractionLoss.toFixed(4),
        dscActive: String(sim.dscActive && driving),
        brakePressure: sim.brakePressure.toFixed(3),
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
  instruments.update(dt, sim, nightMode, driving);
  suspensionDisplay.update(dt, sim);
  minimap.update(dt, sim);
  vehicleAudio.update(dt, sim, {
    driving,
    raining: rainMode,
    accelerate: Boolean(input.accelerate),
    brake: Boolean(input.brake),
    distance: cameraView !== 'chase' ? 4 : rig ? camera.position.distanceTo(rig.root.position) : 8,
    inside: cameraViews[cameraView].inside ? 1 : 0,
  });
  dayBar.setSound(vehicleAudio.audible, $('#sound').checked);
  if (cameraView === 'chase' || !rig) controls.update(dt);
  else {
    seatCamera.step(dt, driving ? sim : null);
    seatCamera.place(camera, cameraView, rig.root, rig.body);
  }
  shiftShake.apply(camera, innerWidth, innerHeight);
  rain.update(dt, camera, sim, nightMode);
  document.body.dataset.orbit = String(controls.autoRotate);
  document.body.dataset.cameraAzimuth = controls.getAzimuthalAngle().toFixed(4);
  environment.update(dt, camera, rig?.root.position);
  renderer.render(scene, camera);
});
