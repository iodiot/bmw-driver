// Timed runs, as a magazine would measure them, while you drive (not on
// autopilot): 0–100 km/h and the quarter mile from a standstill, 100–200
// km/h from wherever you pass 100 accelerating, and the top speed reached.
// The best of each is kept in the browser.
export const runLimits = Object.freeze({
  // Below this (m/s) for `settle` seconds the car counts as standing.
  standing: 0.4,
  settle: 0.3,
  quarterMile: 402.336,
  // A run ends if the car slows this much (km/h) below its best speed in it.
  giveUp: 12,
});
const kmh = 3.6;
const storageKey = 'bmw-driver:runs';

export function loadRecords(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage?.getItem(storageKey) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export class RunTimer {
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    this.records = loadRecords(storage);
    this.reset();
  }
  reset() {
    this.still = 0;
    this.launch = null;
    this.rolling = null;
    this.peak = 0;
    this.peakAnnounced = true;
  }
  save() {
    try {
      this.storage?.setItem(storageKey, JSON.stringify(this.records));
    } catch {
      // Not kept between visits.
    }
  }
  // A result: whether it beats the best (lower time, or higher speed).
  result(kind, value, { higher = false, extra = null } = {}) {
    const best = this.records[kind];
    const record = best === undefined || (higher ? value > best : value < best);
    if (record) {
      this.records[kind] = value;
      this.save();
    }
    return { kind, value, best: record ? best : best, record, extra };
  }
  // Advances by dt with the car's `speed` (m/s, forward); `manual` false
  // (autopilot, paused, reversing) stops and cancels any run. Returns the
  // results finished this step.
  update(dt, speed, manual = true) {
    const results = [];
    if (!manual || dt <= 0) {
      this.launch = this.rolling = null;
      this.still = 0;
      this.peak = 0;
      return results;
    }
    const v = speed * kmh;
    // From a standstill: 0–100 and the quarter mile.
    if (speed < runLimits.standing) {
      this.still += dt;
      if (this.still > runLimits.settle)
        this.launch = { time: 0, distance: 0, best: 0, done100: false };
    } else {
      this.still = 0;
      const run = this.launch;
      if (run) {
        run.time += dt;
        run.distance += speed * dt;
        run.best = Math.max(run.best, v);
        if (!run.done100 && v >= 100) {
          run.done100 = true;
          results.push(this.result('0-100', run.time));
        }
        if (run.distance >= runLimits.quarterMile) {
          results.push(this.result('quarter', run.time, { extra: v }));
          this.launch = null;
        } else if (v < run.best - runLimits.giveUp) this.launch = null;
      }
    }
    // 100–200 from a rolling start.
    if (!this.rolling && this.previous !== undefined && this.previous < 100 && v >= 100)
      this.rolling = { time: 0 };
    if (this.rolling) {
      this.rolling.time += dt;
      if (v < 95) this.rolling = null;
      else if (v >= 200) {
        results.push(this.result('100-200', this.rolling.time));
        this.rolling = null;
      }
    }
    // Top speed: announced once the car stops gaining.
    if (v > this.peak) {
      this.peak = v;
      this.peakAnnounced = false;
    } else if (!this.peakAnnounced && this.peak >= 150 && v < this.peak - 8) {
      this.peakAnnounced = true;
      const best = this.records.top;
      if (best === undefined || this.peak > best)
        results.push(this.result('top', this.peak, { higher: true }));
      this.peak = v;
    }
    if (v < 60) this.peak = Math.min(this.peak, v);
    this.previous = v;
    return results;
  }
}

// A result as a line of text.
export function describeRun({ kind, value, best, record, extra }) {
  const seconds = (t) => `${t.toFixed(2)} s`;
  const label = {
    '0-100': '0–100 km/h',
    '100-200': '100–200 km/h',
    quarter: '¼ mile',
    top: 'Top speed',
  }[kind];
  const shown =
    kind === 'top'
      ? `${Math.round(value)} km/h`
      : kind === 'quarter'
        ? `${seconds(value)} at ${Math.round(extra)} km/h`
        : seconds(value);
  const previous =
    best === undefined ? '' : kind === 'top' ? `${Math.round(best)} km/h` : seconds(best);
  return {
    label,
    shown,
    note: record ? (previous ? `record · was ${previous}` : 'record') : `best ${previous}`,
  };
}
