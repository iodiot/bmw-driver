// What a pothole or a bump does to the car beyond the suspension's travel.
// A sharp edge loads a tyre to twice its weight for a few hundredths of a
// second; the springs and dampers soak up nearly all of it, so the body
// moves only millimetres, yet in a real car the hit is felt and seen. A
// jolt from each wheel's sudden load (against its slowly changing load, so
// braking, cornering and swells do not count) shakes the body briefly
// toward that wheel and, through `kick`, the camera.
export const joltSettings = Object.freeze({
  // Sudden load above the wheel's usual, as a share of its static load.
  threshold: 0.7,
  full: 1.6,
  // Seconds before the same wheel can jolt again.
  cooldown: 0.1,
  // Body movement for a full jolt: metres of heave, radians of roll, pitch.
  heave: 0.018,
  roll: 0.012,
  pitch: 0.007,
  // How long a jolt rings (s) and at what frequency (Hz).
  decay: 0.075,
  frequency: 9,
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class RoadJolt {
  constructor() {
    this.reset();
  }
  reset() {
    this.usual = [];
    this.cooldowns = [];
    this.age = 1;
    this.strength = 0;
    this.side = 0;
    this.front = 0;
    this.heave = this.roll = this.pitch = 0;
    this.fresh = 0;
    this.events = 0;
  }
  // `wheels`: the simulation's wheels (load, peakLoad, staticLoad, x, z).
  update(dt, wheels, { enabled = true, speed = 0 } = {}) {
    this.fresh = 0;
    if (dt <= 0) return;
    const { threshold, full, cooldown, decay, frequency } = joltSettings;
    this.age += dt;
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
      const current = this.strength * Math.exp(-this.age / decay);
      if (strength < current) return;
      this.strength = strength;
      this.age = 0;
      this.side = Math.sign(w.z) || 1;
      this.front = Math.sign(w.x) || 1;
      this.fresh = Math.max(this.fresh, strength);
      this.events++;
    });
    const ring =
      this.age < 6 * decay
        ? this.strength * Math.exp(-this.age / decay) * Math.cos(this.age * Math.PI * 2 * frequency)
        : 0;
    // The hit corner drops, then springs back.
    this.heave = -joltSettings.heave * ring;
    this.roll = -this.side * joltSettings.roll * ring;
    this.pitch = -this.front * joltSettings.pitch * ring;
  }
}
