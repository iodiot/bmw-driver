import {
  road,
  roadCenterZ,
  roadLateral,
  guardrailsAt,
  guardrailSlope as railSlope,
  railFaceGap,
  surfaces,
} from './road-profile.js';
import { M5Powertrain, m5Specifications } from './powertrain.js';
import { TyreDynamics } from './tyre-dynamics.js';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const suspensionSpecifications = Object.freeze({
  sprungMass: 1650,
  wheelMass: 45,
  springRate: 36000,
  dampingRate: 2400,
});
// Reverse gear: up to 25 km/h, pulling away at about 3 m/s²; selected by
// pressing the brake again at a standstill, or holding it this long.
export const reverseGear = Object.freeze({ topSpeed: 25 / 3.6, acceleration: 3.2, engage: 0.25 });
export const wheelLayout = [
  { name: 'Steering_Left', x: 1.482, z: 0.8135, r: 0.34675 },
  { name: 'Steering_Right', x: 1.482, z: -0.8135, r: 0.34675 },
  { name: 'Rear_mount_Left', x: -1.482, z: 0.791, r: 0.3425 },
  { name: 'Rear_mount_Right', x: -1.482, z: -0.791, r: 0.3425 },
];
// Body outline points (body axes: +x forward, z sideways) checked against
// the guardrails: bumper corners and the widest point of each side.
const bodyCorners = [
  [2.4, 0.9],
  [2.4, -0.9],
  [-2.42, 0.9],
  [-2.42, -0.9],
  [0.3, 0.95],
  [0.3, -0.95],
];
export class DrivingSimulation {
  // `surface` is the road by default; vehicle tests pass the straight track.
  constructor(layout = wheelLayout, surface = road) {
    this.surface = surface;
    this.layout = layout.map((w) => ({ ...w }));
    this.wheelbase = Math.max(...layout.map((w) => w.x)) - Math.min(...layout.map((w) => w.x));
    this.powertrain = new M5Powertrain();
    this.tyres = new TyreDynamics(this.layout, m5Specifications.mass);
    this.reset();
  }
  reset(speed = 30 / 3.6) {
    Object.assign(this, {
      x: 0,
      z: 0,
      heading: 0,
      speed,
      steer: 0,
      roll: 0,
      rollVelocity: 0,
      pitch: 0,
      pitchVelocity: 0,
      heave: 0,
      heaveVelocity: 0,
      acceleration: 0,
      yawRate: 0,
      lateralVelocity: 0,
      lateralAcceleration: 0,
      slipAngle: 0,
      tractionLoss: 0,
      dscActive: false,
      // DSC switched off by the driver (kept through a reset).
      dscOff: this.dscOff ?? false,
      distance: 0,
      pedalUsed: false,
      brakeEnergy: 0,
      brakePressure: 0,
      railContact: null,
      surfaceGrip: 1,
      surfaceRolling: 0.013,
      surfaceName: 'asphalt',
      reversing: false,
      directionHold: 0,
      directionArmed: false,
    });
    this.powertrain.reset(this.speed);
    this.tyres.reset();
    this.wheels = this.layout.map((w) => ({
      ...w,
      offset: 0,
      velocity: 0,
      ground: 0,
      compression: 0,
      compressionVelocity: 0,
      damperForce: 0,
      staticLoad:
        (suspensionSpecifications.sprungMass / 4 + suspensionSpecifications.wheelMass) * 9.81,
      load: (suspensionSpecifications.sprungMass / 4 + suspensionSpecifications.wheelMass) * 9.81,
      contact: true,
      slip: 0,
    }));
  }
  step(dt, input = {}, enabled = true, { raining = false } = {}) {
    if (!enabled || dt <= 0) return this;
    dt = clamp(dt, 0, 1 / 15);
    const steps = Math.max(1, Math.ceil(dt * 240)),
      h = dt / steps;
    // Strongest guardrail contact during this step, for sparks and telemetry.
    this.railContact = null;
    // Each wheel's highest load during this step (a pothole's edge loads a
    // tyre for only a few hundredths of a second).
    for (const w of this.wheels) w.peakLoad = w.load;
    for (let i = 0; i < steps; i++) this.integrate(h, input, raining);
    return this;
  }

  // Keeps the body inside the guardrails. Corners of the body that cross a
  // rail face push the car back; velocity into the rail is removed with a
  // small rebound, the rail scrapes speed off along its length, and the car
  // swings toward the rail's direction. Rails come from the road layout, so
  // the branch road's rails work the same as the main road's.
  collideWithGuardrails(dt) {
    const railTouch = 0.03;
    const c = Math.cos(this.heading),
      s = Math.sin(this.heading);
    const centreLateral = roadLateral(this.x, this.z);
    let deepest = null;
    for (const [lx, lz] of bodyCorners) {
      const x = this.x + c * lx + s * lz,
        z = this.z - s * lx + c * lz,
        lateral = z - roadCenterZ(x);
      for (const rail of guardrailsAt(x)) {
        // The side of the rail the car is on: its traffic side, or for a
        // rail with traffic on both sides, wherever the car's centre is.
        const traffic = rail.traffic || Math.sign(centreLateral - rail.lateral) || 1;
        // Only the rail beside the car, not one across the field.
        if (Math.abs(centreLateral - rail.lateral) > 4) continue;
        // Within a few centimetres the body still rubs the rail: sparks fly,
        // but only a corner that crosses the face is pushed back.
        const depth = railFaceGap - traffic * (lateral - rail.lateral);
        if (depth > -railTouch && (!deepest || depth > deepest.depth))
          deepest = { x, side: -traffic, depth, rail: rail.lateral };
      }
    }
    if (!deepest) return;
    const { side } = deepest,
      depth = Math.max(0, deepest.depth);
    // Pushed out at up to 12 m/s: a rail that begins inside the car (where
    // the rails open for the country road and close again) or a deep hit
    // eases the car out over a few frames instead of moving it at once.
    this.z -= side * Math.min(depth, 12 * dt);
    // World velocity, rail normal (pointing into the rail) and rail tangent.
    const k = railSlope(deepest.x, deepest.rail),
      norm = Math.hypot(1, k);
    const nx = (-side * k) / norm,
      nz = side / norm,
      tx = 1 / norm,
      tz = k / norm;
    let vx = c * this.speed - s * this.lateralVelocity,
      vz = -(s * this.speed + c * this.lateralVelocity);
    const into = vx * nx + vz * nz;
    let along = vx * tx + vz * tz;
    const impact = Math.max(0, into);
    // Rebound of 15%; Coulomb friction from the impact plus steady scraping.
    const friction = Math.min(Math.abs(along), 0.45 * 1.15 * impact + 4 * dt);
    along -= Math.sign(along) * friction;
    const normal = into > 0 ? -0.15 * into : into;
    vx = along * tx + normal * nx;
    vz = along * tz + normal * nz;
    this.speed = Math.max(0, c * vx - s * vz);
    this.lateralVelocity = -s * vx - c * vz;
    this.tyres.lateralVelocity = this.lateralVelocity;
    // Turn toward the rail's direction and damp the spin.
    const railHeading = -Math.atan(k),
      turn = Math.atan2(Math.sin(railHeading - this.heading), Math.cos(railHeading - this.heading));
    if (Math.abs(turn) < Math.PI / 2) this.heading += turn * Math.min(1, 0.04 * impact + 2 * dt);
    this.yawRate *= Math.exp(-6 * dt) * (impact > 0 ? 0.7 : 1);
    this.tyres.yawRate = this.yawRate;
    const strength = impact + 0.25 * Math.abs(along) * Math.min(1, depth * 40 + 0.4);
    // Merely touching at walking pace makes no sparks.
    if (deepest.depth <= 0 && Math.abs(along) < 1) return;
    if (!this.railContact || strength > this.railContact.strength)
      this.railContact = {
        x: deepest.x,
        z: roadCenterZ(deepest.x) + deepest.rail - side * railFaceGap,
        side,
        impact,
        scrape: Math.abs(along),
        strength,
        velocityX: vx,
        velocityZ: vz,
        // The rail's direction (dz/dx), for how much of the side it touches.
        railSlope: k,
      };
  }
  // Grip and rolling resistance from what each wheel stands on, averaged:
  // two wheels on the gravel pull at the car and cost part of its grip.
  readSurface() {
    const at = this.surface.surfaceAt;
    const c = Math.cos(this.heading),
      s = Math.sin(this.heading),
      wet = this.tyres.wetness;
    let grip = 0,
      rolling = 0;
    for (const w of this.wheels) {
      w.surface = at ? at(this.x + c * w.x + s * w.z, this.z - s * w.x + c * w.z) : 'asphalt';
      const kind = surfaces[w.surface];
      // Relative to the tyre model's own asphalt grip at this wetness.
      grip += (kind.grip + (kind.wetGrip - kind.grip) * wet) / (1 + (0.536 - 1) * wet);
      rolling += kind.rolling;
    }
    // (`gripScale`: less on snow and ice in winter.)
    this.surfaceGrip = (grip / this.wheels.length) * (this.gripScale ?? 1);
    this.surfaceRolling = rolling / this.wheels.length;
    this.surfaceName = at ? at(this.x, this.z) : 'asphalt';
  }
  // Reverse, as in a driving game: holding the brake brings the car to a
  // stop and, a moment later, backs it up; the accelerator brakes it and
  // then drives forward again. (A fresh press at a standstill switches at
  // once.)
  selectDirection(dt, input) {
    const pedal = this.reversing
      ? input.accelerate && !input.brake
      : input.brake && !input.accelerate;
    if (this.speed >= 0.15) {
      this.directionArmed = false;
      this.directionHold = 0;
      return;
    }
    if (!pedal) {
      this.directionArmed = true;
      this.directionHold = 0;
      return;
    }
    this.directionHold += dt;
    if (this.directionHold >= (this.directionArmed ? 0.12 : reverseGear.engage)) {
      this.reversing = !this.reversing;
      this.directionHold = 0;
      this.directionArmed = false;
      this.brakePressure = 0;
      this.powertrain.reset(0);
    }
  }
  // The road's grade in the direction the car faces (rising ahead > 0).
  gradeAhead() {
    return (this.surface.grade?.(this.x) ?? 0) * Math.cos(this.heading);
  }
  // Speed along the car's heading: negative while reversing.
  get forwardSpeed() {
    return this.reversing ? -this.speed : this.speed;
  }
  // The gear shown on the cluster.
  get gearLabel() {
    return this.reversing ? 'R' : `D${this.powertrain.gear}`;
  }
  // In reverse the brake pedal (S) drives the car backward, up to walking
  // pace and a little more, and the accelerator (W) brakes. At these
  // speeds the tyres do not slide: the car turns about its rear axle, the
  // opposite way to going forward.
  driveBackward(dt, input) {
    const previousSpeed = this.speed,
      { topSpeed, acceleration: pull } = reverseGear;
    this.brakePressure = input.accelerate ? Math.min(1, this.brakePressure + dt * 2.5) : 0;
    this.readSurface();
    const rolling =
      this.speed > 0 ? 0.3 + Math.max(0, this.surfaceRolling - surfaces.asphalt.rolling) * 9.81 : 0;
    const acceleration =
      (input.brake ? pull * (1 - this.speed / topSpeed) : 0) - 8 * this.brakePressure - rolling;
    this.speed = clamp(
      this.speed +
        (acceleration + 9.81 * this.gradeAhead() * (this.speed > 0 || input.brake ? 1 : 0)) * dt,
      0,
      topSpeed
    );
    const lock = (25 * Math.PI) / 180;
    const steerTarget =
      Number.isFinite(input.steerAxis) && input.steerAxis !== 0
        ? clamp(input.steerAxis, -1, 1) * lock
        : ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * lock;
    this.steer += (steerTarget - this.steer) * (1 - Math.exp(-6.5 * dt));
    this.yawRate = (-this.speed * Math.tan(this.steer)) / this.wheelbase;
    this.lateralVelocity *= Math.exp(-8 * dt);
    this.lateralAcceleration = -this.speed * this.yawRate;
    this.slipAngle = 0;
    this.tractionLoss = 0;
    this.dscActive = false;
    this.tyres.yawRate = this.yawRate;
    this.tyres.lateralVelocity = this.lateralVelocity;
    // Along the heading, so the body pitches the right way.
    this.acceleration = -(this.speed - previousSpeed) / dt;
    if (input.accelerate)
      this.brakeEnergy +=
        0.5 * m5Specifications.mass * (previousSpeed * previousSpeed - this.speed * this.speed);
    this.heading += this.yawRate * dt;
    this.x +=
      (-Math.cos(this.heading) * this.speed - Math.sin(this.heading) * this.lateralVelocity) * dt;
    this.z -=
      (-Math.sin(this.heading) * this.speed + Math.cos(this.heading) * this.lateralVelocity) * dt;
    this.distance += this.speed * dt;
    // The engine turns with the wheels in R (its ratio is close to first's).
    this.powertrain.rpm = Math.max(800, this.powertrain.rpmForSpeed(this.speed, 1));
    if (this.surface.guardrails) {
      // Against a rail the car stops.
      const backward = this.speed;
      this.speed = -backward;
      this.collideWithGuardrails(dt);
      this.speed = this.speed === -backward ? backward : 0;
    }
  }
  driveForward(dt, input, raining) {
    const previousSpeed = this.speed;
    // A keyboard tap is a light pedal application; holding builds full braking
    // effort in 0.4 s. Releasing the key releases the pedal immediately.
    this.brakePressure = input.brake ? Math.min(1, this.brakePressure + dt * 2.5) : 0;
    let acceleration =
      this.powertrain.step(dt, this.speed, input, !this.pedalUsed) *
      (input.brake ? this.brakePressure : 1);
    // Cruise control for self-driving: eases toward the set speed (gently up,
    // firmer down for a bend, or as hard as `cruiseAccel` and `cruiseBrake`
    // allow, and as promptly as `cruiseGain` asks) until the driver touches
    // a pedal.
    if (Number.isFinite(input.cruiseSpeed) && !this.pedalUsed)
      acceleration = clamp(
        (input.cruiseSpeed - this.speed) * (input.cruiseGain ?? 0.5),
        -(input.cruiseBrake ?? 2.5),
        input.cruiseAccel ?? 1.8
      );
    // With DSC off the driver has more lock at speed, to throw the car into
    // a slide and catch it.
    const limit = Math.min(
      (25 * Math.PI) / 180,
      Math.atan(((this.dscOff ? 30 : 8.5) * this.wheelbase) / (this.speed * this.speed + 1))
    );
    // Keys steer to the speed-dependent lock; lane keeping may request a
    // continuous angle instead, within the same limit.
    // Its smooth, small corrections tolerate more lock at speed than key taps.
    const assistLimit = Math.min(
      (25 * Math.PI) / 180,
      Math.atan((45 * this.wheelbase) / (this.speed * this.speed + 1))
    );
    // A stick or the touch wheel gives `steerAxis` (-1 right … 1 left), a
    // share of the same lock.
    const steerTarget = Number.isFinite(input.steerAngle)
      ? clamp(input.steerAngle, -assistLimit, assistLimit)
      : Number.isFinite(input.steerAxis) && input.steerAxis !== 0
        ? clamp(input.steerAxis, -1, 1) * limit
        : ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * limit;
    this.steer += (steerTarget - this.steer) * (1 - Math.exp(-6.5 * dt));
    this.readSurface();
    const tyres = this.tyres.step(dt, this, input, raining, acceleration);
    this.speed = clamp(this.speed + tyres.acceleration * dt, 0, m5Specifications.topSpeed);
    // Loose and soft ground drags more than asphalt (whose rolling resistance
    // the powertrain already includes).
    const extraRolling = this.surfaceRolling - surfaces.asphalt.rolling;
    if (extraRolling > 0 && this.speed > 0)
      this.speed = Math.max(0, this.speed - extraRolling * 9.81 * (1 + this.speed / 40) * dt);
    // Up a hill gravity holds the car back, down one it runs on.
    this.speed = clamp(this.speed - 9.81 * this.gradeAhead() * dt, 0, m5Specifications.topSpeed);
    if (input.brake)
      this.brakeEnergy +=
        0.5 * m5Specifications.mass * (previousSpeed * previousSpeed - this.speed * this.speed);
    this.acceleration = (this.speed - previousSpeed) / dt;
    this.yawRate = tyres.yawRate;
    this.lateralVelocity = tyres.lateralVelocity;
    this.lateralAcceleration = tyres.lateralAcceleration;
    this.slipAngle = tyres.slipAngle;
    this.tractionLoss = tyres.tractionLoss;
    this.dscActive = tyres.dscActive;
    this.heading += this.yawRate * dt;
    this.x +=
      (Math.cos(this.heading) * this.speed - Math.sin(this.heading) * this.lateralVelocity) * dt;
    this.z -=
      (Math.sin(this.heading) * this.speed + Math.cos(this.heading) * this.lateralVelocity) * dt;
    this.distance += Math.hypot(this.speed, this.lateralVelocity) * dt;
    if (this.surface.guardrails) this.collideWithGuardrails(dt);
  }
  integrate(dt, input, raining) {
    if (input.accelerate || input.brake) this.pedalUsed = true;
    this.selectDirection(dt, input);
    if (this.reversing) this.driveBackward(dt, input);
    else this.driveForward(dt, input, raining);
    const c = Math.cos(this.heading),
      s = Math.sin(this.heading);
    const mass = suspensionSpecifications.sprungMass,
      wheelMass = suspensionSpecifications.wheelMass,
      k = suspensionSpecifications.springRate,
      damping = suspensionSpecifications.dampingRate,
      tyreK = 210000,
      tyreD = 180;
    let force = 0,
      rollTorque = 0,
      pitchTorque = 0;
    for (const w of this.wheels) {
      const x = this.x + c * w.x + s * w.z,
        z = this.z - s * w.x + c * w.z;
      // Approximate the circular tyre envelope, so a wheel bridges a small hole
      // instead of blindly following the height at its centre.
      const yaw = this.heading + (w.x > 0 ? this.steer : 0),
        cx = Math.cos(yaw),
        sz = Math.sin(yaw);
      let ground = -Infinity;
      for (const fraction of [-0.6, -0.3, 0, 0.3, 0.6]) {
        const dx = w.r * fraction;
        ground = Math.max(
          ground,
          this.surface.height(x + cx * dx, z - sz * dx) - (w.r - Math.sqrt(w.r * w.r - dx * dx))
        );
      }
      const groundVelocity = (ground - w.ground) / dt;
      w.ground = ground;
      const body = this.heave + this.pitch * w.x - this.roll * w.z;
      const bodyV = this.heaveVelocity + this.pitchVelocity * w.x - this.rollVelocity * w.z;
      const relative = w.offset - body,
        relativeV = w.velocity - bodyV;
      let suspension = k * relative + damping * relativeV;
      // Progressive compression stop keeps the tyre inside the visible arch.
      if (relative > 0.04) suspension += 1200000 * (relative - 0.04) + 900 * Math.max(relativeV, 0);
      if (relative < -0.11) suspension += 180000 * (relative + 0.11);
      // Static load is already balanced at rest. Limiting the dynamic tyre force
      // prevents the ground from pulling a wheel down after a sharp crest.
      const staticLoad = (mass / 4 + wheelMass) * 9.81;
      const rawTyre = tyreK * (ground - w.offset) + tyreD * (groundVelocity - w.velocity);
      const tyre = Math.max(-staticLoad, rawTyre);
      w.contact = rawTyre > -staticLoad;
      w.load = staticLoad + tyre;
      w.peakLoad = Math.max(w.peakLoad ?? w.load, w.load);
      w.damperForce = damping * relativeV;
      w.compressionVelocity = relativeV;
      w.velocity += ((tyre - suspension) / wheelMass) * dt;
      w.offset += w.velocity * dt;
      w.compression = relative;
      force += suspension;
      rollTorque -= suspension * w.z;
      pitchTorque += suspension * w.x;
    }
    const rollTarget = clamp(Math.atan(this.lateralAcceleration / 9.81) * 0.14, -0.075, 0.075);
    const pitchTarget = clamp(this.acceleration * 0.003, -0.035, 0.025);
    const rollStiffness = k * this.layout.reduce((sum, w) => sum + w.z * w.z, 0);
    const pitchStiffness = k * this.layout.reduce((sum, w) => sum + w.x * w.x, 0);
    this.heaveVelocity += (force / mass) * dt;
    this.heave += this.heaveVelocity * dt;
    this.rollVelocity += ((rollTorque + rollStiffness * rollTarget) / 650) * dt;
    this.roll += this.rollVelocity * dt;
    this.pitchVelocity += ((pitchTorque + pitchStiffness * pitchTarget) / 3000) * dt;
    this.pitch += this.pitchVelocity * dt;
  }
}
