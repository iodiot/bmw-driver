import {
  roadCenterZ,
  roadCenterSlope,
  roadEdge,
  roadLanes,
  roadPeriod,
  obstacles,
  branchOffset,
  fuelStationPlace,
  roadBranch,
  oncoming,
  oncomingCentre,
} from './road-profile.js';
import { structureLayout, nearestOccurrence } from './road-structures.js';
import { elevationPeriod, roadElevation, roadGrade } from './terrain.js';
import { route } from './route.js';

// Road-ahead schematic in the top left corner, like a navigation display.
// Up is the road's direction at the car; the road ahead is drawn with its
// sideways deviation from that direction magnified, so gentle curves and the
// car's place in its lane read at a glance, with the next curve's distance.
// Below it: the height above sea level and the grade, and the land's profile
// from a little behind the car to the end of the map.
// Seen in perspective, as a navigation display shows it: from above and
// behind the car, the road narrowing toward the horizon. Its curves are
// bent `curveGain` times the road's real deviation, so they read from afar;
// things far beside the road come in closer (`sideGain`).
export const minimapView = Object.freeze({
  ahead: 1500,
  behind: 40,
  // The eye: this far behind the car (m), and how high over the land the
  // horizon and the car sit on the map (shares of its height).
  eyeBack: 70,
  horizon: 0.1,
  carAt: 0.8,
  // The asphalt's width at the car, as a share of the map's width.
  roadShare: 0.16,
  curveGain: 3,
  sideGain: 0.45,
});
// Perspective projection: a point `forward` metres ahead and `lateral`
// metres to the side to map pixels, with its scale (pixels per metre).
export function project(forward, lateral, width, height) {
  const { eyeBack, horizon, carAt, roadShare } = minimapView;
  const depth = Math.max(1, forward + eyeBack);
  const focal = (roadShare * width * eyeBack) / (2 * roadEdge);
  const lift = ((carAt - horizon) * height * eyeBack) / focal;
  return [
    width / 2 + (focal * lateral) / depth,
    horizon * height + (focal * lift) / depth,
    focal / depth,
  ];
}
// A lateral offset from the road's centre as drawn: true on the road,
// closer beyond it.
export function drawnLateral(lateral) {
  const a = Math.abs(lateral);
  return (
    Math.sign(lateral) *
    (a <= roadEdge + 2 ? a : roadEdge + 2 + (a - roadEdge - 2) * minimapView.sideGain)
  );
}
// The road's centre at x, its sideways deviation from the car's heading
// along the road (magnified), in metres.
function centreDeviation(simulation, x) {
  const forward = x - simulation.x,
    tangent = roadCenterZ(simulation.x) + roadCenterSlope(simulation.x) * forward;
  return (roadCenterZ(x) - tangent) * minimapView.curveGain;
}
// Curvature (1/m) above which a stretch counts as a curve: radius < 3 km.
const curveThreshold = 1 / 3000;

// World point to map pixels.
export function toMinimap(simulation, x, z, width, height) {
  const lateral = centreDeviation(simulation, x) + drawnLateral(z - roadCenterZ(x));
  const [px, py] = project(x - simulation.x, lateral, width, height);
  return [px, py];
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

// Height above sea level (m): the forest-steppe south-west of Kyiv lies
// some 170 m up, and the hills rise and fall about it.
export const baseAltitude = 170;
export const altitudeAt = (x) => baseAltitude + roadElevation(x);
// The land's lowest and highest over a section, so the profile's scale
// stays put as the car drives.
const landRange = (() => {
  let low = Infinity,
    high = -Infinity;
  for (let x = 0; x < elevationPeriod; x += 10) {
    const h = roadElevation(x);
    low = Math.min(low, h);
    high = Math.max(high, h);
  }
  return [low - 1, high + 1];
})();

// The grade as shown: an arrow up or down, or level, and a colour.
export function gradeLabel(grade) {
  const percent = Math.abs(grade) * 100;
  if (percent < 0.5) return { arrow: '→', text: 'level', colour: '#dfe8ee' };
  return grade > 0
    ? { arrow: '↗', text: `${percent.toFixed(1)}%`, colour: '#ffc56b' }
    : { arrow: '↘', text: `${percent.toFixed(1)}%`, colour: '#7fd7ff' };
}

const font = (weight, size) =>
  `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;

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
  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };
  return {
    reset() {
      trail.length = 0;
      trailDistance = -Infinity;
    },
    // `vehicles`: the traffic (see traffic.js), drawn as small blocks.
    update(dt, simulation, vehicles = []) {
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
        { ahead, behind } = minimapView;
      // A full panel has the land's profile under the map; a small one (a
      // phone's) one line of figures.
      const full = h >= 190;
      const infoH = full ? 78 : 18,
        mapH = h - infoH;
      ctx.clearRect(0, 0, w, h);
      // The figures and the profile on top, the map under them.
      ctx.save();
      ctx.translate(0, infoH);
      ctx.beginPath();
      ctx.rect(0, 0, w, mapH);
      ctx.clip();
      const from = simulation.x - behind,
        to = simulation.x + ahead;
      // A point `lateral` metres (as drawn) off the road's centre at x.
      const P = (x, lateral) =>
        project(x - simulation.x, centreDeviation(simulation, x) + lateral, w, mapH);
      // Samples along the road: close together near the car, farther apart
      // far off.
      const samples = [];
      for (let x = from; x <= to; x += 3 + 0.03 * Math.max(0, x - simulation.x)) samples.push(x);
      samples.push(to);
      // A band along the road between two lateral offsets (as drawn).
      const band = (a, b, colour, start = from, end = to) => {
        const xs = samples.filter((x) => x >= start && x <= end);
        if (xs.length < 2) return;
        ctx.beginPath();
        xs.forEach((x, i) => {
          const [px, py] = P(x, a);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        for (let i = xs.length - 1; i >= 0; i--) {
          const [px, py] = P(xs[i], b);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = colour;
        ctx.fill();
      };
      // A line along the road at a lateral offset (or a function of x, null
      // where absent), its width in metres so it narrows with distance.
      const strip = (offset, metres, colour, minimum = 0.6) => {
        let previous = null;
        for (const x of samples) {
          const lateral = typeof offset === 'function' ? offset(x) : offset;
          if (lateral === null) {
            previous = null;
            continue;
          }
          const point = P(x, drawnLateral(lateral));
          if (previous) {
            ctx.beginPath();
            ctx.moveTo(previous[0], previous[1]);
            ctx.lineTo(point[0], point[1]);
            ctx.lineWidth = Math.max(minimum, metres * point[2]);
            ctx.strokeStyle = colour;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
          previous = point;
        }
      };
      // The fields: stripes across every 50 m, fixed to the land, so they
      // run toward the car as it drives.
      for (let x = Math.ceil(from / 50) * 50; x <= to; x += 50) {
        const [, py, scale] = P(x, 0);
        ctx.fillStyle = `rgba(190,220,170,${Math.min(0.16, scale * 0.05)})`;
        ctx.fillRect(0, py, w, Math.max(0.6, scale * 4));
      }
      // The country road: an unpaved track.
      // (A band of its own, in runs where it exists, so it is drawn evenly.)
      let run = [];
      const track = () => {
        if (run.length > 1) {
          ctx.beginPath();
          run.forEach((x, i) => {
            const [px, py] = P(x, drawnLateral(branchOffset(x) - 1.5));
            if (i) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
          });
          for (let i = run.length - 1; i >= 0; i--) {
            const [px, py] = P(run[i], drawnLateral(branchOffset(run[i]) + 1.5));
            ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(220,184,124,0.6)';
          ctx.fill();
        }
        run = [];
      };
      for (const x of samples) {
        if (branchOffset(x) === null) track();
        else run.push(x);
      }
      track();
      // The motorway: a dark casing, the light see-through asphalt, its
      // edge lines and the lane dashes, fixed to the road so they run.
      // (On the route the oncoming carriageway beside it, a little dimmer,
      // past the median.)
      if (oncoming) {
        band(
          oncomingCentre - roadEdge - 1.4,
          oncomingCentre + roadEdge + 1.4,
          'rgba(6,10,16,0.45)'
        );
        band(oncomingCentre - roadEdge, oncomingCentre + roadEdge, 'rgba(206,216,226,0.28)');
        strip(oncomingCentre - roadEdge + 0.3, 0.35, 'rgba(255,255,255,0.6)');
        strip(oncomingCentre + roadEdge - 0.3, 0.35, 'rgba(255,255,255,0.6)');
      }
      band(-roadEdge - 1.4, roadEdge + 1.4, 'rgba(6,10,16,0.5)');
      band(-roadEdge, roadEdge, 'rgba(226,234,242,0.42)');
      strip(-roadEdge + 0.3, 0.35, 'rgba(255,255,255,0.85)');
      strip(roadEdge - 0.3, 0.35, 'rgba(255,255,255,0.85)');
      for (let x = Math.ceil(from / 12) * 12; x < to; x += 12)
        for (const lane of roadLanes.slice(0, -1)) {
          const [ax, ay, scale] = P(x, lane + 1.8),
            [bx, by] = P(x + 6, lane + 1.8);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.lineWidth = Math.max(0.5, 0.25 * scale);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineCap = 'butt';
          ctx.stroke();
        }
      // A bar across the road at x from lateral `a` to `b`, `metres` deep.
      const bar = (x, a, b, metres, fill, outline) => {
        const [ax, ay] = P(x - metres / 2, a),
          [bx, by] = P(x - metres / 2, b),
          [cx2, cy2] = P(x + metres / 2, b),
          [dx, dy] = P(x + metres / 2, a);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(cx2, cy2);
        ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (outline) {
          ctx.lineWidth = 1;
          ctx.strokeStyle = outline;
          ctx.stroke();
        }
      };
      // The same, `half` metres either side of the centre line.
      const across = (x, half, metres, fill, outline) => bar(x, -half, half, metres, fill, outline);
      // Speed bumps across the road: a thin strip striped yellow and black,
      // as they are painted.
      const first = Math.floor(from / roadPeriod) * roadPeriod;
      for (let base = first; base < to; base += roadPeriod)
        for (const o of obstacles) {
          const x = base + o.x;
          if (o.w < 5 || o.h < 0 || x < from || x > to) continue;
          const stripes = 8;
          for (let i = 0; i < stripes; i++) {
            const a = -roadEdge + ((2 * roadEdge) / stripes) * i;
            bar(
              x,
              a,
              a + (2 * roadEdge) / stripes,
              1.6,
              i % 2 ? 'rgba(20,22,26,0.95)' : 'rgba(255,206,64,0.98)'
            );
          }
        }
      // The tunnel: the road under the hill, dark, its portals marked.
      const { tunnel, bridges, period } = structureLayout;
      const tunnels = [];
      for (let base = nearestOccurrence(from, tunnel.from) - period; base < to; base += period) {
        const a = Math.max(from, base),
          b = Math.min(to, base + (tunnel.to - tunnel.from));
        if (b <= a) continue;
        tunnels.push([a, b]);
        band(-roadEdge - 2.5, roadEdge + 2.5, 'rgba(8,11,16,0.82)', a, b);
        for (const x of [base, base + (tunnel.to - tunnel.from)])
          if (x >= from && x <= to) across(x, roadEdge + 3.5, 6, 'rgba(214,202,178,0.95)');
      }
      // Bridges: an overpass over the road (both carriageways on the route),
      // its shadow on the asphalt, a concrete deck and a railing along each
      // edge.
      const decks = [];
      const bridgeFrom = oncoming ? oncomingCentre - roadEdge - 4 : -roadEdge - 4,
        bridgeTo = roadEdge + 4;
      for (const u of bridges)
        for (let x = nearestOccurrence(from, u) - period; x < to; x += period) {
          if (x < from || x > to) continue;
          decks.push(x);
          bar(x - 2, bridgeFrom, bridgeTo, 12, 'rgba(0,0,0,0.28)');
          bar(x, bridgeFrom, bridgeTo, 9, 'rgba(146,156,168,0.82)');
          for (const edge of [-4.4, 4.4])
            bar(x + edge, bridgeFrom, bridgeTo, 0.7, 'rgba(242,246,250,0.95)');
        }
      // The fuel station beside the country road: a green pump sign.
      const station = nearestOccurrence(simulation.x, fuelStationPlace.at);
      for (const at of [station - roadBranch.period, station, station + roadBranch.period]) {
        if (at < from || at > to) continue;
        const branch = branchOffset(at);
        if (branch === null) continue;
        const [sx, sy, scale] = P(at, drawnLateral(branch + 16));
        const r = Math.max(4, Math.min(8, scale * 6));
        roundRect(sx - r, sy - r, 2 * r, 2 * r, r * 0.4);
        ctx.fillStyle = 'rgba(22,132,71,0.95)';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = font(700, r * 1.25);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⛽', sx, sy + 0.5);
      }
      // The traffic, each vehicle a block of its size in its lane.
      for (const v of vehicles) {
        if (v.x < from || v.x > to) continue;
        const half = v.width / 2;
        const [ax, ay] = P(v.x - v.length / 2, v.lat - half),
          [bx] = P(v.x - v.length / 2, v.lat + half),
          [, cy2] = P(v.x + v.length / 2, v.lat);
        const wide = Math.max(1.6, bx - ax),
          tall = Math.max(1.6, ay - cy2);
        if (v.lorry) {
          // A lorry: a long light trailer and a dark cab at its front (the
          // end toward its way).
          ctx.fillStyle = 'rgba(214,224,234,0.95)';
          roundRect(ax, cy2, wide, tall, Math.min(1.2, wide / 4));
          ctx.fill();
          const cab = Math.max(1.4, tall * 0.2),
            ahead = !v.oncoming;
          ctx.fillStyle = 'rgba(28,40,56,0.95)';
          roundRect(ax, ahead ? cy2 : cy2 + tall - cab, wide, cab, Math.min(1.2, wide / 4));
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(22,30,42,0.88)';
          roundRect(ax, cy2, wide, tall, Math.min(1.5, wide / 3));
          ctx.fill();
        }
      }
      // The car at its place in the lane, tilted by its angle to the road,
      // glowing blue.
      const [cx, cy, carScale] = P(
        simulation.x,
        drawnLateral(simulation.z - roadCenterZ(simulation.x))
      );
      const tilt = Math.max(
        -0.8,
        Math.min(0.8, -(simulation.heading - roadHeadingAt(simulation.x)) * 3)
      );
      const size = Math.max(0.8, Math.min(1.4, carScale / 2.2));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.scale(size, size);
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, 10);
      halo.addColorStop(0, 'rgba(90,170,255,0.6)');
      halo.addColorStop(1, 'rgba(90,170,255,0)');
      ctx.fillStyle = halo;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(4.6, 5);
      ctx.lineTo(0, 2.6);
      ctx.lineTo(-4.6, 5);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(30,110,220,0.95)';
      ctx.lineWidth = 1.4;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // The distance fades out at the top.
      const fade = ctx.createLinearGradient(0, 0, 0, mapH * 0.3);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, mapH * 0.3);
      ctx.globalCompositeOperation = 'source-over';
      // The upcoming curve, in a small label at the map's foot (left out
      // on a phone's small map).
      const curve = full ? nextCurve(simulation.x) : null;
      const curveText = curve
        ? `${curve.direction === 'left' ? '↰' : '↱'} ${Math.round(curve.distance)} m`
        : '↑ straight';
      if (full) {
        ctx.font = font(650, 10);
        const chipW = ctx.measureText(curveText).width + 12;
        roundRect(6, mapH - 22, chipW, 16, 7);
        ctx.fillStyle = 'rgba(8,12,18,0.72)';
        ctx.fill();
        ctx.fillStyle = '#eaf2f7';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(curveText, 12, mapH - 14);
      }
      ctx.restore();
      // Above the map: the height and grade, and the land's profile.
      const altitude = Math.round(altitudeAt(simulation.x));
      const grade = gradeLabel(roadGrade(simulation.x) * Math.cos(simulation.heading));
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, infoH - 1, w, 1);
      if (!full) {
        ctx.font = font(650, 9.5);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#eef4f8';
        ctx.fillText(`${altitude} m`, 6, 9.5);
        ctx.textAlign = 'right';
        ctx.fillStyle = grade.colour;
        ctx.fillText(grade.arrow, w - 6, 9.5);
        return;
      }
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.font = font(600, 8);
      ctx.fillStyle = 'rgba(220,232,240,0.55)';
      ctx.fillText('ALTITUDE', 10, 14);
      ctx.textAlign = 'right';
      ctx.fillText('GRADE', w - 10, 14);
      ctx.textAlign = 'left';
      ctx.font = font(700, 17);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(altitude), 10, 33);
      const numberW = ctx.measureText(String(altitude)).width;
      ctx.font = font(600, 10);
      ctx.fillStyle = 'rgba(230,238,244,0.75)';
      ctx.fillText('m', 12 + numberW, 33);
      ctx.textAlign = 'right';
      ctx.font = font(700, 13);
      ctx.fillStyle = grade.colour;
      ctx.fillText(`${grade.arrow} ${grade.text}`, w - 10, 32);
      // The profile: from `behind` metres back to the end of the map.
      const px = 8,
        pw = w - 16,
        py = 40,
        ph = infoH - py - 6;
      // (On the route the land is not the same every section: scaled to the
      // stretch shown, at least 14 m tall.)
      let [low, high] = landRange;
      if (route) {
        low = Infinity;
        high = -Infinity;
        for (let x = from; x <= to; x += 40) {
          const h = roadElevation(x);
          low = Math.min(low, h);
          high = Math.max(high, h);
        }
        const middle = (low + high) / 2,
          half = Math.max(7, (high - low) / 2 + 1);
        low = middle - half;
        high = middle + half;
      }
      const along = (x) => px + ((x - from) / (to - from)) * pw;
      const up = (x) => py + ph - ((roadElevation(x) - low) / (high - low)) * ph;
      ctx.beginPath();
      ctx.moveTo(px, py + ph);
      for (let x = from; x <= to; x += 20) ctx.lineTo(along(x), up(x));
      ctx.lineTo(px + pw, py + ph);
      ctx.closePath();
      const land = ctx.createLinearGradient(0, py, 0, py + ph);
      land.addColorStop(0, 'rgba(140,196,120,0.55)');
      land.addColorStop(1, 'rgba(70,96,62,0.1)');
      ctx.fillStyle = land;
      ctx.fill();
      ctx.beginPath();
      for (let x = from; x <= to; x += 20)
        x === from ? ctx.moveTo(along(x), up(x)) : ctx.lineTo(along(x), up(x));
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(200,236,180,0.9)';
      ctx.stroke();
      // A tunnel: its hill over the road, the road dashed through it and its
      // name when there is room.
      for (const [a, b] of tunnels) {
        const xa = along(a),
          xb = along(b),
          top = Math.max(py + 2, Math.min(up(a), up(b)) - 10);
        ctx.beginPath();
        ctx.moveTo(xa - 4, up(a));
        ctx.bezierCurveTo(xa + (xb - xa) * 0.2, top, xb - (xb - xa) * 0.2, top, xb + 4, up(b));
        ctx.closePath();
        ctx.fillStyle = 'rgba(52,78,48,0.9)';
        ctx.fill();
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        for (let x = a; x <= b; x += 20)
          x === a ? ctx.moveTo(along(x), up(x)) : ctx.lineTo(along(x), up(x));
        ctx.strokeStyle = 'rgba(236,240,244,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        for (const x of [a, b]) {
          ctx.beginPath();
          ctx.arc(along(x), up(x), 2.2, Math.PI, 0);
          ctx.fillStyle = 'rgba(8,10,14,0.9)';
          ctx.fill();
        }
        if (xb - xa > 34) {
          ctx.font = font(700, 7);
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(230,238,244,0.85)';
          ctx.fillText('TUNNEL', (xa + xb) / 2, top + 7);
        }
      }
      ctx.strokeStyle = 'rgba(240,244,248,0.85)';
      ctx.lineWidth = 1.5;
      for (const x of decks) {
        ctx.beginPath();
        ctx.moveTo(along(x), up(x) - 5);
        ctx.lineTo(along(x), up(x) - 1);
        ctx.stroke();
      }
      // The car on it.
      const carX = along(simulation.x),
        carY = up(simulation.x);
      ctx.strokeStyle = 'rgba(110,190,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(carX, py);
      ctx.lineTo(carX, py + ph);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(carX, carY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,110,220,1)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    },
  };
}
