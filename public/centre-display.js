import * as THREE from 'three';
import { roadCenterZ, branchOffset, roadEdge } from './road-profile.js';
import { formatClock } from './time-of-day.js';
import { roundedBlock } from './door-trim.js';

// The centre of the dashboard. The model shows a blurred portrait picture
// there; the F10 has a wide iDrive screen set into the dashboard top, above
// the centre stack (built in dashboard.js). The screen shows a live navigation map of the road ahead, the
// country roads branching off and the car, beside the time, outside
// temperature and radio, redrawn a few times a second.
export const centreLayout = Object.freeze({
  // The model's centre picture (body space): top left, bottom left, top
  // right, bottom right as the driver sees it.
  corners: Object.freeze([
    Object.freeze([0.636, 0.406, -0.085]),
    Object.freeze([0.495, 0.17, -0.086]),
    Object.freeze([0.636, 0.406, 0.11]),
    Object.freeze([0.495, 0.171, 0.11]),
  ]),
  // The iDrive screen: 8.8-inch class, 8:3.
  screen: Object.freeze({ width: 0.3, height: 0.1125, pixels: [960, 360] }),
  refresh: 1 / 4,
  // Map scale (pixels per metre) and how far ahead the car sits.
  mapScale: 1.3,
  // The trim band on the dashboard's sloping face (body space): across z,
  // its centre, height and the face's tilt.
  band: Object.freeze({ from: 0.13, to: 0.69, x: 0.592, y: 0.302, height: 0.034, tilt: -0.52 }),
});

const inside = { envMapIntensity: 0.25 };
const dashMaterial = new THREE.MeshStandardMaterial({
  name: 'Dashboard leather',
  color: 0x121316,
  roughness: 0.7,
  ...inside,
});
const trimMaterial = new THREE.MeshStandardMaterial({
  name: 'Dashboard Aluminium Trace',
  color: 0x5a5d63,
  metalness: 0.55,
  roughness: 0.5,
  ...inside,
});
const chromeMaterial = new THREE.MeshStandardMaterial({
  name: 'Dashboard chrome',
  color: 0xc4c8cc,
  metalness: 1,
  roughness: 0.22,
});

// A quad from four corners (top left, bottom left, top right, bottom right).
function quad(corners, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      corners.flatMap((q) => q.toArray()),
      3
    )
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 1, 1, 0], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function canvasTexture(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, ctx: canvas.getContext('2d'), texture };
}

// Map position of a world point relative to the car, heading up.
export function mapPoint(simulation, x, z, scale, cx, cy) {
  const dx = x - simulation.x,
    dz = z - simulation.z;
  const c = Math.cos(simulation.heading),
    s = Math.sin(simulation.heading);
  // Forward is (cos h, -sin h) in x/z; right is (sin h, cos h).
  const forward = dx * c - dz * s,
    right = dx * s + dz * c;
  return [cx + right * scale, cy - forward * scale];
}

function drawScreen(ctx, w, h, simulation, hours, raining) {
  // Map on the left two thirds, in iDrive's night-blue style.
  const mapW = w * 0.66;
  ctx.fillStyle = '#0c1724';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, mapW, h);
  ctx.clip();
  // Fields: faint parcels.
  ctx.strokeStyle = 'rgba(70,110,140,0.18)';
  ctx.lineWidth = 1;
  for (let i = -6; i < 14; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 60, 0);
    ctx.lineTo(i * 60 - 80, h);
    ctx.stroke();
  }
  const { mapScale } = centreLayout,
    cx = mapW / 2,
    cy = h * 0.78;
  const line = (lateral, from, to, width, colour) => {
    ctx.beginPath();
    let drawing = false;
    for (let x = from; x <= to; x += 4) {
      const l = typeof lateral === 'function' ? lateral(x) : lateral;
      if (l === null) {
        drawing = false;
        continue;
      }
      const [px, py] = mapPoint(simulation, x, roadCenterZ(x) + l, mapScale, cx, cy);
      if (drawing) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      drawing = true;
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  const from = simulation.x - 120,
    to = simulation.x + 320;
  // Country roads, the motorway, and the route along it.
  line(branchOffset, from, to, 4.4 * mapScale + 3, '#8a7a5c');
  line(0, from, to, (2 * roadEdge + 2) * mapScale + 4, '#c9d3dc');
  line(0, from, to, 2 * roadEdge * mapScale, '#e6ebf0');
  line(0, simulation.x, to, 3.6 * mapScale + 4, '#2d8cff');
  // The car: a white arrowhead.
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0c1724';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(12, 14);
  ctx.lineTo(0, 7);
  ctx.lineTo(-12, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Top bar.
  ctx.fillStyle = 'rgba(6,12,20,0.85)';
  ctx.fillRect(0, 0, w, h * 0.13);
  ctx.fillStyle = '#e8eef4';
  ctx.font = `500 ${Math.round(h * 0.075)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Navigation', w * 0.025, h * 0.066);
  ctx.textAlign = 'right';
  ctx.fillText(formatClock(hours), w * 0.975, h * 0.066);
  // Right pane: time, outside temperature, radio.
  ctx.fillStyle = '#101d2c';
  ctx.fillRect(mapW, h * 0.13, w - mapW, h * 0.87);
  ctx.fillStyle = '#2a3c50';
  ctx.fillRect(mapW, h * 0.13, 2, h * 0.87);
  const px = mapW + (w - mapW) / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `300 ${Math.round(h * 0.2)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(formatClock(hours), px, h * 0.36);
  ctx.fillStyle = '#9fb3c6';
  ctx.font = `400 ${Math.round(h * 0.07)}px "Helvetica Neue", Arial, sans-serif`;
  const temperature = Math.round(
    14 + 9 * Math.sin((Math.PI * (hours - 9)) / 12) - (raining ? 4 : 0)
  );
  ctx.fillText(`${temperature} °C  ${raining ? 'Rain' : 'Clear'}`, px, h * 0.53);
  ctx.fillStyle = '#e8eef4';
  ctx.fillText('FM 101.5', px, h * 0.72);
  ctx.fillStyle = '#5f7a93';
  ctx.fillText('Radio', px, h * 0.84);
}

export function setupCentreDisplay(rig) {
  const { corners, screen, refresh } = centreLayout;
  const body = rig.body;
  // The model's centre picture is its own mesh (beside the cluster, which
  // cockpit-cluster.js replaced): hide it entirely.
  const old = body.getObjectByName('Object_31');
  if (old) old.visible = false;
  const p = corners.map((c) => new THREE.Vector3(...c));
  const up = p[0].clone().sub(p[1]).normalize(),
    right = p[2].clone().sub(p[0]).normalize(),
    normal = new THREE.Vector3().crossVectors(right, up).normalize();
  if (normal.x > 0) normal.negate();
  // The iDrive screen standing on the dashboard above it, in a bezel.
  const topCentre = p[0].clone().add(p[2]).multiplyScalar(0.5);
  const screenCentre = topCentre
    .clone()
    .addScaledVector(up, screen.height * 0.32)
    .addScaledVector(normal, 0.012);
  const hw = screen.width / 2,
    hh = screen.height / 2;
  const corner = (sx, sy) =>
    screenCentre
      .clone()
      .addScaledVector(right, sx * hw)
      .addScaledVector(up, sy * hh);
  const display = canvasTexture(...screen.pixels);
  const screenMesh = quad(
    [corner(-1, 1), corner(-1, -1), corner(1, 1), corner(1, -1)],
    new THREE.MeshBasicMaterial({ name: 'iDrive screen', map: display.texture, color: 0xd8d8d8 })
  );
  screenMesh.name = 'iDrive screen';
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(screen.width + 0.014, screen.height + 0.014, 0.012),
    new THREE.MeshStandardMaterial({ name: 'Screen bezel', color: 0x07080a, roughness: 0.25 })
  );
  bezel.position.copy(screenCentre).addScaledVector(normal, -0.0065);
  bezel.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
  // As in the F10, the screen sits in the dashboard rather than on it: a
  // housing behind it reaches forward into the dash top, under a brow that
  // shades the glass.
  const basis = new THREE.Matrix4().makeBasis(right, up, normal);
  const housing = new THREE.Mesh(
    roundedBlock(screen.width + 0.03, screen.height + 0.022, 0.11, 0.008),
    dashMaterial
  );
  housing.position.copy(screenCentre).addScaledVector(normal, -0.062);
  housing.quaternion.setFromRotationMatrix(basis);
  housing.name = 'iDrive screen housing';
  const brow = new THREE.Mesh(roundedBlock(screen.width + 0.04, 0.012, 0.05, 0.005), dashMaterial);
  brow.position
    .copy(screenCentre)
    .addScaledVector(up, screen.height / 2 + 0.012)
    .addScaledVector(normal, -0.012);
  brow.quaternion.setFromRotationMatrix(basis);
  brow.name = 'iDrive screen brow';
  // The trim band across the dashboard, from the centre stack to the
  // passenger door at vent height, Aluminium Trace over a thin chrome line,
  // on the dash's sloping face.
  const { band } = centreLayout;
  const length = band.to - band.from;
  const trim = new THREE.Mesh(roundedBlock(0.012, band.height, length, 0.004), trimMaterial);
  trim.position.set(band.x, band.y, (band.from + band.to) / 2);
  trim.rotation.z = band.tilt;
  trim.name = 'Dashboard trim band';
  const chromeLine = new THREE.Mesh(roundedBlock(0.006, 0.004, length, 0.0015), chromeMaterial);
  chromeLine.position.set(
    band.x + Math.sin(-band.tilt) * 0.004 - 0.002,
    band.y - band.height / 2 - 0.004,
    (band.from + band.to) / 2
  );
  chromeLine.rotation.z = band.tilt;
  chromeLine.name = 'Dashboard chrome line';
  const group = new THREE.Group();
  group.name = 'Centre display';
  group.add(bezel, screenMesh, housing, brow, trim, chromeLine);
  body.add(group);
  let elapsed = Infinity;
  return {
    group,
    update(dt, simulation, { hours = 13, raining = false, night = false } = {}) {
      screenMesh.material.color.setScalar(night ? 0.6 : 0.85);
      elapsed += dt;
      if (elapsed < refresh || !simulation) return;
      elapsed = 0;
      drawScreen(display.ctx, ...screen.pixels, simulation, hours, raining);
      display.texture.needsUpdate = true;
    },
  };
}
