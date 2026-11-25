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
// motorway and the track, read from the motorway: a WOG, as on Ukraine's
// highways (its name in white on its green, a WOG CAFE in the shop; the
// lettering is ours, not the chain's logo). Under the canopy at night the
// lights come on.
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
export const priceSignPlace = Object.freeze({ along: -62, out: 2.6 });
// The islands run along the road, a lane either side of them `pumpLane` m
// from their middle: a car draws up beside a pump along the road.
export const pumpIslands = Object.freeze([-8, 0, 8]);
export const pumpRow = 12;
export const pumpLane = 2.4;
// The way through the station (m along from the forecourt's middle): over
// from the service lane onto the lane beside the pumps (on the road's side
// of the islands) between `turnIn`, back to the service lane between
// `turnOut`; paved `width` wide where it runs off the forecourt.
export const forecourtWay = Object.freeze({
  turnIn: Object.freeze([-56, -20]),
  turnOut: Object.freeze([16, 52]),
  width: 5.2,
});
// (Its bend eases in and out: the curvature too starts and ends at nought,
// so the wheel turns smoothly rather than with a jerk at each end.)
const ease = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * t * (t * (6 * t - 15) + 10);
};
// How far over from the service lane onto the way past the pumps (0–1).
export function wayShare(along) {
  const [a, b] = forecourtWay.turnIn,
    [c, d] = forecourtWay.turnOut;
  return ease(a, b, along) * (1 - ease(c, d, along));
}
// The way's middle, out from the service lane's far edge.
export const wayDepth = (along) =>
  -roadBranch.halfWidth + (pumpRow - pumpLane + roadBranch.halfWidth) * wayShare(along);
const brandGreen = 0x109b3c;

// The steel barrier along the outside of the way off, leading back to the
// motorway (m along), and how far out from the way's middle it stands.
export const wayBarriers = Object.freeze([
  Object.freeze([fuelStationPlace.length / 2 + 8, forecourtWay.turnOut[1] + 6]),
]);
export const wayBarrierOut = forecourtWay.width / 2 + 2.6;

// The car's fuel: an 80 L tank with only 10 L in it at the start (some
// 70 km driven hard, so the first fuel station is worth a stop), using
// about 14 L/100 km. It fills at a pump at `rate` litres a second (far
// faster than a real pump, for a game: a full tank in some 15 s).
export class FuelTank {
  constructor(litres = 10) {
    this.capacity = 80;
    this.litres = litres;
    this.perMetre = 0.14 / 1000;
    this.rate = 5;
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

const green = '#109b3c',
  lime = '#e9ee1c',
  wogFont = (size) => `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
// The brand's round badge: a lime disc ringed in dark green with a W.
function badge(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = lime;
  g.fill();
  g.lineWidth = r * 0.16;
  g.strokeStyle = '#0b6e2b';
  g.beginPath();
  g.arc(x, y, r * 0.86, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#0b6e2b';
  g.font = wogFont(r * 1.1);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('W', x, y + r * 0.06);
}
// The canopy's fascia: bright green, shading darker toward its foot, the
// name in lime by its badge, and a lime light line along the foot.
function fasciaTexture() {
  return canvasTexture(1024, 96, (g, w, h) => {
    const shade = g.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, '#1db446');
    shade.addColorStop(1, '#0c8834');
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);
    g.fillStyle = lime;
    g.fillRect(0, h - 11, w, 7);
    badge(g, w / 2 - 105, h / 2 - 5, 34);
    g.fillStyle = lime;
    g.font = wogFont(56);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('WOG', w / 2 - 58, h / 2 - 3);
  });
}

// The price sign: a white head with the badge and the name in green, then
// the prices in red on black on the green.
function priceTexture() {
  return canvasTexture(256, 640, (g, w, h) => {
    g.fillStyle = green;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, 150);
    badge(g, w / 2, 52, 34);
    g.fillStyle = green;
    g.font = wogFont(46);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText('WOG', w / 2, 136);
    fuelPrices.forEach(({ grade, price }, i) => {
      const y = 168 + i * 112;
      g.fillStyle = '#0b0d0f';
      g.fillRect(16, y, w - 32, 96);
      g.fillStyle = '#ffffff';
      g.font = 'bold 30px "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'left';
      g.fillText(grade, 28, y + 36);
      g.fillStyle = '#ff3b2f';
      g.font = 'bold 50px "Courier New", monospace';
      g.textAlign = 'right';
      g.fillText(price.toFixed(2), w - 26, y + 84);
    });
  });
}

function shopSignTexture() {
  return canvasTexture(512, 64, (g, w, h) => {
    g.fillStyle = green;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.font = wogFont(32);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('WOG CAFE · MARKET · 24', w / 2, h / 2 + 2);
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
  // The way on from the service lane and off again, where it runs off the
  // forecourt: asphalt along its curve from the lane's edge, a kerb along
  // each side, and a steel barrier along the outside of the way off, so the
  // way on and the way back to the motorway read at a glance.
  const half = forecourtWay.width / 2;
  const stretches = [
    [forecourtWay.turnIn[0] - 4, -length / 2 + 0.5],
    [length / 2 - 0.5, forecourtWay.turnOut[1] + 4],
  ];
  const strip = [];
  for (const [a0, a1] of stretches)
    for (let a = a0; a < a1; a += 1) {
      const b = Math.min(a + 1, a1);
      const edges = (u) => [Math.max(0.05, wayDepth(u) - half), wayDepth(u) + half];
      const [p0, q0] = edges(a),
        [p1, q1] = edges(b);
      if (q0 < 0.4 && q1 < 0.4) continue;
      // (Two triangles a metre long, facing up.)
      strip.push(a, 0.03, p0, a, 0.03, q0, b, 0.03, q1, a, 0.03, p0, b, 0.03, q1, b, 0.03, p1);
      const turn = -Math.atan2(wayDepth(b) - wayDepth(a), b - a);
      const mid = (a + b) / 2;
      // Kerbs, where the way is clear of the service lane.
      if (wayDepth(mid) - half > 0.4)
        kit.box(1.04, 0.14, 0.18, mid, 0, wayDepth(mid) - half - 0.09, 0xd2d4d6, turn);
      kit.box(1.04, 0.14, 0.18, mid, 0, wayDepth(mid) + half + 0.09, 0xd2d4d6, turn);
    }
  const way = new THREE.BufferGeometry();
  way.setAttribute('position', new THREE.Float32BufferAttribute(strip, 3));
  way.computeVertexNormals();
  ground.add(way, 0x55595f);
  for (const [a, b] of wayBarriers)
    for (let u = a; u < b; u += 2) {
      const z = wayDepth(u + 1) + wayBarrierOut,
        turn = -Math.atan2(wayDepth(u + 2) - wayDepth(u), 2);
      kit.box(0.1, 0.75, 0.1, u, 0, wayDepth(u) + wayBarrierOut, 0x8c9297);
      kit.box(2.04, 0.32, 0.06, u + 1, 0.42, z, 0xc2c8cd, turn);
    }
  // Paint on it: a dashed line along each side under the canopy (through
  // its columns), arrows in the lanes either side of the islands showing
  // the way through (in from the left, out to the right) and a stop line
  // across each lane at each island's front end.
  const paint = 0xe8e8e2,
    y = 0.045;
  for (const z of [pumpRow - 4.4, pumpRow + 4.4])
    for (let x = -24; x < 24; x += 1.6) ground.box(0.8, 0.004, 0.12, x + 0.4, y, z, paint);
  const arrowAt = (x, z) => {
    ground.box(2.2, 0.004, 0.22, x - 0.6, y, z, paint);
    for (const side of [-1, 1])
      ground.box(1, 0.004, 0.22, x + 0.55, y, z + side * 0.3, paint, side * 0.75);
  };
  for (const x of [-20, 18])
    for (const z of [pumpRow - pumpLane, pumpRow + pumpLane]) arrowAt(x, z);
  for (const x of pumpIslands)
    for (const side of [-1, 1])
      ground.box(0.2, 0.004, 1.9, x + 2.75, y, pumpRow + side * pumpLane, paint);
  // Kerbs round the islands (along the road) and the dispensers on them:
  // on a dark plinth, a white body with the brand's green band on top, and
  // on each face (toward each lane) a dark display with its price strip,
  // the nozzles in their black holsters and the hoses hanging in loops.
  for (const x of pumpIslands) {
    kit.box(5.2, 0.18, 1.4, x, 0.04, pumpRow, 0xd9dcde);
    for (const px of [x - 1.3, x + 1.3]) {
      kit.box(0.6, 0.22, 0.96, px, 0.22, pumpRow, 0x3a3f44);
      kit.box(0.55, 1.68, 0.9, px, 0.44, pumpRow, brandGreen);
      kit.box(0.57, 0.32, 0.92, px, 1.72, pumpRow, 0x0b6e2b);
      kit.box(0.59, 0.04, 0.94, px, 2.04, pumpRow, 0xdfe3e6);
      for (const face of [-1, 1]) {
        const fz = pumpRow + face * 0.455;
        kit.box(0.42, 0.36, 0.02, px, 1.18, fz, 0x14181c);
        kit.box(0.36, 0.07, 0.025, px, 1.42, fz + face * 0.004, 0xd8f0a8);
        for (const dx of [-0.16, 0, 0.16]) {
          kit.box(0.07, 0.2, 0.08, px + dx, 0.82, fz + face * 0.04, 0x1b1d20);
          // The hose: a loop down from the top and back up to the nozzle.
          const hose = new THREE.TorusGeometry(0.34, 0.018, 5, 14, Math.PI);
          hose.rotateZ(Math.PI);
          kit.add(hose, 0x22252a, new THREE.Matrix4().setPosition(px + dx, 1.3, fz + face * 0.05));
        }
      }
    }
    // Bollards at the islands' ends, and a bin.
    for (const bx of [x - 2.9, x + 2.9]) kit.cylinder(0.11, 0.9, bx, 0.04, pumpRow, 0xf2c230);
    kit.cylinder(0.2, 0.75, x, 0.22, pumpRow, 0x5b636b);
  }
  // The canopy's columns: white, clad in the brand's green for their lower
  // half, a bright ring at the top of the cladding.
  for (const x of [-12, -4, 4, 12])
    for (const z of [pumpRow - 4.4, pumpRow + 4.4]) {
      kit.box(0.45, 5.4, 0.45, x, 0, z, 0xeef0f2);
      kit.box(0.55, 2.8, 0.55, x, 0, z, brandGreen);
      kit.box(0.57, 0.06, 0.57, x, 2.8, z, 0xe9ecef);
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
      fascia.emissiveIntensity = 0.75 * night;
      pool.visible = night > 0.02;
      pool.material.opacity = 0.55 * night;
      glass.emissiveIntensity = 0.55 * night;
      sign.face.emissiveIntensity = 0.5 * night;
      for (const s of shadows) s.update(sun, strength);
    },
  };
}
