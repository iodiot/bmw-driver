const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const suspensionCorners = ['FL', 'FR', 'RL', 'RR'];
const cornerNames = { FL: 'Front left', FR: 'Front right', RL: 'Rear left', RR: 'Rear right' };
// Travel range shown on each gauge: compression up to the bump stop region,
// rebound down to full extension.
const maxCompression = 0.065,
  maxRebound = 0.12;

// Display smoothing (seconds): bars and the load dot, the numbers, how
// often the numbers change, and how long "In the air" stays after landing.
export const suspensionSmoothing = Object.freeze({
  bars: 0.15,
  text: 0.4,
  textInterval: 0.2,
  // A wheel counts as in the air after this long off the ground (bumps
  // cause brief bounces), and the label then stays for airHold.
  airAfter: 0.06,
  airHold: 0.3,
});

export function wheelCorner(wheel) {
  return (wheel.x > 0 ? 'F' : 'R') + (wheel.z > 0 ? 'L' : 'R');
}

// Share of the total tyre load carried by the front axle and the left side,
// and the centre of load in car coordinates (−1…1, front and left positive).
export function loadBalance(wheels) {
  let total = 0,
    front = 0,
    left = 0;
  for (const wheel of wheels) {
    const load = Math.max(0, wheel.load);
    total += load;
    if (wheel.x > 0) front += load;
    if (wheel.z > 0) left += load;
  }
  if (total <= 0) return { front: 0.5, left: 0.5, x: 0, y: 0 };
  return {
    front: front / total,
    left: left / total,
    x: clamp((left / total - 0.5) * 4, -1, 1),
    y: clamp((front / total - 0.5) * 4, -1, 1),
  };
}

// Travel in millimetres: positive is compression (bump), negative rebound.
export function travelGauge(compression) {
  const up = compression >= 0;
  return {
    mm: Math.round(compression * 1000),
    direction: up ? 'up' : 'down',
    fill: clamp(Math.abs(compression) / (up ? maxCompression : maxRebound), 0, 1),
  };
}

function card(corner) {
  return `
    <div class="susp-corner" data-corner="${corner}">
      <div class="susp-name">${cornerNames[corner]}</div>
      <div class="susp-load"><b>4.5</b> kN</div>
      <div class="susp-loadbar" title="Tyre load; the mark is the load at rest">
        <i></i><span></span>
      </div>
      <div class="susp-travel">
        <div class="susp-gauge" title="Suspension travel: up is compression, down is rebound">
          <i></i>
        </div>
        <span>0 mm</span>
      </div>
      <div class="susp-air">In the air</div>
    </div>`;
}

export function setupSuspensionDisplay(container) {
  container.innerHTML = `
    <div class="susp-head">
      <h2>Suspension</h2>
      <span class="susp-balance">Front 50% · Left 50%</span>
    </div>
    <div class="susp-grid">
      ${card('FL')}
      <div class="susp-car" aria-hidden="true">
        <svg viewBox="0 0 40 80">
          <path d="M12 3Q5 4 5 14V66Q6 76 12 77H28Q34 76 35 66V14Q35 4 28 3Z" class="susp-body"/>
          <path d="M8 22l4-6h16l4 6M8 22h24M8 60l4 6h16l4-6M8 60h24" class="susp-glass"/>
          <path d="M20 -1l-3 4h6z" class="susp-nose"/>
        </svg>
        <i class="susp-centre"></i>
      </div>
      ${card('FR')}
      ${card('RL')}
      ${card('RR')}
    </div>
`;
  const narrow = matchMedia('(max-width: 620px)');
  const balanceText = container.querySelector('.susp-balance'),
    centre = container.querySelector('.susp-centre');
  const cards = new Map(
    suspensionCorners.map((corner) => {
      const root = container.querySelector(`[data-corner="${corner}"]`);
      return [
        corner,
        {
          root,
          load: root.querySelector('.susp-load b'),
          bar: root.querySelector('.susp-loadbar i'),
          gauge: root.querySelector('.susp-gauge i'),
          travel: root.querySelector('.susp-travel span'),
        },
      ];
    })
  );
  // What the widget shows is smoothed: bars and the load dot follow quickly
  // enough to show bumps and weight transfer, the numbers more slowly and
  // only a few times a second so they can be read, and "In the air" is held
  // briefly instead of blinking on every crest.
  const shown = new Map(
    suspensionCorners.map((corner) => [
      corner,
      { load: null, travel: 0, loadText: 0, travelText: 0, air: 0, off: 0 },
    ])
  );
  const balanceShown = { front: 0.5, left: 0.5, x: 0, y: 0, frontText: 0.5, leftText: 0.5 };
  let barClock = 0,
    textClock = 0;
  return {
    update(dt, simulation) {
      // Hidden on narrow screens: skip DOM work until it is shown again.
      if (!simulation || narrow.matches) return;
      dt = Math.min(dt, 0.1);
      const bars = 1 - Math.exp(-dt / suspensionSmoothing.bars),
        text = 1 - Math.exp(-dt / suspensionSmoothing.text);
      for (const wheel of simulation.wheels) {
        const state = shown.get(wheelCorner(wheel));
        if (!state) continue;
        const load = Math.max(0, wheel.load) / wheel.staticLoad;
        if (state.load === null) {
          state.load = state.loadText = load;
          state.travel = state.travelText = wheel.compression;
        }
        state.load += (load - state.load) * bars;
        state.travel += (wheel.compression - state.travel) * bars;
        state.loadText += (load - state.loadText) * text;
        state.travelText += (wheel.compression - state.travelText) * text;
        state.off = wheel.contact ? 0 : state.off + dt;
        if (state.off > suspensionSmoothing.airAfter) state.air = suspensionSmoothing.airHold;
        else state.air = Math.max(0, state.air - dt);
        state.staticLoad = wheel.staticLoad;
      }
      const balance = loadBalance(simulation.wheels);
      for (const k of ['front', 'left', 'x', 'y'])
        balanceShown[k] += (balance[k] - balanceShown[k]) * bars;
      balanceShown.frontText += (balance.front - balanceShown.frontText) * text;
      balanceShown.leftText += (balance.left - balanceShown.leftText) * text;
      barClock -= dt;
      textClock -= dt;
      if (barClock > 0) return;
      barClock = 1 / 30;
      const writeText = textClock <= 0;
      if (writeText) textClock = suspensionSmoothing.textInterval;
      const descriptions = [];
      for (const [corner, state] of shown) {
        const card = cards.get(corner);
        if (!card || state.load === null) continue;
        const gauge = travelGauge(state.travel),
          inAir = state.air > 0;
        card.bar.style.width = `${(clamp(state.load / 2, 0, 1) * 100).toFixed(1)}%`;
        card.root.classList.toggle('heavy', state.load > 1.5);
        card.root.classList.toggle('light', !inAir && state.load < 0.5);
        card.root.classList.toggle('air', inAir);
        card.gauge.style.height = `${(gauge.fill * 50).toFixed(1)}%`;
        card.gauge.dataset.direction = gauge.direction;
        const loadN = state.loadText * state.staticLoad,
          travelMm = travelGauge(state.travelText).mm;
        card.root.dataset.load = loadN.toFixed(1);
        card.root.dataset.travel = travelMm;
        card.root.dataset.contact = String(!inAir);
        if (writeText) {
          card.load.textContent = (loadN / 1000).toFixed(1);
          card.travel.textContent = `${travelMm > 0 ? '+' : ''}${travelMm} mm`;
        }
        descriptions.push(
          `${cornerNames[corner]}: ${(loadN / 1000).toFixed(1)} kN, ${travelMm} mm ${travelMm >= 0 ? 'compression' : 'rebound'}${inAir ? ', in the air' : ''}`
        );
      }
      // The dot shows where the load is: forward under braking, outward in a turn.
      centre.style.transform = `translate(${(-balanceShown.x * 12).toFixed(1)}px, ${(-balanceShown.y * 26).toFixed(1)}px)`;
      if (writeText) {
        balanceText.textContent = `Front ${Math.round(balanceShown.frontText * 100)}% · Left ${Math.round(balanceShown.leftText * 100)}%`;
        container.setAttribute('aria-label', `Suspension. ${descriptions.join('; ')}`);
      }
    },
  };
}
