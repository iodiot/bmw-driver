const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const suspensionCorners = ['FL', 'FR', 'RL', 'RR'];

export function wheelCorner(wheel) {
  return (wheel.x > 0 ? 'F' : 'R') + (wheel.z > 0 ? 'L' : 'R');
}

function station(corner, i) {
  const left = i % 2 === 0,
    x = left ? 56 : 194,
    y = i < 2 ? 38 : 142;
  return `
    <g data-corner="${corner}" transform="translate(${x} ${y})">
      <title>${corner} suspension</title>
      <text y="-24" class="suspension-corner">${corner}</text>
      <text y="-7" class="wheel-load">4.5 kN</text>
      <rect x="-27" y="12" width="3" height="29" rx="1.5" class="load-rail"/>
      <rect x="-27" y="27" width="3" height="14" rx="1.5" class="load-fill"/>
      <g transform="scale(${left ? 1 : -1} 1)">
        <path d="M-10 8H14M14 8H42" class="suspension-link"/>
        <path class="damper-rod" d="M9 8V21"/>
        <path class="spring-coil"/>
        <g class="suspension-wheel">
          <path d="M-10 35H27" class="suspension-link"/>
          <rect x="6" y="21" width="6" height="14" rx="2" class="damper-cylinder"/>
          <rect x="22" y="22" width="10" height="27" rx="3" class="tyre-outline"/>
          <path d="M25 26V45M29 26V45" class="tyre-tread"/>
        </g>
      </g>
      <text y="59" class="wheel-travel">0 mm</text>
    </g>`;
}

function coil(end) {
  let path = 'M-4 8';
  for (let i = 1; i <= 8; i++) {
    const y = 8 + ((end - 8) * i) / 9;
    path += `L${i % 2 ? -9 : 1} ${y.toFixed(2)}`;
  }
  return path + `L-4 ${end.toFixed(2)}`;
}

export function setupSuspensionDisplay(container) {
  container.innerHTML = `
    <h2>Suspension <span>LOAD / TRAVEL</span></h2>
    <svg viewBox="0 0 250 212" role="img" aria-label="Live four-wheel suspension">
      <path d="m122 7 3-4 3 4 M125 3v10" class="car-front-arrow"/>
      <path d="M112 26Q99 28 99 44V170Q100 187 112 190H138Q150 187 151 170V44Q151 28 138 26Z" class="suspension-car"/>
      <path d="m102 58 8-13h30l8 13M102 58h46M103 146l8 13h28l8-13M103 146h44M104 69v66M146 69v66" class="suspension-car-detail"/>
      ${suspensionCorners.map(station).join('')}
    </svg>`;
  const svg = container.querySelector('svg');
  const stations = new Map(
    suspensionCorners.map((corner) => {
      const root = container.querySelector(`[data-corner="${corner}"]`);
      return [
        corner,
        {
          root,
          title: root.querySelector('title'),
          coil: root.querySelector('.spring-coil'),
          wheel: root.querySelector('.suspension-wheel'),
          rod: root.querySelector('.damper-rod'),
          cylinder: root.querySelector('.damper-cylinder'),
          load: root.querySelector('.wheel-load'),
          travel: root.querySelector('.wheel-travel'),
          bar: root.querySelector('.load-fill'),
        },
      ];
    })
  );
  for (const station of stations.values()) station.coil.setAttribute('d', coil(35));
  let elapsed = 0;
  return {
    update(dt, simulation) {
      if (!simulation) return;
      elapsed -= dt;
      if (elapsed > 0) return;
      elapsed = 1 / 30;
      const descriptions = [];
      for (const wheel of simulation.wheels) {
        const corner = wheelCorner(wheel),
          station = stations.get(corner);
        if (!station) continue;
        const travel = Math.round(wheel.compression * 1000);
        const offset = clamp(wheel.compression * 1000, -120, 65) * 0.12;
        const load = Math.max(0, wheel.load),
          relativeLoad = load / wheel.staticLoad;
        const barHeight = clamp(relativeLoad / 2, 0, 1) * 29;
        const moving = Math.abs(wheel.compressionVelocity) > 0.015;
        const direction = moving ? (wheel.compressionVelocity > 0 ? '↑ ' : '↓ ') : '';
        const color = !wheel.contact
          ? '#788691'
          : moving
            ? wheel.compressionVelocity > 0
              ? '#e2b685'
              : '#93c5df'
            : '#afc6d5';
        station.coil.setAttribute('d', coil(35 - offset));
        station.wheel.setAttribute('transform', `translate(0 ${(-offset).toFixed(2)})`);
        station.rod.setAttribute('d', `M9 8V${(21 - offset).toFixed(2)}`);
        station.cylinder.style.stroke = color;
        station.cylinder.style.fillOpacity = String(
          0.1 + clamp(Math.abs(wheel.damperForce) / 6000, 0, 1) * 0.5
        );
        station.bar.setAttribute('height', barHeight.toFixed(2));
        station.bar.setAttribute('y', (41 - barHeight).toFixed(2));
        station.bar.style.fill = relativeLoad > 1.6 ? '#e2b685' : '#95c3db';
        station.load.textContent = `${(load / 1000).toFixed(1)} kN`;
        station.travel.textContent = `${direction}${travel > 0 ? '+' : ''}${travel} mm`;
        station.travel.style.fill = color;
        station.root.dataset.load = load.toFixed(1);
        station.root.dataset.travel = travel;
        station.root.dataset.damperForce = wheel.damperForce.toFixed(1);
        station.root.dataset.contact = String(wheel.contact);
        const description = `${corner}: ${(load / 1000).toFixed(1)} kN load, ${travel} mm travel, ${(wheel.damperForce / 1000).toFixed(1)} kN damper force`;
        station.title.textContent = description;
        descriptions.push(description);
      }
      svg.setAttribute('aria-label', descriptions.join('; '));
    },
  };
}
