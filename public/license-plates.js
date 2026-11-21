import * as THREE from 'three';

// Ukrainian registration plates (520 × 112 mm): white reflective field, thin
// dark border, light-blue band with the national flag and "UA", black
// characters. The character shapes and proportions are measured from a
// photographed plate: wide geometric letters with rounded bowls, about
// 64 mm tall and 46–48 mm wide, drawn bold with an 11 mm stroke so they read
// at a distance (the photographed plate's 8.3 mm looked thin on screen).
// Glyphs are drawn as vector
// shapes rather than with a system font, so the plate looks the same
// everywhere.
export const ukrainianPlate = Object.freeze({
  text: 'AP 1011 CX',
  width: 0.52,
  height: 0.112,
});

// Character geometry in millimetres.
const glyphHeight = 64,
  stroke = 11,
  advance = 7.5,
  groupGap = 22;
const glyphWidths = { A: 47, P: 42, C: 46, X: 46, 0: 45, 1: 27 };
// Rounded letters use a superellipse: rounder than a stadium, squarer than an
// ellipse, matching the plate typeface.
const roundness = 2.6;

function superellipse(ctx, cx, cy, a, b, from, to, move = true) {
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps,
      c = Math.cos(t),
      s = Math.sin(t);
    const px = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / roundness),
      py = cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / roundness);
    if (i === 0 && move) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

function glyph(ctx, ch, x, y, w, h, sw) {
  ctx.beginPath();
  ctx.lineWidth = sw;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  if (ch === 'A') {
    // Pointed letter with a narrow flat apex and a low crossbar.
    const apex = sw * 0.42,
      cx = x + w / 2,
      slope = (w / 2 - apex) / h,
      leg = sw * Math.sqrt(1 + slope * slope);
    ctx.moveTo(x, y + h);
    ctx.lineTo(cx - apex, y);
    ctx.lineTo(cx + apex, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w - leg, y + h);
    ctx.lineTo(cx, y + h - (w / 2 - leg) / slope);
    ctx.lineTo(x + leg, y + h);
    ctx.closePath();
    ctx.fill();
    const barTop = y + h * 0.64,
      barBottom = barTop + sw * 0.95,
      inner = (yy) => leg + (y + h - yy) * slope;
    ctx.beginPath();
    ctx.moveTo(x + inner(barTop) - 1, barTop);
    ctx.lineTo(x + w - inner(barTop) + 1, barTop);
    ctx.lineTo(x + w - inner(barBottom) + 1, barBottom);
    ctx.lineTo(x + inner(barBottom) - 1, barBottom);
    ctx.closePath();
    ctx.fill();
  } else if (ch === 'X') {
    const slope = (w - sw) / h,
      b = sw * Math.sqrt(1 + slope * slope);
    for (const [x0, x1] of [
      [x, x + w - b],
      [x + w - b, x],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + b, y);
      ctx.lineTo(x1 + b, y + h);
      ctx.lineTo(x1, y + h);
      ctx.closePath();
      ctx.fill();
    }
  } else if (ch === '0') {
    superellipse(ctx, x + w / 2, y + h / 2, (w - sw) / 2, (h - sw) / 2, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.stroke();
  } else if (ch === 'C') {
    // Open on the right; the terminals end where the bowl turns upright.
    const open = 0.62;
    superellipse(ctx, x + w / 2, y + h / 2, (w - sw) / 2, (h - sw) / 2, open, 2 * Math.PI - open);
    ctx.stroke();
  } else if (ch === 'P') {
    ctx.fillRect(x, y, sw, h);
    const bowl = h * 0.56,
      a = Math.min(bowl / 2, w * 0.42) - sw / 2,
      b = bowl / 2 - sw / 2,
      cx = x + w - sw / 2 - a,
      cy = y + bowl / 2;
    ctx.moveTo(x + sw / 2, y + sw / 2);
    ctx.lineTo(cx, y + sw / 2);
    superellipse(ctx, cx, cy, a, b, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(x + sw / 2, y + bowl - sw / 2);
    ctx.stroke();
  } else if (ch === '1') {
    // Upright stem with a long diagonal flag and no foot.
    const stem = x + w - sw;
    ctx.fillRect(stem, y, sw, h);
    const flagY = y + h * 0.34,
      thick = sw * 1.05;
    ctx.beginPath();
    ctx.moveTo(stem + 0.2, y);
    ctx.lineTo(stem + 0.2, y + thick * 1.35);
    ctx.lineTo(x, flagY + thick / 2);
    ctx.lineTo(x, flagY - thick / 2);
    ctx.closePath();
    ctx.fill();
  }
}

export function plateLayout(text) {
  const groups = text.trim().split(/\s+/);
  let width = 0;
  const glyphs = [];
  groups.forEach((group, g) => {
    if (g) width += groupGap - advance;
    for (const ch of group) {
      if (!(ch in glyphWidths)) throw new Error(`Unsupported plate character: ${ch}`);
      glyphs.push({ ch, x: width, w: glyphWidths[ch] });
      width += glyphWidths[ch] + advance;
    }
  });
  return { glyphs, width: width - advance };
}

// Draws the plate at `scale` pixels per millimetre.
export function drawUkrainianPlate(ctx, text = ukrainianPlate.text, scale = 4) {
  const W = 520,
    H = 112;
  ctx.save();
  ctx.scale(scale, scale);
  const round = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };
  // Pressed metal rim, then the reflective white field.
  ctx.fillStyle = '#2b2f33';
  round(0, 0, W, H, 6);
  ctx.fill();
  const field = ctx.createLinearGradient(0, 0, 0, H);
  field.addColorStop(0, '#fafbfb');
  field.addColorStop(1, '#eef0f1');
  ctx.fillStyle = field;
  round(2.4, 2.4, W - 4.8, H - 4.8, 4.5);
  ctx.fill();
  // Blue band with the flag on top and the country code below.
  const band = { x: 2.4, y: 2.4, w: 47, h: H - 4.8 };
  ctx.save();
  round(band.x, band.y, W - 4.8, band.h, 4.5);
  ctx.clip();
  ctx.fillStyle = '#2a76d6';
  ctx.fillRect(band.x, band.y, band.w, band.h);
  ctx.restore();
  const flag = { x: band.x + 9, y: band.y + 15, w: 29, h: 17 };
  ctx.fillStyle = '#1f5fbf';
  ctx.fillRect(flag.x, flag.y, flag.w, flag.h / 2);
  ctx.fillStyle = '#f5cd1c';
  ctx.fillRect(flag.x, flag.y + flag.h / 2, flag.w, flag.h / 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 19px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('UA', band.x + band.w / 2, band.y + band.h - 15);
  // Characters, centred in the white field, with a faint stamped emboss.
  const { glyphs, width } = plateLayout(text);
  const fieldLeft = band.x + band.w,
    left = fieldLeft + (W - 2.4 - fieldLeft - width) / 2,
    top = (H - glyphHeight) / 2;
  for (const [dx, dy, color] of [
    [0.6, 0.8, '#0000002a'],
    [-0.3, -0.4, '#ffffffa0'],
    [0, 0, '#141518'],
  ]) {
    ctx.fillStyle = ctx.strokeStyle = color;
    for (const g of glyphs) glyph(ctx, g.ch, left + g.x + dx, top + dy, g.w, glyphHeight, stroke);
  }
  ctx.restore();
}

// Finds a flat, upright plane that sits just outside the body over the plate
// area, following the body's mean tilt there.
function fitPlate(meshes, { end, centreY }) {
  const { width, height } = ukrainianPlate,
    direction = end === 'front' ? -1 : 1,
    ray = new THREE.Raycaster(),
    origin = new THREE.Vector3(),
    dir = new THREE.Vector3(direction, 0, 0);
  const rows = [-0.42, -0.21, 0, 0.21, 0.42].map((f) => centreY + f * height),
    cols = [-0.48, -0.32, -0.16, 0, 0.16, 0.32, 0.48].map((f) => f * width);
  const surface = rows.map((y) =>
    cols.map((z) => {
      origin.set(-direction * 4, y, z);
      ray.set(origin, dir);
      return ray.intersectObjects(meshes, false)[0]?.point.x ?? null;
    })
  );
  // Mean tilt from the centre column; then push the plane clear of every hit.
  const centre = surface.map((row) => row[3]);
  if (centre.some((x) => x === null)) throw new Error(`No ${end} plate surface found.`);
  const slope = (centre[centre.length - 1] - centre[0]) / (rows[rows.length - 1] - rows[0]) || 0;
  let x = direction * Infinity;
  surface.forEach((row, i) =>
    row.forEach((hit) => {
      if (hit === null) return;
      const atCentre = hit - slope * (rows[i] - centreY);
      x = direction < 0 ? Math.max(x, atCentre) : Math.min(x, atCentre);
    })
  );
  return { x: x - direction * 0.004, y: centreY, slope };
}

export function setupLicensePlates(rig, { text = ukrainianPlate.text } = {}) {
  rig.root.updateMatrixWorld(true);
  // The model carries a taller, blank US-size rear plate. Hide it so it does
  // not show above and below the narrower Ukrainian plate.
  const blank = rig.root.getObjectByName('Object_55');
  if (blank?.isMesh) blank.visible = false;
  const meshes = [];
  rig.body.traverse((o) => {
    if (o.isMesh && o.visible) meshes.push(o);
  });
  const canvas = document.createElement('canvas');
  const scale = 4;
  canvas.width = 520 * scale;
  canvas.height = 112 * scale;
  drawUkrainianPlate(canvas.getContext('2d'), text, scale);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const face = new THREE.MeshStandardMaterial({
    name: 'Ukrainian_plate',
    map: texture,
    roughness: 0.42,
    metalness: 0,
  });
  const rearFace = face.clone();
  rearFace.name = 'Ukrainian_plate_rear';
  rearFace.emissive.set(0xffffff);
  rearFace.emissiveMap = texture;
  rearFace.emissiveIntensity = 0;
  const edge = new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.35, metalness: 0.8 });
  const { width, height } = ukrainianPlate,
    thickness = 0.0012;
  const plates = [
    { end: 'front', centreY: 0.42, material: face },
    { end: 'rear', centreY: 0.737, material: rearFace },
  ].map(({ end, centreY, material }) => {
    const fit = fitPlate(meshes, { end, centreY });
    // Box faces: +x, -x, +y, -y, +z (printed side), -z (back).
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), [
      edge,
      edge,
      edge,
      edge,
      material,
      edge,
    ]);
    mesh.name = `LicencePlate_${end}`;
    const outward = end === 'front' ? 1 : -1;
    // Face the printed side outward along ±x, then lean with the body.
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = (outward * Math.PI) / 2;
    mesh.rotation.x = outward * Math.atan(fit.slope);
    const local = rig.body.worldToLocal(
      new THREE.Vector3(fit.x + outward * (thickness / 2), fit.y, 0)
    );
    mesh.position.copy(local);
    mesh.castShadow = true;
    rig.body.add(mesh);
    return mesh;
  });
  return {
    plates,
    texture,
    // Rear plate lamps light the plate at night.
    setNight(night) {
      rearFace.emissiveIntensity = night ? 0.22 : 0;
    },
  };
}
