// Graphics quality and what the viewer remembers between visits: the time
// of day (and whether it runs), the camera view and the graphics level.
export const graphicsLevels = Object.freeze(['auto', 'high', 'medium', 'low']);
// `pixels`: the most the canvas may have (null: the device's default);
// `adaptive`: lowered while frames run slow; `shadowMap`: the sun's shadow
// map size round the car (0: none); `grass`: blades round the camera;
// `projected`: the traffic's and roadside things' sun shadows; `mirrors`:
// frames between door-mirror refreshes in the chase view.
export const graphicsPresets = Object.freeze({
  auto: {
    label: 'Auto',
    pixels: null,
    adaptive: true,
    shadowMap: null,
    grass: null,
    projected: true,
  },
  high: {
    label: 'High',
    pixels: 4_200_000,
    adaptive: false,
    shadowMap: 2048,
    grass: true,
    projected: true,
  },
  medium: {
    label: 'Medium',
    pixels: 2_000_000,
    adaptive: true,
    shadowMap: 1024,
    grass: false,
    projected: true,
  },
  low: {
    label: 'Low',
    pixels: 1_000_000,
    adaptive: true,
    shadowMap: 0,
    grass: false,
    projected: false,
  },
});
export const nextGraphics = (level) =>
  graphicsLevels[(graphicsLevels.indexOf(level) + 1) % graphicsLevels.length];

const storageKey = 'bmw-driver:settings';
export function loadSettings(storage = globalThis.localStorage) {
  let saved = {};
  try {
    saved = JSON.parse(storage?.getItem(storageKey) ?? '{}') ?? {};
  } catch {
    saved = {};
  }
  return {
    graphics: graphicsLevels.includes(saved.graphics) ? saved.graphics : 'auto',
    time: Number.isFinite(saved.time) ? ((saved.time % 24) + 24) % 24 : null,
    timeRunning: typeof saved.timeRunning === 'boolean' ? saved.timeRunning : true,
    camera: typeof saved.camera === 'string' ? saved.camera : null,
  };
}
export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage?.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // Not kept between visits.
  }
}
