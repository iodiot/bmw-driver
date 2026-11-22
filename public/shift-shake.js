const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export class GearShiftShake {
  constructor() {
    this.applied = false;
    this.reset();
  }
  reset(gear = null) {
    this.lastGear = gear;
    this.age = 1;
    this.amplitude = 0;
    this.x = this.y = 0;
    this.events = 0;
    this.lastKind = 'none';
    this.lastStrength = 0;
  }
  update(dt, gear, { enabled = true, accelerate = false, brake = false, speed = 0 } = {}) {
    if (!enabled) {
      this.lastGear = gear;
      this.amplitude = this.x = this.y = 0;
      this.age = 1;
      return;
    }
    if (dt <= 0) return;
    const previous = this.lastGear;
    this.lastGear = gear;
    this.age += Math.min(dt, 1 / 15);
    if (previous != null && previous !== gear) {
      const up = gear > previous;
      const strength =
        brake && !up
          ? 0.28
          : accelerate && !brake
            ? up
              ? 0.82 + 0.18 * clamp(speed / 70, 0, 1)
              : 0.5
            : 0;
      if (strength > 0) {
        this.age = 0;
        this.amplitude = this.lastStrength = strength;
        this.lastKind = up ? 'upshift' : brake ? 'braking-downshift' : 'kickdown';
        this.events++;
      }
    }
    if (this.age >= 0.34) {
      this.x = this.y = 0;
      this.amplitude = 0;
      return;
    }
    const decay = Math.exp(-this.age / 0.085) * this.amplitude;
    this.x = 0.65 * decay * Math.sin(this.age * Math.PI * 2 * 17 + 0.35);
    this.y = 2.4 * decay * Math.cos(this.age * Math.PI * 2 * 12);
  }
  // `extraY`: another vertical offset in pixels to add (the road's jolt).
  apply(camera, width, height, extraY = 0) {
    const y = this.y + extraY;
    const active = this.x !== 0 || y !== 0;
    if (active || this.applied) {
      // Off-axis projection jolts the scene without moving OrbitControls' camera
      // or target. Reset the base projection each time so offsets never drift.
      camera.updateProjectionMatrix();
      if (active) {
        const scale = clamp(height / 720, 0.65, 1.25);
        camera.projectionMatrix.elements[8] -= (2 * this.x * scale) / width;
        camera.projectionMatrix.elements[9] += (2 * y * scale) / height;
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      }
    }
    this.applied = active;
  }
}
