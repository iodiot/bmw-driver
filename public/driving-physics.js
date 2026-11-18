import { roadHeight } from './road-profile.js';
import { M5Powertrain, m5Specifications } from './powertrain.js';
import { TyreDynamics } from './tyre-dynamics.js';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const suspensionSpecifications = Object.freeze({
  sprungMass: 1650,
  wheelMass: 45,
  springRate: 36000,
  dampingRate: 2400,
});
export const wheelLayout = [
  { name: 'Steering_Left', x: 1.482, z: 0.8135, r: 0.34675 },
  { name: 'Steering_Right', x: 1.482, z: -0.8135, r: 0.34675 },
  { name: 'Rear_mount_Left', x: -1.482, z: 0.791, r: 0.3425 },
  { name: 'Rear_mount_Right', x: -1.482, z: -0.791, r: 0.3425 },
];
export class DrivingSimulation {
  constructor(layout = wheelLayout) {
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
      distance: 0,
      pedalUsed: false,
      brakeEnergy: 0,
      brakePressure: 0,
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
    for (let i = 0; i < steps; i++) this.integrate(h, input, raining);
    return this;
  }
  integrate(dt, input, raining) {
    if (input.accelerate || input.brake) this.pedalUsed = true;
    const previousSpeed = this.speed;
    // A keyboard tap is a light pedal application; holding builds full braking
    // effort in 0.4 s. Releasing the key releases the pedal immediately.
    this.brakePressure = input.brake ? Math.min(1, this.brakePressure + dt * 2.5) : 0;
    const acceleration =
      this.powertrain.step(dt, this.speed, input, !this.pedalUsed) *
      (input.brake ? this.brakePressure : 1);
    const limit = Math.min(
      (25 * Math.PI) / 180,
      Math.atan((8.5 * this.wheelbase) / (this.speed * this.speed + 1))
    );
    this.steer +=
      (((input.left ? 1 : 0) - (input.right ? 1 : 0)) * limit - this.steer) *
      (1 - Math.exp(-6.5 * dt));
    const tyres = this.tyres.step(dt, this, input, raining, acceleration);
    this.speed = clamp(this.speed + tyres.acceleration * dt, 0, m5Specifications.topSpeed);
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
          roadHeight(x + cx * dx, z - sz * dx) - (w.r - Math.sqrt(w.r * w.r - dx * dx))
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
