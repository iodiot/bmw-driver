const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = (low, high, value) => {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
};

// Tuned visual driving model, not measured BMW tyre or DSC calibration.
// Body axes: +X forward; positive lateral velocity and yaw turn towards -Z.
export class TyreDynamics {
  constructor(layout, mass) {
    this.front = Math.max(...layout.map((w) => w.x));
    this.rear = -Math.min(...layout.map((w) => w.x));
    this.wheelbase = this.front + this.rear;
    this.mass = mass;
    this.inertia = mass * 1.8;
    this.reset();
  }

  reset() {
    Object.assign(this, {
      lateralVelocity: 0,
      yawRate: 0,
      lateralAcceleration: 0,
      slipAngle: 0,
      frontSlip: 0,
      rearSlip: 0,
      tractionLoss: 0,
      intervention: 0,
      dscActive: false,
      dscHold: 0,
      wetness: 0,
      acceleration: 0,
    });
  }

  step(dt, state, input, raining, requestedAcceleration) {
    this.wetness += ((raining ? 1 : 0) - this.wetness) * (1 - Math.exp(-dt / 0.6));
    // Asphalt grip, dry to wet, scaled for what the wheels stand on.
    const mu = (1.12 - 0.52 * this.wetness) * (state.surfaceGrip ?? 1);
    const speed = state.speed;
    const dynamic = smooth(2, 6, speed);
    const throttle = input.accelerate && !input.brake;
    const weight = this.mass * 9.81;
    const rearFraction = clamp(
      this.front / this.wheelbase + (requestedAcceleration * 0.55) / (9.81 * this.wheelbase),
      0.25,
      0.78
    );
    const frontNormal = weight * (1 - rearFraction);
    const rearNormal = weight * rearFraction;
    const cornerDemand = Math.abs((speed * speed * Math.tan(state.steer)) / this.wheelbase);
    const reserveFactor = input.brake ? 0.9 : 0.65 - this.wetness * 0.25;
    const lateralReserve = clamp((cornerDemand * reserveFactor) / (mu * 9.81), 0, 0.88);
    const combinedBudget = Math.sqrt(1 - lateralReserve * lateralReserve);
    const longitudinalLimit =
      (input.brake ? mu * 9.81 * 0.94 : (mu * rearNormal) / this.mass) * combinedBudget;
    this.acceleration = clamp(requestedAcceleration, -longitudinalLimit, longitudinalLimit);
    const driveExcess = throttle
      ? clamp((requestedAcceleration - this.acceleration) / Math.max(longitudinalLimit, 1), 0, 1)
      : 0;

    // Combined grip: accelerating the rear wheels or braking uses some of each
    // axle's finite friction budget, leaving less force available for cornering.
    const longitudinal = this.acceleration * this.mass;
    const frontLongitudinal = input.brake ? longitudinal * (1 - rearFraction) : 0;
    // With DSC off a wheelspinning rear axle uses its grip on driving: all
    // that the engine asks for, up to the whole budget, so the throttle can
    // kick the tail out (power oversteer), as on the real rear-drive car.
    const spin =
      state.dscOff && throttle ? Math.min(requestedAcceleration * this.mass, mu * rearNormal) : 0;
    const rearLongitudinal = input.brake
      ? longitudinal * rearFraction
      : Math.max(0, longitudinal, spin);
    let frontSupport = 0,
      rearSupport = 0,
      frontCount = 0,
      rearCount = 0;
    for (const wheel of state.wheels) {
      const support = wheel.contact ? clamp(wheel.load / wheel.staticLoad, 0, 1.35) : 0;
      if (wheel.x > 0) {
        frontSupport += support;
        frontCount++;
      } else {
        rearSupport += support;
        rearCount++;
      }
    }
    const lateralBudget = (normal, longitudinalForce, support) =>
      Math.sqrt(Math.max((mu * normal) ** 2 - longitudinalForce ** 2, (mu * normal * 0.16) ** 2)) *
      clamp(support, 0, 1);
    const frontLimit = lateralBudget(frontNormal, frontLongitudinal, frontSupport / frontCount);
    const rearLimit = lateralBudget(rearNormal, rearLongitudinal, rearSupport / rearCount);
    this.frontSlip =
      state.steer -
      Math.atan2(this.lateralVelocity + this.front * this.yawRate, Math.max(speed, 3));
    this.rearSlip = -Math.atan2(
      this.lateralVelocity - this.rear * this.yawRate,
      Math.max(speed, 3)
    );
    const frontDemand = 100000 * this.frontSlip;
    const rearDemand = (115000 - 45000 * this.wetness * (throttle ? 1 : 0.35)) * this.rearSlip;
    const tyreForce = (demand, limit) => limit * Math.tanh(demand / Math.max(limit, 1));
    const frontForce = tyreForce(frontDemand, frontLimit);
    const rearForce = tyreForce(rearDemand, rearLimit);
    const yawTarget = clamp(
      (speed / this.wheelbase) * Math.tan(state.steer),
      -(mu * 9.81) / Math.max(speed, 3),
      (mu * 9.81) / Math.max(speed, 3)
    );
    const beta = Math.atan2(this.lateralVelocity, Math.max(speed, 3));
    const saturation = Math.max(
      Math.abs(frontDemand) / Math.max(frontLimit, 1),
      Math.abs(rearDemand) / Math.max(rearLimit, 1)
    );
    const loss =
      dynamic *
      Math.max(smooth(1.15, 2.3, saturation), smooth(0.045, 0.13, Math.abs(beta)), driveExcess);
    this.tractionLoss += (loss - this.tractionLoss) * (1 - Math.exp(-dt / 0.1));
    this.intervention = this.tractionLoss * dynamic;

    // Approximate DSC yaw correction allows a small slide before recovering it.
    // Its moment represents selective wheel braking; it does not rotate the body directly.
    // With DSC switched off (state.dscOff) there is none, and the throttle is
    // not trimmed in a slide: the car can be held in a drift.
    // (Past about 35° it still catches a slide that is turning into a spin,
    // as a driver's instinct would, so a drift stays a drift.)
    const dsc = state.dscOff ? 0 : 1;
    const slipCorrection = 150000 - this.wetness * (input.brake ? 95000 : 115000);
    const support = clamp((frontSupport + rearSupport) / (frontCount + rearCount), 0, 1);
    const correction =
      clamp(
        (8000 * (yawTarget - this.yawRate) + slipCorrection * beta) * this.intervention,
        -18000,
        18000
      ) *
      support *
      (state.dscOff ? 2.2 * smooth(0.6, 1.1, Math.abs(beta)) : 1);
    const lateralAcceleration = (frontForce * Math.cos(state.steer) + rearForce) / this.mass;
    this.lateralVelocity += (lateralAcceleration - speed * this.yawRate) * dt * dynamic;
    this.yawRate +=
      ((this.front * frontForce * Math.cos(state.steer) - this.rear * rearForce + correction) /
        this.inertia) *
      dt *
      dynamic;
    const kinematicYaw = (speed / this.wheelbase) * Math.tan(state.steer);
    const lowSpeedBlend = (1 - dynamic) * (1 - Math.exp(-12 * dt));
    this.yawRate += (kinematicYaw - this.yawRate) * lowSpeedBlend;
    this.lateralVelocity *= Math.exp(-(1 - dynamic) * 12 * dt);
    // Tyre scrub dissipates energy in a sustained slide. Straight-line launch
    // calibration is unaffected; DSC also trims rear-wheel drive during a slide.
    this.acceleration -=
      dynamic * Math.min(1.8, Math.abs(this.lateralVelocity) * this.tractionLoss * 0.4);
    if (throttle) this.acceleration *= 1 - this.intervention * 0.18 * dsc;
    this.lateralAcceleration = lateralAcceleration * dynamic + speed * kinematicYaw * (1 - dynamic);
    this.slipAngle = Math.atan2(this.lateralVelocity, Math.max(speed, 0.5));
    if (speed < 0.5) {
      this.lateralVelocity =
        this.yawRate =
        this.slipAngle =
        this.tractionLoss =
        this.intervention =
          0;
      this.frontSlip = this.rearSlip = 0;
      this.dscHold = 0;
    } else if (this.intervention > 0.06 && dsc) this.dscHold = 0.32;
    this.dscHold = Math.max(0, this.dscHold - dt);
    this.dscActive = this.dscHold > 0;
    for (const wheel of state.wheels)
      wheel.slip = Math.abs(wheel.x > 0 ? this.frontSlip : this.rearSlip);
    return this;
  }
}
