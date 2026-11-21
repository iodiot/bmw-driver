const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// The F10's two main dials use a 240-degree sweep with an open lower sector.
export function gaugeAngle(value, maximum) {
  return -120 + (clamp(Number.isFinite(value) ? value : 0, 0, maximum) / maximum) * 240;
}

export class InstrumentMotion {
  constructor() {
    this.initialized = false;
    this.speed = 0;
    this.rpm = 800;
  }
  update(dt, speed, rpm) {
    const targetSpeed = clamp(Number.isFinite(speed) ? speed * 3.6 : 0, 0, 330);
    const targetRpm = clamp(Number.isFinite(rpm) ? rpm : 800, 0, 8000);
    if (!this.initialized) {
      this.speed = targetSpeed;
      this.rpm = targetRpm;
      this.initialized = true;
    } else {
      const step = clamp(dt, 0, 1 / 15);
      this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-step / 0.065));
      this.rpm += (targetRpm - this.rpm) * (1 - Math.exp(-step / 0.08));
    }
    return this;
  }
}

export class DscIndicatorMotion {
  constructor() {
    this.reset();
  }
  reset() {
    this.elapsed = 0;
    this.active = this.visible = false;
  }
  update(dt, active) {
    if (!active) this.reset();
    else {
      if (this.active) this.elapsed += clamp(dt, 0, 1 / 15);
      this.active = true;
      this.visible = this.elapsed % (1 / 3) < 1 / 6;
    }
    return this;
  }
}

function point(cx, cy, radius, angle) {
  const radians = (angle * Math.PI) / 180;
  return [cx + Math.sin(radians) * radius, cy - Math.cos(radians) * radius];
}
function arc(cx, cy, radius, start, end) {
  const a = point(cx, cy, radius, start),
    b = point(cx, cy, radius, end);
  return `M${a.join(',')} A${radius},${radius} 0 ${end - start > 180 ? 1 : 0},1 ${b.join(',')}`;
}
// Layout and markings follow a photograph of the European F10 M5 cluster:
// a 0–330 km/h speedometer numbered every 30 km/h with a tick every 10 km/h,
// a 0–8 tachometer and blue information displays in the lower opening of each
// dial, on a semi-transparent panel over the scene.
export const speedometerMaximum = 330;
export const speedometerLabels = Array.from({ length: 12 }, (_, i) => i * 30);
// Simplified fuel model for the range display: an 80 L tank
// starting at three quarters, about 14 L/100 km when driven hard.
export function fuelState(distanceMetres) {
  const litres = clamp(60 - (Math.max(0, distanceMetres) / 1000) * 0.14, 0, 80);
  return { fraction: litres / 80, rangeKm: (litres / 14) * 100 };
}

const cy = 137;
function tick(cx, cyy, r1, r2, angle, cls) {
  const a = point(cx, cyy, r1, angle),
    b = point(cx, cyy, r2, angle);
  return `<path d="M${a.map((v) => v.toFixed(2)).join(',')} L${b.map((v) => v.toFixed(2)).join(',')}" class="${cls}"/>`;
}

function dial(cx, maximum, major, minor, name) {
  const rpm = name === 'rpm';
  let markings = '';
  for (let value = 0; value <= maximum + 1e-9; value += minor) {
    const angle = gaugeAngle(value, maximum),
      isMajor = Math.abs(value / major - Math.round(value / major)) < 1e-9;
    markings += tick(
      cx,
      cy,
      106,
      isMajor ? 97 : 100.5,
      angle,
      isMajor ? 'major-tick' : 'minor-tick'
    );
    if (isMajor) {
      const [lx, ly] = point(cx, cy, rpm ? 81 : 82, angle).map((v) => v.toFixed(2));
      markings += `<text x="${lx}" y="${ly}" class="dial-number ${rpm ? 'rpm-number' : 'speed-number'}">${Math.round(value)}</text>`;
    }
  }
  // Tachometer: amber pre-shift segments, then the red zone from 7200 rpm.
  let zone = '';
  if (rpm)
    for (let value = 6.5; value < 8; value += 0.1)
      zone += tick(
        cx,
        cy,
        112,
        107.5,
        gaugeAngle(value + 0.05, 8),
        value < 7.15 ? 'rpm-warning' : 'rpm-redline'
      );
  // Blue information display arc in the dial's lower opening.
  const display = `<path d="${arc(cx, cy, 103, 132, 228)}" class="info-arc"/>
    <path d="${arc(cx, cy, 99, 136, 224)}" class="info-arc-inner"/>`;
  return `
    <circle cx="${cx}" cy="${cy}" r="117" class="dial-face"/>
    <circle cx="${cx}" cy="${cy}" r="119.5" class="dial-bezel-shadow"/>
    <circle cx="${cx}" cy="${cy}" r="116" class="dial-bezel"/>
    <circle cx="${cx}" cy="${cy}" r="113.2" class="dial-bezel-edge"/>
    ${display}${zone}${markings}
    <text x="${cx}" y="${rpm ? 96 : 98}" class="dial-unit">${rpm ? '1/min x 1000' : 'km/h'}</text>
    <g id="${name}-needle" transform="rotate(-120 ${cx} ${cy})">
      <path d="M${cx - 2.6},${cy + 15} L${cx - 1},${cy - 88} L${cx + 1},${cy - 88} L${cx + 2.6},${cy + 15}Z" class="needle-glow" filter="url(#needle-blur)"/>
      <path d="M${cx - 2.4},${cy + 15} L${cx - 0.9},${cy - 88} L${cx + 0.9},${cy - 88} L${cx + 2.4},${cy + 15}Z" fill="url(#needle-red)"/>
      <path d="M${cx},${cy + 8} L${cx},${cy - 84}" class="needle-core"/>
    </g>
    <circle cx="${cx}" cy="${cy}" r="8.5" fill="url(#needle-hub)" stroke="#2c3137" stroke-width="1"/>
  `;
}

const fuelIcon =
  '<path d="M-5,-5 h6 v10 h-6Z M-4,-4 h4 v3 h-4Z M1,-2 h2 v5 q0,1.5 1.5,1.5 v-7 l-1.5,-2"/>';

export function setupInstruments(container) {
  container.innerHTML = `
    <svg viewBox="0 0 620 286" role="img" aria-label="BMW M5 instrument cluster">
      <defs>
        <!-- Black-panel cluster: neutral smoked black, no blue cast. -->
        <linearGradient id="cluster-shell" x1="0" y1="0" x2="0" y2="1">
          <stop stop-color="#262626"/><stop offset=".07" stop-color="#121212"/>
          <stop offset=".55" stop-color="#080808"/><stop offset="1" stop-color="#030303"/>
        </linearGradient>
        <!-- Dial faces: deep black centre, a faintly lighter band under the
             scale, black again at the bezel. -->
        <radialGradient id="dial-face" cx="50%" cy="50%" r="50%">
          <stop stop-color="#040404"/><stop offset=".62" stop-color="#090909"/>
          <stop offset=".78" stop-color="#151515"/><stop offset=".92" stop-color="#0c0c0c"/>
          <stop offset="1" stop-color="#020202"/>
        </radialGradient>
        <linearGradient id="bezel-metal" x1="0" y1="0" x2=".35" y2="1">
          <stop stop-color="#f4f7f9"/><stop offset=".22" stop-color="#9aa3ab"/>
          <stop offset=".5" stop-color="#3f464d"/><stop offset=".78" stop-color="#a7b0b8"/>
          <stop offset="1" stop-color="#eef2f5"/>
        </linearGradient>
        <linearGradient id="needle-red" x1="0" y1="0" x2="1" y2="0">
          <stop stop-color="#d4201a"/><stop offset=".5" stop-color="#ff5a3d"/>
          <stop offset="1" stop-color="#d4201a"/>
        </linearGradient>
        <linearGradient id="info-blue" x1="0" y1="0" x2="1" y2="0">
          <stop stop-color="#1d6fff" stop-opacity=".2"/><stop offset=".5" stop-color="#4aa3ff"/>
          <stop offset="1" stop-color="#1d6fff" stop-opacity=".2"/>
        </linearGradient>
        <filter id="needle-blur" x="-200%" y="-10%" width="500%" height="120%">
          <feGaussianBlur stdDeviation="2.4"/>
        </filter>
        <radialGradient id="needle-hub" cx="35%" cy="30%">
          <stop stop-color="#3a3a3a"/><stop offset="1" stop-color="#0a0a0a"/>
        </radialGradient>
      </defs>
      <path d="M9,268 L9,141 C9,57 67,12 155,12 C222,12 255,37 284,57 Q310,72 336,57 C365,37 398,12 465,12 C553,12 611,57 611,141 L611,268 Q611,280 598,280 L22,280 Q9,280 9,268Z" class="cluster-shell"/>
      ${dial(155, speedometerMaximum, 30, 10, 'speed')}
      ${dial(465, 8, 1, 0.5, 'rpm')}
      <g transform="translate(130 210)" class="side-icon">${fuelIcon}</g>
      <text id="range" x="160" y="214" class="info-text">0 km</text>
      <g transform="translate(436 172) skewX(-18)">
        <path d="M0,0 H7 V14 H0Z" fill="#71bdea"/><path d="M8,0 H15 V14 H8Z" fill="#264d8f"/>
        <path d="M16,0 H23 V14 H16Z" fill="#e54b53"/>
      </g>
      <text x="464" y="187" class="m-mark">M</text>
      <text id="gear" x="310" y="214" class="gear-display">D1</text>
      <text x="310" y="234" class="transmission-label">M DCT</text>
      <g id="low-beam-indicator" transform="translate(318 120) scale(-1 1)" class="low-beam-indicator" visibility="hidden">
        <path d="M6,0 Q-2,0 -2,7 Q-2,14 6,14Z M9,2 l8,-3 M9,6 l8,-3 M9,10 l8,-3 M9,14 l8,-3"/>
      </g>
      <g id="dsc-indicator" transform="translate(296 71) scale(1.18)" class="dsc-indicator" visibility="hidden" aria-label="DSC stabilizing vehicle">
        <title>Dynamic Stability Control intervention</title>
        <!-- The standard skidding-car symbol: the car with two S-shaped tracks
             beneath it (outline from Material Design Icons, car-traction-control,
             Apache License 2.0). -->
        <path class="dsc-symbol" d="M9.5,11H10.5C10.8,11 11,10.8 11,10.5V9H19V10.5C19,10.8 19.2,11 19.5,11H20.5C20.8,11 21,10.8 21,10.5V9L21,8.5V6L19.6,1.7C19.5,1.3 19.1,1 18.7,1H11.4C11,1 10.6,1.3 10.5,1.7L9,6V8.5L9,9V10.5C9,10.8 9.2,11 9.5,11M11.3,2H18.6L19.5,5H10.4L11.3,2M12,23H10C10,22.2 8.1,21.5 6.6,20.9C4.5,20.1 2,19.2 2,17C2,14.7 4.3,14.1 6.2,13.5C7.9,13.1 9,12.7 9,12H11C11,14.3 8.7,14.9 6.8,15.5C5.1,15.9 4,16.3 4,17C4,17.8 5.9,18.5 7.4,19.1C9.5,19.9 12,20.8 12,23M22,23H20C20,22.2 18.1,21.5 16.6,20.9C14.5,20.1 12,19.2 12,17C12,14.7 14.3,14.1 16.2,13.5C17.8,13 19,12.7 19,12H21C21,14.3 18.7,14.9 16.8,15.5C15.2,15.9 14,16.3 14,17C14,17.8 15.9,18.5 17.4,19.1C19.5,19.9 22,20.8 22,23Z"/>
      </g>
    </svg>`;
  const $ = (selector) => container.querySelector(selector);
  const svg = $('svg'),
    speedNeedle = $('#speed-needle'),
    rpmNeedle = $('#rpm-needle'),
    rangeText = $('#range'),
    gearText = $('#gear'),
    lowBeams = $('#low-beam-indicator'),
    dsc = $('#dsc-indicator');
  const warning = new DscIndicatorMotion();
  const motion = new InstrumentMotion();
  let textTime = 0;
  return {
    reset() {
      motion.initialized = false;
      warning.reset();
      dsc.setAttribute('visibility', 'hidden');
    },
    update(dt, simulation, night, driving = true) {
      if (!simulation) return;
      motion.update(dt, simulation.speed, simulation.powertrain.rpm);
      warning.update(dt, driving && simulation.dscActive);
      dsc.setAttribute('visibility', warning.visible ? 'visible' : 'hidden');
      container.dataset.dscActive = String(warning.active);
      container.dataset.dscVisible = String(warning.visible);
      speedNeedle.setAttribute(
        'transform',
        `rotate(${gaugeAngle(motion.speed, speedometerMaximum).toFixed(3)} 155 ${cy})`
      );
      rpmNeedle.setAttribute(
        'transform',
        `rotate(${gaugeAngle(motion.rpm, 8000).toFixed(3)} 465 ${cy})`
      );
      const fuel = fuelState(simulation.distance);
      textTime -= dt;
      if (textTime <= 0) {
        textTime = 0.1;
        const gear = `D${simulation.powertrain.gear}`;
        gearText.textContent = gear;
        rangeText.textContent = `${Math.round(fuel.rangeKm)} km`;
        lowBeams.setAttribute('visibility', night ? 'visible' : 'hidden');
        svg.setAttribute(
          'aria-label',
          `BMW M5 instrument cluster: ${Math.round(motion.speed)} km/h, ${Math.round(simulation.powertrain.rpm)} rpm, gear ${gear}${warning.active ? ', DSC intervening' : ''}`
        );
      }
    },
  };
}
