import * as THREE from 'three';

// Turn signals and the high-beam assistant.
//
// Turn signals flash about 85 times a minute, the lamp lit a little more
// than half of each cycle. Q and E switch them on by hand, and like a real
// stalk they cancel once the steering, having turned that way, comes back
// to straight. The self-driving car signals its own lane changes.
export const signalTiming = Object.freeze({ period: 0.7, lit: 0.55 });

export class TurnSignals {
  constructor() {
    this.reset();
  }
  reset() {
    this.side = null;
    this.time = 0;
    this.turned = 0;
    this.wasLit = false;
  }
  // `side`: 'left', 'right' or null.
  set(side) {
    if (side === this.side) return;
    this.side = side;
    this.time = 0;
    this.turned = 0;
  }
  toggle(side) {
    this.set(this.side === side ? null : side);
  }
  get lit() {
    return (
      this.side !== null && this.time % signalTiming.period < signalTiming.period * signalTiming.lit
    );
  }
  // Advances the flashing; returns 'on' or 'off' at each relay click.
  step(dt, steer = 0, { autoCancel = true } = {}) {
    if (this.side === null) {
      const click = this.wasLit ? 'off' : null;
      this.wasLit = false;
      return click;
    }
    this.time += dt;
    // Positive steer turns left.
    const toward = this.side === 'left' ? steer : -steer;
    this.turned = Math.max(this.turned, toward);
    if (autoCancel && this.turned > 0.06 && toward < 0.015) this.set(null);
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

// Amber lamps on the headlights' outer edge, along the mirror caps and in
// the tail lamps: thin strips laid onto the model's surface where a ray
// from outside meets it. Body space: x forward, y up, z to the right, so the
// left lamps are at negative z; positions are given for the right side.
export const signalLamps = Object.freeze([
  // Width across (z), height (y); ray start and direction; surfaces to hit.
  {
    name: 'front',
    size: [0.13, 0.012],
    from: [2.8, 0.13, 0.62],
    dir: [-1, 0, 0],
    // The headlight's cover glass.
    onto: ['Object_49'],
  },
  { name: 'mirror', size: [0.15, 0.009], from: [1.2, 0.392, 0.975], dir: [-1, 0, 0], onto: null },
  {
    name: 'rear',
    size: [0.13, 0.016],
    from: [-3.2, 0.262, 0.62],
    dir: [1, 0, 0],
    onto: ['BrakeLamp_Left', 'BrakeLamp_Right'],
  },
]);

export function setupSignalLamps(rig) {
  const lit = { left: [], right: [] };
  const materials = {};
  rig.body.updateMatrixWorld(true);
  const toBody = new THREE.Matrix4().copy(rig.body.matrixWorld).invert();
  const toWorld = rig.body.matrixWorld;
  const raycaster = new THREE.Raycaster();
  const meshes = [];
  rig.body.traverse((o) => o.isMesh && o.visible && meshes.push(o));
  for (const side of ['left', 'right']) {
    materials[side] = new THREE.MeshStandardMaterial({
      name: `Turn signal ${side}`,
      color: 0x3a2508,
      emissive: 0xff7a0a,
      emissiveIntensity: 0,
      roughness: 0.3,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const sign = side === 'left' ? -1 : 1;
    for (const lamp of signalLamps) {
      const from = new THREE.Vector3(lamp.from[0], lamp.from[1], sign * lamp.from[2]);
      const dir = new THREE.Vector3(...lamp.dir);
      raycaster.set(from.clone().applyMatrix4(toWorld), dir.clone().transformDirection(toWorld));
      const targets = lamp.onto ? meshes.filter((m) => lamp.onto.includes(m.name)) : meshes;
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (!hit) continue;
      const point = hit.point.applyMatrix4(toBody);
      // Facing back along the ray, onto the surface.
      const normal = dir.clone().negate();
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(lamp.size[0], lamp.size[1]),
        materials[side]
      );
      mesh.name = `Turn signal ${side} ${lamp.name}`;
      mesh.position.copy(point).addScaledVector(normal, 0.004);
      mesh.lookAt(mesh.position.clone().add(normal));
      mesh.visible = false;
      rig.body.add(mesh);
      lit[side].push(mesh);
    }
  }
  return {
    lit,
    // The strips show only while lit: the lenses are clear when off.
    update(signals) {
      const on = signals.lit;
      for (const side of ['left', 'right']) {
        const shown = on && signals.side === side;
        materials[side].emissiveIntensity = shown ? 9 : 0;
        for (const mesh of lit[side]) mesh.visible = shown;
      }
    },
  };
}
