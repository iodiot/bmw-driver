import * as THREE from 'three';

// The car's paint and wheel finish, chosen from the top panel and kept in
// the browser. Paints are from the F10 M5's range: metallics with flakes
// under the clear coat, solid colours without, and a matt Individual
// finish whose clear coat is satin.
export const paints = Object.freeze([
  { id: 'black-sapphire', name: 'Black Sapphire', colour: 0x11151b, metal: 0.5, rough: 0.32 },
  { id: 'alpine-white', name: 'Alpine White', colour: 0xe4e6e6, metal: 0, rough: 0.3 },
  { id: 'monte-carlo-blue', name: 'Monte Carlo Blue', colour: 0x16305f, metal: 0.55, rough: 0.3 },
  { id: 'imola-red', name: 'Imola Red', colour: 0x9c0f16, metal: 0.05, rough: 0.3 },
  { id: 'silverstone', name: 'Silverstone', colour: 0x8f969c, metal: 0.75, rough: 0.3 },
  { id: 'singapore-grey', name: 'Singapore Grey', colour: 0x4f555b, metal: 0.65, rough: 0.32 },
  { id: 'sakhir-orange', name: 'Sakhir Orange', colour: 0xb94a17, metal: 0.45, rough: 0.3 },
  {
    id: 'frozen-grey',
    name: 'Frozen Grey (matt)',
    colour: 0x5e6266,
    metal: 0.45,
    rough: 0.6,
    coat: 0.25,
    coatRough: 0.55,
  },
]);
// Tints of the alloy (the tyres stay black).
export const wheelFinishes = Object.freeze([
  { id: 'silver', name: 'Silver', tint: 0xffffff, metal: 0.7, rough: 0.34 },
  { id: 'ferric-grey', name: 'Ferric Grey', tint: 0x6d7075, metal: 0.75, rough: 0.32 },
  { id: 'black', name: 'Gloss black', tint: 0x1c1d1f, metal: 0.3, rough: 0.22 },
  { id: 'bronze', name: 'Bronze', tint: 0xa47a42, metal: 0.8, rough: 0.3 },
]);
const storageKey = 'bmw-driver:look';
export const defaultLook = Object.freeze({ paint: paints[0].id, wheels: wheelFinishes[0].id });

export function loadLook(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(storageKey) ?? '{}') ?? {};
    return {
      paint: paints.some((p) => p.id === saved.paint) ? saved.paint : defaultLook.paint,
      wheels: wheelFinishes.some((w) => w.id === saved.wheels) ? saved.wheels : defaultLook.wheels,
    };
  } catch {
    return { ...defaultLook };
  }
}
export function saveLook(look, storage = globalThis.localStorage) {
  try {
    storage?.setItem(storageKey, JSON.stringify(look));
  } catch {
    // Not kept between visits.
  }
}

// The wheel finish as shader values: the alloy's tint, metalness and
// roughness (see refineWheelMaterial).
export const wheelUniforms = {
  wheelTint: { value: new THREE.Color(1, 1, 1) },
  wheelMetal: { value: 0.7 },
  wheelRough: { value: 0.34 },
};

// Sets the paint on the car's paint materials and the wheel finish.
export function applyLook(paintMaterials, look) {
  const paint = paints.find((p) => p.id === look.paint) ?? paints[0];
  const wheels = wheelFinishes.find((w) => w.id === look.wheels) ?? wheelFinishes[0];
  for (const m of paintMaterials) {
    m.color.set(paint.colour);
    m.metalness = paint.metal;
    m.roughness = paint.rough;
    m.clearcoat = paint.coat ?? 0.85;
    m.clearcoatRoughness = paint.coatRough ?? 0.16;
  }
  wheelUniforms.wheelTint.value.set(wheels.tint);
  wheelUniforms.wheelMetal.value = wheels.metal;
  wheelUniforms.wheelRough.value = wheels.rough;
  return { paint, wheels };
}
