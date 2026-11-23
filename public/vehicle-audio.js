import { obstacles, roadLateral, roadPeriod } from './road-profile.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const clips = ['engine-idle', 'engine-low', 'engine-high', 'rain', 'tyres'];
const storageKey = 'bmw-driver:sound';

// Recorded layers: the V8 crossfades between idle, low and high recordings by
// RPM and load. `throttle` (0–1) is the load when no pedal is held, as under
// cruise control; holding the accelerator is full load.
export function vehicleAudioMix({
  rpm = 800,
  speed = 0,
  acceleration = 0,
  accelerate = false,
  throttle = 0,
  brake = false,
  driving = true,
  raining = false,
  shifting = false,
  distance = 8,
} = {}) {
  rpm = clamp(driving ? rpm : 800, 800, 7200);
  speed = driving ? Math.max(0, speed) : 0;
  const pedal = accelerate ? 1 : clamp(throttle, 0, 1);
  const load = brake ? 0.12 : driving ? 0.25 + 0.75 * pedal : 0.25;
  const rev = smooth(1300, 2300, rpm),
    high = smooth(3200, 5200, rpm);
  const perspective = clamp(Math.sqrt(8 / Math.max(4, distance)), 0.35, 1.25);
  const engine = perspective * (shifting ? 0.76 : 1);
  return {
    rpm,
    idle: Math.cos((rev * Math.PI) / 2) * (0.3 + load * 0.07) * engine,
    low:
      Math.sin((rev * Math.PI) / 2) *
      Math.cos((high * Math.PI) / 2) *
      (0.16 + load * 0.46) *
      engine,
    high: Math.sin((high * Math.PI) / 2) * (0.14 + load * 0.48) * engine,
    rain: Number(raining) * (0.32 + 0.08 * clamp(speed / 55, 0, 1)),
    tyres:
      driving && brake
        ? 0.15 * smooth(2, 15, speed) * smooth(4, 14, -acceleration) * perspective
        : 0,
    idleRate: clamp(rpm / 800, 0.65, 1.8),
    lowRate: clamp(rpm / 3500, 0.45, 1.8),
    highRate: clamp(rpm / 6000, 0.5, 1.35),
    tyreRate: 0.8 + clamp(speed / 70, 0, 1) * 0.35,
    cutoff: clamp(1000 + rpm * (load > 0.5 ? 0.75 : 0.32), 1200, 6500),
  };
}

// How each surface sounds under the tyres (gains at full speed): a low roll,
// the crackle of stones, the swish of grass, and whether rubber can squeal.
export const surfaceAudio = Object.freeze({
  asphalt: Object.freeze({ roll: 0.06, rollFreq: 150, crunch: 0, swish: 0, squeal: 1 }),
  gravel: Object.freeze({ roll: 0.11, rollFreq: 190, crunch: 0.34, swish: 0.02, squeal: 0 }),
  dirt: Object.freeze({ roll: 0.17, rollFreq: 105, crunch: 0.1, swish: 0.04, squeal: 0 }),
  grass: Object.freeze({ roll: 0.08, rollFreq: 120, crunch: 0.03, swish: 0.17, squeal: 0 }),
});

// Synthesised layers from the motion: the road under the tyres (by the
// share of wheels on each surface; wheels in the air add nothing), spray off
// a wet road, cornering squeal on asphalt, and metal scraping along a rail.
// In the driver's seat (`inside` 0–1) the outside world is muffled and
// quieter, and the engine is heard through the bulkhead.
export function roadAudioMix({
  speed = 0,
  lateralVelocity = 0,
  surfaces = { asphalt: 1 },
  wet = false,
  slipAngle = 0,
  tractionLoss = 0,
  scrape = 0,
  driving = true,
  distance = 8,
  inside = 0,
} = {}) {
  const v = driving ? Math.hypot(speed, lateralVelocity) : 0;
  const perspective = clamp(Math.sqrt(8 / Math.max(4, distance)), 0.35, 1.25);
  const rolling = smooth(1, 30, v),
    loose = smooth(0.5, 18, v);
  let roll = 0,
    rollFreq = 0,
    crunch = 0,
    swish = 0,
    squealable = 0,
    contact = 0;
  for (const [name, share] of Object.entries(surfaces)) {
    const s = surfaceAudio[name];
    if (!s || !(share > 0)) continue;
    roll += s.roll * share * rolling;
    rollFreq += s.rollFreq * share;
    crunch += s.crunch * share * loose;
    swish += s.swish * share * loose;
    squealable += s.squeal * share;
    contact += share;
  }
  rollFreq = contact > 0 ? rollFreq / contact : 150;
  const slide = clamp(
    smooth(0.05, 0.16, Math.abs(slipAngle)) + 0.8 * clamp(tractionLoss, 0, 1),
    0,
    1
  );
  const squeal = 0.24 * slide * smooth(6, 15, v) * squealable * (1 - 0.65 * Number(wet));
  return {
    roll: roll * perspective,
    rollFreq: rollFreq + v * 2.5,
    crunch: crunch * perspective,
    crunchRate: 0.55 + clamp(v / 30, 0, 1),
    swish: swish * perspective,
    spray: Number(wet) * (0.08 + 0.12 * squealable) * smooth(3, 30, v) * contact * perspective,
    squeal: squeal * perspective,
    squealRate: 0.85 + 0.25 * slide - 0.1 * Number(wet),
    scrape: driving ? 0.42 * smooth(0.2, 10, scrape) * perspective : 0,
    scrapeFreq: 1300 + clamp(scrape / 25, 0, 1) * 1600,
    ...cabinMix(inside),
  };
}

// The cabin: a low-pass on everything outside and a quieter, duller engine.
export function cabinMix(inside) {
  const muffle = clamp(inside, 0, 1);
  return {
    cabinCutoff: 16000 * Math.pow(1400 / 16000, muffle),
    outside: 1 - 0.35 * muffle,
    engine: 1 - 0.25 * muffle,
    engineCutoff: 1 - 0.4 * muffle,
  };
}

// Share of the wheels touching each surface; all zero when airborne.
export function contactSurfaces(wheels) {
  const shares = {};
  if (!wheels?.length) return shares;
  for (const w of wheels)
    if (w.contact) shares[w.surface] = (shares[w.surface] ?? 0) + 1 / wheels.length;
  return shares;
}

// Deterministic generator for the synthesised loops.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// White noise in [-1, 1]: roll, swish, spray and scraping are all
// filtered from it.
export function noiseSamples(length, seed = 1) {
  const next = random(seed),
    out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = next() * 2 - 1;
  return out;
}

// Stones under the tyres: short decaying clicks at random times and
// strengths. None crosses the end, so the loop has no seam.
export function crunchSamples(length, sampleRate, { seed = 7, density = 260 } = {}) {
  const next = random(seed),
    out = new Float32Array(length);
  const longest = Math.ceil(sampleRate * 0.0065);
  const count = Math.round((density * length) / sampleRate);
  for (let n = 0; n < count; n++) {
    const start = Math.floor(next() * (length - longest)),
      span = Math.ceil(sampleRate * (0.0015 + next() * 0.005)),
      amp = 0.25 + next() ** 2 * 0.75;
    for (let j = 0; j < span; j++)
      out[start + j] += (next() * 2 - 1) * amp * Math.exp(-j / (span * 0.3));
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < length; i++) out[i] *= 0.9 / peak;
  return out;
}

// One-shot knocks: a wheel hitting a speed bump, a hump or a pothole, or the
// car striking a rail.
export const knockSettings = Object.freeze({
  // Obstacle height (m) for a full-strength thump, and the speeds (m/s)
  // from which a hit is felt and at which it is at full strength.
  bump: Object.freeze({ height: 0.08, from: 3, full: 20, cooldown: 0.1 }),
  // Speed into the rail (m/s) that starts a clang, and full strength.
  rail: Object.freeze({ from: 0.4, full: 6, cooldown: 0.3 }),
  // Closing speed into another vehicle (m/s): a crunch, full at 15.
  crash: Object.freeze({ from: 0.6, full: 15, cooldown: 0.35 }),
});
export function knockStrength(kind, value, speed = 0) {
  if (kind === 'rail' || kind === 'crash') {
    const { from, full } = knockSettings[kind];
    return value < from ? 0 : clamp(0.25 + (0.75 * (value - from)) / (full - from), 0, 1);
  }
  const { height, from, full } = knockSettings.bump;
  if (speed < from) return 0;
  return clamp(Math.abs(value) / height, 0, 1) * (0.3 + 0.7 * smooth(from, full, speed));
}

// The obstacle under a point on the road (by its distance along the road
// and its lateral offset), or null.
export function obstacleAt(x, lateral, list = obstacles) {
  for (const o of list) {
    const dx =
      ((((x - o.x + roadPeriod / 2) % roadPeriod) + roadPeriod) % roadPeriod) - roadPeriod / 2;
    if (Math.abs(dx) < o.l / 2 && Math.abs(lateral - o.z) < o.w / 2) return o;
  }
  return null;
}

export function setupVehicleAudio({ sound, volume, status }) {
  let context, master, engineBus, engineFilter, cabin, outside, noiseBuffer, loading;
  let ready = false,
    elapsed = 0;
  const sources = new Map(),
    gains = new Map(),
    filters = new Map(),
    cooldown = { bump: 0, rail: 0, crash: 0 };
  let bumpPeak = 0,
    railPeak = 0,
    crashPeak = 0,
    knocks = 0;
  // The obstacle each wheel was on at the last frame.
  const under = [];
  try {
    if (localStorage.getItem(storageKey) === 'off') sound.checked = false;
  } catch {
    // Without storage, sound starts on.
  }
  const remember = () => {
    try {
      localStorage.setItem(storageKey, sound.checked ? 'on' : 'off');
    } catch {
      // Not remembered.
    }
  };
  const showStatus = (text) => {
    status.textContent = text;
    status.hidden = !text;
  };
  function createGraph() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Audio is unavailable');
    context = new AudioContextClass();
    // iPhones play it even with the ringer switched to silent, as a game
    // would.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    master = context.createGain();
    master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    master.connect(limiter).connect(context.destination);
    engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 1800;
    engineFilter.Q.value = 0.4;
    engineBus = context.createGain();
    engineBus.connect(master);
    engineFilter.connect(engineBus);
    // Everything but the engine: rain, tyres, the road and knocks, through
    // the cabin's filter.
    outside = context.createGain();
    cabin = context.createBiquadFilter();
    cabin.type = 'lowpass';
    cabin.frequency.value = 16000;
    cabin.Q.value = 0.5;
    outside.connect(cabin).connect(master);
  }
  // A looping synthesised layer: buffer → filters → gain → outside.
  function layer(name, buffer, chain, rate = 1) {
    const source = context.createBufferSource(),
      gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    gain.gain.value = 0;
    let node = source;
    const made = chain.map(([type, frequency, q]) => {
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      node.connect(filter);
      node = filter;
      return filter;
    });
    node.connect(gain).connect(outside);
    // Start each layer at its own place in the noise, so none correlate.
    source.start(context.currentTime + 0.04, Math.random() * buffer.duration);
    sources.set(name, source);
    gains.set(name, gain);
    filters.set(name, made);
  }
  function synthesise() {
    const rate = context.sampleRate,
      length = Math.round(rate * 2);
    noiseBuffer = context.createBuffer(1, length, rate);
    noiseBuffer.getChannelData(0).set(noiseSamples(length, 11));
    const crunchBuffer = context.createBuffer(1, length, rate);
    crunchBuffer.getChannelData(0).set(crunchSamples(length, rate));
    layer('roll', noiseBuffer, [['lowpass', 150, 0.7]]);
    layer('crunch', crunchBuffer, [['highpass', 700, 0.5]]);
    layer('swish', noiseBuffer, [['bandpass', 3200, 0.9]]);
    layer('spray', noiseBuffer, [['highpass', 2600, 0.5]]);
    // Metal on metal: two narrow resonances over the noise.
    layer('scrape', noiseBuffer, [
      ['bandpass', 1700, 7],
      ['peaking', 3900, 6],
    ]);
    filters.get('scrape')[1].gain.value = 14;
  }
  async function load() {
    showStatus('Loading sound…');
    const decoded = await Promise.all(
      clips.map(async (name) => {
        const response = await fetch(new URL(`./assets/audio/${name}.wav`, import.meta.url));
        if (!response.ok) throw new Error('Audio file unavailable');
        return [name, await context.decodeAudioData(await response.arrayBuffer())];
      })
    );
    const start = context.currentTime + 0.04;
    for (const [name, buffer] of decoded) {
      const source = context.createBufferSource(),
        gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain).connect(name.startsWith('engine') ? engineFilter : outside);
      source.start(start);
      sources.set(name, source);
      gains.set(name, gain);
    }
    synthesise();
    ready = true;
    showStatus('');
  }
  // A thump through the suspension, or a rail strike with a metallic ring.
  function knock(strength, metal) {
    const now = context.currentTime,
      end = now + (metal ? 0.6 : 0.3);
    const envelope = (peak, decay) => {
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      gain.connect(outside);
      return gain;
    };
    const body = context.createOscillator();
    body.frequency.setValueAtTime(metal ? 95 : 72, now);
    body.frequency.exponentialRampToValueAtTime(40, now + 0.18);
    body.connect(envelope(strength * 0.55, 0.22));
    body.start(now);
    body.stop(end);
    const burst = context.createBufferSource();
    burst.buffer = noiseBuffer;
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = metal ? 900 : 360;
    burst.connect(low).connect(envelope(strength * (metal ? 0.4 : 0.3), 0.16));
    burst.start(now, Math.random());
    burst.stop(end);
    if (metal) {
      for (const [frequency, q, decay] of [
        [1250, 18, 0.55],
        [2870, 22, 0.4],
      ]) {
        const ring = context.createBufferSource(),
          band = context.createBiquadFilter();
        ring.buffer = noiseBuffer;
        band.type = 'bandpass';
        band.frequency.value = frequency;
        band.Q.value = q;
        ring.connect(band).connect(envelope(strength * 1.6, decay));
        ring.start(now, Math.random());
        ring.stop(end);
      }
    }
    knocks++;
  }
  // Into another car: a deep thud of panels, a crunch of crumpling metal
  // and cracking plastic, and in a hard hit glass tinkling after it.
  function crunch(strength) {
    const now = context.currentTime;
    const envelope = (peak, decay, at = now) => {
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      gain.connect(outside);
      return gain;
    };
    const noise = (at, length, filter, frequency, q, peak, decay) => {
      const source = context.createBufferSource(),
        band = context.createBiquadFilter();
      source.buffer = noiseBuffer;
      band.type = filter;
      band.frequency.value = frequency;
      band.Q.value = q;
      source.connect(band).connect(envelope(peak, decay, at));
      source.start(at, Math.random());
      source.stop(at + length);
    };
    const thud = context.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(64, now);
    thud.frequency.exponentialRampToValueAtTime(32, now + 0.3);
    thud.connect(envelope(strength * 0.9, 0.38));
    thud.start(now);
    thud.stop(now + 0.45);
    // Crumpling panels, low and broad.
    noise(now, 0.4, 'bandpass', 520, 0.7, strength * 0.75, 0.3);
    // Plastic cracking: a run of short bright snaps.
    const snaps = 3 + Math.round(strength * 5);
    for (let i = 0; i < snaps; i++) {
      const at = now + 0.01 + Math.random() * 0.12 * (1 + strength);
      noise(
        at,
        0.05,
        'bandpass',
        1800 + Math.random() * 1800,
        1.5,
        strength * 0.35,
        0.03 + Math.random() * 0.03
      );
    }
    // Glass, in a hard hit.
    if (strength > 0.55)
      for (let i = 0; i < 6; i++) {
        const at = now + 0.05 + Math.random() * 0.45;
        noise(
          at,
          0.12,
          'bandpass',
          4200 + Math.random() * 3500,
          28,
          strength * 0.9,
          0.08 + Math.random() * 0.06
        );
      }
    knocks++;
  }
  async function unlock() {
    if (!sound.checked) return;
    try {
      if (!context) createGraph();
      if (context.state !== 'running') await context.resume();
      if (!ready && !loading) loading = load();
      if (loading) await loading;
    } catch {
      loading = null;
      showStatus('Sound unavailable. Toggle Sound to retry.');
    }
  }
  const running = () => context?.state === 'running';
  const gesture = () => {
    if (sound.checked && !running()) void unlock();
  };
  // A mouse press or a key lets sound start, but on a touch screen only the
  // end of a touch does (the touch pedals and wheel included).
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'])
    document.addEventListener(type, gesture, { capture: true });
  sound.addEventListener('change', () => {
    remember();
    if (sound.checked) void unlock();
    else if (master) master.gain.setTargetAtTime(0, context.currentTime, 0.04);
  });
  document.addEventListener('visibilitychange', () => {
    if (master)
      master.gain.setTargetAtTime(
        document.hidden || !sound.checked ? 0 : Number(volume.value) / 100,
        context.currentTime,
        0.04
      );
  });
  window.addEventListener('pagehide', () => {
    if (context) void context.close();
  });
  return {
    // On, and the browser lets it play.
    get audible() {
      return sound.checked && running();
    },
    // The turn-signal relay, heard in the cabin (it bypasses the cabin
    // filter): a dry click with a little hollow body, higher as the lamps
    // light ("tick") and lower as they go out ("tock").
    tick(on) {
      if (!ready || !sound.checked || !running()) return;
      const now = context.currentTime;
      const click = context.createBufferSource(),
        band = context.createBiquadFilter(),
        clickGain = context.createGain();
      click.buffer = noiseBuffer;
      band.type = 'bandpass';
      band.frequency.value = on ? 2100 : 1500;
      band.Q.value = 1.4;
      clickGain.gain.setValueAtTime(on ? 0.22 : 0.15, now);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.014);
      click.connect(band).connect(clickGain).connect(master);
      click.start(now, Math.random());
      click.stop(now + 0.03);
      // The relay's body: a short damped knock.
      const body = context.createOscillator(),
        bodyGain = context.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(on ? 520 : 380, now);
      body.frequency.exponentialRampToValueAtTime(on ? 300 : 230, now + 0.04);
      bodyGain.gain.setValueAtTime(on ? 0.12 : 0.085, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      body.connect(bodyGain).connect(master);
      body.start(now);
      body.stop(now + 0.06);
    },
    // Thunder from a strike `distance` metres away, `loudness` 0–1: a
    // sharp crack overhead, then a rumble that rolls on for seconds, deeper
    // and slower to build the farther the strike.
    thunder(loudness, distance = 1000) {
      if (!ready || !sound.checked || !running() || loudness <= 0.01) return;
      const now = context.currentTime,
        far = clamp(distance / 4000, 0, 1),
        length = 3.5 + 3 * far + Math.random() * 2;
      const voice = (filterType, frequency, q, at) => {
        const source = context.createBufferSource(),
          filter = context.createBiquadFilter(),
          gain = context.createGain();
        source.buffer = noiseBuffer;
        source.loop = true;
        source.playbackRate.value = 0.5 + 0.2 * Math.random();
        filter.type = filterType;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        gain.gain.setValueAtTime(0.0001, at);
        source.connect(filter).connect(gain).connect(outside);
        source.start(at, Math.random() * 1.5);
        return { source, gain: gain.gain, filter };
      };
      // The crack of a near strike.
      if (distance < 1200) {
        const crack = voice('highpass', 900, 0.6, now);
        const peak = loudness * 1.4 * (1 - distance / 1200);
        crack.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.01);
        crack.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        crack.source.stop(now + 0.4);
      }
      // The rumble: low noise swelling and fading in a few rolls.
      const rumble = voice('lowpass', 520 - 380 * far, 0.7, now);
      const body = voice('lowpass', 75, 0.9, now);
      const rise = 0.06 + 0.5 * far;
      let at = now + rise;
      rumble.gain.exponentialRampToValueAtTime(Math.max(0.0002, loudness * 1.6), at);
      body.gain.exponentialRampToValueAtTime(Math.max(0.0002, loudness * 2.4), at);
      while (at < now + length * 0.7) {
        const step = 0.35 + Math.random() * 0.9,
          level = loudness * (0.5 + 1.1 * Math.random()) * (1 - (at - now) / length);
        rumble.gain.setTargetAtTime(Math.max(0.0002, level), at, step / 3);
        body.gain.setTargetAtTime(Math.max(0.0002, level * 1.5), at, step / 3);
        at += step;
      }
      rumble.gain.setTargetAtTime(0.0001, at, length * 0.12);
      body.gain.setTargetAtTime(0.0001, at, length * 0.15);
      rumble.filter.frequency.setTargetAtTime(160, now, length * 0.4);
      rumble.source.stop(now + length + 1.5);
      body.source.stop(now + length + 1.5);
    },
    // The sound button: mutes or unmutes. Sound that is on but still waiting
    // for the browser's permission starts instead of muting.
    toggle() {
      if (sound.checked && !running()) {
        void unlock();
        return;
      }
      sound.checked = !sound.checked;
      sound.dispatchEvent(new Event('change'));
    },
    update(dt, simulation, { driving, raining, accelerate, brake, distance, inside = 0 }) {
      // Knocks are caught every frame; the mix itself updates 30 times a second.
      if (simulation && driving) {
        const c = Math.cos(simulation.heading),
          s = Math.sin(simulation.heading),
          speed = Math.abs(simulation.speed);
        simulation.wheels.forEach((w, i) => {
          const x = simulation.x + c * w.x + s * w.z,
            z = simulation.z - s * w.x + c * w.z;
          const now = obstacleAt(x, roadLateral(x, z)),
            was = under[i];
          under[i] = now;
          // Onto an obstacle; off a long table bump, the drop is a second hit.
          // Small humps and potholes in a wheel track knock softer than a
          // full-width speed bump.
          const hit = (o) => knockStrength('bump', o.h, speed) * (o.w > 5 ? 1 : 0.5);
          if (now && now !== was) bumpPeak = Math.max(bumpPeak, hit(now));
          else if (!now && was?.table) bumpPeak = Math.max(bumpPeak, 0.6 * hit(was));
        });
        // Into another vehicle, or a guardrail.
        if (simulation.railContact?.traffic)
          crashPeak = Math.max(crashPeak, simulation.railContact.impact ?? 0);
        else railPeak = Math.max(railPeak, simulation.railContact?.impact ?? 0);
      } else under.length = 0;
      elapsed -= dt;
      cooldown.bump -= dt;
      cooldown.rail -= dt;
      cooldown.crash -= dt;
      if (elapsed > 0 || !simulation) return;
      elapsed = 1 / 30;
      const mix = vehicleAudioMix({
        rpm: simulation.powertrain.rpm,
        speed: simulation.speed,
        acceleration: simulation.acceleration,
        throttle: driving && !brake ? simulation.acceleration / 1.8 : 0,
        shifting: simulation.powertrain.shiftRemaining > 0,
        driving,
        raining,
        accelerate,
        brake,
        distance,
      });
      const road = roadAudioMix({
        speed: simulation.speed,
        lateralVelocity: simulation.lateralVelocity,
        surfaces: contactSurfaces(simulation.wheels),
        wet: raining,
        slipAngle: simulation.slipAngle,
        tractionLoss: simulation.tractionLoss,
        // Rubbing along another car scrapes less than along a rail.
        scrape:
          (simulation.railContact?.scrape ?? 0) * (simulation.railContact?.traffic ? 0.35 : 1),
        driving,
        distance,
        inside,
      });
      const audible = sound.checked && !document.hidden;
      const tyres = Math.max(mix.tyres, road.squeal);
      const data = document.body.dataset;
      data.audioState = context?.state ?? 'locked';
      data.audioLoaded = String(ready);
      data.audioRpm = String(Math.round(mix.rpm));
      data.audioRainGain = (audible ? mix.rain : 0).toFixed(3);
      data.audioTyresGain = (audible ? tyres : 0).toFixed(3);
      data.audioRoad = [road.roll, road.crunch, road.swish, road.spray, road.scrape]
        .map((v) => (audible ? v : 0).toFixed(3))
        .join(',');
      const bump = bumpPeak,
        rail = knockStrength('rail', railPeak),
        hit = knockStrength('crash', crashPeak);
      bumpPeak = railPeak = crashPeak = 0;
      if (!ready) return;
      const now = context.currentTime;
      if (audible && hit > 0 && cooldown.crash <= 0) {
        crunch(hit);
        cooldown.crash = knockSettings.crash.cooldown;
      } else if (audible && rail > 0 && cooldown.rail <= 0) {
        knock(rail, true);
        cooldown.rail = knockSettings.rail.cooldown;
      } else if (audible && bump > 0 && cooldown.bump <= 0) {
        knock(bump, false);
        cooldown.bump = knockSettings.bump.cooldown;
      }
      data.audioKnocks = String(knocks);
      const level = (name, value) => gains.get(name).gain.setTargetAtTime(value, now, 0.07);
      engineBus.gain.setTargetAtTime(road.engine, now, 0.08);
      outside.gain.setTargetAtTime(road.outside, now, 0.08);
      cabin.frequency.setTargetAtTime(road.cabinCutoff, now, 0.08);
      const pitch = (name, value, lag = 0.04) =>
        sources.get(name).playbackRate.setTargetAtTime(value, now, lag);
      const tune = (name, value, i = 0) =>
        filters.get(name)[i].frequency.setTargetAtTime(value, now, 0.08);
      master.gain.setTargetAtTime(audible ? clamp(Number(volume.value) / 100, 0, 1) : 0, now, 0.06);
      level('engine-idle', mix.idle);
      level('engine-low', mix.low);
      level('engine-high', mix.high);
      level('rain', mix.rain);
      level('tyres', tyres);
      level('roll', road.roll);
      level('crunch', road.crunch);
      level('swish', road.swish);
      level('spray', road.spray);
      gains.get('scrape').gain.setTargetAtTime(road.scrape, now, 0.03);
      pitch('engine-idle', mix.idleRate);
      pitch('engine-low', mix.lowRate);
      pitch('engine-high', mix.highRate);
      pitch('tyres', road.squeal > mix.tyres ? road.squealRate : mix.tyreRate, 0.08);
      pitch('crunch', road.crunchRate, 0.1);
      tune('roll', road.rollFreq);
      tune('scrape', road.scrapeFreq);
      engineFilter.frequency.setTargetAtTime(mix.cutoff * road.engineCutoff, now, 0.08);
    },
  };
}
