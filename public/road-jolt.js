// What a pothole or a bump does to the car beyond the suspension's travel.
// A sharp edge loads a tyre to twice its weight for a few hundredths of a
// second; the springs and dampers soak up nearly all of it, so the body
// moves only millimetres, yet in a real car the hit is felt and seen. Each
// wheel's sudden load (against its slowly changing load, so braking,
// cornering and swells do not count) kicks soft springs: the body dips
// toward that wheel and settles in a sway, and the camera eases down and
// back. Springs rather than a shake, so the motion stays smooth.
export const joltSettings = Object.freeze({
  // Sudden load above the wheel's usual, as a share of its static load.
  threshold: 0.7,
  full: 1.6,
  // Seconds before the same wheel can jolt again.
  cooldown: 0.1,
  // Peak movement for a full jolt: metres of heave, radians of roll and
  // pitch, pixels of the camera's dip.
  heave: 0.014,
  roll: 0.009,
  pitch: 0.005,
  camera: 1.8,
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A damped spring at rest at 0, set moving by kicks.
class Spring {
  constructor(frequency, damping) {
    this.omega = 2 * Math.PI * frequency;
    this.damping = damping;
    this.x = this.v = 0;
  }
  // The velocity that brings a peak of about `size`.
  kick(size) {
    const z = this.damping,
      peak = z >= 1 ? 1 / Math.E : Math.exp((-z / Math.sqrt(1 - z * z)) * Math.acos(z)) * 1;
    this.v += (size * this.omega) / peak;
  }
  step(dt) {
    const steps = Math.ceil(dt / 0.004),
      h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.omega * this.omega * this.x - 2 * this.damping * this.omega * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
  }
}

export class RoadJolt {
  constructor() {
    this.reset();
  }
  reset() {
    this.usual = [];
    this.cooldowns = [];
    // Body: a soft sway; camera: critically damped, no bounce.
    this.springs = {
      heave: new Spring(3.2, 0.45),
      roll: new Spring(2.8, 0.45),
      pitch: new Spring(2.8, 0.45),
      camera: new Spring(2.2, 1),
    };
    this.heave = this.roll = this.pitch = this.cameraY = 0;
    this.fresh = 0;
    this.events = 0;
  }
  // `wheels`: the simulation's wheels (load, peakLoad, staticLoad, x, z).
  update(dt, wheels, { enabled = true, speed = 0 } = {}) {
    this.fresh = 0;
    if (dt <= 0) return;
    const { threshold, full, cooldown } = joltSettings;
    wheels.forEach((w, i) => {
      const load = w.load / w.staticLoad,
        peak = (w.peakLoad ?? w.load) / w.staticLoad;
      this.usual[i] ??= load;
      this.cooldowns[i] = (this.cooldowns[i] ?? 0) - dt;
      const sudden = peak - this.usual[i];
      // The usual load follows the slow changes within about 0.15 s.
      this.usual[i] +=
        (Math.min(load, this.usual[i] + 0.3) - this.usual[i]) * (1 - Math.exp(-dt / 0.15));
      if (!enabled || sudden < threshold || this.cooldowns[i] > 0) return;
      this.cooldowns[i] = cooldown;
      // Harder the faster the car goes over it.
      const strength =
        clamp((sudden - threshold) / (full - threshold), 0.15, 1) *
        (0.35 + 0.65 * clamp(speed / 25, 0, 1));
      const side = Math.sign(w.z) || 1,
        front = Math.sign(w.x) || 1;
      const { heave, roll, pitch, camera } = this.springs;
      // The hit corner drops.
      heave.kick(-joltSettings.heave * strength);
      roll.kick(-side * joltSettings.roll * strength);
      pitch.kick(-front * joltSettings.pitch * strength);
      camera.kick(joltSettings.camera * strength);
      this.fresh = Math.max(this.fresh, strength);
      this.events++;
    });
    for (const spring of Object.values(this.springs)) spring.step(Math.min(dt, 1 / 15));
    this.heave = this.springs.heave.x;
    this.roll = this.springs.roll.x;
    this.pitch = this.springs.pitch.x;
    this.cameraY = this.springs.camera.x;
  }
}
