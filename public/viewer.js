import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupEnvironment } from './environment.js';
import { installTerrainLift, keepUnlifted, roadElevation, roadGrade } from './terrain.js';
import { setupRoad } from './road.js';
import { setupRoadside } from './roadside.js';
import {
  setupRoadStructures,
  tunnelCover,
  insideTunnel,
  bridgeShade,
  structureUniforms,
} from './road-structures.js';
import { DrivingSimulation } from './driving-physics.js';
import {
  rigDownloadedCar,
  addArchLiners,
  addRearDefroster,
  addGillPockets,
} from './vehicle-rig.js';
import { setupBrakeLights } from './brake-lights.js';
import { setupHeadlights } from './headlights.js';
import { setupExhaust } from './exhaust.js';
import { setupRain } from './rain.js';
import { setupBodyWater } from './body-water.js';
import { setupWipers } from './wipers.js';
import { setupTraffic } from './traffic-view.js';
import { collideWithTraffic, trafficShade } from './traffic.js';
import { RunTimer, describeRun } from './runs.js';
import { setupSpeedCameras, camerasPassed, fineFor, cameraSpeed } from './speed-cameras.js';
import { setupPowerLines } from './power-lines.js';
import { setupBusStops } from './bus-stops.js';
import { FuelTank, atPump, fuelPrice, setupFuelStation } from './fuel-station.js';
import { setupVillage } from './village.js';
import { setupRouteLand } from './route-land.js';
import { checkpointAt, checkpointSpeed, setupCheckpoints, slalomLat } from './checkpoints.js';
import { setupFoxes } from './foxes.js';
import { collideWithSolids } from './obstacles.js';
import { route, routeName } from './route.js';
import { setupRouteSigns } from './route-signs.js';
import { setupRouteCard } from './route-card.js';
import { DriftScore, driftRules } from './drift.js';
import { seasonUniforms, snowOnScene, stepSeason, winterDriving } from './season.js';
import { setupToasts } from './toasts.js';
import { setupClipRecorder, setupCaptureMenu, savePhoto } from './clip-recorder.js';
import { setupGrassBlades } from './grass-blades.js';
import { setupBrakes } from './brakes.js';
import { RenderQuality } from './render-quality.js';
import { setupInstruments } from './instruments.js';
import { setupSuspensionDisplay } from './suspension-display.js';
import { GearShiftShake } from './shift-shake.js';
import { RoadJolt } from './road-jolt.js';
import { setupVehicleAudio } from './vehicle-audio.js';
import { setupSkidMarks } from './skid-marks.js';
import { setupLicensePlates } from './license-plates.js';
import { setupContactShadow } from './contact-shadow.js';
import { refineCarMaterials } from './car-materials.js';
import { applyLook, loadLook, saveLook } from './car-look.js';
import { setupLookPicker } from './look-picker.js';
import { setupWeatherPicker } from './weather-picker.js';
import { graphicsPresets, loadSettings, nextGraphics, saveSettings } from './settings.js';
import {
  laneKeepingSteer,
  nearestLane,
  curveSpeed,
  bumpSpeed,
  fastLanePlan,
  flashRange,
  pressingOn,
  followSpeed,
  AutopilotPace,
} from './lane-keeping.js';
import { setupSparks } from './sparks.js';
import { setupMinimap } from './minimap.js';
import { setMirrorInterval, setupMirrors, setupRearViewMirror } from './mirrors.js';
import { createWeatherCycle, isWet, weatherCycle } from './weather-cycle.js';
import { setupLightning } from './lightning.js';
import { daylight, dayCycle, wrapHours } from './time-of-day.js';
import { setupDayBar } from './day-bar.js';
import { setupRadio } from './radio.js';
import { setupRearGlow } from './rear-glow.js';
import { setupSignalGlow } from './signal-glow.js';
import { setupBeamFlash } from './beam-flash.js';
import { setupInterior } from './interior.js';
import { mergeStaticMeshes } from './merge-static.js';
import { setAmbientLight } from './door-trim.js';
import { SeatCamera, cameraViews, nextCameraView, viewFov } from './camera-views.js';
import { setupCockpitCluster } from './cockpit-cluster.js';
import { setupCentreDisplay } from './centre-display.js';
import { setupDust } from './dust.js';
import { setupTyreSmoke } from './tyre-smoke.js';
import {
  TurnSignals,
  HeadlightFlasher,
  highBeamWanted,
  glareDistance,
  setupReversingLamps,
  setupSignalLamps,
} from './signals.js';
import { readPad, setupTouchControls } from './touch-controls.js';
import { setupBodyDirt } from './body-dirt.js';
import { setupCarOpenings } from './car-openings.js';
import {
  roadLateral,
  roadCenterZ,
  roadCenterSlope,
  guardrailsEnabled,
  surfaceRoughness,
  roadLanes,
  guardrailOffset,
  laneCount,
} from './road-profile.js';

const $ = (s) => document.querySelector(s);
const instruments = setupInstruments($('#instruments'));
const suspensionDisplay = setupSuspensionDisplay($('#suspension-display'));
const minimap = setupMinimap($('#minimap'));
const shiftShake = new GearShiftShake();
const roadJolt = new RoadJolt();
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
// The hills: three.js's shaders lift everything by the land's height (see
// terrain.js); installed before anything is drawn.
installTerrainLift();
// The car stands on the land at its place, pitched and rolled to its slope
// (the land rises along x only).
function placeCarOnLand(root, x, heading) {
  const grade = roadGrade(x);
  root.position.y = roadElevation(x);
  root.rotation.set(
    -Math.atan(grade * Math.sin(heading)),
    heading,
    Math.atan(grade * Math.cos(heading)),
    'YZX'
  );
}
document.body.dataset.capture = String(new URLSearchParams(location.search).get('capture') === '1');
const scene = new THREE.Scene();
// Phones and tablets (a touch screen as the main pointer): fewer pixels, no
// multisampling (their dense screens hide the edges), a smaller shadow map
// and less frequent mirrors, for a steady frame rate on their GPUs.
const lowPower = matchMedia('(pointer: coarse)').matches;
// A stencil buffer for the traffic's sun shadows (see traffic-view.js).
const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, stencil: true });
renderer.setSize(innerWidth, innerHeight);
const renderQuality = lowPower
  ? new RenderQuality(devicePixelRatio, 1_400_000, { minPixels: 900_000 })
  : new RenderQuality(devicePixelRatio);
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
// Layer 1: the cabin, seen only by this camera (see the model's setup).
const cabinLayer = 1;
camera.layers.enable(cabinLayer);
// Layer 2: what only the main view draws, not the mirrors (shadows laid on
// the ground, the grass blades, the beads on the glass's inner side): in a
// small mirror none of it shows, and each mirror is a whole scene's draw.
const mainViewLayer = 2;
camera.layers.enable(mainViewLayer);
const mainViewOnly = (root) =>
  root.traverse((o) => {
    if (/shadows?$|^Grass blades$|^Glass water inside$/i.test(o.name)) o.layers.set(mainViewLayer);
  });
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
const environment = setupEnvironment(scene, renderer, sun, { refresh: lowPower ? 20 : 1.5 }),
  road = setupRoad(scene, { lite: lowPower });
// Phones: no sun shadow map at all (a pass drawing the car again, and a
// lookup in every lit pixel); the contact shadow stays under the car, and
// the road still shades itself under the overpasses.
if (lowPower) sun.castShadow = false;
document.body.dataset.lowPower = String(lowPower);
// What the viewer remembers between visits (not in a capture, which must
// come out the same each time): graphics, time of day, camera view.
const capturing = new URLSearchParams(location.search).get('capture') === '1';
const remembered = capturing ? loadSettings(null) : loadSettings();
const rememberSettings = () => {
  if (!capturing) saveSettings(remembered);
};
const rain = setupRain(scene);
const roadside = guardrailsEnabled ? setupRoadside(scene) : null;
const structures = setupRoadStructures(scene, road.fields);
// Blades of grass round the camera (not on phones: a few hundred thousand
// vertices every frame).
const grassBlades = lowPower ? null : setupGrassBlades(scene, road.fields);
// Graphics quality (the top panel's frame rate, or the paint panel, steps
// through Auto, High, Medium and Low): the canvas's pixel budget and
// whether it adapts to the frame rate, the sun's shadow map round the car,
// the grass blades, the projected sun shadows and the mirrors' refresh.
let graphics = remembered.graphics,
  projectedShadows = true,
  grassWanted = true;
// The season (summer or winter, in the paint panel): `winterLevel` eases
// between them as the snow comes or goes.
let season = remembered.season,
  winterLevel = season === 'winter' ? 1 : 0,
  // The weather panel (season, weather, whether it changes by itself).
  weatherPicker = null;
seasonUniforms.winterCover.value = winterLevel;
// Rain that wets the road and the car: in winter it falls as snow.
const wetWeather = () => rainMode && winterLevel < 0.5;
document.body.dataset.season = season;
function applyGraphics(level) {
  graphics = level;
  const preset = graphicsPresets[level];
  const auto = level === 'auto';
  renderQuality.setBudget(preset.pixels ?? (lowPower ? 1_400_000 : 3_000_000), {
    minPixels: auto && lowPower ? 900_000 : 0,
    adaptive: preset.adaptive,
  });
  renderer.setPixelRatio(renderQuality.resize(innerWidth, innerHeight));
  const size = preset.shadowMap ?? (lowPower ? 0 : 2048);
  if (sun.castShadow !== size > 0) {
    sun.castShadow = size > 0;
    // Lit materials' programs change with the shadow map.
    scene.traverse((o) => {
      for (const m of [o.material ?? []].flat()) m.needsUpdate = true;
    });
  }
  if (size > 0 && sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  grassWanted = preset.grass ?? true;
  if (grassBlades) grassBlades.mesh.visible = grassWanted && winterLevel < 0.5;
  projectedShadows = preset.projected;
  document.body.dataset.graphics = level;
  remembered.graphics = level;
  rememberSettings();
}
applyGraphics(graphics);
// Cars, vans and lorries on the motorway (see traffic.js).
// So many to a lane: two-lane roads are no more crowded than three-lane.
const trafficView = setupTraffic(scene, {
    count: laneCount * (lowPower ? 3 : 4),
    // The other way, on the route's dual carriageway.
    oncoming: route ? Math.round(laneCount * (lowPower ? 2 : 3.5)) : 0,
  }),
  traffic = trafficView.traffic;
// Timed runs and speed cameras, announced in short notices.
const toasts = setupToasts(document.body),
  runTimer = new RunTimer(),
  speedCameras = setupSpeedCameras(scene);
const powerLines = setupPowerLines(scene),
  busStops = setupBusStops(scene),
  fuelStation = setupFuelStation(scene),
  village = setupVillage(scene),
  // On a real route, what really stands beside it.
  routeLand = setupRouteLand(scene),
  // On the N-08, its checkpoints (see checkpoints.js).
  checkpointsView = setupCheckpoints(scene);
// Foxes in the winter fields.
const foxes = setupFoxes(scene);
// On the route, the real places' names by the road.
const routeSignsView = route ? setupRouteSigns(scene, route) : null;
// And how far it still is to Kyiv, at the top right.
const routeCard = route ? setupRouteCard(document.body, route) : null;
// The car's tank: it empties as the car drives and fills at a pump, a
// meter showing the litres and the cost running up meanwhile.
let fuelTank = new FuelTank(),
  fuelDistance = 0;
// Drift points (with DSC off, T): a meter while a drift lasts.
const drift = new DriftScore();
const driftMeter = document.createElement('div');
driftMeter.className = 'drift-meter';
driftMeter.hidden = true;
driftMeter.innerHTML =
  '<span class="drift-line"><small>DRIFT</small><b>0</b><em>×1</em></span>' +
  '<span class="drift-angle"><i></i></span>';
document.body.append(driftMeter);
const driftPoints = driftMeter.querySelector('b'),
  driftMultiplier = driftMeter.querySelector('em'),
  driftAngle = driftMeter.querySelector('.drift-angle i');
function showDrift() {
  driftMeter.hidden = !drift.active;
  if (!drift.active) return;
  driftMeter.classList.toggle('fading', drift.below > 0);
  driftPoints.textContent = drift.total.toLocaleString('uk-UA');
  driftMultiplier.textContent = `×${drift.multiplier.toFixed(drift.multiplier % 1 ? 1 : 0)}`;
  // The angle as a bar from the middle, to the side the tail is out.
  const share = Math.min(1, Math.abs(drift.angle) / driftRules.scoreAngle) * 50;
  driftAngle.style.width = `${share.toFixed(1)}%`;
  driftAngle.style.left = drift.angle > 0 ? `${(50 - share).toFixed(1)}%` : '50%';
}
const refuelMeter = document.createElement('div');
refuelMeter.className = 'refuel-meter';
refuelMeter.hidden = true;
refuelMeter.setAttribute('aria-live', 'off');
refuelMeter.innerHTML =
  '<span class="pump">⛽</span><span><b class="litres">0.00</b> <small>L</small></span>' +
  '<span><b class="cost">0.00</b> <small>₴</small></span><span class="bar"><i></i></span>';
document.body.append(refuelMeter);
const meterLitres = refuelMeter.querySelector('.litres'),
  meterCost = refuelMeter.querySelector('.cost'),
  meterBar = refuelMeter.querySelector('.bar i');
function showRefuel() {
  const filling = fuelTank.filling;
  refuelMeter.hidden = !filling;
  if (!filling) return;
  meterLitres.textContent = filling.litres.toFixed(2);
  meterCost.textContent = (filling.litres * fuelPrice).toFixed(2);
  meterBar.style.width = `${((100 * fuelTank.litres) / fuelTank.capacity).toFixed(1)}%`;
}
let finesToday = 0,
  lastCameraX = NaN;
function cameraFlash() {
  const flash = document.createElement('div');
  flash.className = 'camera-flash';
  document.body.append(flash);
  setTimeout(() => flash.remove(), 700);
}
const sparks = setupSparks(scene);
const dust = setupDust(scene);
const tyreSmoke = setupTyreSmoke(scene);
// Turn signals (Q, E), hazards (X) and the high-beam assistant (H switches
// it off and on).
const signals = new TurnSignals();
let signalLamps,
  reversingLamps,
  reverseGlow,
  highBeamAssistOn = true;
// The horn (G, held): the car ahead in the lane moves over or hurries.
let horning = false;
function setHorn(on) {
  if (on === horning) return;
  horning = on;
  vehicleAudio.horn(on);
  document.body.dataset.horn = String(on);
  if (on && sim) {
    const yielding = traffic.honk(sim.x, roadLateral(sim.x, sim.z));
    document.body.dataset.hornedAt = yielding
      ? yielding.change
        ? 'moving over'
        : 'hurrying'
      : 'none';
  }
}
// The paint and wheel finish, chosen in the top panel and remembered.
let look = loadLook(),
  paintMaterials = [];
function showLook() {
  const { paint, wheels } = applyLook(paintMaterials, look);
  document.body.dataset.paint = paint.name;
  document.body.dataset.wheels = wheels.name;
}
function chooseGraphics(level) {
  applyGraphics(level);
  applyMirrors();
  lookPicker.setGraphics(level);
  dayBar.setGraphics(graphicsPresets[level].label);
}
function chooseSeason(chosen) {
  season = chosen;
  remembered.season = chosen;
  rememberSettings();
  weatherPicker.set({ season: chosen });
  document.body.dataset.season = chosen;
}
const lookPicker = setupLookPicker(document.body, {
  look,
  graphics,
  onGraphics: (level) => chooseGraphics(level),
  onChange(chosen) {
    look = chosen;
    saveLook(look);
    showLook();
  },
});
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
  signalGlow,
  beamFlashGlow,
  interior,
  cockpitCluster,
  centreDisplay,
  nightMode = false,
  rainMode = false,
  // 'clear', 'rain', 'storm' or 'fog'; rainMode is true in rain and storm.
  weatherKind = 'clear',
  driving = false,
  telemetryTime = 0;
const peaks = { compression: 0, extension: 0, roll: 0, pitch: 0, ground: 0 };
// The view's aspect; a page opened hidden, with no size yet, has none: wide,
// then.
const shownAspect = () => (camera.aspect > 0 ? camera.aspect : 16 / 9);
function resetView() {
  const x = sim?.x ?? 0,
    z = sim?.z ?? 0,
    heading = sim?.heading ?? 0;
  if (rig && new URLSearchParams(location.search).get('detail') === 'brakes') {
    const wheel = rig.wheels.find((w) => w.front && w.z > 0);
    const target = new THREE.Vector3(wheel.x, wheel.y, wheel.z).applyAxisAngle(up, heading);
    target.add(new THREE.Vector3(x, roadElevation(x), z));
    const distance = (1.25 * lensScale) / Math.min(1, shownAspect());
    const offset = new THREE.Vector3(distance * 0.18, distance * 0.07, distance).applyAxisAngle(
      up,
      heading
    );
    camera.position.copy(target).add(offset);
    controls.target.copy(target);
    controls.update();
    return;
  }
  // ?camera=x,y,z places the chase camera there relative to the car (x
  // forward, z right, in metres before the lens's scaling), for pictures.
  const given = (new URLSearchParams(location.search).get('camera') ?? '').split(',').map(Number);
  const offset = (
    given.length === 3 && given.every(Number.isFinite)
      ? new THREE.Vector3(...given)
      : new THREE.Vector3(4.8, 1.9, 5.6)
  )
    .multiplyScalar(Math.max(1, 0.9 / shownAspect()) * lensScale)
    .applyAxisAngle(up, heading);
  const ground = roadElevation(x);
  camera.position.set(x, ground, z).add(offset);
  controls.target.set(x, ground + 0.75, z);
  controls.update();
}
resetView();
// Camera view: the orbiting chase camera, the driver's seat or the bonnet.
// Every visit starts with the chase camera, from behind the car.
const seatCamera = new SeatCamera();
let cameraView = cameraViews[remembered.camera] ? remembered.camera : 'chase';
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
  // On a phone, from behind the car the door mirrors (each a whole scene
  // render) keep their first picture, and the cabin is not drawn.
  const lite = lowPower || graphics === 'low';
  setMirrorInterval(lite ? (cameraView === 'chase' ? 1e9 : 4) : cameraView === 'chase' ? 4 : 2);
  if (interior) interior.interior.visible = !(lowPower && cameraView === 'chase');
}
function setCameraView(view) {
  cameraView = view;
  controls.enabled = view === 'chase';
  seatCamera.reset();
  applyCameraFov();
  if (view === 'chase') resetView();
  document.body.dataset.cameraView = view;
  remembered.camera = view;
  rememberSettings();
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
const lightning = setupLightning(scene, {
  onThunder: (loudness, distance) => vehicleAudio.thunder(loudness, distance),
});
// Time of day: it runs a full day in dayCycle.minutesPerDay real minutes and
// sets the sky, light and fog continuously; lamps switch at dusk and dawn.
let timeOfDay = remembered.time ?? dayCycle.start,
  // (The day always runs: the panel's pause button became the autopilot's.)
  timeRunning = true,
  lowBeamsOn = false,
  light = daylight(timeOfDay, rainMode);
// Discrete changes: the weather, night-time lamps and materials.
// Weather sets in and clears over `rainEase` seconds: each ramp runs toward
// 1 or 0 and its level (eased) changes the sky, light and fog: rain darkens
// the sky, closes in the fog and wets the road while the drops thicken; a
// storm darkens it further; a morning fog veils everything past a hundred
// metres.
const rainEase = 10;
let rainRamp = 0,
  rainLevel = 0,
  fogRamp = 0,
  fogLevel = 0,
  stormRamp = 0,
  stormLevel = 0,
  lightningFlash = 0;
const easeLevel = (r) => r * r * (3 - 2 * r);
const rampToward = (value, target, dt) =>
  target > value
    ? Math.min(target, value + dt / rainEase)
    : Math.max(target, value - dt / rainEase);
function stepWeather(dt) {
  const rain = rampToward(rainRamp, rainMode ? 1 : 0, dt),
    fog = rampToward(fogRamp, weatherKind === 'fog' ? 1 : 0, dt),
    storm = rampToward(stormRamp, weatherKind === 'storm' ? 1 : 0, dt);
  if (rain === rainRamp && fog === fogRamp && storm === stormRamp) return;
  rainRamp = rain;
  fogRamp = fog;
  stormRamp = storm;
  rainLevel = easeLevel(rain);
  fogLevel = easeLevel(fog);
  stormLevel = easeLevel(storm);
  road.setWetness(rainLevel);
  applyDaylight();
}
function applyWeather(fade = 0) {
  renderQuality.reset();
  rain.setEnabled(rainMode, fade, weatherKind === 'storm' ? 1.45 : 1);
  headlights?.setNight(lowBeamsOn || inTunnel);
  licensePlates?.setNight(nightMode);
  contactShadow?.setNight(nightMode);
  // Compile hidden tyre trails when lighting changes, before the first slide
  // makes them visible. The first on-road compilation otherwise caused a hitch.
  if (skidMarks)
    compileForAllViews(skidMarks.mesh)
      .then(() => skidMarks.warmup(renderer, camera, scene))
      .catch(console.error);
  $('#night').checked = nightMode;
  $('#rain').checked = rainMode;
  document.body.dataset.night = String(nightMode);
  document.body.dataset.rain = String(rainMode);
  document.body.dataset.weather = weatherKind;
  document.body.dataset.lowBeams = String(Boolean(lowBeamsOn && headlights));
}
// The headlamps' lights are out of the scene by day (see headlights.js). Once
// loaded, the programs with them in are compiled in the background (the
// lamps lit at zero, so nothing shows), so dusk or the tunnel needs no
// compile.
function warmNightPrograms() {
  if (!headlights || headlights.projectors[0].visible) return;
  for (const light of headlights.projectors) light.visible = true;
  compileForAllViews(scene)
    .catch(console.error)
    .finally(() => headlights.setNight(lowBeamsOn || inTunnel));
}
// The door and rear-view mirrors draw the scene into render targets, where
// every material takes a program of its own (linear colour, no tone
// mapping): compiling only the screen's left whatever first showed in a
// mirror (the village, a turn signal's glow) to compile mid-drive, a
// hitch of tens of milliseconds each. So both are compiled: for the screen,
// and with a target like the mirrors' bound.
function compileForAllViews(root) {
  // (Made on first use: this may be called before this line has run.)
  compileForAllViews.target ??= new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const onScreen = renderer.compileAsync(root, camera, scene);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(compileForAllViews.target);
  // (The programs are chosen as the call is made; only the linking waits.)
  const inMirrors = renderer.compileAsync(root, camera, scene);
  renderer.setRenderTarget(previous);
  return Promise.all([onScreen, inMirrors]);
}
// In the tunnel the car's light changes: the sun and sky give way to the
// tunnel's warm lamps, the low beams come on, and the camera is out of the
// rain. Applied every frame, over the
// daylight's values.
const sunDirection = new THREE.Vector3(),
  tunnelLampColour = new THREE.Color(1, 0.9, 0.76),
  lightningColour = new THREE.Color(0.78, 0.84, 1);
let inTunnel = false,
  // How far the camera is in the tunnel: no rain seen or heard there.
  cameraShelter = 0;
// An overpass's shadow on the car. The car's body takes no shadow-map
// shadows (on this model its own would streak the paint), so its materials
// take the sun through `carSunlight` instead, and their sky reflections are
// turned down with it: on black paint the sky's sheen is most of what shows.
const carSunlight = { value: 1 },
  carSkylight = { value: 1 },
  carReflection = { value: 1 };
function shadeCarFromSun(root) {
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (done.has(m) || !(m.isMeshStandardMaterial || m.isMeshPhongMaterial)) continue;
      done.add(m);
      const before = m.onBeforeCompile,
        key = m.customProgramCacheKey;
      m.onBeforeCompile = (shader, r) => {
        before?.call(m, shader, r);
        shader.uniforms.carSunlight = carSunlight;
        shader.uniforms.carSkylight = carSkylight;
        shader.uniforms.carReflection = carReflection;
        // (A material's envMapIntensity does not apply to the scene's
        // environment, so the sky's reflection is scaled here.)
        if (m.isMeshStandardMaterial)
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            `radiance *= carReflection;
            iblIrradiance *= carReflection;
            #ifdef USE_CLEARCOAT
              clearcoatRadiance *= carReflection;
            #endif
            #include <lights_fragment_end>`
          );
        shader.fragmentShader =
          'uniform float carSunlight;\nuniform float carSkylight;\nuniform float carReflection;\n' +
          shader.fragmentShader.replace(
            '#include <lights_fragment_begin>',
            THREE.ShaderChunk.lights_fragment_begin
              .replace(
                'getDirectionalLightInfo( directionalLight, directLight );',
                'getDirectionalLightInfo( directionalLight, directLight );\ndirectLight.color *= carSunlight;'
              )
              .replace(
                'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );',
                'irradiance += carSkylight * getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );'
              )
          );
      };
      m.customProgramCacheKey = () => `${key ? key.call(m) : ''}|car-sunlight`;
      m.needsUpdate = true;
    }
  });
}
let carShade = 0;
// How far the car's body (at about 1 m) is in an overpass's shadow, over
// its length, so the shade comes over it gradually.
function deckShadeOnCar() {
  const c = Math.cos(sim.heading),
    s = Math.sin(sim.heading),
    shift = structureUniforms.structureSunShift.value;
  let shade = 0;
  for (const along of [-2, -1, 0, 1, 2])
    shade += bridgeShade(sim.x + c * along, sim.z - s * along, shift, 1);
  return shade / 5;
}
// How much of the car's body is in the traffic's sun shadow: points along
// each side at about window height.
const carShadePoints = [];
let trafficShadeLevel = 0,
  frameDtForShade = 1 / 60;
function trafficShadeOnCar() {
  const c = Math.cos(sim.heading),
    s = Math.sin(sim.heading);
  carShadePoints.length = 0;
  for (const along of [-1.9, -0.9, 0, 0.9, 1.9])
    for (const side of [-0.75, 0.75])
      carShadePoints.push([sim.x + c * along + s * side, 1.05, sim.z - s * along + c * side]);
  const near = traffic.vehicles.filter((v) => Math.abs(v.x - sim.x) < 45);
  return near.length
    ? trafficShade(near, carShadePoints, structureUniforms.structureSunShift.value)
    : 0;
}
function applyStructureLight() {
  const cover = sim ? tunnelCover(sim.x, roadLateral(sim.x, sim.z)) : 0;
  // An overpass's deck shades the car through the shadow map, as it passes
  // under; only the tunnel changes the light itself.
  sun.intensity = light.direct * (1 - cover);
  // A lightning flash lights everything out in the open, cold and blue.
  const strike = lightningFlash * (1 - cover);
  ambient.intensity = light.ambient + (0.55 - light.ambient) * cover + 3.2 * strike;
  ambient.color
    .setRGB(...light.ambientColour)
    .lerp(tunnelLampColour, cover)
    .lerp(lightningColour, Math.min(1, strike * 1.5));
  fill.intensity = light.fill * (1 - cover) + 1.6 * strike;
  scene.environmentIntensity = (1 - 0.2 * light.darkness) * (1 - 0.8 * cover);
  // Out of the rain, seen and heard, when the camera or the car is under
  // the tunnel's roof.
  const p = camera.position;
  cameraShelter = Math.max(cover, tunnelCover(p.x, roadLateral(p.x, p.z)));
  rain.setShelter(cameraShelter);
  if (cover > 0.05 !== inTunnel) {
    inTunnel = cover > 0.05;
    headlights?.setNight(lowBeamsOn || inTunnel);
    document.body.dataset.lowBeams = String(Boolean(headlights && (lowBeamsOn || inTunnel)));
  }
  document.body.dataset.tunnel = cover.toFixed(3);
  const shade = sim ? deckShadeOnCar() * (1 - cover) : 0;
  // In a lorry's or a car's shadow the sun is gone from that part of the
  // body, eased so it comes over the car rather than switching.
  const target = sim && projectedShadows ? trafficShadeOnCar() * (1 - cover) : 0;
  trafficShadeLevel += (target - trafficShadeLevel) * Math.min(1, frameDtForShade * 10);
  // Under the deck the sun is gone, and about half the sky; in a lorry's
  // shadow the sun, and the half of the sky it stands against.
  carShade = Math.max(shade, trafficShadeLevel);
  carSunlight.value = 1 - carShade;
  carSkylight.value = 1 - Math.max(0.5 * shade, 0.5 * trafficShadeLevel);
  carReflection.value = 1 - Math.max(0.6 * shade, 0.55 * trafficShadeLevel);
  // Its own shadow fades as it goes into another's, which already darkens
  // the road there.
  sun.shadow.intensity = 1 - 0.85 * trafficShadeLevel;
  document.body.dataset.trafficShade = trafficShadeLevel.toFixed(3);
  document.body.dataset.deckShade = carShade.toFixed(3);
}
// In the tunnel the chase camera stays inside its walls and under its
// vault, rather than looking at the car through the lining.
function keepCameraInTunnel() {
  const p = camera.position;
  if (!insideTunnel(p.x)) return;
  const lateral = roadLateral(p.x, p.z),
    limit = 7.1;
  const roof = roadElevation(p.x) + 5.8;
  if (Math.abs(lateral) <= limit && p.y <= roof) return;
  if (Math.abs(lateral) > limit) p.z = roadCenterZ(p.x) + Math.sign(lateral) * limit;
  p.y = Math.min(p.y, roof);
  camera.lookAt(controls.target);
}
// Continuous changes for the current time and weather.
function applyDaylight() {
  const conditions = { fog: fogLevel, storm: stormLevel, winter: winterLevel };
  light = daylight(timeOfDay, rainLevel, conditions);
  environment.setConditions(light, rainLevel, { ...conditions, flash: lightningFlash });
  ambient.intensity = light.ambient;
  ambient.color.setRGB(...light.ambientColour);
  sun.intensity = light.direct;
  sun.color.setRGB(...light.directColour);
  fill.intensity = light.fill;
  document.body.dataset.timeOfDay = timeOfDay.toFixed(3);
  dayBar.update(light, { running: timeRunning, weather: shownWeather() });
  if (light.night !== nightMode || light.lowBeams !== lowBeamsOn) {
    nightMode = light.night;
    lowBeamsOn = light.lowBeams;
    applyWeather();
  }
}
function setTimeOfDay(hours) {
  timeOfDay = wrapHours(hours);
  remembered.time = timeOfDay;
  rememberSettings();
  applyDaylight();
}
// The running clock is remembered every few seconds and on leaving.
let timeSavedAt = 0;
addEventListener('pagehide', () => {
  remembered.time = timeOfDay;
  rememberSettings();
});
// The weather as named and shown: rain and storms fall as snow in winter.
function shownWeather() {
  if (winterLevel < 0.5) return weatherKind;
  return { rain: 'snow', storm: 'blizzard' }[weatherKind] ?? weatherKind;
}
function setWeather(kind, fade = 0) {
  weatherKind = kind;
  weatherPicker?.set({ weather: kind });
  rainMode = isWet(kind);
  applyWeather(fade);
  applyDaylight();
}
function setRain(value, fade = 0) {
  setWeather(value ? (weatherKind === 'storm' ? 'storm' : 'rain') : 'clear', fade);
}
// (The weather panel opens from the top panel's weather button.)
queueMicrotask(() => {
  weatherPicker = setupWeatherPicker(document.body, {
    season,
    weather: weatherKind,
    auto: $('#weather-cycle').checked,
    onSeason: (chosen) => chooseSeason(chosen),
    onWeather(kind) {
      weather.set(kind);
      setWeather(kind, rainEase);
    },
    onAuto(on) {
      $('#weather-cycle').checked = on;
    },
  });
});
const dayBar = setupDayBar($('#day-bar'), {
  setTime: setTimeOfDay,
  openWeather(button) {
    lookPicker.close();
    captureMenu.close();
    dayBar.closeTime();
    weatherPicker.toggle(button);
  },
  openTime() {
    lookPicker.close();
    captureMenu.close();
    weatherPicker.close();
  },
  // Back to the autopilot after taking the wheel (in its lane, the pedals
  // let go, moving off if paused), or the wheel taken from it.
  toggleAutopilot() {
    if (!sim) return;
    if (autopilot) {
      autopilot = false;
      return;
    }
    clearInput();
    autopilot = true;
    keptLane = null;
    sim.pedalUsed = false;
    if (!driving) setDriving(true);
  },
  restart: () => restart(),
  toggleSound: () => vehicleAudio.toggle(),
  nextStation: () => radio.next(),
  nextCamera: () => setCameraView(nextCameraView(cameraView)),
  openCapture(button) {
    // While a video runs the button stops it (and saves it).
    if (clipRecorder.recording) return clipRecorder.toggle();
    weatherPicker.close();
    lookPicker.close();
    dayBar.closeTime();
    captureMenu.toggle(button);
  },
  openLook(button) {
    weatherPicker.close();
    captureMenu.close();
    dayBar.closeTime();
    lookPicker.toggle(button);
  },
  nextGraphics() {
    const level = nextGraphics(graphics);
    chooseGraphics(level);
    toasts.show({ label: 'Graphics', shown: graphicsPresets[level].label }, 2);
  },
});
// Photos and ten-second videos of the drive, from the capture button's menu
// (or P and V), saved where the browser saves downloads.
let photoWanted = false;
const clipRecorder = setupClipRecorder({
  canvas: renderer.domElement,
  sound: () => vehicleAudio.recordingStream(),
  onChange: (state) => dayBar.setCapture(state),
  onSaved: (name) => toasts.show({ label: 'Video', shown: 'saved', note: name }, 4),
});
const captureMenu = setupCaptureMenu(document.body, {
  video: clipRecorder.available,
  onPhoto: () => (photoWanted = true),
  onVideo: () => clipRecorder.toggle(),
});
setCameraView(cameraView);
dayBar.setGraphics(graphicsPresets[graphics].label);
// The radio: Ukrainian stations live (N or the panel's button). A new
// station is named in a toast, and one that cannot be reached says so.
let radioShown = null;
const radio = setupRadio({
  sound: $('#sound'),
  volume: $('#volume'),
  onChange: ({ station, state }) => {
    dayBar.setRadio(station, state);
    if (station !== radioShown) {
      radioShown = station;
      toasts.show(
        station
          ? { label: 'Radio', shown: station.name, note: station.note }
          : { label: 'Radio', shown: 'off' },
        2.5
      );
    }
    if (state === 'error' && station)
      toasts.show({ label: station.name, shown: 'no signal', note: 'N for the next station' }, 3);
  },
});
radioShown = radio.station;
dayBar.setRadio(radio.station, radio.state);
$('#night').onchange = (e) => {
  setTimeOfDay(e.target.checked ? dayCycle.presets.night : dayCycle.presets.day);
};
$('#rain').onchange = (e) => {
  weather.set(e.target.checked);
  setRain(e.target.checked, rainEase);
};
applyWeather();
applyDaylight();
// Keys held, kept apart from `input`, which also takes the touch pedals and
// a gamepad each frame.
const keyInput = {};
function clearInput() {
  setHorn(false);
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
// The drive from Zhytomyr to Kyiv: timed while driving; arriving shows the
// time (and the best, kept in the browser), and past Kyiv's edge the drive
// starts again from Zhytomyr.
let routeTime = 0,
  arrived = false;
const routeBestKey = `bmw-driver:route-${routeName}`;
const routeClock = (seconds) => {
  const h = Math.floor(seconds / 3600),
    m = Math.floor((seconds % 3600) / 60),
    sec = Math.floor(seconds % 60);
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
};
function arriveOnRoute(dt) {
  if (driving && !arrived) routeTime += dt;
  if (!arrived && sim.x >= route.length) {
    arrived = true;
    let best = Infinity;
    try {
      best = Number(localStorage.getItem(routeBestKey)) || Infinity;
      if (routeTime < best) localStorage.setItem(routeBestKey, String(routeTime));
    } catch {
      // Not kept.
    }
    toasts.show(
      {
        label: route.to,
        shown: `${Math.round(route.length / 1000)} km in ${routeClock(routeTime)}${
          routeTime < best ? ' · best' : ` · best ${routeClock(best)}`
        }`,
        tone: 'fine',
      },
      8
    );
  }
  if (sim.x > route.length + 800) restart();
}

function restart(x = 0) {
  if (!sim) return;
  routeTime = 0;
  arrived = false;
  sim.reset();
  fuelTank = new FuelTank();
  fuelDistance = 0;
  cameraFollowHeading = 0;
  keptLane = null;
  autopilot = true;
  shiftShake.reset(sim.powertrain.gear);
  roadJolt.reset();
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
  // On the road's centre line at x, heading along it.
  sim.x = x;
  sim.z = roadCenterZ(x);
  sim.heading = -Math.atan(roadCenterSlope(x));
  trafficView.reset(x, 0);
  runTimer.reset();
  drift.reset();
  showDrift();
  lastCameraX = x;
  rig.wheels.forEach((w) => {
    w.spin.rotation.z = 0;
    w.mount.rotation.y = 0;
  });
  for (const k of Object.keys(peaks)) peaks[k] = 0;
  rig.root.position.set(x, 0, sim.z);
  placeCarOnLand(rig.root, x, sim.heading);
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
  // Shift: the handbrake, held.
  ShiftLeft: 'handbrake',
  ShiftRight: 'handbrake',
};
// Doors (O), bonnet (B) and boot (K): only while the car stands (or is
// paused).
let carOpenings = null;
const openingKeys = { KeyO: 'doors', KeyB: 'bonnet', KeyK: 'boot' };
function toggleOpening(group) {
  if (!carOpenings || !sim) return;
  if (!carOpenings.toggle(group, driving ? sim.speed : 0))
    toasts.show({ label: 'Stop the car', shown: 'to open it' }, 2);
}
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
  if (['KeyQ', 'KeyE', 'KeyH', 'KeyX'].includes(e.code) && !e.repeat && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    if (e.code === 'KeyH') highBeamAssistOn = !highBeamAssistOn;
    else if (e.code === 'KeyX') signals.toggleHazard();
    else signals.toggle(e.code === 'KeyQ' ? 'left' : 'right');
    return;
  }
  // T: DSC off and on again, as the car's button (long press) does.
  if (e.code === 'KeyT' && !e.repeat && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    if (sim) {
      sim.dscOff = !sim.dscOff;
      document.body.dataset.dscOff = String(sim.dscOff);
      toasts.show(
        {
          label: sim.dscOff ? 'DSC OFF' : 'DSC ON',
          shown: sim.dscOff ? 'drift away' : 'stability control on',
          tone: sim.dscOff ? 'fine' : '',
        },
        2.5
      );
    }
    return;
  }
  if (e.code === 'KeyG' && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    setHorn(true);
    return;
  }
  if (e.code === 'KeyC' && !e.repeat && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    setCameraView(nextCameraView(cameraView));
    return;
  }
  if (openingKeys[e.code] && !e.repeat && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    toggleOpening(openingKeys[e.code]);
    return;
  }
  if (e.code === 'KeyP' && !e.repeat && !e.metaKey && !e.ctrlKey) photoWanted = true;
  if (e.code === 'KeyV' && !e.repeat && !e.metaKey && !e.ctrlKey && clipRecorder.available)
    clipRecorder.toggle();
  if (e.code === 'KeyN' && !e.repeat && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    radio.next();
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
  if (e.code === 'KeyG') setHorn(false);
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
      const paintSet = new Set();
      g.scene.traverse((o) => {
        if (o.isMesh && o.material.name === 'M5_F10_Paint') paintSet.add(o.material);
      });
      paintMaterials = [...paintSet];
      showLook();
      rig = rigDownloadedCar(g.scene);
      addArchLiners(rig);
      addRearDefroster(rig);
      addGillPockets(rig);
      refineCarMaterials(rig.root);
      scene.add(rig.root);
      sim = new DrivingSimulation(rig.wheels);
      skidMarks = setupSkidMarks(scene, sim.layout);
      brakeLights = setupBrakeLights(rig);
      headlights = setupHeadlights(rig);
      signalLamps = setupSignalLamps(rig);
      reversingLamps = setupReversingLamps(rig);
      rain.setHeadlights(headlights);
      headlights.setNight(lowBeamsOn || inTunnel);
      exhaust = setupExhaust(scene, rig);
      bodyWater = setupBodyWater(rig);
      carOpenings = setupCarOpenings(rig);
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
      // The cabin's still parts as one mesh per material, and on a layer of
      // their own: the main camera draws them, the mirrors' cameras and the
      // sun's shadow pass (which see none of it) skip them.
      const cabin = mergeStaticMeshes(interior.interior, [interior.wheel]);
      interior.interior.traverse((o) => o.layers.set(cabinLayer));
      document.body.dataset.cabinMeshes = `${cabin.before}>${cabin.after}`;
      licensePlates.setNight(nightMode);
      contactShadow = setupContactShadow(scene, sim.layout);
      contactShadow.setNight(nightMode);
      rearGlow = setupRearGlow(scene);
      signalGlow = setupSignalGlow(scene);
      beamFlashGlow = setupBeamFlash(scene);
      reverseGlow = setupRearGlow(scene, {
        colour: new THREE.Color(0.95, 0.93, 0.88),
        idle: 0,
        name: 'Reversing lamp glow',
      });
      document.body.dataset.waterGlassMeshes = String(bodyWater.glassMeshes.length);
      document.body.dataset.lowBeams = String(lowBeamsOn);
      let triangles = 0;
      rig.root.traverse((o) => {
        if (o.isMesh) {
          triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
        }
      });
      // The car's still parts as one mesh per material, as the cabin's are
      // (the glass, which the wipers and rain work on, the cabin and the
      // wheels stay apart), and only its larger parts cast the sun's
      // shadow: bolts, badges and calipers made no visible shadow but each
      // a draw in the shadow pass.
      // (Before the hidden parts are shown for compiling below: the turn
      // signals, shown only while lit, must stay apart.)
      const signalStrips = [];
      rig.body.traverse(
        (o) => /^(Turn signal|Reversing lamp)/.test(o.name) && signalStrips.push(o)
      );
      const body = mergeStaticMeshes(rig.body, [
        interior.interior,
        ...bodyWater.glassMeshes,
        ...signalStrips,
      ]);
      let casters = 0;
      rig.root.traverse((o) => {
        if (!o.isMesh || !o.castShadow) return;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (o.geometry.boundingSphere.radius * o.getWorldScale(new THREE.Vector3()).x < 0.25)
          o.castShadow = false;
        else casters++;
      });
      document.body.dataset.carMeshes = `${body.before}>${body.after}, ${casters} casting`;
      // Compile and upload what first appears later (the rear-view mirror,
      // turn signals, dust and smoke, the beam patterns) now, so none of it
      // stalls a frame when it first shows.
      const later = [];
      scene.traverse((o) => {
        if (
          !o.visible &&
          (/^(Turn signal|Reversing lamp)/.test(o.name) ||
            ['Rear-view mirror', 'Wheel dust', 'Tyre smoke'].includes(o.name))
        )
          later.push(o);
      });
      for (const o of later) o.visible = true;
      // The car is placed on the land as a whole: its parts are not lifted
      // (set before the programs are compiled).
      keepUnlifted(rig.root);
      // Snow lies on everything standing on the land in winter, not the car.
      snowOnScene(scene, [rig.root]);
      shadeCarFromSun(rig.root);
      await compileForAllViews(scene);
      for (const o of later) o.visible = false;
      applyMirrors();
      renderer.initTexture(headlights.pattern);
      renderer.initTexture(headlights.highPattern);
      skidMarks.warmup(renderer, camera, scene);
      warmNightPrograms();
      mainViewOnly(scene);
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
      resetView();
      document.querySelectorAll('button').forEach((b) => (b.disabled = false));
      // ?at=1900 starts that many metres along the road (to look at a
      // particular place); ?paused=1 holds the car still.
      const query = new URLSearchParams(location.search);
      if (Number(query.get('at'))) restart(Number(query.get('at')));
      // ?police: a patrol car takes up the chase a few seconds in.
      if (query.has('police')) traffic.policeIn = 5;
      // ?time=17.5 sets the time of day (hours).
      if (query.has('time') && Number.isFinite(Number(query.get('time'))))
        setTimeOfDay(Number(query.get('time')));
      // ?season=winter (or summer) for a picture, at once and not kept.
      if (['winter', 'summer'].includes(query.get('season'))) {
        season = query.get('season');
        winterLevel = seasonUniforms.winterCover.value = season === 'winter' ? 1 : 0;
        if (grassBlades) grassBlades.mesh.visible = grassWanted && winterLevel < 0.5;
        applyDaylight();
      }
      // ?weather=fog (or rain, storm) sets in that weather at once.
      if (['rain', 'storm', 'fog'].includes(query.get('weather'))) {
        weather.set(query.get('weather'));
        setWeather(weather.kind);
        stepWeather(rainEase);
      }
      setDriving(query.get('paused') !== '1');
      if (!traffic.vehicles.length) trafficView.reset(sim.x, roadLateral(sim.x, sim.z));
      // The loading screen fades once the scene has drawn in full.
      // (A hidden tab draws no frames: then on a timer.)
      const reveal = () => $('#status').classList.add('done');
      requestAnimationFrame(() => requestAnimationFrame(reveal));
      setTimeout(reveal, 600);
    } catch (e) {
      $('#status').textContent = 'Unable to prepare model: ' + e.message;
      document.body.dataset.error = e.message;
      console.error(e);
    }
  },
  (progress) => {
    if (progress.total)
      $('#status').style.setProperty('--progress', String(progress.loaded / progress.total));
  },
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
const fpsCount = { frames: 0, time: 0 };
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
// The self-driving pace: 90 km/h in the right-hand lanes, and in the left
// one a driver's moods, from a brisk cruise to a push toward 180 km/h (see
// AutopilotPace in lane-keeping.js).
const autopilotSpeed = 25,
  autopilotPacing = new AutopilotPace();
let autopilotPassing = false,
  // Held up in the left lane, its left indicator on (see pressingOn).
  autopilotPressing = false;
// The self-driving car in traffic keeps to the left lane (see fastLanePlan
// in lane-keeping.js): it moves over whenever the left lane is clear, and
// held up there by a slower car it sits close behind it with the left
// indicator on and flashes its headlights till it moves over to the right;
// it never goes round on the right. Each change is signalled (a lane is a
// constant offset; lane keeping steers there).
let autopilotPlan = 0,
  // The indicator the autopilot put on (it turns off only its own).
  autopilotSignal = null,
  // Who it last flashed at, how many times, and how long ago.
  flashedVehicle = null,
  flashCount = 0,
  sinceBeamFlash = Infinity;
const beamFlasher = new HeadlightFlasher();
// The tell-tales lit on both clusters (the overlay's and the cabin's).
const clusterLamps = { left: false, right: false, low: false, high: false };
// A patrol car chasing the car, within sight behind it: on autopilot the
// car runs for it (see autopilotTraffic and the cruise below).
const escapeSpeed = 69,
  escapeRange = 500;
let sinceEscapeMove = 0,
  escaping = false,
  // The patrol car last announced.
  policeSeen = null;
function chasedBy() {
  const chaser = sim ? traffic.chaser : null;
  if (!chaser) return null;
  const behind = sim.x - chaser.x;
  return behind > -10 && behind < escapeRange ? chaser : null;
}
function autopilotTraffic(dt) {
  sinceBeamFlash += dt;
  const lat = roadLateral(sim.x, sim.z);
  const settled = Math.abs(lat - keptLane) < 0.4;
  if (settled && autopilotSignal && !autopilotPressing && signals.side === autopilotSignal) {
    signals.set(null);
    autopilotSignal = null;
  }
  autopilotPlan -= dt;
  if (autopilotPlan > 0 || !settled) return;
  // No lane changes on the way into a checkpoint or through it.
  if (checkpointAt(sim.x, 300) !== null) return;
  autopilotPlan = 0.5;
  const lane = roadLanes.findIndex((l) => Math.abs(l - keptLane) < 0.1);
  if (lane < 0) return;
  const ahead = traffic.leaderFor(sim.x, keptLane);
  if (ahead?.who !== flashedVehicle) {
    flashedVehicle = ahead?.who ?? null;
    flashCount = 0;
  }
  const left = roadLanes[lane - 1];
  // Running from the police: into whichever lane next to it has the most
  // room ahead (the right one too), flashing slower traffic out of the way;
  // no more than one move every 1.2 s, so it threads rather than weaves.
  if (escaping) {
    if (autopilotPressing && signals.side === 'left') signals.set(null);
    autopilotPressing = false;
    sinceEscapeMove += 0.5;
    const right = roadLanes[lane + 1];
    const room = (l) => {
      const lead = traffic.leaderFor(sim.x, l);
      return lead ? lead.gap + 6 * Math.max(0, lead.speed - sim.speed) : 1e4;
    };
    const slow = ahead && ahead.gap < flashRange(sim.speed) + 30 && ahead.speed < sim.speed - 1;
    if (slow && sinceBeamFlash > 1.5) {
      beamFlasher.start();
      sinceBeamFlash = 0;
      flashCount++;
      traffic.flashedAt(sim.x, keptLane, flashRange(sim.speed) + 30);
    }
    if (sinceEscapeMove < 1.2) return;
    const here = room(keptLane);
    let to = null,
      best = here + 15;
    for (const [side, l] of [
      ['left', left],
      ['right', right],
    ]) {
      if (l === undefined || !traffic.laneClearFor(sim.x, sim.speed, l, 4.9, 1.9, 20)) continue;
      const r = room(l) + (side === 'left' ? 10 : 0);
      if (r > best) {
        best = r;
        to = side;
      }
    }
    if (to && (slow || to === 'left')) {
      keptLane = to === 'left' ? left : right;
      autopilotPassing = true;
      signals.set(to);
      autopilotSignal = to;
      sinceEscapeMove = 0;
    }
    return;
  }
  const leader = ahead && {
    gap: ahead.gap,
    speed: ahead.speed,
    moving: Boolean(ahead.who.change),
  };
  // Held up in the left lane: the left indicator on, “move over”.
  const pressing = pressingOn({ lane, leader, cruise: autopilotPacing.set, speed: sim.speed });
  if (pressing && signals.side !== 'left') {
    signals.set('left');
    autopilotSignal = 'left';
  } else if (!pressing && autopilotPressing && signals.side === 'left') {
    signals.set(null);
    autopilotSignal = null;
  }
  autopilotPressing = pressing;
  // (Seen in the mirror, the indicator asks as a flash does.)
  if (pressing && ahead) traffic.signalledAt(sim.x, keptLane, flashRange(sim.speed) + 30);
  const plan = fastLanePlan({
    lane,
    leader,
    cruise: autopilotPacing.set,
    speed: sim.speed,
    clearLeft: left !== undefined && traffic.laneClearFor(sim.x, sim.speed, left, 4.9, 1.9, 20),
    flashes: flashCount,
    sinceFlash: sinceBeamFlash,
  });
  if (plan === 'flash') {
    beamFlasher.start();
    sinceBeamFlash = 0;
    flashCount++;
    traffic.flashedAt(sim.x, keptLane, flashRange(sim.speed) + 30);
  } else if (plan) {
    keptLane = left;
    autopilotPassing = false;
    signals.set(plan);
    autopilotSignal = plan;
  }
}
let cameraFollowHeading = 0,
  keptLane = null,
  autopilot = true;
// Frame pacing. On a phone or tablet with a screen faster than about
// 100 Hz every other frame is skipped (60 frames a second on a 120 Hz
// screen, for half the work and battery; computers keep the screen's rate),
// and
// while the car is paused and the view still, a few frames a second keep
// the sky and the time of day moving.
let tickAt = 0,
  tickInterval = 1000 / 60,
  skipTick = false,
  drawnAt = 0,
  viewChanged = true;
controls.addEventListener('change', () => (viewChanged = true));
for (const type of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'resize'])
  addEventListener(type, () => (viewChanged = true), { passive: true });
renderer.setAnimationLoop((time) => {
  const interval = time - tickAt;
  tickAt = time;
  if (interval > 0 && interval < 50) tickInterval += (interval - tickInterval) * 0.05;
  if (lowPower && tickInterval < 9.5) {
    skipTick = !skipTick;
    if (skipTick) return;
  }
  if (sim && !driving && !viewChanged && time - drawnAt < 100) return;
  viewChanged = false;
  drawnAt = time;
  const frameDt = clock.getDelta();
  const dt = Math.min(frameDt, 1 / 15);
  // Frames per second on the top panel, counted over half a second.
  if (!document.hidden && frameDt > 0 && frameDt < 1) {
    fpsCount.frames++;
    fpsCount.time += frameDt;
    if (fpsCount.time >= 0.5) {
      dayBar.setFps(fpsCount.frames / fpsCount.time);
      fpsCount.frames = fpsCount.time = 0;
    }
  }
  // (Paused frames come slowly on purpose and say nothing of the load.)
  if (sim && driving && !document.hidden) {
    const ratio = renderQuality.update(frameDt);
    if (Math.abs(renderer.getPixelRatio() - ratio) > 0.001) renderer.setPixelRatio(ratio);
  }
  if ($('#weather-cycle').checked && !document.hidden && weather.update(dt, timeOfDay))
    setWeather(weather.kind, weatherCycle.fade);
  if (!document.hidden) stepWeather(dt);
  // Lightning lights the sky and the scene for a moment; its thunder comes
  // after.
  // The season eases in or out; snow falls instead of rain in winter, driven
  // by the wind in a blizzard, and there is no lightning.
  const previousWinter = winterLevel;
  winterLevel = stepSeason(dt, season === 'winter');
  if (winterLevel !== previousWinter) {
    if (grassBlades) grassBlades.mesh.visible = grassWanted && winterLevel < 0.5;
    if (!(timeRunning && !document.hidden)) applyDaylight();
  }
  document.body.dataset.winter = winterLevel.toFixed(2);
  rain.setSnow(winterLevel, winterLevel * stormLevel * 7);
  const flash = lightning.update(dt, camera, stormLevel * (1 - winterLevel), cameraShelter);
  const flashChanged = flash !== lightningFlash;
  lightningFlash = flash;
  document.body.dataset.lightning = String(lightning.strikes);
  if (flashChanged && !(timeRunning && !document.hidden)) applyDaylight();
  if (timeRunning && !document.hidden) {
    timeOfDay = wrapHours(timeOfDay + (dt * 24) / (dayCycle.minutesPerDay * 60));
    applyDaylight();
    if ((timeSavedAt += dt) > 10) {
      timeSavedAt = 0;
      remembered.time = timeOfDay;
      rememberSettings();
    }
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
      if (pad.hazard) signals.toggleHazard();
      if (pad.restart) restart();
      if (pad.pause) setDriving(!driving);
    }
    if (pad) setHorn(pad.horn || held.has('KeyG'));
    input.accelerate = Boolean(keyInput.accelerate || touch.accelerate || pad?.accelerate);
    input.brake = Boolean(keyInput.brake || touch.brake || pad?.brake);
    input.left = Boolean(keyInput.left);
    input.right = Boolean(keyInput.right);
    input.handbrake = Boolean(keyInput.handbrake);
    input.steerAxis = touch.steer || pad?.steer || 0;
    if (touch.accelerate || touch.brake || pad?.accelerate || pad?.brake || input.steerAxis)
      autopilot = false;
    // Self-driving after page load and Restart: the car keeps its lane through
    // the curves. Once the driver presses any driving key, steering is fully
    // manual with no assistance.
    // The police: a notice when a patrol car takes up the chase and when
    // it gives up; on autopilot the car runs for it meanwhile.
    const chaser = chasedBy();
    escaping = Boolean(autopilot && driving && chaser);
    // How far behind a chasing patrol car is (m), for the tests.
    document.body.dataset.police = traffic.chaser
      ? String(Math.round(sim.x - traffic.chaser.x))
      : '';
    if (chaser && chaser !== policeSeen) {
      policeSeen = chaser;
      toasts.show(
        {
          label: 'POLICE',
          shown: 'on your tail',
          note: autopilot ? 'the autopilot runs for it' : 'lose them',
          tone: 'fine',
        },
        3.5
      );
    } else if (traffic.caught) {
      // Pulled over: a fine for the speed it caught the car at, at the
      // motorway's 130 km/h (340 ₴ at the least), on the day's total.
      const speed = sim.speed * 3.6,
        fine = fineFor(speed, 130) || 340;
      finesToday += fine;
      traffic.caught = null;
      policeSeen = null;
      toasts.show(
        {
          label: 'POLICE',
          shown: 'pulled you over',
          note: `fine ${fine.toLocaleString('uk-UA')} ₴ · ${finesToday.toLocaleString('uk-UA')} ₴ so far`,
          tone: 'fine',
        },
        6
      );
    } else if (policeSeen && !traffic.chaser) {
      policeSeen = null;
      toasts.show({ label: 'POLICE', shown: 'gave up', tone: 'record' }, 3);
    }
    if (autopilot && driving) {
      keptLane ??= nearestLane(roadLateral(sim.x, sim.z));
      autopilotTraffic(dt);
      // (Through a checkpoint, along the way through its gaps.)
      const lane = keptLane;
      input.steerAngle = laneKeepingSteer(
        sim,
        checkpointAt(sim.x, 140) === null ? lane : (x) => slalomLat(x, lane) ?? lane
      );
      // Cruise at motorway pace, easing off for the bends and speed bumps,
      // and keeping its distance behind slower traffic.
      const leader = traffic.leaderFor(sim.x, roadLateral(sim.x, sim.z));
      // It keeps close, as a driver in a hurry does: some 0.6 s behind
      // (more on snow), and closing up it brakes late and firmly, as late as
      // its brakes allow to come down to the other's speed there.
      // Closer still behind one it is pressing to move over.
      const headway = (escaping ? 0.35 : autopilotPressing ? 0.45 : 0.6) + 0.5 * winterLevel,
        closing = 3.5 - 1.5 * winterLevel;
      // Behind one braking hard, or on the way into a checkpoint (where the
      // traffic queues for the gaps), it assumes the other may stop: no
      // faster than lets it stop as short as the other would.
      const spare = leader ? leader.gap - (4 + headway * leader.speed) : Infinity;
      const wary = leader && ((leader.who?.accel ?? 0) < -1 || checkpointAt(sim.x, 500) !== null);
      const follow = !leader
        ? Infinity
        : wary && spare > 0
          ? Math.sqrt(leader.speed * leader.speed + 2 * (closing - 1) * spare)
          : followSpeed(spare, leader.speed, closing);
      const fastLane = Math.abs(keptLane - roadLanes[0]) < 0.1;
      if (fastLane) autopilotPassing = false;
      const pace = autopilotPacing.step(dt, {
        fastLane,
        passing: autopilotPassing || escaping,
        speed: sim.speed,
      });
      // The weather tames it: in rain it keeps to about 145 km/h, on snow
      // to some 70% of its pace (125 at most), and in fog to about 70.
      // Running from the police: flat out, whatever the cameras.
      let wanted = escaping ? Math.max(pace.speed, escapeSpeed) : pace.speed;
      wanted += (Math.min(wanted, 40) - wanted) * rainLevel;
      const onSnow = fastLane ? winterDriving.autopilotPace : winterDriving.autopilotSpeed;
      wanted += (Math.min(wanted * onSnow, 35) - wanted) * winterLevel;
      wanted += (Math.min(wanted, autopilotSpeed * 0.78) - wanted) * fogLevel;
      input.cruiseSpeed = Math.min(
        wanted,
        follow,
        curveSpeed(sim.x, keptLane, { lateral: rainMode ? 2.5 : 3.5 }),
        bumpSpeed(sim.x),
        escaping ? Infinity : cameraSpeed(sim.x),
        // Checkpoints: a walking pace through, police or not.
        checkpointSpeed(sim.x)
      );
      input.cruiseAccel = pace.accel;
      // Firmer on the brakes at speed, gentler on snow.
      input.cruiseBrake = 3 + 3.5 * (1 - winterLevel);
      input.cruiseGain = 1;
    } else {
      keptLane = null;
      // Taking the wheel while it pressed on: its left indicator goes off.
      if (autopilotPressing) {
        if (signals.side === 'left' && autopilotSignal === 'left') signals.set(null);
        autopilotPressing = false;
        autopilotSignal = null;
      }
      delete input.steerAngle;
      delete input.cruiseSpeed;
      delete input.cruiseAccel;
      delete input.cruiseBrake;
      delete input.cruiseGain;
    }
    document.body.dataset.autopilot = String(autopilot);
    dayBar.setAutopilot(autopilot);
    // Snow and ice: less grip all round.
    sim.gripScale = 1 - (1 - winterDriving.grip) * winterLevel;
    traffic.speedScale = 1 - (1 - winterDriving.trafficSpeed) * winterLevel;
    sim.step(dt, input, driving, { raining: wetWeather() });
    if (driving) {
      const lat = roadLateral(sim.x, sim.z);
      traffic.step(
        dt,
        Math.abs(lat) < guardrailOffset + 0.3 && !sim.reversing
          ? { x: sim.x, lat, speed: sim.speed }
          : null
      );
      // Traffic, and the buildings, fences and poles by the country road.
      const solid = collideWithSolids(sim);
      const trafficHit = collideWithTraffic(sim, traffic);
      const hit =
        solid && (!trafficHit || solid.strength > trafficHit.strength) ? solid : trafficHit;
      if (hit && (!sim.railContact || hit.strength > sim.railContact.strength))
        sim.railContact = hit;
      // Drift points while driving by hand.
      const drifted = drift.update(dt, {
        angle: (sim.slipAngle * 180) / Math.PI,
        speed: sim.speed * 3.6,
        manual: !autopilot && !sim.reversing,
        crashed: Boolean(hit && hit.strength > 0.2) || (sim.railContact?.strength ?? 0) > 0.35,
      });
      if (drifted?.kind === 'drift')
        toasts.show({
          label: 'Drift',
          shown: `${drifted.points.toLocaleString('uk-UA')} · ×${drifted.multiplier}`,
          note: drifted.record
            ? drifted.best
              ? `record · was ${drifted.best.toLocaleString('uk-UA')}`
              : 'record'
            : `best ${drift.best.toLocaleString('uk-UA')}`,
          tone: drifted.record ? 'record' : '',
        });
      else if (drifted?.kind === 'wipeout' && drifted.points >= 50)
        toasts.show({
          label: 'Wipeout',
          shown: `−${drifted.points.toLocaleString('uk-UA')}`,
          note: 'the drift is lost',
          tone: 'fine',
        });
      showDrift();
      // Fuel: burnt as the car goes, filled while it stands at a pump.
      fuelTank.burn(sim.distance - fuelDistance);
      const filled = fuelTank.step(dt, atPump(sim.x, sim.z, sim.speed));
      if (filled)
        toasts.show({
          label: 'Fuel',
          shown: `+${filled.litres.toFixed(1)} L`,
          note: `${Math.round(filled.cost).toLocaleString('uk-UA')} ₴ · ${(filled.cost / filled.litres).toFixed(2)} ₴/L`,
        });
      document.body.dataset.fuel = fuelTank.litres.toFixed(2);
      document.body.dataset.refuelling = String(Boolean(fuelTank.filling));
      showRefuel();
      // Timed runs while you drive.
      const manual = !autopilot && !sim.reversing;
      for (const result of runTimer.update(dt, Math.max(0, sim.forwardSpeed ?? sim.speed), manual))
        toasts.show({ ...describeRun(result), tone: result.record ? 'record' : '' });
      // Speed cameras passed this frame.
      if (Number.isFinite(lastCameraX) && Math.abs(lat) < guardrailOffset + 0.3)
        for (const camera of camerasPassed(lastCameraX, sim.x)) {
          const speed = sim.speed * 3.6,
            fine = fineFor(speed, camera.limit);
          if (!fine) continue;
          finesToday += fine;
          speedCameras.flash(camera);
          if (!reducedMotion.matches) cameraFlash();
          toasts.show(
            {
              label: 'Speed camera',
              shown: `${Math.round(speed)} km/h in a ${camera.limit} zone`,
              note: `fine ${fine.toLocaleString('uk-UA')} ₴ · ${finesToday.toLocaleString('uk-UA')} ₴ so far`,
              tone: 'fine',
            },
            6
          );
        }
      lastCameraX = sim.x;
    }
    // In reverse the brake key drives backward and the accelerator brakes:
    // the pedals as the car feels them, for lamps, sound and smoke.
    const pedals = sim.reversing
      ? { accelerate: Boolean(input.brake), brake: Boolean(input.accelerate) }
      : { accelerate: Boolean(input.accelerate), brake: Boolean(input.brake) };
    shiftShake.update(dt, sim.powertrain.gear, {
      enabled: driving && !reducedMotion.matches,
      accelerate: pedals.accelerate,
      brake: pedals.brake,
      speed: sim.speed,
    });
    const oldY = rig.root.position.y;
    rig.root.position.set(sim.x, 0, sim.z);
    placeCarOnLand(rig.root, sim.x, sim.heading);
    const movement = frameMovement.set(sim.x - oldX, rig.root.position.y - oldY, sim.z - oldZ),
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
      const scale = Math.max(1, 0.9 / shownAspect()) * lensScale;
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
    // Potholes and bumps jolt the body and the camera (see road-jolt.js).
    roadJolt.update(dt, sim.wheels, { enabled: driving, speed: sim.speed });
    rig.body.position.y = 0.55 + sim.heave + roadJolt.heave;
    rig.body.rotation.set(sim.roll + roadJolt.roll, 0, sim.pitch + roadJolt.pitch);
    // (Flashing them works whatever the assistant wants.)
    const beamClick = beamFlasher.step(dt);
    if (beamClick) vehicleAudio.tick(beamClick === 'on');
    headlights.setFlash(beamFlasher.lit);
    headlights.setHighBeam(
      beamFlasher.lit ||
        highBeamWanted({
          night: lowBeamsOn,
          speed: sim.speed,
          raining: rainMode,
          enabled: highBeamAssistOn,
          trafficDistance: glareDistance(
            sim.x,
            roadLateral(sim.x, sim.z),
            traffic.vehicles,
            trafficView.oncoming?.vehicles
          ),
        })
    );
    headlights.update(dt);
    // The stalk cancels by itself when the driver steers back; the
    // self-driving car switches its signals itself.
    const relay = signals.step(dt, sim.steer, { autoCancel: !autopilot });
    if (relay) vehicleAudio.tick(relay === 'on');
    signalLamps.update(signals);
    const flashing = {
      left: signals.lit && signals.flashes('left'),
      right: signals.lit && signals.flashes('right'),
    };
    clusterLamps.left = flashing.left;
    clusterLamps.right = flashing.right;
    clusterLamps.low = lowBeamsOn;
    clusterLamps.high = headlights.high || beamFlasher.lit;
    instruments.setLamps(clusterLamps);
    // And their amber light on the road beside the car, in the dark.
    signalGlow.update(dt, sim, light.darkness, flashing);
    beamFlashGlow.update(dt, sim, light.darkness, beamFlasher.lit);
    document.body.dataset.signal = signals.hazard ? 'hazard' : (signals.side ?? 'none');
    document.body.dataset.highBeam = String(headlights.high);
    document.body.dataset.beamFlashes = String(flashCount);
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
            (sim.forwardSpeed + sim.yawRate * w.z) * Math.cos(a) +
            (sim.lateralVelocity + sim.yawRate * w.x) * Math.sin(a);
        // (The handbrake holds the rear wheels still.)
        if (!(input.handbrake && w.x < 0))
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
      braking: pedals.brake,
      raining: wetWeather(),
    });
    const lights = brakeLights.update(dt, pedals.brake, nightMode);
    // Tail lamps light the road behind at dusk and night, more when braking.
    rearGlow.update(sim, light.darkness, lights.intensity / brakeLights.brake);
    reversingLamps.update(dt, sim.reversing);
    reverseGlow.update(sim, light.darkness, reversingLamps.level);
    document.body.dataset.reversingLamps = String(reversingLamps.level > 0.5);
    interior.update(sim);
    interior.setDaylight(1 - light.darkness);
    // Ambient lighting comes up with the dusk.
    setAmbientLight(Math.max(0, (light.darkness - 0.35) / 0.4));
    // The cabin's screens are redrawn only while seen from the driver's seat.
    const inCabin = cameraView === 'driver';
    cockpitCluster.update(
      dt,
      sim,
      nightMode,
      inCabin,
      route ? { to: route.to, km: route.toGo(sim.x) / 1000 } : null,
      clusterLamps
    );
    centreDisplay.update(dt, sim, {
      hours: timeOfDay,
      weather: shownWeather(),
      winter: winterLevel > 0.5,
      night: nightMode,
      visible: inCabin,
      radio: radio.station,
    });
    brakes.update(dt, {
      energy: sim.brakeEnergy - previousBrakeEnergy,
      speed: driving ? sim.speed : 0,
      raining: wetWeather(),
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
      raining: wetWeather(),
      winter: winterLevel,
      running: driving,
    });
    document.body.dataset.bodySlush = dirt.slush.toFixed(3);
    document.body.dataset.bodyDust = dirt.dust.toFixed(3);
    document.body.dataset.bodyMud = dirt.mud.toFixed(3);
    document.body.dataset.bodyWetness = bodyWater
      .update(dt, {
        // Snow settles on the car as rain does, and the wipers clear it.
        raining: rainMode && cameraShelter < 0.5,
        speed: driving ? sim.speed : 0,
        cabin: cameraView === 'driver',
        snow: winterLevel,
        light: Math.min(1.1, 0.25 + 0.5 * light.ambient + 0.12 * light.direct),
        night: light.darkness,
      })
      .toFixed(4);
    const frost = bodyWater.frost.update(dt, {
      winter: winterLevel,
      running: driving,
      speed: sim.speed,
      snowing: rainMode,
      blizzard: stormLevel > 0.5,
    });
    // Moving off closes the doors, bonnet and boot.
    carOpenings.update(dt, driving ? sim.speed : 0);
    document.body.dataset.frost = `${frost.screen.toFixed(3)} ${frost.ice.toFixed(3)}`;
    const exhaustParticles = exhaust.update(dt, sim, {
      enabled: driving,
      accelerate: pedals.accelerate,
      brake: pedals.brake,
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
        roadJolts: String(roadJolt.events),
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
  if (sim) fuelDistance = sim.distance;
  const nav = route && sim ? { to: route.to, km: route.toGo(sim.x) / 1000 } : null;
  if (route && sim) arriveOnRoute(dt);
  instruments.update(dt, sim, Boolean(headlights?.lit), driving, fuelTank, nav);
  suspensionDisplay.update(dt, sim);
  minimap.update(
    dt,
    sim,
    trafficView.oncoming
      ? [...traffic.vehicles, ...trafficView.oncoming.vehicles]
      : traffic.vehicles
  );
  vehicleAudio.update(dt, sim, {
    driving,
    raining: rainLevel * (1 - cameraShelter) * (1 - winterLevel),
    winter: winterLevel,
    // A blizzard howls; a summer storm's wind is gentler. None in the tunnel.
    wind: stormLevel * (0.35 + 0.65 * winterLevel) * (1 - cameraShelter),
    accelerate: Boolean(sim?.reversing ? input.brake : input.accelerate),
    brake: Boolean(sim?.reversing ? input.accelerate : input.brake),
    distance: cameraView !== 'chase' ? 4 : rig ? camera.position.distanceTo(rig.root.position) : 8,
    inside: cameraViews[cameraView].inside ? 1 : 0,
    // The chasing patrol car's siren, by how far off it is.
    siren: sim && traffic.chaser ? Math.abs(traffic.chaser.x - sim.x) : Infinity,
  });
  dayBar.setSound(vehicleAudio.audible, $('#sound').checked);
  radio.update(dt, { inside: cameraViews[cameraView].inside ? 1 : 0 });
  if (cameraView === 'chase' || !rig) {
    controls.update(dt);
    keepCameraInTunnel();
  } else {
    seatCamera.step(dt, driving ? sim : null);
    seatCamera.place(camera, cameraView, rig.root, rig.body);
  }
  shiftShake.apply(camera, innerWidth, innerHeight, reducedMotion.matches ? 0 : roadJolt.cameraY);
  rain.update(dt, camera, sim, nightMode);
  document.body.dataset.orbit = String(controls.autoRotate);
  document.body.dataset.cameraAzimuth = controls.getAzimuthalAngle().toFixed(4);
  environment.update(dt, camera, rig?.root.position);
  grassBlades?.update(dt);
  // Bridges, the tunnel and signs stand at their places from the first frame.
  structures.update(
    sim?.x ?? 0,
    sunDirection.subVectors(sun.position, sun.target.position).normalize()
  );
  frameDtForShade = dt;
  applyStructureLight();
  // Sun shadows by day, fainter in rain or fog and gone once the sun is
  // down or under a storm's clouds.
  const sunlight =
    (1 - light.darkness) *
    (1 - 0.7 * rainLevel) *
    (1 - 0.8 * fogLevel) *
    (1 - stormLevel) *
    Math.min(1, Math.max(0, sunDirection.y * 6)) *
    (projectedShadows ? 1 : 0);
  trafficView.update({
    night: lowBeamsOn ? 1 : 0,
    playerCover: cameraShelter,
    sun: sunDirection,
    sunlight,
    x: sim?.x ?? 0,
    dt,
  });
  document.body.dataset.traffic = String(traffic.vehicles.length);
  speedCameras.update(sim?.x ?? 0, dt, sunDirection, sunlight);
  powerLines.update(sim?.x ?? 0, sunDirection, sunlight);
  roadside?.shadow(sunDirection, sunlight);
  busStops.update(sim?.x ?? 0, sunDirection, sunlight);
  checkpointsView?.update(sim?.x ?? 0, sunDirection, sunlight);
  const evening = Math.min(1, Math.max(0, (light.darkness - 0.25) / 0.5));
  fuelStation.update(sim?.x ?? 0, evening, sunDirection, sunlight);
  village.update(sim?.x ?? 0, evening, sunDirection, sunlight, winterLevel, dt);
  routeLand?.update(sim?.x ?? 0, {
    evening,
    winter: winterLevel,
    sun: sunDirection,
    sunlight,
  });
  foxes.update(driving ? dt : 0, sim?.x ?? 0, sim?.z ?? 0, winterLevel);
  routeSignsView?.update(sim?.x ?? 0);
  if (sim) routeCard?.update(dt, sim.x);
  renderer.render(scene, camera);
  // A photo is read now, while the frame's pixels are still there.
  if (photoWanted) {
    photoWanted = false;
    savePhoto(renderer.domElement).then(
      (name) => name && toasts.show({ label: 'Photo', shown: 'saved', note: name }, 3)
    );
  }
});
