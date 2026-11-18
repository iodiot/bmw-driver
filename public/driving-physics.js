import { roadHeight } from './road-profile.js';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
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
    this.reset();
  }
  reset() {
    Object.assign(this, {
      x: 0,
      z: 0,
      heading: 0,
      speed: 8.333333,
      steer: 0,
      roll: 0,
      rollVelocity: 0,
      pitch: 0,
      pitchVelocity: 0,
      heave: 0,
      heaveVelocity: 0,
      acceleration: 0,
      yawRate: 0,
      distance: 0,
      pedalUsed: false,
    });
    this.wheels = this.layout.map((w) => ({
      ...w,
      offset: 0,
      velocity: 0,
      ground: 0,
      compression: 0,
      contact: true,
    }));
  }
  step(dt, input = {}, enabled = true) {
    if (!enabled) return this;
    dt = clamp(dt, 0, 1 / 15);
    const steps = Math.max(1, Math.ceil(dt * 240)),
      h = dt / steps;
    for (let i = 0; i < steps; i++) this.integrate(h, input);
    return this;
  }
  integrate(dt, input) {
    if (input.accelerate || input.brake) this.pedalUsed = true;
    const previousSpeed = this.speed;
    const acceleration = input.brake
      ? -15
      : input.accelerate
        ? 6.2 * (1 - this.speed / 55)
        : this.pedalUsed
          ? -0.18 - 0.0009 * this.speed * this.speed
          : 0;
    this.speed = clamp(this.speed + acceleration * dt, 0, 44.4444);
    this.acceleration = (this.speed - previousSpeed) / dt;
    const limit = Math.min(
      (25 * Math.PI) / 180,
      Math.atan((8.5 * this.wheelbase) / (this.speed * this.speed + 1))
    );
    this.steer +=
      (((input.left ? 1 : 0) - (input.right ? 1 : 0)) * limit - this.steer) *
      (1 - Math.exp(-6.5 * dt));
    this.yawRate = (this.speed / this.wheelbase) * Math.tan(this.steer);
    this.heading += this.yawRate * dt;
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.z -= Math.sin(this.heading) * this.speed * dt;
    this.distance += this.speed * dt;
    const c = Math.cos(this.heading),
      s = Math.sin(this.heading);
    const mass = 1650,
      wheelMass = 45,
      k = 36000,
      damping = 2400,
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
      w.velocity += ((tyre - suspension) / wheelMass) * dt;
      w.offset += w.velocity * dt;
      w.compression = relative;
      force += suspension;
      rollTorque -= suspension * w.z;
      pitchTorque += suspension * w.x;
    }
    const rollTarget = clamp(Math.atan((this.speed * this.yawRate) / 9.81) * 0.14, -0.075, 0.075);
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
