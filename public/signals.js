import * as THREE from 'three';

// Turn signals and the high-beam assistant.
//
// Turn signals flash about 85 times a minute, the lamp lit a little more
// than half of each cycle. Q and E switch them on by hand, and like a real
// stalk they cancel once the steering, having turned that way, comes back
// to straight. The self-driving car signals its own lane changes. The
// hazard switch (X) flashes all of them; a signal set meanwhile waits
// under it.
export const signalTiming = Object.freeze({ period: 0.7, lit: 0.55 });

export class TurnSignals {
  constructor() {
    this.reset();
  }
  reset() {
    this.side = null;
    this.hazard = false;
    this.time = 0;
    this.turned = 0;
    this.wasLit = false;
  }
  // `side`: 'left', 'right' or null.
  set(side) {
    if (side === this.side) return;
    this.side = side;
    if (!this.hazard) this.time = 0;
    this.turned = 0;
  }
  toggle(side) {
    this.set(this.side === side ? null : side);
  }
  toggleHazard() {
    this.hazard = !this.hazard;
    this.time = 0;
  }
  // Flashing at all: hazards or a turn signal.
  get active() {
    return this.hazard || this.side !== null;
  }
  // Whether a side's lamps flash.
  flashes(side) {
    return this.hazard || this.side === side;
  }
  get lit() {
    return this.active && this.time % signalTiming.period < signalTiming.period * signalTiming.lit;
  }
  // Advances the flashing; returns 'on' or 'off' at each relay click.
  step(dt, steer = 0, { autoCancel = true } = {}) {
    if (!this.active) {
      const click = this.wasLit ? 'off' : null;
      this.wasLit = false;
      return click;
    }
    this.time += dt;
    // Positive steer turns left.
    const toward = this.side === 'left' ? steer : this.side === 'right' ? -steer : 0;
    this.turned = Math.max(this.turned, toward);
    if (this.side && autoCancel && this.turned > 0.06 && toward < 0.015) this.set(null);
    const lit = this.lit;
    const click = lit !== this.wasLit ? (lit ? 'on' : 'off') : null;
    this.wasLit = lit;
    return click;
  }
}

// High-beam assistant: main beam at night on an open road, above town
// speed, dipped in rain or fog spray and for traffic ahead or oncoming
// within `glare` metres.
export const highBeamAssist = Object.freeze({ minSpeed: 14, glare: 400 });
export function highBeamWanted({
  night,
  speed,
  raining,
  trafficDistance = Infinity,
  enabled = true,
}) {
  return Boolean(
    enabled &&
    night &&
    !raining &&
    speed >= highBeamAssist.minSpeed &&
    trafficDistance > highBeamAssist.glare
  );
}

// Amber lamps where the F10 has them: a strip along the top edge of each
// headlight (its "eyebrow"), one along the lower edge of each mirror cap
// and one along the lower edge of each tail lamp. Each is a ribbon laid on
// the model's surface: for points across the lamp, a ray from outside
// finds the lamp's edge (scanning down from above, or up from below) and
// the ribbon runs a little inside it, following the surface's curve. Body
// space: x forward, y up, z to the right; given for the right side.
export const signalLamps = Object.freeze([
  {
    name: 'front',
    across: [0.4, 0.86],
    rayX: 2.9,
    dir: -1,
    scan: [0.32, 0.02],
    inset: 0.018,
    width: 0.026,
    // The headlight's cover glass.
    onto: ['Object_49'],
  },
  {
    name: 'mirror',
    across: [0.94, 1.08],
    rayX: 1.4,
    dir: -1,
    scan: [0.26, 0.52],
    inset: 0.012,
    width: 0.02,
    onto: null,
  },
  {
    name: 'rear',
    // The outer lamp, in the wing (not the part in the boot lid).
    across: [0.6, 0.88],
    rayX: -3.2,
    dir: 1,
    scan: [0.12, 0.42],
    inset: 0.02,
    width: 0.032,
    onto: ['BrakeLamp_Left', 'BrakeLamp_Right'],
  },
]);

// A soft round glow, for the light round a lit lamp.
function glowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// A lamp's light: a strip, brightest along its middle, and the light it
// spreads into the lens round it, both added onto the lamp.
function lampLight(name) {
  return new THREE.MeshBasicMaterial({
    name,
    color: 0x000000,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    // Flat or added on: one pass for both faces (three otherwise draws
    // a double-sided transparent material twice, re-checking its program
    // each time).
    forceSinglePass: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

// Lays a lit strip on the model along a lamp's edge (a `signalLamps` entry)
// on one side (`sign` 1 right, −1 left): for points across the lamp, a ray
// from outside finds the lamp's edge (scanning toward `scan[1]`) and the
// strip runs `inset` inside it, following the surface. Adds its core and
// halo to the body, hidden, and returns them with the point and normal at
// its middle; null if the lamp was not found.
export function lampStrip(rig, lamp, sign, { core: coreMaterial, halo: haloMaterial }, name) {
  rig.body.updateMatrixWorld(true);
  const toBody = new THREE.Matrix4().copy(rig.body.matrixWorld).invert();
  const toWorld = rig.body.matrixWorld;
  const raycaster = new THREE.Raycaster();
  const meshes = [];
  rig.body.traverse((o) => o.isMesh && o.visible && meshes.push(o));
  const targets = lamp.onto ? meshes.filter((m) => lamp.onto.includes(m.name)) : meshes;
  const dir = new THREE.Vector3(lamp.dir, 0, 0);
  const worldDir = dir.clone().transformDirection(toWorld);
  const cast = (y, z) => {
    raycaster.set(new THREE.Vector3(lamp.rayX, y, z).applyMatrix4(toWorld), worldDir);
    return raycaster.intersectObjects(targets, false)[0] ?? null;
  };
  // Scanning from `scan[0]` toward `scan[1]`: the first height that meets
  // the lamp is its edge.
  const step = Math.sign(lamp.scan[1] - lamp.scan[0]) * 0.004;
  const samples = [];
  const count = 18;
  for (let i = 0; i <= count; i++) {
    const z = sign * (lamp.across[0] + ((lamp.across[1] - lamp.across[0]) * i) / count);
    let edge = null;
    for (let y = lamp.scan[0]; step > 0 ? y <= lamp.scan[1] : y >= lamp.scan[1]; y += step)
      if (cast(y, z)) {
        edge = y;
        break;
      }
    if (edge === null) continue;
    const hit = cast(edge - Math.sign(step) * -lamp.inset, z);
    if (!hit) continue;
    const point = hit.point.clone().applyMatrix4(toBody);
    const normal = hit.face
      ? hit.face.normal
          .clone()
          .transformDirection(hit.object.matrixWorld)
          .transformDirection(toBody)
      : dir.clone().negate();
    if (normal.dot(dir) > 0) normal.negate();
    samples.push({ point: point.addScaledVector(normal, 0.003), normal });
  }
  if (samples.length < 2) return null;
  // The ribbon: across the lamp, `width` up and down the surface, its
  // brightness by `profile` (pairs of offset, −1…1, and brightness), and
  // fading out at its two ends.
  const up = new THREE.Vector3();
  const ribbon = (width, profile, lift) => {
    const positions = [],
      colours = [];
    const vertex = (s, i, [k, bright]) => {
      up.set(0, 1, 0).addScaledVector(s.normal, -s.normal.y).normalize();
      const end = Math.min(1, (Math.min(i, samples.length - 1 - i) + 0.5) / 2.5);
      positions.push(
        ...s.point
          .clone()
          .addScaledVector(up, (k * width) / 2)
          .addScaledVector(s.normal, lift)
          .toArray()
      );
      const b = bright * end;
      colours.push(b, b, b);
    };
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i],
        b = samples[i + 1];
      if (a.point.distanceTo(b.point) > 0.08) continue;
      for (let j = 0; j < profile.length - 1; j++) {
        const p = profile[j],
          q = profile[j + 1];
        vertex(a, i, p);
        vertex(b, i + 1, p);
        vertex(a, i, q);
        vertex(a, i, q);
        vertex(b, i + 1, p);
        vertex(b, i + 1, q);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    return geometry;
  };
  const core = new THREE.Mesh(
    ribbon(
      lamp.width,
      [
        [-1, 0.15],
        [-0.45, 0.85],
        [0, 1],
        [0.45, 0.85],
        [1, 0.15],
      ],
      0
    ),
    coreMaterial
  );
  core.name = name;
  const halo = new THREE.Mesh(
    ribbon(
      lamp.width * 3.5,
      [
        [-1, 0],
        [-0.25, 0.55],
        [0, 0.7],
        [0.25, 0.55],
        [1, 0],
      ],
      0.004
    ),
    haloMaterial
  );
  halo.name = `${name} halo`;
  for (const m of [core, halo]) {
    m.visible = false;
    m.renderOrder = 5;
    rig.body.add(m);
  }
  return { meshes: [core, halo], middle: samples[Math.floor(samples.length / 2)] };
}

// A bulb's warm-up and fade (s): lamps swell on and die away rather than
// switch.
const rise = 0.05,
  fall = 0.12;

export function setupSignalLamps(rig) {
  const lit = { left: [], right: [] };
  // The light round each lit lamp, added onto the scene behind it.
  const glow = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(0.9, 0.34, 0.03),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const materials = {};
  for (const side of ['left', 'right']) {
    materials[side] = {
      core: lampLight(`Turn signal ${side}`),
      halo: lampLight(`Turn signal ${side} halo`),
    };
    const sign = side === 'left' ? -1 : 1;
    for (const lamp of signalLamps) {
      const strip = lampStrip(rig, lamp, sign, materials[side], `Turn signal ${side} ${lamp.name}`);
      if (!strip) continue;
      lit[side].push(...strip.meshes);
      // A little bloom at its middle.
      const s = strip.middle;
      const bloom = new THREE.Sprite(glow);
      bloom.name = `Turn signal ${side} ${lamp.name} glow`;
      bloom.position.copy(s.point).addScaledVector(s.normal, 0.03);
      bloom.scale.setScalar(lamp.name === 'mirror' ? 0.18 : 0.2);
      bloom.visible = false;
      bloom.renderOrder = 5;
      rig.body.add(bloom);
      lit[side].push(bloom);
    }
  }
  const core = new THREE.Color(2.4, 0.78, 0.05),
    halo = new THREE.Color(0.42, 0.13, 0.008);
  return {
    lit,
    // The lamps show only while lit: the lenses are clear when off.
    update(signals) {
      const { period, lit: share } = signalTiming;
      const t = signals.active ? signals.time % period : Infinity,
        on = period * share;
      const level = t < on ? Math.min(1, t / rise) : t < on + fall ? 1 - (t - on) / fall : 0;
      for (const side of ['left', 'right']) {
        const shown = signals.flashes(side) && level > 0;
        const k = shown ? level * level : 0;
        materials[side].core.color.copy(core).multiplyScalar(k);
        materials[side].halo.color.copy(halo).multiplyScalar(k);
        for (const mesh of lit[side]) mesh.visible = shown;
      }
      glow.opacity = 0.75 * level;
    },
  };
}

// Reversing lamps: the F10 has them in the lower part of the tail lamps in
// the boot lid, white. Lit while reverse is engaged.
export const reversingLamp = Object.freeze({
  name: 'reversing',
  across: [0.36, 0.56],
  rayX: -3.2,
  dir: 1,
  scan: [0.12, 0.42],
  inset: 0.022,
  width: 0.034,
  onto: ['BrakeLamp_Left', 'BrakeLamp_Right'],
});

export function setupReversingLamps(rig) {
  const materials = { core: lampLight('Reversing lamp'), halo: lampLight('Reversing lamp halo') };
  const meshes = [];
  for (const sign of [-1, 1]) {
    const strip = lampStrip(
      rig,
      reversingLamp,
      sign,
      materials,
      `Reversing lamp ${sign < 0 ? 'left' : 'right'}`
    );
    if (strip) meshes.push(...strip.meshes);
  }
  const core = new THREE.Color(2.2, 2.1, 1.95),
    halo = new THREE.Color(0.4, 0.39, 0.36);
  let level = 0;
  return {
    meshes,
    get level() {
      return level;
    },
    update(dt, on) {
      level = on ? Math.min(1, level + dt / rise) : Math.max(0, level - dt / fall);
      const k = level * level;
      materials.core.color.copy(core).multiplyScalar(k);
      materials.halo.color.copy(halo).multiplyScalar(k);
      for (const mesh of meshes) mesh.visible = level > 0;
    },
  };
}

// Flashing the headlights (the stalk pulled toward the driver): two quick
// blinks of the main beam, the motorway's way of asking a slower car ahead
// in the fast lane to move over.
export const beamFlash = Object.freeze({ on: 0.16, off: 0.13, blinks: 2 });
export class HeadlightFlasher {
  t = Infinity;
  start() {
    this.t = 0;
  }
  // Advances by dt; returns 'on' or 'off' when the beam changes (for the
  // stalk's click), else null.
  step(dt) {
    const was = this.lit;
    this.t += dt;
    const lit = this.lit;
    return lit === was ? null : lit ? 'on' : 'off';
  }
  get lit() {
    const period = beamFlash.on + beamFlash.off;
    return this.t < beamFlash.blinks * period && this.t % period < beamFlash.on;
  }
}
