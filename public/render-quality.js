// Keep Retina framebuffers bounded, then adapt to sustained rendering load.
// This changes only canvas resolution; weather density and physics stay intact.
export class RenderQuality {
  constructor(devicePixelRatio = 1, maxPixels = 4_000_000) {
    this.devicePixelRatio = Math.min(devicePixelRatio, 2);
    this.maxPixels = maxPixels;
    this.ratio = this.limit = this.devicePixelRatio;
    this.recoveryDelay = 0;
    this.reset();
  }

  reset() {
    this.warmup = 1.5;
    this.elapsed = 0;
    this.samples = [];
  }

  resize(width, height) {
    this.limit = Math.min(this.devicePixelRatio, Math.sqrt(this.maxPixels / (width * height)));
    this.floor = Math.min(0.75, this.limit);
    this.ratio = this.limit;
    this.recoveryDelay = 0;
    this.reset();
    return this.ratio;
  }

  update(dt) {
    // Tab switching, debugger pauses and initial shader compilation are not
    // representative of steady frame cost.
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.25) {
      this.reset();
      return this.ratio;
    }
    this.recoveryDelay = Math.max(0, this.recoveryDelay - dt);
    if (this.warmup > 0) {
      this.warmup -= dt;
      return this.ratio;
    }
    this.elapsed += dt;
    this.samples.push(dt);
    if (this.elapsed < 1) return this.ratio;
    this.samples.sort((a, b) => a - b);
    const frame = this.samples[Math.floor(this.samples.length * 0.75)];
    if (frame > 1 / 50 && this.ratio > this.floor) {
      this.ratio = Math.max(this.floor, this.ratio * 0.85);
      this.recoveryDelay = 12;
      this.warmup = 0.5;
    } else if (frame < 1 / 57 && this.recoveryDelay === 0 && this.ratio < this.limit) {
      this.ratio = Math.min(this.limit, this.ratio + 0.075);
      this.recoveryDelay = 6;
      this.warmup = 0.5;
    }
    this.elapsed = 0;
    this.samples.length = 0;
    return this.ratio;
  }
}
