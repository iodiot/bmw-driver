// Drift points, while you drive (not on autopilot): with DSC off (T) the M5
// can be held sideways. A drift counts once the car slides more than
// `minAngle` above `minSpeed`; it scores by the angle and the speed every
// moment it lasts, and its multiplier climbs the longer it is held and at
// every flick from one side to the other. Another drift begun within `chain`
// seconds carries the score and multiplier on. Ending it banks the points
// (times the multiplier); hitting a guardrail or a car loses them all.
// The best drift is kept in the browser.
export const driftRules = Object.freeze({
  minAngle: 10,
  minSpeed: 30,
  // Seconds below the angle that end a drift (a chance to link the next).
  chain: 1.3,
  // Multiplier: +1 every `holdStep` seconds held and +0.5 at each flick,
  // up to `maxMultiplier`.
  holdStep: 2.5,
  flickBonus: 0.5,
  maxMultiplier: 5,
  // Angles beyond this score no more (a spin is not a drift).
  scoreAngle: 60,
});
const storageKey = 'bmw-driver:drift';

// Points a second for a slide at `angle` degrees and `speed` km/h.
export function driftRate(angle, speed) {
  const a = Math.min(Math.abs(angle), driftRules.scoreAngle);
  return (a * speed) / 25;
}

export class DriftScore {
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    try {
      this.best = Number(JSON.parse(storage?.getItem(storageKey) ?? '{}')?.best) || 0;
    } catch {
      this.best = 0;
    }
    this.reset();
  }
  reset() {
    this.active = false;
    this.points = 0;
    this.multiplier = 1;
    this.held = 0;
    this.below = 0;
    this.side = 0;
    this.angle = 0;
  }
  // The score as it stands (points times multiplier).
  get total() {
    return Math.round(this.points * this.multiplier);
  }
  // Advances by dt. `angle`: the body's slip (degrees, signed), `speed` in
  // km/h, `manual` false on autopilot or in reverse (no drifting then),
  // `crashed` true at a hit. Returns {kind: 'drift' | 'wipeout', ...} when a
  // drift ends, else null.
  update(dt, { angle, speed, manual = true, crashed = false }) {
    this.angle = angle;
    if (!manual) {
      const ended = this.active ? this.finish() : null;
      this.reset();
      return ended;
    }
    if (this.active && crashed) {
      const lost = this.total;
      this.reset();
      return { kind: 'wipeout', points: lost };
    }
    const sliding = Math.abs(angle) >= driftRules.minAngle && speed >= driftRules.minSpeed;
    if (sliding) {
      if (!this.active) {
        this.active = true;
        this.held = 0;
      }
      this.below = 0;
      this.points += driftRate(angle, speed) * dt;
      const before = Math.floor(this.held / driftRules.holdStep);
      this.held += dt;
      if (Math.floor(this.held / driftRules.holdStep) > before) this.bump(1);
      const side = Math.sign(angle);
      if (this.side && side !== this.side) this.bump(driftRules.flickBonus);
      this.side = side;
      return null;
    }
    if (!this.active) return null;
    this.below += dt;
    if (this.below < driftRules.chain && speed >= driftRules.minSpeed * 0.6) return null;
    return this.finish();
  }
  bump(by) {
    this.multiplier = Math.min(driftRules.maxMultiplier, this.multiplier + by);
  }
  finish() {
    const points = this.total,
      multiplier = this.multiplier;
    const previous = this.best;
    const record = points > previous && points > 0;
    if (record) {
      this.best = points;
      try {
        this.storage?.setItem(storageKey, JSON.stringify({ best: points }));
      } catch {
        // Not kept between visits.
      }
    }
    this.reset();
    return points > 0 ? { kind: 'drift', points, multiplier, record, best: previous } : null;
  }
}
