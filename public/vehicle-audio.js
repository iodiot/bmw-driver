const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const clips = ['engine-idle', 'engine-low', 'engine-high', 'rain', 'tyres'];

export function vehicleAudioMix({
  rpm = 800,
  speed = 0,
  acceleration = 0,
  accelerate = false,
  brake = false,
  driving = true,
  raining = false,
  shifting = false,
  distance = 8,
} = {}) {
  rpm = clamp(driving ? rpm : 800, 800, 7200);
  speed = driving ? Math.max(0, speed) : 0;
  const load = driving && accelerate && !brake ? 1 : brake ? 0.12 : 0.25;
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
    rain: raining ? 0.32 + 0.08 * clamp(speed / 55, 0, 1) : 0,
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

export function setupVehicleAudio({ sound, volume, status }) {
  let context, master, engineFilter, tyreFilter, loading;
  let ready = false,
    elapsed = 0;
  const sources = new Map(),
    gains = new Map();
  const showStatus = (text) => {
    status.textContent = text;
    status.hidden = !text;
  };
  function createGraph() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Audio is unavailable');
    context = new AudioContextClass();
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
    engineFilter.connect(master);
    tyreFilter = context.createBiquadFilter();
    tyreFilter.type = 'lowpass';
    tyreFilter.frequency.value = 2500;
    tyreFilter.Q.value = 0.3;
    tyreFilter.connect(master);
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
      source
        .connect(gain)
        .connect(name.startsWith('engine') ? engineFilter : name === 'tyres' ? tyreFilter : master);
      source.start(start);
      sources.set(name, source);
      gains.set(name, gain);
    }
    ready = true;
    showStatus('');
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
  const gesture = () => {
    if (sound.checked && (!context || context.state !== 'running')) void unlock();
  };
  document.addEventListener('pointerdown', gesture, { capture: true });
  document.addEventListener('keydown', gesture, { capture: true });
  sound.addEventListener('change', () => {
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
    update(dt, simulation, { driving, raining, accelerate, brake, distance }) {
      elapsed -= dt;
      if (elapsed > 0 || !simulation) return;
      elapsed = 1 / 30;
      const mix = vehicleAudioMix({
        rpm: simulation.powertrain.rpm,
        speed: simulation.speed,
        acceleration: simulation.acceleration,
        shifting: simulation.powertrain.shiftRemaining > 0,
        driving,
        raining,
        accelerate,
        brake,
        distance,
      });
      const audible = sound.checked && !document.hidden;
      document.body.dataset.audioState = context?.state ?? 'locked';
      document.body.dataset.audioLoaded = String(ready);
      document.body.dataset.audioRpm = String(Math.round(mix.rpm));
      document.body.dataset.audioRainGain = (audible ? mix.rain : 0).toFixed(3);
      document.body.dataset.audioTyresGain = (audible ? mix.tyres : 0).toFixed(3);
      if (!ready) return;
      const now = context.currentTime;
      const level = (name, value) => gains.get(name).gain.setTargetAtTime(value, now, 0.07);
      master.gain.setTargetAtTime(audible ? clamp(Number(volume.value) / 100, 0, 1) : 0, now, 0.06);
      level('engine-idle', mix.idle);
      level('engine-low', mix.low);
      level('engine-high', mix.high);
      level('rain', mix.rain);
      level('tyres', mix.tyres);
      sources.get('engine-idle').playbackRate.setTargetAtTime(mix.idleRate, now, 0.04);
      sources.get('engine-low').playbackRate.setTargetAtTime(mix.lowRate, now, 0.04);
      sources.get('engine-high').playbackRate.setTargetAtTime(mix.highRate, now, 0.04);
      sources.get('tyres').playbackRate.setTargetAtTime(mix.tyreRate, now, 0.08);
      engineFilter.frequency.setTargetAtTime(mix.cutoff, now, 0.08);
    },
  };
}
