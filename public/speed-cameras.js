import * as THREE from 'three';
import { roadCenterZ, roadCenterSlope } from './road-profile.js';
import { structureLayout, nearestOccurrence } from './road-structures.js';
import { groupShadow } from './sun-shadows.js';

// Speed cameras on the right verge, as on Ukrainian motorways: one before
// the tunnel's mouth, in its 100 km/h zone, and one on the open road at 120.
// Pass one more than 20 km/h too fast and it flashes and fines you: 340 ₴ up
// to 50 km/h over, 1 700 ₴ beyond (the Code of Administrative Offences,
// article 122). Each stands on a pole with a blue "photo and video
// enforcement" sign under it.
const { tunnel } = structureLayout;
export const speedCameras = Object.freeze([
  Object.freeze({ at: tunnel.from - 60, limit: 100 }),
  Object.freeze({ at: 1000, limit: 120 }),
]);
export const cameraLateral = 8.7;
export function fineFor(speed, limit) {
  const over = speed - limit;
  if (over <= 20) return 0;
  return over > 50 ? 1700 : 340;
}

// The cameras the car passed between x0 and x1 (along the road), with
// their place.
export function camerasPassed(x0, x1) {
  const passed = [];
  for (const camera of speedCameras) {
    const at = nearestOccurrence(x1, camera.at);
    if (x0 < at && x1 >= at) passed.push({ ...camera, x: at });
  }
  return passed;
}

function signTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#1f5fbf';
  g.beginPath();
  g.roundRect(10, 10, 236, 236, 18);
  g.fill();
  // A white camera pictogram.
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(56, 92, 144, 96, 14);
  g.fill();
  g.fillRect(96, 70, 52, 30);
  g.fillStyle = '#1f5fbf';
  g.beginPath();
  g.arc(128, 140, 32, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(128, 140, 20, 0, Math.PI * 2);
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function setupSpeedCameras(scene) {
  const steel = new THREE.MeshStandardMaterial({
    color: 0x9aa1a6,
    metalness: 0.6,
    roughness: 0.45,
  });
  const housing = new THREE.MeshStandardMaterial({
    color: 0xd8dcdf,
    metalness: 0.2,
    roughness: 0.4,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0e10, roughness: 0.2, metalness: 0.4 });
  const sign = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.5 });
  const units = speedCameras.map((camera) => {
    const group = new THREE.Group();
    group.name = 'Speed camera';
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 12), steel);
    pole.position.y = 3;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.2), steel);
    arm.position.set(0, 5.9, -0.55);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.34), housing);
    box.position.set(-0.05, 5.7, -1.05);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.22), dark);
    lens.position.set(-0.335, 5.72, -1.05);
    // The flash: lit for a moment as it catches someone.
    const flash = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.1, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x404040, toneMapped: false })
    );
    flash.position.set(-0.335, 5.94, -1.05);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.7), [
      steel,
      sign,
      steel,
      steel,
      steel,
      steel,
    ]);
    plate.position.set(-0.1, 3.1, 0);
    for (const m of [pole, arm, box, lens, flash, plate]) {
      m.castShadow = m !== flash;
      group.add(m);
    }
    scene.add(group);
    return {
      camera,
      group,
      flash,
      glow: 0,
      shadow: groupShadow(scene, group, 'Speed camera shadow'),
    };
  });
  return {
    units,
    // Places each at its nearest occurrence to x; dt fades a flash. `sun`
    // and `strength` (0–1) lay their shadows.
    update(x, dt, sun = null, strength = 0) {
      for (const unit of units) {
        const at = nearestOccurrence(x, unit.camera.at);
        unit.group.position.set(at, 0, roadCenterZ(at) + cameraLateral);
        unit.group.rotation.y = -Math.atan(roadCenterSlope(at));
        unit.shadow.update(sun, strength);
        unit.glow = Math.max(0, unit.glow - dt * 6);
        const v = 0.25 + 8 * unit.glow;
        unit.flash.material.color.setRGB(v, v, v * 1.05);
      }
    },
    flash(camera) {
      const unit = units.find((u) => u.camera.at === camera.at);
      if (unit) unit.glow = 1;
    },
  };
}

// The speed a driver who knows the road keeps for the cameras: it slows to
// within `margin` km/h over the limit, braking gently from far enough ahead,
// until past each one; and keeps to about 110 km/h from shortly before the
// tunnel's mouth to its far end. m/s, at x.
export function cameraSpeed(x, { margin = 12, braking = 1.6, after = 40 } = {}) {
  const { period, tunnel } = structureLayout;
  const approach = (v, d) => Math.sqrt(v * v + 2 * braking * Math.max(0, d));
  let limit = Infinity;
  for (const camera of speedCameras) {
    let at = nearestOccurrence(x, camera.at);
    if (at < x - after) at += period;
    limit = Math.min(limit, approach((camera.limit + margin) / 3.6, at - x));
  }
  if (tunnel.to > tunnel.from) {
    let start = nearestOccurrence(x, tunnel.from);
    if (x > start + tunnel.to - tunnel.from) start += period;
    limit = Math.min(limit, approach(110 / 3.6, start - 150 - x));
  }
  return limit;
}
