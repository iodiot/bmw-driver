const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Standard F10 M5, not Competition or the optional M Driver's Package.
// BMW launch specifications: 412 kW, 680 Nm, 250 km/h, 0–100/200 in 4.4/13.0 s.
// Ratios, EU mass, aero and tyres: BMW M5 technical data, February 2012.
export const m5Specifications = Object.freeze({
  power: 412000,
  torque: 680,
  mass: 1945,
  dragArea: 0.33 * 2.4,
  wheelRadius: (0.508 + 2 * 0.295 * 0.3) / 2,
  gearRatios: Object.freeze([4.806, 2.593, 1.701, 1.277, 1, 0.844, 0.671]),
  finalDrive: 3.154,
  redline: 7200,
  topSpeed: 250 / 3.6,
});

export function engineTorque(rpm) {
  const { torque, power, redline } = m5Specifications;
  if (rpm < 1500) return 400 + (torque - 400) * clamp((rpm - 800) / 700, 0, 1);
  if (rpm <= 5750) return torque;
  if (rpm < 6000) {
    const ratedTorque = power / ((6000 * Math.PI) / 30);
    return torque + (ratedTorque - torque) * ((rpm - 5750) / 250);
  }
  if (rpm <= 7000) return power / ((rpm * Math.PI) / 30);
  if (rpm < redline)
    return (power / ((7000 * Math.PI) / 30)) * (1 - (rpm - 7000) / (redline - 7000));
  return 0;
}

export class M5Powertrain {
  constructor() {
    this.reset(30 / 3.6);
  }

  reset(speed = 0) {
    this.gear = 1;
    this.targetGear = 1;
    this.shiftRemaining = 0;
    this.shiftDuration = 0;
    this.shiftCooldown = 0;
    while (this.gear < 7 && this.rpmForSpeed(speed, this.gear + 1) >= 1200) this.gear++;
    this.targetGear = this.gear;
    this.rpm = Math.max(800, this.rpmForSpeed(speed, this.gear));
  }

  rpmForSpeed(speed, gear) {
    const { wheelRadius, gearRatios, finalDrive } = m5Specifications;
    return (Math.max(0, speed) / wheelRadius) * gearRatios[gear - 1] * finalDrive * (30 / Math.PI);
  }

  shiftTo(gear) {
    this.targetGear = gear;
    this.shiftDuration = gear > this.gear ? 0.12 : 0.18;
    this.shiftRemaining = this.shiftDuration;
  }

  step(dt, speed, { accelerate = false, brake = false } = {}, cruise = false) {
    if (dt <= 0) return 0;
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    if (this.shiftRemaining > 0) {
      this.shiftRemaining = Math.max(0, this.shiftRemaining - dt);
      if (this.shiftRemaining === 0) {
        this.gear = this.targetGear;
        this.shiftCooldown = 0.25;
      }
    }
    const fullThrottle = accelerate && !brake;
    const wheelRpm = this.rpmForSpeed(speed, this.gear);
    if (this.shiftRemaining === 0 && this.shiftCooldown === 0) {
      let desired = this.gear;
      if (fullThrottle) {
        if (wheelRpm >= 7000 && this.gear < 7) desired++;
        else {
          // Kick down to the strongest usable gear, avoiding an immediate upshift.
          for (let gear = 1; gear < this.gear; gear++) {
            if (this.rpmForSpeed(speed, gear) < 6600) {
              desired = gear;
              break;
            }
          }
        }
      } else if (speed < 1) desired = 1;
      else if (this.gear > 1 && wheelRpm < 1050) desired--;
      else if (this.gear < 7 && wheelRpm > 2200 && this.rpmForSpeed(speed, this.gear + 1) > 1200)
        desired++;
      if (desired !== this.gear) this.shiftTo(desired);
    }

    const shiftProgress =
      this.shiftRemaining > 0 ? 1 - this.shiftRemaining / this.shiftDuration : 0;
    const coupledRpm =
      wheelRpm + (this.rpmForSpeed(speed, this.targetGear) - wheelRpm) * shiftProgress;
    // Clutch slip lets the engine build launch torque without stalling at rest.
    this.rpm = clamp(
      Math.max(fullThrottle ? 3000 : 800, coupledRpm),
      800,
      m5Specifications.redline
    );

    const { mass, dragArea, wheelRadius, gearRatios, finalDrive, topSpeed } = m5Specifications;
    const rolling = mass * 9.81 * 0.013;
    const aero = 0.5 * 1.225 * dragArea * speed * speed;
    const resistance = rolling + aero;
    if (brake) return -15;
    if (cruise && !fullThrottle) return 0;
    if (!fullThrottle) {
      const engineBraking =
        speed > 1
          ? ((25 + this.rpm * 0.004) * gearRatios[this.gear - 1] * finalDrive) / wheelRadius
          : 0;
      return -(resistance + engineBraking) / mass;
    }

    // Losses, rotating inertia, traction and clutch overlap are calibrated model
    // assumptions, fitted to BMW's launch sprint times, not factory measurements.
    const efficiency = 0.823;
    const wheelForce =
      (engineTorque(this.rpm) * gearRatios[this.gear - 1] * finalDrive * efficiency) / wheelRadius;
    const tractionLimit = mass * 6.82;
    const shiftFactor = this.shiftRemaining > 0 ? 0.65 : 1;
    const driveForce = Math.min(wheelForce, tractionLimit) * shiftFactor;
    const limiter = clamp((topSpeed - speed) / 0.45, 0, 1);
    return ((driveForce - resistance) / (mass * 1.035)) * limiter;
  }
}
