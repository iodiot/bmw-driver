import { dayCycle, dayPhase, formatClock, sunElevation, wrapHours } from './time-of-day.js';

// Top-centre panel, see-through over the scene: the sun's path over 24
// hours with the sun or moon at the current time (click or drag to set the
// time), the clock with a glowing sun or moon, the frame rate under it, a
// time-of-day button showing the current phase (it opens Day, Sunset and
// Night), the weather, the autopilot, the radio, sound and restart.
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

const icons = {
  day: '<circle cx="9" cy="9" r="3.4"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4"/>',
  sunset:
    '<path d="M4.5 12.5a4.5 4.5 0 0 1 9 0M1.5 12.5h15M3 15.5h12M9 3v3M3.4 6.4l1.4 1.4M14.6 6.4l-1.4 1.4"/>',
  night: '<path d="M13.8 11.6A6 6 0 0 1 6.4 4.2a6 6 0 1 0 7.4 7.4z"/>',
  clear:
    '<path d="M6 12.5h7.5a2.8 2.8 0 0 0 .3-5.6 3.9 3.9 0 0 0-7.4.6A2.5 2.5 0 0 0 6 12.5z"/><path d="M4.8 6.2a2.6 2.6 0 0 1 3-3.4M3.2 4.3l-1-1M5.6 2.1V1"/>',
  rain: '<path d="M5 10.5h8a3 3 0 0 0 .3-6 4.2 4.2 0 0 0-8.1 1A2.6 2.6 0 0 0 5 10.5zM6 13l-1 2.5M9.5 13l-1 2.5M13 13l-1 2.5"/>',
  storm:
    '<path d="M5 10.5h8a3 3 0 0 0 .3-6 4.2 4.2 0 0 0-8.1 1A2.6 2.6 0 0 0 5 10.5z"/><path d="M9.8 10.5 8 13.5h2.4L8.8 17"/>',
  fog: '<path d="M2.5 6h13M4.5 9h11M2.5 12h12M5 15h9"/>',
  snow: '<path d="M5 10.5h8a3 3 0 0 0 .3-6 4.2 4.2 0 0 0-8.1 1A2.6 2.6 0 0 0 5 10.5z"/><path d="M6 13.2v2.6M4.7 14.5h2.6M12 13.2v2.6M10.7 14.5h2.6M9 14.6v2.4M7.8 15.8h2.4"/>',
  blizzard:
    '<path d="M5 9.5h8a3 3 0 0 0 .3-6 4.2 4.2 0 0 0-8.1 1A2.6 2.6 0 0 0 5 9.5z"/><path d="M2.5 12.5h9M5 15h10M8 12.2v1M13 14.7v1"/>',
  // A steering wheel: the rim, the hub and three spokes.
  autopilot:
    '<circle cx="9" cy="9" r="6.6"/><circle cx="9" cy="9" r="1.9"/><path d="M2.6 8.2h4.5M10.9 8.2h4.5M9 10.9v4.6"/>',
  restart: '<path d="M3.8 9a5.2 5.2 0 1 0 1.6-3.8M3.6 2.8v2.6h2.6"/>',
  sound:
    '<path d="M2.5 7h2.8l3.7-3.2v10.4L5.3 11H2.5z"/><path d="M11.6 6.4a3.6 3.6 0 0 1 0 5.2M13.9 4.2a6.7 6.7 0 0 1 0 9.6"/>',
  // The view (an eye), so it is not taken for the photo button.
  camera:
    '<path d="M1.6 9c2-3.6 4.6-5.3 7.4-5.3s5.4 1.7 7.4 5.3c-2 3.6-4.6 5.3-7.4 5.3S3.6 12.6 1.6 9z"/><circle cx="9" cy="9" r="2.5"/>',
  // A radio: its body, a speaker, the tuning scale and the aerial.
  radio:
    '<path d="M4.5 5.6 13.5 2.2"/><rect x="1.8" y="5.6" width="14.4" height="10" rx="2"/><circle cx="6.4" cy="10.6" r="2.4"/><path d="M11 9h3M11 12.2h3"/>',
  capture: '<circle cx="9" cy="9" r="6.2"/><circle class="dot" cx="9" cy="9" r="2.8"/>',
  paint:
    '<path d="M9 2.3c2.7 3.3 4.4 5.7 4.4 7.9a4.4 4.4 0 0 1-8.8 0c0-2.2 1.7-4.6 4.4-7.9z"/><path d="M7 11.2a2 2 0 0 0 2 1.9"/>',
  muted:
    '<path d="M2.5 7h2.8l3.7-3.2v10.4L5.3 11H2.5z"/><path d="M11.8 6.8l4.4 4.4M16.2 6.8l-4.4 4.4"/>',
};
const icon = (name) => `<svg viewBox="0 0 18 18" aria-hidden="true">${icons[name]}</svg>`;
// A weather's icon (clear, rain, storm, fog, snow, blizzard).
export const weatherIcon = (kind) => icon(icons[kind] ? kind : 'clear');
const weatherNames = {
  clear: 'clear',
  rain: 'rain',
  storm: 'thunderstorm',
  fog: 'fog',
  snow: 'snow',
  blizzard: 'blizzard',
};
const presetNames = { day: 'Day', sunset: 'Sunset', night: 'Night' };

export function setupDayBar(
  container,
  {
    setTime,
    openWeather,
    toggleAutopilot,
    restart,
    toggleSound,
    nextCamera,
    openLook,
    nextGraphics,
    openCapture,
    nextStation,
    openTime,
  }
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
      <button type="button" class="day-fps" data-level="good" title="Frames per second · graphics: Auto (click to change)"><i></i><b>–</b> FPS</button>
    </div>
    <div class="day-buttons">
      <button type="button" class="day-time" aria-label="Time of day" title="Time of day" aria-expanded="false">${icon('day')}</button>
      <button type="button" class="day-rain" aria-label="Weather and season" title="Weather and season" aria-pressed="false" aria-expanded="false">${icon('clear')}</button>
      <button type="button" class="day-autopilot" aria-label="Autopilot" title="Autopilot" aria-pressed="true">${icon('autopilot')}</button>
      <button type="button" class="day-paint" aria-label="Paint, wheels and graphics" title="Paint, wheels and graphics" aria-expanded="false">${icon('paint')}</button>
      <button type="button" class="day-camera" aria-label="Camera: Chase (C)" title="Camera: Chase (C)">${icon('camera')}</button>
      <button type="button" class="day-capture" aria-label="Photo or video" title="Photo or video" aria-expanded="false">${icon('capture')}<b></b></button>
      <button type="button" class="day-radio" aria-label="Radio (N)" title="Radio (N)" aria-pressed="false">${icon('radio')}</button>
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
    timeButton = container.querySelector('.day-time'),
    rain = container.querySelector('.day-rain'),
    autopilotButton = container.querySelector('.day-autopilot'),
    soundButton = container.querySelector('.day-sound'),
    cameraButton = container.querySelector('.day-camera');
  // The time of day's panel, as the weather's: Day, Sunset and Night with
  // their times, the current one lit; a choice closes it.
  const timePanel = document.createElement('div');
  timePanel.className = 'look-picker time-picker';
  timePanel.hidden = true;
  timePanel.setAttribute('role', 'dialog');
  timePanel.setAttribute('aria-label', 'Time of day');
  timePanel.innerHTML = `
    <h3>Time of day</h3>
    <div class="weather-kinds time-kinds" role="group" aria-label="Time of day">
      ${Object.keys(presetNames)
        .map(
          (p) =>
            `<button type="button" data-preset="${p}" title="${presetNames[p]} (${formatClock(dayCycle.presets[p])})">${icon(p)}<span>${presetNames[p]}</span><small>${formatClock(dayCycle.presets[p])}</small></button>`
        )
        .join('')}
    </div>`;
  document.body.append(timePanel);
  const presets = [...timePanel.querySelectorAll('[data-preset]')];
  const closeTime = () => {
    timePanel.hidden = true;
    timeButton.setAttribute('aria-expanded', 'false');
  };
  timeButton.onclick = () => {
    const opening = timePanel.hidden;
    if (opening) openTime?.();
    timePanel.hidden = !opening;
    timeButton.setAttribute('aria-expanded', String(opening));
  };
  for (const button of presets)
    button.onclick = () => {
      setTime(dayCycle.presets[button.dataset.preset]);
      closeTime();
      button.blur();
    };
  document.addEventListener('pointerdown', (e) => {
    if (!timePanel.hidden && !timePanel.contains(e.target) && !timeButton.contains(e.target))
      closeTime();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !timePanel.hidden) closeTime();
  });
  rain.onclick = () => openWeather?.(rain);
  autopilotButton.onclick = () => toggleAutopilot?.();
  container.querySelector('.day-restart').onclick = () => restart?.();
  soundButton.onclick = () => toggleSound?.();
  const radioButton = container.querySelector('.day-radio');
  radioButton.onclick = () => nextStation?.();
  cameraButton.onclick = () => nextCamera?.();
  const captureButton = container.querySelector('.day-capture');
  captureButton.onclick = () => openCapture?.(captureButton);
  const paintButton = container.querySelector('.day-paint');
  paintButton.onclick = () => openLook?.(paintButton);
  fps.onclick = () => nextGraphics?.();
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
  let autopilotShown = null;
  return {
    // Closes the time of day's panel (another panel opening).
    closeTime,
    // The autopilot on (the button lit) or off; a click turns it on again
    // after the driver has taken the wheel, or hands the wheel over.
    setAutopilot(on) {
      if (on === autopilotShown) return;
      autopilotShown = on;
      autopilotButton.setAttribute('aria-pressed', String(on));
      autopilotButton.title = autopilotButton.ariaLabel = on
        ? 'Autopilot on (click to take the wheel)'
        : 'Autopilot off (click to let the car drive itself)';
    },
    // A video being recorded: the button turns red with the seconds left
    // (a click then stops it and saves).
    setCapture({ recording = false, left = 0 } = {}) {
      captureButton.dataset.recording = String(recording);
      captureButton.querySelector('b').textContent = recording ? String(left) : '';
      captureButton.title = captureButton.ariaLabel = recording
        ? `Recording · ${left} s left (click to stop)`
        : 'Photo or video';
    },
    // The radio's station (null when off) and its state: lit while it
    // plays, pulsing while it tunes in or waits for a click.
    setRadio(station, state) {
      radioButton.dataset.state = state;
      radioButton.setAttribute('aria-pressed', String(Boolean(station)));
      radioButton.title = radioButton.ariaLabel = station
        ? `Radio: ${station.name} · ${
            {
              tuning: 'tuning in',
              waiting: 'click to play',
              muted: 'sound off',
              error: 'no signal',
            }[state] ?? station.note
          } (N: next station)`
        : 'Radio off (N: Ukrainian stations)';
    },
    // Frames per second, with a dot: green from 55, amber from 30, red below.
    setFps(value) {
      const shown = String(Math.round(value));
      if (fpsValue.textContent !== shown) fpsValue.textContent = shown;
      const level = value >= 55 ? 'good' : value >= 30 ? 'fair' : 'low';
      if (fps.dataset.level !== level) fps.dataset.level = level;
    },
    // The graphics level, named on the frame rate's tooltip.
    setGraphics(label) {
      fps.title = fps.ariaLabel = `Frames per second · graphics: ${label} (click to change)`;
      fps.dataset.graphics = label;
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
    // `weather`: 'clear', 'rain', 'storm' or 'fog'.
    update(light, { running, weather = 'clear' }) {
      const text = formatClock(light.hours);
      // The DOM changes once a game minute (a few times a second at most).
      const state = `${text}|${running}|${weather}`;
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
      container.style.setProperty('--day-progress', (light.hours / 24).toFixed(3));
      const active = presetFor(light.hours);
      for (const button of presets)
        button.setAttribute('aria-pressed', String(button.dataset.preset === active));
      if (timeButton.dataset.phase !== active) {
        timeButton.dataset.phase = active;
        timeButton.innerHTML = icon(active);
        timeButton.title =
          timeButton.ariaLabel = `Time of day: ${presetNames[active]} (click to choose)`;
      }
      if (rain.dataset.weather !== weather) {
        rain.dataset.weather = weather;
        rain.innerHTML = icon(weather);
        rain.title =
          rain.ariaLabel = `Weather: ${weatherNames[weather]} (click to choose, and the season)`;
      }
      rain.setAttribute('aria-pressed', String(weather !== 'clear'));
      container.setAttribute(
        'aria-label',
        `Time ${text}, ${name.toLowerCase()}, ${next.kind} at ${formatClock(next.at)}${weather === 'clear' ? '' : `, ${weatherNames[weather]}`}`
      );
    },
  };
}
