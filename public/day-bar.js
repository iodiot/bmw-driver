import { dayCycle, dayPhase, formatClock, sunElevation, wrapHours } from './time-of-day.js';

// Top-centre panel, coloured like the sky at the moment: the sun's path over
// 24 hours with the sun or moon at the current time (click or drag to set
// the time), the clock with a glowing sun or moon, the frame rate under it,
// a Day / Sunset / Night switch with the current
// phase lit, rain, pause with a ring showing how far the day has run, sound
// and restart.
const width = 132,
  height = 46,
  horizonY = 25;
// Graph coordinates for an hour: x across the day, y by sun elevation.
export function dayGraphPoint(hours) {
  return [4 + ((width - 8) * hours) / 24, horizonY - sunElevation(hours) * 0.4];
}

function sunPath() {
  const points = [];
  for (let h = 0; h <= 24.001; h += 0.25) points.push(dayGraphPoint(h).map((v) => v.toFixed(1)));
  return 'M' + points.map((p) => p.join(' ')).join('L');
}

// Sunrise and sunset (hours), where the sun crosses the horizon.
function crossing(from, to) {
  let a = from,
    b = to;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (Math.sign(sunElevation(m)) === Math.sign(sunElevation(a))) a = m;
    else b = m;
  }
  return (a + b) / 2;
}
export const sunrise = crossing(3, 12),
  sunset = crossing(13, 23);

// The next sunrise or sunset after an hour.
export function nextSunEvent(hours) {
  const h = wrapHours(hours);
  return h >= sunrise && h < sunset
    ? { kind: 'sunset', at: sunset }
    : { kind: 'sunrise', at: sunrise };
}

// Which preset the time belongs to: day, the low-sun band, or night.
export function presetFor(hours) {
  const elevation = sunElevation(hours);
  return elevation > 10 ? 'day' : elevation < -6 ? 'night' : 'sunset';
}

// Panel colours (top, bottom) for the sky at a moment.
const skyColours = {
  day: [
    [59, 120, 196],
    [111, 167, 220],
  ],
  sunset: [
    [196, 103, 58],
    [122, 74, 143],
  ],
  night: [
    [14, 26, 51],
    [29, 43, 76],
  ],
  rain: [
    [74, 85, 98],
    [96, 108, 122],
  ],
};
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function panelSky(light, raining) {
  return [0, 1].map((i) => {
    let c = mixRgb(skyColours.day[i], skyColours.night[i], light.darkness);
    c = mixRgb(c, skyColours.sunset[i], light.sunset * (1 - light.darkness * 0.5));
    if (raining)
      c = mixRgb(c, mixRgb(skyColours.rain[i], skyColours.night[i], light.darkness), 0.6);
    return `rgb(${c.map((v) => Math.round(v)).join(' ')})`;
  });
}

const icons = {
  day: '<circle cx="9" cy="9" r="3.4"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4"/>',
  sunset:
    '<path d="M4.5 12.5a4.5 4.5 0 0 1 9 0M1.5 12.5h15M3 15.5h12M9 3v3M3.4 6.4l1.4 1.4M14.6 6.4l-1.4 1.4"/>',
  night: '<path d="M13.8 11.6A6 6 0 0 1 6.4 4.2a6 6 0 1 0 7.4 7.4z"/>',
  rain: '<path d="M5 10.5h8a3 3 0 0 0 .3-6 4.2 4.2 0 0 0-8.1 1A2.6 2.6 0 0 0 5 10.5zM6 13l-1 2.5M9.5 13l-1 2.5M13 13l-1 2.5"/>',
  pause: '<path d="M6.5 4.5v9M11.5 4.5v9"/>',
  play: '<path d="M6.5 4.2v9.6L14 9z"/>',
  restart: '<path d="M3.8 9a5.2 5.2 0 1 0 1.6-3.8M3.6 2.8v2.6h2.6"/>',
  sound:
    '<path d="M2.5 7h2.8l3.7-3.2v10.4L5.3 11H2.5z"/><path d="M11.6 6.4a3.6 3.6 0 0 1 0 5.2M13.9 4.2a6.7 6.7 0 0 1 0 9.6"/>',
  camera: '<path d="M2.5 6.2h3l1.4-2h4.2l1.4 2h3v8.3h-13z"/><circle cx="9" cy="10.2" r="2.6"/>',
  muted:
    '<path d="M2.5 7h2.8l3.7-3.2v10.4L5.3 11H2.5z"/><path d="M11.8 6.8l4.4 4.4M16.2 6.8l-4.4 4.4"/>',
};
const icon = (name) => `<svg viewBox="0 0 18 18" aria-hidden="true">${icons[name]}</svg>`;
const presetLabels = { day: 'Day (13:00)', sunset: 'Sunset (18:54)', night: 'Night (23:00)' };

export function setupDayBar(
  container,
  { setTime, toggleRain, toggleRunning, restart, toggleSound, nextCamera }
) {
  container.innerHTML = `
    <div class="day-graph" title="Time of day: click or drag to change">
      <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <rect class="day-below" x="0" y="${horizonY}" width="${width}" height="${height - horizonY}"/>
        <path class="day-path" d="${sunPath()}"/>
        <line class="day-horizon" x1="0" y1="${horizonY}" x2="${width}" y2="${horizonY}"/>
        <line class="day-now" y1="2" y2="${height - 2}"/>
        <circle class="day-body" r="4.2"/>
      </svg>
    </div>
    <div class="day-readout">
      <svg class="day-celestial" viewBox="0 0 26 26" aria-hidden="true">
        <circle class="sun" cx="13" cy="13" r="6.5"/>
        <path class="moon" d="M17.5 17.2A7.2 7.2 0 0 1 8.8 8.5a7.2 7.2 0 1 0 8.7 8.7z"/>
      </svg>
      <b class="day-clock">13:00</b>
      <span class="day-fps" data-level="good" title="Frames per second"><i></i><b>–</b> FPS</span>
    </div>
    <div class="day-buttons">
      <div class="day-presets" role="group" aria-label="Time presets">
        ${Object.keys(presetLabels)
          .map(
            (p) =>
              `<button type="button" data-preset="${p}" aria-label="${presetLabels[p]}" title="${presetLabels[p]}">${icon(p)}</button>`
          )
          .join('')}
      </div>
      <button type="button" class="day-rain" aria-label="Rain" title="Rain" aria-pressed="false">${icon('rain')}</button>
      <button type="button" class="day-run" aria-label="Pause time" title="Pause time" aria-pressed="false">${icon('pause')}</button>
      <button type="button" class="day-camera" aria-label="Camera: Chase (C)" title="Camera: Chase (C)">${icon('camera')}</button>
      <button type="button" class="day-sound" aria-label="Sound (M)" title="Sound (M)" aria-pressed="true">${icon('sound')}</button>
      <button type="button" class="day-restart" aria-label="Restart (R)" title="Restart (R)">${icon('restart')}</button>
    </div>`;
  const graph = container.querySelector('.day-graph'),
    svg = graph.querySelector('svg'),
    body = svg.querySelector('.day-body'),
    now = svg.querySelector('.day-now'),
    clock = container.querySelector('.day-clock'),
    fps = container.querySelector('.day-fps'),
    fpsValue = fps.querySelector('b'),
    sun = container.querySelector('.day-celestial .sun'),
    moon = container.querySelector('.day-celestial .moon'),
    presets = [...container.querySelectorAll('[data-preset]')],
    rain = container.querySelector('.day-rain'),
    run = container.querySelector('.day-run'),
    soundButton = container.querySelector('.day-sound'),
    cameraButton = container.querySelector('.day-camera');
  for (const button of presets)
    button.onclick = () => setTime(dayCycle.presets[button.dataset.preset]);
  rain.onclick = toggleRain;
  run.onclick = toggleRunning;
  container.querySelector('.day-restart').onclick = () => restart?.();
  soundButton.onclick = () => toggleSound?.();
  cameraButton.onclick = () => nextCamera?.();
  // A clicked button lets go of focus, so the keyboard drives the car again.
  for (const button of container.querySelectorAll('button'))
    button.addEventListener('pointerup', () => button.blur());
  // Click or drag on the graph to set the time.
  const timeAt = (event) => {
    const box = svg.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * width;
    return Math.max(0, Math.min(23.99, ((x - 4) / (width - 8)) * 24));
  };
  let dragging = false;
  graph.onpointerdown = (event) => {
    dragging = true;
    graph.setPointerCapture(event.pointerId);
    setTime(timeAt(event));
  };
  graph.onpointermove = (event) => {
    if (dragging) setTime(timeAt(event));
  };
  graph.onpointerup = graph.onpointercancel = () => {
    dragging = false;
  };
  let shown = '',
    soundShown = '';
  return {
    // Frames per second, with a dot: green from 55, amber from 30, red below.
    setFps(value) {
      const shown = String(Math.round(value));
      if (fpsValue.textContent !== shown) fpsValue.textContent = shown;
      const level = value >= 55 ? 'good' : value >= 30 ? 'fair' : 'low';
      if (fps.dataset.level !== level) fps.dataset.level = level;
    },
    // The current camera view, named on the button.
    setCamera(view, label) {
      cameraButton.dataset.view = view;
      cameraButton.title = cameraButton.ariaLabel = `Camera: ${label} (C)`;
    },
    // On and playing, on but waiting for a click (browsers start sound only
    // after one), or muted.
    setSound(audible, enabled) {
      const state = enabled ? (audible ? 'on' : 'waiting') : 'off';
      if (state === soundShown) return;
      soundShown = state;
      soundButton.dataset.state = state;
      soundButton.setAttribute('aria-pressed', String(enabled));
      soundButton.innerHTML = icon(enabled ? 'sound' : 'muted');
      soundButton.title = soundButton.ariaLabel =
        state === 'on' ? 'Mute (M)' : state === 'off' ? 'Sound on (M)' : 'Click to start sound';
    },
    update(light, { running, raining }) {
      const text = formatClock(light.hours);
      // The DOM changes once a game minute (a few times a second at most).
      const state = `${text}|${running}|${raining}`;
      if (state === shown) return;
      shown = state;
      const [x, y] = dayGraphPoint(light.hours);
      body.setAttribute('cx', x.toFixed(1));
      body.setAttribute('cy', y.toFixed(1));
      now.setAttribute('x1', x.toFixed(1));
      now.setAttribute('x2', x.toFixed(1));
      const night = light.elevation < -3;
      body.classList.toggle('moon', night);
      sun.style.opacity = night ? 0 : 1;
      moon.style.opacity = night ? 1 : 0;
      clock.textContent = text;
      // The phase of day and next sunrise or sunset, for screen readers.
      const next = nextSunEvent(light.hours),
        name = dayPhase(light.hours);
      const [top, bottom] = panelSky(light, raining);
      container.style.setProperty('--sky-top', top);
      container.style.setProperty('--sky-bottom', bottom);
      container.style.setProperty('--sky-glow', (light.sunset * (1 - light.darkness)).toFixed(2));
      container.style.setProperty('--day-progress', (light.hours / 24).toFixed(3));
      const active = presetFor(light.hours);
      for (const button of presets)
        button.setAttribute('aria-current', String(button.dataset.preset === active));
      rain.setAttribute('aria-pressed', String(raining));
      run.setAttribute('aria-pressed', String(!running));
      run.innerHTML = icon(running ? 'pause' : 'play');
      run.title = run.ariaLabel = running ? 'Pause time' : 'Resume time';
      container.setAttribute(
        'aria-label',
        `Time ${text}, ${name.toLowerCase()}, ${next.kind} at ${formatClock(next.at)}${raining ? ', raining' : ''}`
      );
    },
  };
}
