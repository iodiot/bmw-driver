import * as THREE from 'three';
import {
  branchOffset,
  forecourtDepth,
  fuelStationPlace,
  roadBranch,
  roadCenterSlope,
  roadCenterZ,
  roadLateral,
  nearestService,
} from './road-profile.js';
import { Kit, canvasTexture } from './build-kit.js';
import { addSurfaceDetail } from './surface-detail.js';
import { groupShadow } from './sun-shadows.js';

// A roadside fuel station on the country road, on its far side where it
// runs beside the motorway, as along Ukrainian highways: a forecourt with a
// white canopy over three pump islands, its fascia in the brand's green, a
// shop with a glass front behind, and a tall price sign between the
// motorway and the track, read from the motorway. The brand ("СТЕП", the
// steppe) is made up. Under the canopy at night the lights come on.
//
// Stop beside a pump and the tank fills (see FuelTank): the cluster's range
// climbs, and driving off (or a full tank) shows what went in and its cost.
export const fuelPrices = Object.freeze([
  { grade: 'А-95+', price: 58.99 },
  { grade: 'А-95', price: 55.49 },
  { grade: 'ДП', price: 53.99 },
  { grade: 'ГАЗ', price: 31.99 },
]);
// The M5 takes А-95+ (super plus).
export const fuelPrice = fuelPrices[0].price;
// Pump islands along the forecourt (x) and their row from the track (z), in
// the station's frame: x along the road, z away from the track's far edge.
// The price sign's place: along the road from the forecourt's middle, and
// out from the service lane's far edge.
export const priceSignPlace = Object.freeze({ along: -42, out: 1.6 });
export const pumpIslands = Object.freeze([-8, 0, 8]);
export const pumpRow = 12;
const brandGreen = 0x168447;

// The car's fuel: an 80 L tank, three quarters full at the start, using
// about 14 L/100 km driven hard. It fills at a pump at `rate` litres a
// second (a little faster than a real pump, for a game).
export class FuelTank {
  constructor(litres = 60) {
    this.capacity = 80;
    this.litres = litres;
    this.perMetre = 0.14 / 1000;
    this.rate = 2.5;
    this.filling = null;
  }
  get rangeKm() {
    return (this.litres / 14) * 100;
  }
  // Uses fuel for the distance driven.
  burn(metres) {
    this.litres = Math.max(0, this.litres - Math.max(0, metres) * this.perMetre);
  }
  // Fills while `atPump`; returns {litres, cost} when a fill ends (the car
  // leaves or the tank is full), else null.
  step(dt, atPump) {
    if (atPump && this.litres < this.capacity - 0.01) {
      this.filling ??= { litres: 0 };
      const add = Math.min(this.rate * dt, this.capacity - this.litres);
      this.litres += add;
      this.filling.litres += add;
      if (this.litres < this.capacity - 0.01) return null;
    }
    if (!this.filling) return null;
    const { litres } = this.filling;
    this.filling = null;
    return litres > 0.05 ? { litres, cost: litres * fuelPrice } : null;
  }
}

// Whether a car at x, z (moving at `speed`) stands at a pump: beside an
// island, under the canopy, all but stopped.
export function atPump(x, z, speed) {
  if (speed > 0.4) return false;
  const depth = forecourtDepth(x, roadLateral(x, z));
  if (depth === null) return false;
  const along = x - nearestService(x, fuelStationPlace.at);
  const beside = Math.abs(depth - pumpRow);
  return pumpIslands.some((p) => Math.abs(along - p) < 3.2) && beside > 0.9 && beside < 4;
}

function fasciaTexture() {
  return canvasTexture(1024, 96, (g, w, h) => {
    g.fillStyle = '#168447';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2c230';
    g.fillRect(0, h - 14, w, 14);
    g.fillStyle = '#ffffff';
    g.font = 'bold 64px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('СТЕП', w / 2, h / 2 - 6);
    // The brand's mark: a sun over the steppe, either side.
    for (const x of [w * 0.32, w * 0.68]) {
      g.beginPath();
      g.arc(x, h / 2 - 6, 22, 0, Math.PI * 2);
      g.fillStyle = '#f2c230';
      g.fill();
      g.fillStyle = '#168447';
      g.fillRect(x - 24, h / 2 + 2, 48, 18);
    }
  });
}

function priceTexture() {
  return canvasTexture(256, 640, (g, w, h) => {
    g.fillStyle = '#168447';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.font = 'bold 54px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText('СТЕП', w / 2, 70);
    g.fillStyle = '#f2c230';
    g.beginPath();
    g.arc(w / 2, 126, 26, Math.PI, 0);
    g.fill();
    g.fillRect(28, 130, w - 56, 6);
    fuelPrices.forEach(({ grade, price }, i) => {
      const y = 168 + i * 112;
      g.fillStyle = '#0b0d0f';
      g.fillRect(16, y, w - 32, 96);
      g.fillStyle = '#ffffff';
      g.font = 'bold 30px "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'left';
      g.fillText(grade, 28, y + 36);
      g.fillStyle = '#ffb21c';
      g.font = 'bold 50px "Courier New", monospace';
      g.textAlign = 'right';
      g.fillText(price.toFixed(2), w - 26, y + 84);
    });
  });
}

function shopSignTexture() {
  return canvasTexture(512, 64, (g, w, h) => {
    g.fillStyle = '#168447';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.font = 'bold 40px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('МАРКЕТ · КАВА · 24', w / 2, h / 2 + 2);
  });
}

function station() {
  const group = new THREE.Group();
  group.name = 'Fuel station';
  const kit = new Kit(),
    // The slab and its paint, apart: they cast no shadow (a shadow of the
    // forecourt laid on the forecourt flickered).
    ground = new Kit();
  const { length, from, depth } = fuelStationPlace;
  // The forecourt: a slab of concrete, thin so the car's wheels sit on it.
  ground.box(length, 0.04, depth, 0, 0, from + depth / 2, 0x9a9ea2);
  // Paint on it: dashed lines between the lanes past the islands, arrows
  // showing the way through (in from the left, out to the right) and a
  // stop line by each pump.
  const paint = 0xe8e8e2,
    y = 0.045;
  for (const x of [-12, -4, 4, 12])
    for (let z = pumpRow - 6; z < pumpRow + 6; z += 1.6)
      ground.box(0.12, 0.004, 0.8, x, y, z + 0.4, paint);
  const arrowAt = (x, z) => {
    ground.box(2.2, 0.004, 0.22, x - 0.6, y, z, paint);
    for (const side of [-1, 1])
      ground.box(1, 0.004, 0.22, x + 0.55, y, z + side * 0.3, paint, side * 0.75);
  };
  for (const x of [-20, 18]) for (const z of [pumpRow - 3, pumpRow + 3]) arrowAt(x, z);
  for (const x of pumpIslands)
    for (const side of [-1, 1])
      ground.box(0.2, 0.004, 1.9, x + 2.6, y, pumpRow + side * 2.5, paint);
  // Kerbs round the islands and the dispensers on them: on a dark plinth, a
  // white body with the brand's green band on top, and on each face (both
  // lanes) a dark display with its price strip, the nozzles in their black
  // holsters and the hoses hanging in loops.
  for (const x of pumpIslands) {
    kit.box(1.4, 0.18, 5.2, x, 0.04, pumpRow, 0xd9dcde);
    for (const z of [pumpRow - 1.3, pumpRow + 1.3]) {
      kit.box(0.96, 0.22, 0.6, x, 0.22, z, 0x3a3f44);
      kit.box(0.9, 1.68, 0.55, x, 0.44, z, 0xf3f4f5);
      kit.box(0.92, 0.32, 0.57, x, 1.72, z, brandGreen);
      kit.box(0.94, 0.04, 0.59, x, 2.04, z, 0xdfe3e6);
      for (const face of [-1, 1]) {
        const fx = x + face * 0.455;
        kit.box(0.02, 0.36, 0.42, fx, 1.18, z, 0x14181c);
        kit.box(0.025, 0.07, 0.36, fx + face * 0.004, 1.42, z, 0xd8f0a8);
        for (const dz of [-0.16, 0, 0.16]) {
          kit.box(0.08, 0.2, 0.07, fx + face * 0.04, 0.82, z + dz, 0x1b1d20);
          // The hose: a loop down from the top and back up to the nozzle.
          const hose = new THREE.TorusGeometry(0.34, 0.018, 5, 14, Math.PI);
          hose.rotateZ(Math.PI);
          hose.rotateY(Math.PI / 2);
          kit.add(hose, 0x22252a, new THREE.Matrix4().setPosition(fx + face * 0.05, 1.3, z + dz));
        }
      }
    }
    // Bollards at the islands' ends, and a bin.
    for (const z of [pumpRow - 2.9, pumpRow + 2.9]) kit.cylinder(0.11, 0.9, x, 0.04, z, 0xf2c230);
    kit.cylinder(0.2, 0.75, x, 0.22, pumpRow, 0x5b636b);
  }
  // The canopy's columns: clad in the brand's green to head height, a
  // bright ring at the top of the cladding.
  for (const x of [-12, -4, 4, 12])
    for (const z of [pumpRow - 3.6, pumpRow + 3.6]) {
      kit.box(0.45, 5.4, 0.45, x, 0, z, 0xe4e6e8);
      kit.box(0.55, 1.6, 0.55, x, 0, z, brandGreen);
      kit.box(0.57, 0.06, 0.57, x, 1.6, z, 0xe9ecef);
    }
  // The shop: walls, a flat roof with a parapet, a glass front (see below)
  // and a door frame.
  const shopZ = from + depth - 6.5;
  kit.box(18, 4.2, 9, 0, 0, shopZ + 2.5, 0xe8e6e0);
  kit.box(18.4, 0.6, 9.4, 0, 4.2, shopZ + 2.5, 0x2e3236);
  kit.box(0.3, 4.2, 0.3, -9.05, 0, shopZ - 2.05, 0x2e3236);
  kit.box(0.3, 4.2, 0.3, 9.05, 0, shopZ - 2.05, 0x2e3236);
  // The door in the glass front: its frame and handles.
  kit.box(1.9, 2.4, 0.08, 4, 0, shopZ - 2.12, 0x2e3236);
  for (const dx of [-0.12, 0.12]) kit.box(0.04, 0.9, 0.06, 4 + dx, 0.7, shopZ - 2.19, 0xc9ced3);
  // Air-conditioning units on the roof.
  for (const x of [-5, 0.5]) {
    kit.box(1.4, 0.8, 1, x, 4.8, shopZ + 4, 0xc8ccd0);
    kit.cylinder(0.32, 0.04, x, 5.6, shopZ + 4, 0x40464c, 16);
  }
  // An air and water post, a bin, a bench and an ice chest by the shop, and
  // a cage of gas cylinders at its corner.
  kit.box(0.4, 1.3, 0.4, 13, 0.04, shopZ - 3, 0x2a62a8);
  kit.cylinder(0.25, 0.8, -13, 0.04, shopZ - 3, 0x3a3f44);
  kit.box(1.8, 0.08, 0.45, -6.5, 0.45, shopZ - 2.6, 0x8a6a48);
  for (const dx of [-0.75, 0.75]) kit.box(0.08, 0.45, 0.4, -6.5 + dx, 0.04, shopZ - 2.6, 0x3a3f44);
  kit.box(1.3, 0.85, 0.7, 7.2, 0.04, shopZ - 2.6, 0xf2f4f6);
  kit.box(1.32, 0.12, 0.72, 7.2, 0.89, shopZ - 2.6, 0x2f7fd0);
  kit.box(1.6, 1.6, 0.8, -10.4, 0.04, shopZ - 1.4, 0x3c4247);
  for (let i = 0; i < 4; i++)
    kit.cylinder(0.15, 1.2, -11 + i * 0.38, 0.12, shopZ - 1.4, 0xd23b2e, 12);
  const solid = new THREE.Mesh(
    kit.geometry(),
    // Concrete panels' joints on the forecourt, plaster on the walls.
    addSurfaceDetail(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }),
      { joints: 4.5 }
    )
  );
  solid.name = 'Fuel station';
  solid.castShadow = solid.receiveShadow = true;
  group.add(solid);
  const forecourt = new THREE.Mesh(ground.geometry(), solid.material);
  forecourt.name = 'Fuel station forecourt';
  forecourt.receiveShadow = true;
  forecourt.userData.noShadow = true;
  group.add(forecourt);
  // The canopy: white, its fascia green with the brand on both long sides,
  // its underside lit at night.
  const fasciaMap = fasciaTexture();
  const fascia = new THREE.MeshStandardMaterial({
    map: fasciaMap,
    roughness: 0.6,
    // Backlit at night.
    emissive: 0xffffff,
    emissiveMap: fasciaMap,
    emissiveIntensity: 0,
  });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f5f6, roughness: 0.7 });
  const underside = new THREE.MeshStandardMaterial({
    color: 0xe9ecef,
    roughness: 0.9,
    emissive: 0xfff4dc,
    emissiveIntensity: 0,
  });
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(30, 1.1, 12), [
    fascia,
    fascia,
    white,
    underside,
    fascia,
    fascia,
  ]);
  canopy.position.set(0, 5.95, pumpRow);
  canopy.name = 'Fuel station canopy';
  group.add(canopy);
  // The shop's glass front and its sign; the windows glow at night.
  const glass = new THREE.MeshStandardMaterial({
    color: 0x22303a,
    roughness: 0.08,
    metalness: 0.4,
    emissive: 0xffe2b0,
    emissiveIntensity: 0,
  });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(17.4, 3.2), glass);
  front.rotation.y = Math.PI;
  // (Clear of the wall by a few centimetres, so the two never flicker.)
  front.position.set(0, 1.9, shopZ - 2.06);
  front.name = 'Fuel station shop window';
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 1.1),
    new THREE.MeshStandardMaterial({ map: shopSignTexture(), roughness: 0.5 })
  );
  sign.rotation.y = Math.PI;
  sign.position.set(0, 3.85, shopZ - 2.1);
  group.add(front, sign);
  // At night the canopy's lights fall on the forecourt: a soft pool of
  // light laid on it (cheaper than lights, which would cost every pixel).
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 20),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(256, 160, (g, w, h) => {
        const grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
        grd.addColorStop(0, 'rgba(255,244,220,1)');
        grd.addColorStop(0.55, 'rgba(255,240,210,0.55)');
        grd.addColorStop(1, 'rgba(255,240,210,0)');
        g.fillStyle = grd;
        g.save();
        g.scale(1, h / w);
        g.fillRect(0, 0, w, w);
        g.restore();
      }),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.08, pumpRow);
  pool.name = 'Fuel station light pool';
  pool.visible = false;
  group.add(pool);
  return { group, underside, glass, pool, fascia };
}

function priceSign() {
  const group = new THREE.Group();
  group.name = 'Fuel price sign';
  const kit = new Kit();
  // Thin along the road, its faces toward the traffic either way.
  kit.box(0.7, 9.4, 2.6, 0, 0, 0, 0xe9ebed);
  kit.box(1, 0.5, 2.9, 0, 0, 0, 0x5c6166);
  const pylon = new THREE.Mesh(
    kit.geometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })
  );
  pylon.castShadow = true;
  const face = new THREE.MeshStandardMaterial({
    map: priceTexture(),
    roughness: 0.5,
    emissive: 0xffffff,
    emissiveMap: null,
    emissiveIntensity: 0,
  });
  face.emissiveMap = face.map;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 5.75), face);
  // Facing the motorway's traffic coming along it (−x).
  panel.rotation.y = -Math.PI / 2;
  // (A few centimetres clear of the pylon, so they never flicker.)
  panel.position.set(-0.4, 6, 0);
  const back = panel.clone();
  back.rotation.y = Math.PI / 2;
  back.position.x = 0.4;
  group.add(pylon, panel, back);
  return { group, face };
}

export function setupFuelStation(scene) {
  const { group, underside, glass, pool, fascia } = station();
  scene.add(group);
  const sign = priceSign();
  scene.add(sign.group);
  const shadows = [
    // (Laid on the forecourt's top, not under it.)
    groupShadow(scene, group, 'Fuel station shadow', { height: 0.07 }),
    groupShadow(scene, sign.group, 'Fuel price sign shadow'),
  ];
  return {
    group,
    // Places it at its nearest occurrence to x; `night` (0–1) lights the
    // canopy, the shop and the sign; `sun` and `strength` lay its shadow.
    update(x, night = 0, sun = null, strength = 0) {
      const u = nearestService(x, fuelStationPlace.at);
      // Not drawn at all when far off.
      const near = Math.abs(u - x) < 900;
      group.visible = sign.group.visible = near;
      if (!near) {
        for (const s of shadows) s.mesh.visible = false;
        return;
      }
      const edge = (branchOffset(u) ?? roadBranch.separation) + roadBranch.halfWidth;
      const turn = -Math.atan(roadCenterSlope(u));
      group.position.set(u, 0, roadCenterZ(u) + edge);
      group.rotation.y = turn;
      // The price sign by the service lane, before the forecourt.
      const signAt = u + priceSignPlace.along;
      sign.group.position.set(signAt, 0, roadCenterZ(signAt) + edge + priceSignPlace.out);
      sign.group.rotation.y = -Math.atan(roadCenterSlope(signAt));
      underside.emissiveIntensity = 0.9 * night;
      fascia.emissiveIntensity = 0.55 * night;
      pool.visible = night > 0.02;
      pool.material.opacity = 0.55 * night;
      glass.emissiveIntensity = 0.55 * night;
      sign.face.emissiveIntensity = 0.5 * night;
      for (const s of shadows) s.update(sun, strength);
    },
  };
}
