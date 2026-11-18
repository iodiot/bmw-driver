// Approximate two-node iron-rotor thermal model, not BMW temperature telemetry.
// The friction surface warms faster than the disc core; both retain energy.
export class BrakeHeatState {
  constructor() {
    this.reset();
  }

  reset() {
    this.discs = Array.from({ length: 4 }, () => ({ surface: 20, core: 20 }));
  }

  step(dt, { energy = 0, speed = 0, raining = false } = {}) {
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 15);
    const steps = Math.ceil(dt * 240),
      h = dt / steps;
    for (let step = 0; step < steps; step++) {
      this.discs.forEach((disc, i) => {
        const front = i < 2;
        const share = (front ? 0.7 : 0.3) / 2;
        const surfaceCapacity = front ? 1600 : 1050;
        const coreCapacity = front ? 4400 : 2900;
        const area = front ? 0.17 : 0.15;
        const transfer = (front ? 220 : 170) * (disc.surface - disc.core);
        const convection = (14 + 5 * Math.sqrt(Math.max(0, speed)) + (raining ? 28 : 0)) * area;
        const radiation =
          0.72 * 5.670374419e-8 * area * ((disc.surface + 273.15) ** 4 - 293.15 ** 4);
        const surfaceLoss = convection * (disc.surface - 20) + radiation;
        const coreLoss = (8 + 1.2 * Math.sqrt(Math.max(0, speed))) * (disc.core - 20);
        const deposited = (Math.max(0, energy) * 0.9 * share) / steps;
        disc.surface += (deposited - (transfer + surfaceLoss) * h) / surfaceCapacity;
        disc.core += ((transfer - coreLoss) * h) / coreCapacity;
        disc.surface = Math.max(20, Math.min(1200, disc.surface));
        disc.core = Math.max(20, Math.min(1200, disc.core));
      });
    }
  }
}

export function brakeGlow(temperature) {
  const x = Math.max(0, Math.min(1, (temperature - 480) / 430));
  return x * x * (3 - 2 * x);
}
