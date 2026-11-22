import {
  roadCenterZ,
  roadCenterSlope,
  roadEdge,
  roadLanes,
  roadPeriod,
  obstacles,
  branchOffset,
  guardrailsEnabled,
} from './road-profile.js';
import { railLines } from './roadside.js';

// Road-ahead schematic in the top left corner, like a navigation display.
// Up is the road's direction at the car; the road ahead is drawn with its
// sideways deviation from that direction magnified, so gentle curves and the
// car's place in its lane read at a glance. Below: the next curve and speed
// bump, with distances.
export const minimapView = Object.freeze({
  ahead: 1500,
  behind: 120,
  forwardMetresPerPixel: 14,
  lateralMetresPerPixel: 1.25,
});
// Curvature (1/m) above which a stretch counts as a curve: radius < 3 km.
const curveThreshold = 1 / 3000;

// World point to schematic pixels.
export function toMinimap(simulation, x, z, width, height) {
  const forward = x - simulation.x,
    tangent = roadCenterZ(simulation.x) + roadCenterSlope(simulation.x) * forward;
  return [
    width / 2 + (z - tangent) / minimapView.lateralMetresPerPixel,
    height * 0.8 - forward / minimapView.forwardMetresPerPixel,
  ];
}

function roadHeadingAt(x) {
  return -Math.atan(roadCenterSlope(x));
}

// The next stretch whose curvature exceeds the threshold, with its direction
// (positive heading change turns toward -z, the driver's left).
export function nextCurve(x, range = minimapView.ahead) {
  let inCurve = Math.abs(roadHeadingAt(x + 5) - roadHeadingAt(x - 5)) / 10 > curveThreshold;
  for (let d = 0; d <= range; d += 10) {
    const k = (roadHeadingAt(x + d + 5) - roadHeadingAt(x + d - 5)) / 10;
    const curving = Math.abs(k) > curveThreshold;
    if (curving && !inCurve) return { distance: d, direction: k > 0 ? 'left' : 'right' };
    inCurve = curving;
  }
  return null;
}

// Distance to the next full-width speed bump.
export function nextSpeedBump(x) {
  let best = Infinity;
  for (const o of obstacles) {
    if (o.w < 5) continue;
    const d = (((o.x - x) % roadPeriod) + roadPeriod) % roadPeriod;
    best = Math.min(best, d);
  }
  return best;
}

export function setupMinimap(container) {
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const trail = [];
  let elapsed = 0,
    trailDistance = -Infinity;
  function resize() {
    const ratio = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(container.clientWidth * ratio);
    canvas.height = Math.round(container.clientHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resize();
  addEventListener('resize', resize);
  return {
    reset() {
      trail.length = 0;
      trailDistance = -Infinity;
    },
    update(dt, simulation) {
      if (!simulation || container.offsetWidth === 0) return;
      if (simulation.distance - trailDistance > 3 || simulation.distance < trailDistance) {
        trailDistance = simulation.distance;
        trail.push([simulation.x, simulation.z]);
        if (trail.length > 50) trail.shift();
      }
      elapsed -= dt;
      if (elapsed > 0) return;
      elapsed = 1 / 20;
      const w = container.clientWidth,
        h = container.clientHeight,
        { ahead, behind, lateralMetresPerPixel } = minimapView;
      const at = (x, z) => toMinimap(simulation, x, z, w, h);
      ctx.clearRect(0, 0, w, h);
      const from = simulation.x - behind,
        to = simulation.x + ahead;
      // A line at a lateral offset: a constant, or a function of x that is
      // null where the line is absent (the branch and its rails).
      const line = (offset, width, colour, dash = []) => {
        ctx.beginPath();
        let drawing = false;
        for (let x = from; x <= to; x += 15) {
          const lateral = typeof offset === 'function' ? offset(x) : offset;
          if (lateral === null) {
            drawing = false;
            continue;
          }
          const [px, py] = at(x, roadCenterZ(x) + lateral);
          if (drawing) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          drawing = true;
        }
        ctx.lineWidth = width;
        ctx.strokeStyle = colour;
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      line(0, (2 * roadEdge) / lateralMetresPerPixel, 'rgba(205,215,225,0.32)');
      for (const lane of roadLanes.slice(0, -1))
        line(lane + 1.8, 0.8, 'rgba(255,255,255,0.45)', [3, 4]);
      // The country road: an unpaved track.
      line(branchOffset, 3 / lateralMetresPerPixel, 'rgba(196,160,104,0.5)');
      if (guardrailsEnabled)
        for (const rail of railLines) line(rail.lateral, 1.2, 'rgba(190,205,215,0.8)');
      // Speed bumps across the road.
      const first = Math.floor(from / roadPeriod) * roadPeriod;
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,200,70,0.95)';
      for (let base = first; base < to; base += roadPeriod)
        for (const o of obstacles) {
          const x = base + o.x;
          if (o.w < 5 || x < from || x > to) continue;
          const z = roadCenterZ(x);
          const [ax, ay] = at(x, z - roadEdge),
            [bx, by] = at(x, z + roadEdge);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      // Recent path.
      if (trail.length > 1) {
        ctx.beginPath();
        trail.forEach(([x, z], i) => {
          const [px, py] = at(x, z);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(120,190,255,0.75)';
        ctx.stroke();
      }
      // The car at its place in the lane, tilted by its angle to the road.
      const [cx, cy] = at(simulation.x, simulation.z);
      const tilt = Math.max(
        -0.8,
        Math.min(0.8, -(simulation.heading - roadHeadingAt(simulation.x)) * 6)
      );
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // Upcoming curve and speed bump.
      const curve = nextCurve(simulation.x),
        bump = nextSpeedBump(simulation.x);
      ctx.font = '600 10px "Helvetica Neue", Arial, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(8,12,16,0.55)';
      ctx.fillRect(0, h - 30, w, 30);
      ctx.fillStyle = '#eaf2f7';
      ctx.textAlign = 'left';
      ctx.fillText(
        curve
          ? `${curve.direction === 'left' ? '↰' : '↱'} ${Math.round(curve.distance)} m`
          : '↑ straight',
        7,
        h - 17
      );
      // A layout may have no speed bump at all.
      if (Number.isFinite(bump)) {
        ctx.fillStyle = '#ffc846';
        ctx.fillText(`▬ bump ${Math.round(bump)} m`, 7, h - 5);
      }
    },
  };
}
