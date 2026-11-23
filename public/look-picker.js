import { paints, wheelFinishes } from './car-look.js';
import { graphicsLevels, graphicsPresets } from './settings.js';

// Swatches for the paint and the wheels, opened from the top panel's paint
// button. A click applies the choice at once; Escape, the button again or a
// click elsewhere closes it.
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export function setupLookPicker(
  container,
  { look, onChange, graphics = 'auto', onGraphics, onOpen }
) {
  const panel = document.createElement('div');
  panel.className = 'look-picker';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Paint, wheels and graphics');
  const group = (title, kind, items, swatch) => `
    <h3>${title}<span data-name="${kind}"></span></h3>
    <div class="look-swatches" role="group" aria-label="${title}">
      ${items
        .map(
          (item) =>
            `<button type="button" data-kind="${kind}" data-id="${item.id}" title="${item.name}" aria-label="${item.name}" style="--swatch:${swatch(item)}"></button>`
        )
        .join('')}
    </div>`;
  panel.innerHTML =
    group('Paint', 'paint', paints, (p) =>
      p.metal > 0.3
        ? `radial-gradient(circle at 35% 30%, ${hex(p.colour)}, ${hex(p.colour)} 40%, #000 130%), ${hex(p.colour)}`
        : hex(p.colour)
    ) +
    group('Wheels', 'wheels', wheelFinishes, (w) =>
      w.id === 'silver'
        ? 'linear-gradient(135deg, #e9edf0, #8d949a)'
        : `linear-gradient(135deg, ${hex(w.tint)}, #000 160%)`
    );
  panel.insertAdjacentHTML(
    'beforeend',
    `<h3>Graphics</h3>
    <div class="look-graphics" role="group" aria-label="Graphics">
      ${graphicsLevels
        .map(
          (level) =>
            `<button type="button" data-graphics="${level}">${graphicsPresets[level].label}</button>`
        )
        .join('')}
    </div>`
  );
  // Doors, bonnet and boot, opened while the car stands (O, B and K).
  panel.insertAdjacentHTML(
    'beforeend',
    `<h3>Open</h3>
    <div class="look-graphics" role="group" aria-label="Open">
      <button type="button" data-open="doors" title="Doors (O)">Doors</button>
      <button type="button" data-open="bonnet" title="Bonnet (B)">Bonnet</button>
      <button type="button" data-open="boot" title="Boot (K)">Boot</button>
    </div>`
  );
  container.append(panel);
  const current = { ...look };
  let level = graphics;
  const showGraphics = () => {
    for (const button of panel.querySelectorAll('[data-graphics]'))
      button.setAttribute('aria-pressed', String(button.dataset.graphics === level));
  };
  showGraphics();
  const show = () => {
    for (const button of panel.querySelectorAll('button[data-kind]'))
      button.setAttribute(
        'aria-pressed',
        String(current[button.dataset.kind] === button.dataset.id)
      );
    panel.querySelector('[data-name="paint"]').textContent = paints.find(
      (p) => p.id === current.paint
    )?.name;
    panel.querySelector('[data-name="wheels"]').textContent = wheelFinishes.find(
      (w) => w.id === current.wheels
    )?.name;
  };
  show();
  let opener = null;
  const close = () => {
    panel.hidden = true;
    opener?.setAttribute('aria-expanded', 'false');
  };
  panel.addEventListener('click', (e) => {
    const part = e.target.closest('button[data-open]');
    if (part) {
      onOpen?.(part.dataset.open);
      part.blur();
      return;
    }
    const choice = e.target.closest('button[data-graphics]');
    if (choice) {
      level = choice.dataset.graphics;
      showGraphics();
      onGraphics?.(level);
      choice.blur();
      return;
    }
    const button = e.target.closest('button[data-kind]');
    if (!button) return;
    current[button.dataset.kind] = button.dataset.id;
    show();
    onChange({ ...current });
    // The keyboard drives the car again.
    button.blur();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !opener?.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
  return {
    panel,
    // The graphics level chosen elsewhere (the frame rate's button).
    setGraphics(chosen) {
      level = chosen;
      showGraphics();
    },
    // Which of the doors, bonnet and boot are open.
    setOpen(open) {
      for (const button of panel.querySelectorAll('[data-open]'))
        button.setAttribute('aria-pressed', String(Boolean(open[button.dataset.open])));
    },
    close() {
      panel.hidden = true;
      opener?.setAttribute('aria-expanded', 'false');
    },
    toggle(button) {
      opener = button;
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
    },
  };
}
