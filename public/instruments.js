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

function point(cx, cy, radius, angle) {
  const radians = (angle * Math.PI) / 180;
  return [cx + Math.sin(radians) * radius, cy - Math.cos(radians) * radius];
}
function arc(cx, cy, radius, start, end) {
  const a = point(cx, cy, radius, start),
    b = point(cx, cy, radius, end);
  return `M${a.join(',')} A${radius},${radius} 0 ${end - start > 180 ? 1 : 0},1 ${b.join(',')}`;
}
function dial(cx, maximum, major, minor, name) {
  const cy = 137;
  let markings = '';
  for (let value = 0; value <= maximum; value += minor) {
    const angle = gaugeAngle(value, maximum),
      isMajor = value % major === 0;
    const a = point(cx, cy, 105, angle),
      b = point(cx, cy, isMajor ? 96 : 101, angle);
    markings += `<path d="M${a.join(',')} L${b.join(',')}" class="${isMajor ? 'major-tick' : 'minor-tick'}"/>`;
    if (isMajor) {
      const label = point(cx, cy, 82, angle);
      markings += `<text x="${label[0]}" y="${label[1]}" class="dial-number">${value}</text>`;
    }
  }
  const warning =
    name === 'rpm'
      ? `
    <path d="${arc(cx, cy, 111, gaugeAngle(6.8, 8), gaugeAngle(7.2, 8))}" class="rpm-warning"/>
    <path d="${arc(cx, cy, 111, gaugeAngle(7.2, 8), gaugeAngle(8, 8))}" class="rpm-redline"/>`
      : '';
  return `
    <circle cx="${cx}" cy="${cy}" r="117" fill="url(#dial-face)"/>
    <circle cx="${cx}" cy="${cy}" r="118" class="dial-bezel-shadow"/>
    <circle cx="${cx}" cy="${cy}" r="115" class="dial-bezel"/>
    <path d="${arc(cx, cy, 112, -120, 120)}" class="dial-inner-ring"/>
    ${warning}${markings}
    <text x="${cx}" y="108" class="dial-unit">${name === 'rpm' ? '1/min × 1000' : 'km/h'}</text>
    <g id="${name}-needle" transform="rotate(-120 ${cx} ${cy})">
      <path d="M${cx - 1.5},${cy + 18} L${cx - 1},${cy - 97} L${cx + 1.1},${cy - 98} L${cx + 2.6},${cy + 18}Z" fill="#07090b" transform="translate(1.5 1.5)"/>
      <path d="M${cx - 2},${cy + 18} L${cx - 1},${cy - 97} L${cx + 0.9},${cy - 98} L${cx + 2},${cy + 18}Z" fill="url(#needle-red)"/>
      <path d="M${cx},${cy + 12} L${cx},${cy - 94}" stroke="#ff8c72" stroke-width=".65"/>
    </g>
    <circle cx="${cx}" cy="${cy}" r="9" fill="url(#needle-hub)" stroke="#353a40" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="3" fill="#1b2025"/>
  `;
}

export function setupInstruments(container) {
  container.innerHTML = `
    <svg viewBox="0 0 620 286" role="img" aria-label="BMW M5 instrument cluster">
      <defs>
        <linearGradient id="cluster-shell" x1="0" y1="0" x2="0" y2="1">
          <stop stop-color="#30363c"/><stop offset=".08" stop-color="#171c21"/>
          <stop offset=".55" stop-color="#0e1216"/><stop offset="1" stop-color="#080b0e"/>
        </linearGradient>
        <radialGradient id="dial-face" cx="45%" cy="30%" r="75%">
          <stop stop-color="#242a30"/><stop offset=".65" stop-color="#151a1f"/>
          <stop offset="1" stop-color="#0d1115"/>
        </radialGradient>
        <linearGradient id="bezel-metal" x1="0" y1="0" x2=".3" y2="1">
          <stop stop-color="#d3dbe1"/><stop offset=".35" stop-color="#667079"/>
          <stop offset=".65" stop-color="#4a545e"/><stop offset="1" stop-color="#c1cbd3"/>
        </linearGradient>
        <linearGradient id="needle-red" x1="0" y1="0" x2="1" y2="0">
          <stop stop-color="#b72222"/><stop offset=".45" stop-color="#ff4c37"/>
          <stop offset="1" stop-color="#ef352b"/>
        </linearGradient>
        <radialGradient id="needle-hub" cx="35%" cy="30%">
          <stop stop-color="#353b42"/><stop offset="1" stop-color="#101419"/>
        </radialGradient>
      </defs>
      <path d="M9,268 L9,141 C9,57 67,12 155,12 C222,12 255,37 284,57 Q310,72 336,57 C365,37 398,12 465,12 C553,12 611,57 611,141 L611,268 Q611,280 598,280 L22,280 Q9,280 9,268Z" class="cluster-shell"/>
      ${dial(155, 330, 30, 10, 'speed')}
      ${dial(465, 8, 1, 0.25, 'rpm')}
      <path d="M30,236 Q155,254 272,236 M348,236 Q465,254 590,236" class="cluster-lower-edge"/>
      <text id="speed" x="155" y="214" class="digital-speed">0</text>
      <text x="155" y="233" class="digital-unit">km/h</text>
      <g transform="translate(436 185) skewX(-18)">
        <path d="M0,0 H7 V14 H0Z" fill="#71bdea"/><path d="M8,0 H15 V14 H8Z" fill="#264d8f"/>
        <path d="M16,0 H23 V14 H16Z" fill="#e54b53"/>
      </g>
      <text x="464" y="200" class="m-mark">M</text>
      <text id="gear" x="310" y="218" class="gear-display">D1</text>
      <text x="310" y="239" class="transmission-label">M DCT</text>
      <text id="trip" x="310" y="265" class="trip-display">TRIP 0.0 km</text>
      <g id="low-beam-indicator" transform="translate(318 120) scale(-1 1)" class="low-beam-indicator" visibility="hidden">
        <path d="M6,0 Q-2,0 -2,7 Q-2,14 6,14Z M9,2 l8,-3 M9,6 l8,-3 M9,10 l8,-3 M9,14 l8,-3"/>
      </g>
    </svg>`;
  const svg = container.querySelector('svg');
  const speedNeedle = container.querySelector('#speed-needle');
  const rpmNeedle = container.querySelector('#rpm-needle');
  const speedText = container.querySelector('#speed');
  const gearText = container.querySelector('#gear');
  const tripText = container.querySelector('#trip');
  const lowBeams = container.querySelector('#low-beam-indicator');
  const motion = new InstrumentMotion();
  let textTime = 0;
  return {
    reset() {
      motion.initialized = false;
    },
    update(dt, simulation, night) {
      if (!simulation) return;
      motion.update(dt, simulation.speed, simulation.powertrain.rpm);
      speedNeedle.setAttribute(
        'transform',
        `rotate(${gaugeAngle(motion.speed, 330).toFixed(3)} 155 137)`
      );
      rpmNeedle.setAttribute(
        'transform',
        `rotate(${gaugeAngle(motion.rpm, 8000).toFixed(3)} 465 137)`
      );
      textTime -= dt;
      if (textTime <= 0) {
        textTime = 0.1;
        const speed = Math.round(simulation.speed * 3.6),
          gear = `D${simulation.powertrain.gear}`;
        speedText.textContent = String(speed);
        gearText.textContent = gear;
        tripText.textContent = `TRIP ${(simulation.distance / 1000).toFixed(1)} km`;
        lowBeams.setAttribute('visibility', night ? 'visible' : 'hidden');
        svg.setAttribute(
          'aria-label',
          `BMW M5 instrument cluster: ${speed} km/h, ${Math.round(simulation.powertrain.rpm)} rpm, gear ${gear}`
        );
      }
    },
  };
}
