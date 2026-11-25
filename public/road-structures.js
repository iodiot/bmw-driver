import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  branchOffset,
  clearOfServiceLane,
  fuelStationPlace,
  roadEdge,
  medianBarrier,
  oncoming,
  roadBranch,
  nearestService,
  roadCenterZ,
  roadCenterSlope,
} from './road-profile.js';
import { roadSeed, seededRandom } from './road-seed.js';
import { route } from './route.js';

// Structures along the motorway, repeating with the country road every
// 3 km: two farm-track overpasses, a tunnel under a wooded hill and the
// signs announcing them. Positions are distances into each 3 km section
// (the country road leaves at 300 m and is back by 1500 m).
//
// The sun's shadow map covers only a few metres round the car, so the
// structures cast no shadow-map shadows: the road shader darkens the road
// in a bridge deck's shadow and under the tunnel itself, and the car's own
// light is dimmed when it is there (see `structureLight`).
// Where things stand in each section: the original layout, or one drawn
// for this visit's road (see road-seed.js).
function placesIn(random) {
  const tunnelNames = ['Дубовий', 'Сосновий', 'Лісовий', 'Березовий', 'Ясеневий'];
  if (!random)
    return { bridges: [1720, 2900], from: 1980, to: 2430, name: tunnelNames[0], exitAt: 2800 };
  const from = Math.round(1900 + 250 * random()),
    to = from + Math.round(380 + 240 * random());
  const bridges = [
    Math.round(1600 + (from - 260 - 1600) * random()),
    Math.round(to + 160 + (3150 - to - 160) * random()),
  ];
  // The exit sign 500 m before the slip road, unless a bridge stands there.
  const exitAt = Math.abs(bridges[1] - 2800) < 20 ? 2770 : 2800;
  return {
    bridges,
    from,
    to,
    name: tunnelNames[Math.floor(random() * tunnelNames.length)],
    exitAt,
  };
}
const drawnPlaces = placesIn(roadSeed ? seededRandom(roadSeed, 3) : null);
// The M-06 has no tunnel: on the route its span is put before every
// section (nothing lies there), and its meshes and signs are left out.
export const hasTunnel = !route;
const places = hasTunnel ? drawnPlaces : { ...drawnPlaces, from: -100, to: -100 };
// A sign a little ahead of or behind a bridge rather than under it.
const clearOfBridges = (at) => {
  const near = places.bridges.find((b) => Math.abs(b - at) < 40);
  return near === undefined ? at : near - 45;
};
export const structureLayout = Object.freeze({
  period: roadBranch.period,
  bridges: Object.freeze(places.bridges),
  bridge: Object.freeze({
    // Underside of the deck above the road, deck depth, width along the
    // road, half its span across it, the piers' offset and the ramps.
    clearance: 5.4,
    deck: 1.1,
    width: 10,
    halfSpan: 26,
    piers: 10.5,
    ramp: 80,
  }),
  tunnel: Object.freeze({
    from: places.from,
    to: places.to,
    name: places.name,
    // Wall face from the road centre, wall height and the crown of the vault.
    halfWidth: 8,
    wall: 4.4,
    crown: 7.2,
    // Daylight reaches this far in from each portal.
    daylight: 30,
    // The hill over it.
    hill: 26,
  }),
  // Signs on the right verge: distance into the section and what they show.
  // Ukrainian signs, as on the E40 (M-06) toward Kyiv through Kyiv Oblast:
  // white on green for the motorway's directions, white on blue for
  // information.
  signs: Object.freeze([
    ...(hasTunnel
      ? [
          Object.freeze({ at: clearOfBridges(places.from - 340), kind: 'tunnel' }),
          Object.freeze({ at: clearOfBridges(places.from - 120), kind: 'limit', value: 100 }),
          Object.freeze({ at: clearOfBridges(places.to + 100), kind: 'limit', value: 120 }),
        ]
      : []),
    Object.freeze({
      at: clearOfBridges(
        Math.min((hasTunnel ? places.to : drawnPlaces.to) + 190, places.exitAt - 80)
      ),
      kind: 'distances',
    }),
    // The service area's signs stand by its place (see nearestService:
    // every section on the endless road, at the real fuel stations on a
    // route), `at` from its origin. The service area 500 m ahead: what it
    // has (fuel, a café, parking).
    Object.freeze({
      at: places.exitAt - 3000,
      service: true,
      kind: 'services',
      distance: 3000 + roadBranch.start - places.exitAt,
    }),
    // The chevron in the island where the service lane has left.
    Object.freeze({ at: roadBranch.start + roadBranch.diverge + 25, service: true, kind: 'gore' }),
    // The fuel station on the service lane: a blue service sign a kilometre
    // before, and one just before the lane leaves the motorway.
    Object.freeze({
      at: clearOfBridges(2650) - 3000,
      service: true,
      kind: 'fuel',
      distance: 3000 + fuelStationPlace.at - clearOfBridges(2650),
    }),
    // (Before the lane leaves, so there is time to move over.)
    Object.freeze({
      at: roadBranch.start - 120,
      service: true,
      kind: 'fuelTurn',
      distance: fuelStationPlace.at - roadBranch.start + 120,
    }),
  ]),
});

const { period } = structureLayout;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// The occurrence of a feature at `u` into a section nearest to x.
export function nearestOccurrence(x, u) {
  return u + period * Math.round((x - u) / period);
}
const sectionOf = (x) => ((x % period) + period) % period;

// How far inside the tunnel a point is, 0 (daylight) to 1 (only the tunnel's
// lamps), by its distance along the road and its lateral offset.
export function tunnelCover(x, lateral) {
  const { from, to, daylight, halfWidth } = structureLayout.tunnel;
  const u = sectionOf(x);
  return (
    smooth(from, from + daylight, u) *
    (1 - smooth(to - daylight, to, u)) *
    (1 - smooth(halfWidth - 0.5, halfWidth + 0.5, Math.abs(lateral)))
  );
}
// Whether x along the road is between the tunnel's portals.
export function insideTunnel(x) {
  const u = sectionOf(x);
  return u >= structureLayout.tunnel.from && u <= structureLayout.tunnel.to;
}
// Whether a ground point lies in a bridge deck's shadow (0 to 1). `sunShift`
// is the sun direction's horizontal part over its height: the deck at
// height h shades the point that far from it, times h. `height`: the
// point's own height above the road.
export function bridgeShade(x, z, sunShift, height = 0) {
  const { clearance, deck, width, halfSpan } = structureLayout.bridge;
  const h = clearance + deck / 2 - height;
  const qx = x + sunShift.x * h,
    qz = z + sunShift.y * h;
  let shade = 0;
  for (const u of structureLayout.bridges) {
    const bx = nearestOccurrence(qx, u),
      s = roadCenterSlope(bx),
      n = Math.hypot(1, s);
    const dx = qx - bx,
      dz = qz - roadCenterZ(bx);
    const along = (dx + s * dz) / n,
      across = (dz - s * dx) / n;
    shade = Math.max(
      shade,
      (1 - smooth(width / 2 - 0.3, width / 2 + 0.3, Math.abs(along))) *
        (1 - smooth(halfSpan - 0.3, halfSpan + 0.3, Math.abs(across)))
    );
  }
  return shade;
}

// The same, for the road's shader. Needs roadCenterZ (roadProfileGLSL).
const f = (n) => Number(n).toFixed(6);
// The same, for the road's shader. The bridges nearest the car come as
// uniforms (each its place on the road and the road's direction there), so
// a pixel need not work out the road's curve for them.
export const structuresGLSL = (() => {
  const { from, to, daylight, halfWidth } = structureLayout.tunnel;
  const { clearance, deck, width, halfSpan } = structureLayout.bridge;
  const count = structureLayout.bridges.length;
  return `
uniform vec2 structureSunShift;
uniform vec4 structureBridges[${count}];
// By distance along the road and offset from its centre.
float tunnelCover(float x, float lateral) {
  float u = mod(x, ${f(period)});
  return smoothstep(${f(from)}, ${f(from + daylight)}, u) *
    (1. - smoothstep(${f(to - daylight)}, ${f(to)}, u)) *
    (1. - smoothstep(${f(halfWidth - 0.5)}, ${f(halfWidth + 0.5)}, abs(lateral)));
}
// 1 on the tunnel's floor (paved up to its kerbs), 0 elsewhere.
float tunnelFloor(vec2 p) {
  float u = mod(p.x, ${f(period)});
  return step(${f(from)}, u) * step(u, ${f(to)});
}
float bridgeShade(vec2 p) {
  vec2 q = p + structureSunShift * ${f(clearance + deck / 2)};
  float shade = 0.;
  for (int i = 0; i < ${count}; i++) {
    vec4 b = structureBridges[i];
    vec2 d = q - b.xy;
    if (abs(d.x) > ${f(halfSpan + width)}) continue;
    float along = d.x * b.z + d.y * b.w, across = d.y * b.z - d.x * b.w;
    shade = max(shade, (1. - smoothstep(${f(width / 2 - 0.3)}, ${f(width / 2 + 0.3)}, abs(along))) *
      (1. - smoothstep(${f(halfSpan - 0.3)}, ${f(halfSpan + 0.3)}, abs(across))));
  }
  return shade;
}
// Tunnel lamps on the road: warm-white, a little brighter under each lamp.
vec3 tunnelLamps(vec2 p) {
  return vec3(1., .93, .82) * (.5 + .12 * cos(p.x * 1.0472));
}
`;
})();
// Shared with the road's material: the sun's horizontal shift per metre.
export const structureUniforms = {
  structureSunShift: { value: new THREE.Vector2() },
  // Per bridge nearest the car: x and z of its place, then cos and sin of
  // the road's direction there.
  structureBridges: { value: structureLayout.bridges.map(() => new THREE.Vector4(1e9, 0, 1, 0)) },
};

// A point at distance x along the road, lateral offset `lat` and height y.
const onRoad = (x, lat, y, target = new THREE.Vector3()) => target.set(x, y, roadCenterZ(x) + lat);

// Canvas textures ----------------------------------------------------------

function canvasTexture(width, height, draw) {
  if (typeof document === 'undefined') return new THREE.Texture();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
// Board concrete: a grey wash with formwork joints and stains.
function concreteTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#b7b3aa';
    g.fillRect(0, 0, w, h);
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2600; i++) {
      const v = 150 + random() * 70;
      g.fillStyle = `rgba(${v},${v - 3},${v - 9},0.35)`;
      g.fillRect(random() * w, random() * h, 1 + random() * 3, 1 + random() * 3);
    }
    g.strokeStyle = 'rgba(80,78,72,0.35)';
    g.lineWidth = 1.5;
    for (let y = 0; y <= h; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    const stain = g.createLinearGradient(0, 0, 0, h);
    stain.addColorStop(0, 'rgba(60,58,52,0.18)');
    stain.addColorStop(0.3, 'rgba(60,58,52,0)');
    g.fillStyle = stain;
    g.fillRect(0, 0, w, h);
  });
}
// Rough stone cladding for the portals and their wing walls: courses of
// grey-brown blocks of uneven length in dark mortar (4 m to the tile).
function stoneTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    let seed = 11;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = '#5e5951';
    g.fillRect(0, 0, w, h);
    const rows = [0];
    while (rows.at(-1) < h) rows.push(rows.at(-1) + 38 + Math.round(random() * 26));
    rows[rows.length - 1] = h;
    for (let r = 0; r < rows.length - 1; r++) {
      const top = rows[r],
        bottom = rows[r + 1];
      let x = -Math.round(random() * 60);
      while (x < w) {
        const width = 64 + Math.round(random() * 76);
        const tone = 104 + random() * 38,
          warm = 4 + random() * 12;
        const fill = `rgb(${tone + warm},${tone + warm * 0.6},${tone - 6})`;
        // Wrap round the tile's edge so it repeats without a seam.
        for (const dx of [0, w]) {
          g.fillStyle = fill;
          g.beginPath();
          g.roundRect(x + 3 - dx, top + 3, width - 6, bottom - top - 6, 7);
          g.fill();
        }
        // A little light on each block's upper face, shade below.
        const face = g.createLinearGradient(0, top, 0, bottom);
        face.addColorStop(0, 'rgba(255,255,255,0.05)');
        face.addColorStop(0.6, 'rgba(0,0,0,0)');
        face.addColorStop(1, 'rgba(0,0,0,0.12)');
        g.fillStyle = face;
        for (const dx of [0, w]) g.fillRect(x + 3 - dx, top + 3, width - 6, bottom - top - 6);
        x += width;
      }
    }
    for (let i = 0; i < 5000; i++) {
      const v = 90 + random() * 120;
      g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.18)`;
      g.fillRect(random() * w, random() * h, 1 + random() * 2, 1 + random() * 2);
    }
    // Rain streaks down from the coping.
    const stain = g.createLinearGradient(0, 0, 0, h);
    stain.addColorStop(0, 'rgba(40,38,34,0.22)');
    stain.addColorStop(0.25, 'rgba(40,38,34,0)');
    g.fillStyle = stain;
    g.fillRect(0, 0, w, h);
  });
}
// Light ceramic tiles on the tunnel's lower walls, dark paint above.
function tunnelWallTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#d9d8d2';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a8a7a1';
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0; y <= h; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });
}

const signFont = (size, weight = 700) => `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`;
const motorwayGreen = '#0f7a3d',
  informationBlue = '#1d5bb4';
// Writes text at most `width` pixels wide, smaller if it would not fit.
function fitText(g, text, x, y, width, size, weight = 700) {
  let px = size;
  g.font = signFont(px, weight);
  while (px > 12 && g.measureText(text).width > width) g.font = signFont((px -= 2), weight);
  g.fillText(text, x, y);
}
function roundedPanel(g, x, y, w, h, r, fill, stroke, line) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = line;
    g.strokeStyle = stroke;
    g.stroke();
  }
}
// The European route number: white on a green plate with a white border.
function routeShield(g, x, y, label = 'E40') {
  roundedPanel(g, x, y, 120, 58, 8, motorwayGreen, '#ffffff', 5);
  g.fillStyle = '#ffffff';
  g.font = signFont(40);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, x + 60, y + 31);
  g.textAlign = 'left';
}
// The fuel pump pictogram, black, centred at x, y.
function fuelPump(g, x, y, scale) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.fillStyle = '#111111';
  g.fillRect(-48, -62, 64, 118);
  g.fillStyle = '#ffffff';
  g.fillRect(-38, -50, 44, 34);
  g.fillStyle = '#111111';
  g.fillRect(-60, 52, 88, 14);
  // The hose and nozzle.
  g.lineWidth = 9;
  g.strokeStyle = '#111111';
  g.beginPath();
  g.moveTo(16, -30);
  g.lineTo(42, -30);
  g.lineTo(42, 30);
  g.quadraticCurveTo(42, 44, 54, 44);
  g.lineTo(54, -34);
  g.lineTo(40, -50);
  g.stroke();
  g.restore();
}
function arrow(g, x, y, angle, length = 70, width = 16) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = '#ffffff';
  g.fillRect(-width / 2, 0, width, -length + 26);
  g.beginPath();
  g.moveTo(-width * 1.8, -length + 30);
  g.lineTo(0, -length);
  g.lineTo(width * 1.8, -length + 30);
  g.closePath();
  g.fill();
  g.restore();
}
// The distance boards' rows at x: on the endless road toward Kyiv; on a
// route, its own places (one on the route by name, its end, and places
// beyond it), counting down as you drive.
function endlessBoards(at) {
  const kyiv = Number.isFinite(at) ? kyivDistance(at) : 48;
  return [
    ['Стоянка', kyiv - 14],
    ['Київ', kyiv],
    ['Бориспіль', kyiv + 38],
  ];
}
function routeBoards(at) {
  const left = Number.isFinite(at) ? route.toGo(at) / 1000 : route.length / 2000;
  return route.boards
    .map((b) => {
      if (b.place) {
        const p = route.places.find((q) => q.name === b.place);
        return p ? [b.place, Math.round(left - route.toGo(p.at) / 1000)] : null;
      }
      return [b.name, Math.round(left + (b.beyond ?? 0))];
    })
    .filter(Boolean);
}
// Kilometres to Kyiv at x metres along the road: counting down as you
// drive, and (the road being endless) starting again from 70 km at 12.
export function kyivDistance(x) {
  // (On the route: the real distance left.)
  if (route) return Math.round(route.toGo(x) / 1000);
  return 12 + Math.floor((((36 - x / 1000) % 58) + 58) % 58);
}
// Each sign's face: its size in metres, canvas size and how to draw it
// (`at`: where it stands, for signs that show distances).
const signFaces = {
  // A checkpoint's STOP (sign 2.2, an octagon) over a КОНТРОЛЬ plate.
  stop: () => ({
    size: [0.9, 1.2],
    canvas: [240, 320],
    draw(g, w, h) {
      g.clearRect(0, 0, w, h);
      const r = w / 2 - 4,
        cx = w / 2,
        cy = w / 2;
      const octagon = (radius) => {
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = Math.PI / 8 + (i * Math.PI) / 4;
          g.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
        }
        g.closePath();
      };
      octagon(r);
      g.fillStyle = '#ffffff';
      g.fill();
      octagon(r - 8);
      g.fillStyle = '#c8102e';
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = signFont(68);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('STOP', cx, cy + 4);
      // The plate under it.
      roundedPanel(g, 14, w + 12, w - 28, h - w - 18, 6, '#ffffff', '#111111', 4);
      g.fillStyle = '#111111';
      g.font = signFont(30);
      g.fillText('КОНТРОЛЬ', cx, w + 12 + (h - w - 18) / 2 + 2);
    },
  }),
  limit: ({ value }) => ({
    size: [0.9, 0.9],
    canvas: [256, 256],
    round: true,
    draw(g, w) {
      g.clearRect(0, 0, w, w);
      g.beginPath();
      g.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      g.lineWidth = 30;
      g.strokeStyle = '#c8102e';
      g.beginPath();
      g.arc(w / 2, w / 2, w / 2 - 20, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#111111';
      g.font = signFont(value >= 100 ? 92 : 110);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(value), w / 2, w / 2 + 6);
    },
  }),
  // Tunnel ahead, its name and length; switch on the low beams.
  tunnel: () => ({
    size: [2.4, 1.6],
    canvas: [480, 320],
    draw(g, w, h) {
      roundedPanel(g, 4, 4, w - 8, h - 8, 22, informationBlue, '#ffffff', 8);
      roundedPanel(g, 30, 36, 150, 150, 10, '#ffffff');
      g.fillStyle = '#111111';
      g.beginPath();
      g.moveTo(52, 168);
      g.lineTo(52, 108);
      g.arc(105, 108, 53, Math.PI, 0);
      g.lineTo(158, 168);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(72, 168);
      g.lineTo(72, 114);
      g.arc(105, 114, 33, Math.PI, 0);
      g.lineTo(138, 168);
      g.closePath();
      g.fill();
      g.textBaseline = 'alphabetic';
      fitText(g, 'Тунель', 200, 92, w - 230, 50);
      fitText(g, `«${structureLayout.tunnel.name}»`, 200, 150, w - 230, 44, 600);
      g.font = signFont(54);
      g.fillText(`${structureLayout.tunnel.to - structureLayout.tunnel.from} м`, 30, 272);
      // Low beams on: the headlamp symbol.
      g.strokeStyle = '#ffffff';
      g.lineWidth = 7;
      g.beginPath();
      g.ellipse(395, 245, 22, 32, 0, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(375, 245 + i * 20);
        g.lineTo(335, 255 + i * 20);
        g.stroke();
      }
    },
  }),
  // Distances to the places ahead (and the route number).
  distances: () => ({
    size: [3.2, 1.9],
    canvas: [640, 380],
    dynamic: true,
    draw(g, w, h, at) {
      roundedPanel(g, 4, 4, w - 8, h - 8, 22, motorwayGreen, '#ffffff', 8);
      routeShield(g, 36, 30);
      const rows = (route ? routeBoards(at) : endlessBoards(at)).filter(([, km]) => km > 0);
      g.fillStyle = '#ffffff';
      g.textBaseline = 'alphabetic';
      rows.forEach(([place, km], i) => {
        const y = 165 + i * 88;
        g.font = signFont(62);
        g.textAlign = 'left';
        g.fillText(place, 44, y);
        g.textAlign = 'right';
        g.fillText(String(km), w - 44, y);
      });
      g.textAlign = 'left';
    },
  }),
  // Exit ahead: Kyiv straight on, Makariv and Zhytomyr off to the right.
  exit: ({ distance }) => ({
    size: [4.2, 2.1],
    canvas: [840, 420],
    draw(g, w, h) {
      roundedPanel(g, 4, 4, w - 8, h - 8, 24, motorwayGreen, '#ffffff', 8);
      g.fillStyle = '#ffffff';
      g.textBaseline = 'alphabetic';
      // Straight on.
      routeShield(g, 40, 36);
      g.font = signFont(70);
      g.fillText('Київ', 40, 190);
      arrow(g, 92, 330, 0, 110, 18);
      // The exit.
      g.strokeStyle = '#ffffff';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(330, 30);
      g.lineTo(330, h - 30);
      g.stroke();
      g.font = signFont(62);
      g.fillText('Макарів', 370, 110);
      g.fillText('Житомир', 370, 190);
      g.font = signFont(48, 600);
      g.fillText('Брусилів', 370, 260);
      g.font = signFont(60);
      g.textAlign = 'right';
      g.fillText(`${distance} м`, w - 40, 370);
      g.textAlign = 'left';
      arrow(g, 740, 250, Math.PI / 4, 120, 18);
    },
  }),
  // A service area ahead, as on Ukraine's motorways: white on blue, its
  // services as pictograms (fuel, a café, parking) and how far.
  services: ({ distance }) => ({
    size: [3.2, 1.8],
    canvas: [640, 360],
    draw(g, w, h) {
      roundedPanel(g, 4, 4, w - 8, h - 8, 22, informationBlue, '#ffffff', 8);
      const tile = 150,
        top = 40;
      [0, 1, 2].forEach((i) => {
        const x = 40 + i * (tile + 30);
        roundedPanel(g, x, top, tile, tile, 10, '#ffffff');
        g.fillStyle = informationBlue;
        g.strokeStyle = informationBlue;
        if (i === 0) fuelPump(g, x + tile / 2, top + tile / 2, 0.82);
        else if (i === 1) {
          // A cup on its saucer, steam above.
          g.fillRect(x + 42, top + 62, 56, 50);
          g.lineWidth = 9;
          g.beginPath();
          g.arc(x + 104, top + 86, 13, -Math.PI / 2, Math.PI / 2);
          g.stroke();
          g.fillRect(x + 30, top + 116, 90, 9);
          g.lineWidth = 6;
          for (const sx of [56, 82]) {
            g.beginPath();
            g.moveTo(x + sx, top + 52);
            g.bezierCurveTo(x + sx - 10, top + 40, x + sx + 10, top + 32, x + sx, top + 20);
            g.stroke();
          }
        } else {
          g.font = signFont(120);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('P', x + tile / 2, top + tile / 2 + 6);
          g.textAlign = 'left';
        }
      });
      g.fillStyle = '#ffffff';
      g.textBaseline = 'alphabetic';
      g.font = signFont(60);
      g.textAlign = 'right';
      g.fillText(`${distance} м`, w - 40, h - 40);
      g.textAlign = 'left';
      arrow(g, 70, h - 60, Math.PI / 4, 80, 14);
    },
  }),
  // Fuel: the white pump on blue, and how far (with an arrow off to the
  // right where the service lane leaves).
  fuel: ({ distance }) => ({
    size: [1.5, 1.95],
    canvas: [300, 390],
    draw(g, w, h) {
      roundedPanel(g, 4, 4, w - 8, h - 8, 18, informationBlue, '#ffffff', 7);
      roundedPanel(g, 40, 34, w - 80, w - 80, 10, '#ffffff');
      fuelPump(g, w / 2, 34 + (w - 80) / 2, 1);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = signFont(46);
      g.fillText('АЗС', w / 2, 300);
      g.font = signFont(52);
      g.fillText(
        distance >= 1000
          ? `${(distance / 1000).toFixed(1).replace('.', ',')} км`
          : `${Math.round(distance / 50) * 50} м`,
        w / 2,
        362
      );
      g.textAlign = 'left';
    },
  }),
  fuelTurn: ({ distance }) => ({
    size: [2.2, 1.4],
    canvas: [440, 280],
    draw(g, w, h) {
      roundedPanel(g, 4, 4, w - 8, h - 8, 18, informationBlue, '#ffffff', 7);
      roundedPanel(g, 26, 30, 150, 150, 10, '#ffffff');
      fuelPump(g, 101, 105, 0.68);
      g.fillStyle = '#ffffff';
      g.textBaseline = 'alphabetic';
      g.font = signFont(46);
      g.fillText('АЗС', 30, 245);
      g.font = signFont(44, 600);
      g.textAlign = 'right';
      g.fillText(`${Math.round(distance / 50) * 50} м`, w - 30, 245);
      g.textAlign = 'left';
      arrow(g, 320, 170, Math.PI / 4, 120, 18);
    },
  }),
  // At the start of the slip road.
  // (On a real route the lane serves only the services: blue, АЗС and a
  // café, rather than the endless road's exit toward Makariv.)
  gore: () => ({
    size: [2.4, 1.2],
    canvas: [480, 240],
    draw(g, w, h) {
      roundedPanel(
        g,
        4,
        4,
        w - 8,
        h - 8,
        18,
        route ? informationBlue : motorwayGreen,
        '#ffffff',
        7
      );
      g.fillStyle = '#ffffff';
      g.textBaseline = 'alphabetic';
      g.font = signFont(56);
      g.fillText(route ? 'АЗС' : 'Макарів', 36, 96);
      g.font = signFont(46, 600);
      g.fillText(route ? 'Кафе · P' : 'Житомир', 36, 178);
      arrow(g, 400, 160, Math.PI / 4, 110, 18);
    },
  }),
};

// Builders ------------------------------------------------------------------

// Joins boxes and other geometries into one, each moved into place.
function merged(parts) {
  const geometries = parts.map(({ geometry, position = [0, 0, 0], rotation = [0, 0, 0] }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(1, 1, 1)
      )
    );
    for (const name of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    return g;
  });
  const count = geometries.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = name === 'uv' ? 2 : 3;
    const array = new Float32Array(count * size);
    let offset = 0;
    for (const g of geometries) {
      array.set(g.attributes[name].array, offset);
      offset += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  return out;
}
// Grass scatters light through its blades, so a slope away from the sun is
// not as dark as a bare surface would be: normals leant toward the sky.
function softenTowardSky(geometry, amount = 0.6) {
  const n = geometry.attributes.normal,
    v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    if (v.y < 0) v.negate();
    v.lerp(new THREE.Vector3(0, 1, 0), amount).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}
// Box texture coordinates in metres, so concrete keeps one scale.
function boxInMetres(w, h, d) {
  const box = new THREE.BoxGeometry(w, h, d);
  const p = box.attributes.position,
    n = box.attributes.normal,
    uv = box.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i));
    const [u, v] =
      ax > 0.5
        ? [p.getZ(i), p.getY(i)]
        : ay > 0.5
          ? [p.getX(i), p.getZ(i)]
          : [p.getX(i), p.getY(i)];
    uv.setXY(i, u / 4, v / 4);
  }
  return box;
}

// An overpass in its own frame: the road runs along x, the bridge across it
// along z, ground at y = 0.
function buildBridge(materials) {
  const { clearance, deck, width, halfSpan, piers, ramp } = structureLayout.bridge;
  const top = clearance + deck;
  const group = new THREE.Group();
  group.name = 'Overpass';
  const concrete = [];
  // The deck: its own mesh, as it alone casts a shadow-map shadow, onto the
  // car passing under it (the road shades itself, see bridgeShade).
  // A slab on five beams, the beams' undersides at the clearance, and an
  // edge beam (the cornice) along each side, standing a little proud.
  const slab = 0.36;
  const deckParts = [
    { geometry: boxInMetres(width, slab, halfSpan * 2), position: [0, top - slab / 2, 0] },
  ];
  for (const x of [-4, -2, 0, 2, 4])
    deckParts.push({
      geometry: boxInMetres(0.5, deck - slab + 0.02, halfSpan * 2),
      position: [x * (width / 10), clearance + (deck - slab) / 2, 0],
    });
  for (const side of [-1, 1])
    deckParts.push({
      geometry: boxInMetres(0.32, deck + 0.05, halfSpan * 2 + 0.1),
      position: [side * (width / 2 + 0.1), clearance + (deck + 0.05) / 2 + 0.02, 0],
    });
  const deckMesh = new THREE.Mesh(merged(deckParts), materials.concrete);
  deckMesh.name = 'Overpass deck';
  for (const side of [-1, 1]) {
    concrete.push({
      geometry: boxInMetres(0.45, 0.4, halfSpan * 2),
      position: [side * (width / 2 - 0.225), top + 0.2, 0],
    });
    // A pier at each side of the motorway: a cap beam on three columns.
    // (On the route the left one stands in the median.)
    const pier = side < 0 && oncoming ? medianBarrier : side * piers;
    concrete.push({
      geometry: boxInMetres(width - 1, 0.8, 1.4),
      position: [0, clearance - 0.4, pier],
    });
    for (const x of [-3.2, 0, 3.2])
      concrete.push({
        geometry: new THREE.CylinderGeometry(0.45, 0.5, clearance - 0.8, 16),
        position: [x, (clearance - 0.8) / 2, pier],
      });
    // The bank seat the deck's end rests on, at the top of the slope below.
    concrete.push({
      geometry: boxInMetres(width + 1, 1.4, 1.6),
      position: [0, clearance - 0.2, side * (halfSpan - 0.8)],
    });
  }
  const concreteMesh = new THREE.Mesh(merged(concrete), materials.concrete);
  concreteMesh.name = 'Overpass concrete';
  // Steel railings: posts every 2 m and two rails.
  const steel = [];
  for (const side of [-1, 1]) {
    for (let z = -halfSpan; z <= halfSpan + 0.01; z += 2)
      steel.push({
        geometry: new THREE.BoxGeometry(0.06, 1, 0.06),
        position: [side * (width / 2 - 0.2), top + 0.9, z],
      });
    for (const y of [top + 0.85, top + 1.38])
      steel.push({
        geometry: new THREE.BoxGeometry(0.07, 0.07, halfSpan * 2),
        position: [side * (width / 2 - 0.2), y, 0],
      });
  }
  const steelMesh = new THREE.Mesh(merged(steel), materials.railing);
  steelMesh.name = 'Overpass railings';
  // The embankments the farm track climbs on each side: smooth mounds with
  // rounded crests and toes that run out into the fields, and a rounded
  // spill slope under each end of the deck, falling toward the motorway
  // and ending well short of the piers. On top, a gravel track 5 m wide
  // with grass shoulders, widening to the deck at the abutment.
  const crest = (u) =>
    u <= halfSpan
      ? top - 0.05
      : Math.max(0, top * (1 - smooth(halfSpan, halfSpan + ramp, u)) - 0.05);
  const trackHalf = (u) => 2.6 + (width / 2 - 0.45 - 2.6) * (1 - smooth(halfSpan, halfSpan + 8, u));
  const spillReach = 1.5 * top;
  const ground = (x, u) => {
    const c = crest(u);
    const d = Math.max(0, Math.abs(x) - width / 2),
      e = Math.max(0, halfSpan - u);
    const q = Math.hypot(d / (2.3 * c + 1.5), e / spillReach);
    let h = c * (1 - smooth(0, 1, q));
    // Just under the track, so the two do not fight.
    if (u > halfSpan) h -= 0.1 * (1 - smooth(trackHalf(u) - 0.1, trackHalf(u) + 0.4, Math.abs(x)));
    // The toe sinks under the fields.
    return h - 0.3 * (1 - smooth(0, 0.6, h));
  };
  const slopes = [],
    surface = [];
  const reachX = width / 2 + 2.3 * top + 4;
  const us = [];
  for (let u = halfSpan - spillReach - 1; u < halfSpan + 12; u += 1) us.push(u);
  for (let u = halfSpan + 12; u <= halfSpan + ramp + 4; u += 2.5) us.push(u);
  const xs = [];
  for (let x = -reachX; x <= reachX + 0.01; x += Math.abs(x) < width / 2 + 3 ? 0.75 : 1.5)
    xs.push(x);
  for (const side of [-1, 1]) {
    const row = (u) => xs.map((x) => [x, ground(x, u), side * u]);
    for (let i = 0; i < us.length - 1; i++) {
      const a = row(us[i]),
        b = row(us[i + 1]);
      // Wound so the upper side faces out on both ends of the bridge.
      for (let j = 0; j < xs.length - 1; j++)
        if (side > 0) slopes.push(a[j], b[j], a[j + 1], a[j + 1], b[j], b[j + 1]);
        else slopes.push(a[j], a[j + 1], b[j], a[j + 1], b[j + 1], b[j]);
    }
    // The track, from the deck's end down to the fields.
    for (let i = 0; i < us.length - 1; i++) {
      const [u0, u1] = [us[i], us[i + 1]];
      if (u1 <= halfSpan) continue;
      const [ua, ub] = [Math.max(u0, halfSpan), u1];
      const [ha, hb] = [crest(ua) + 0.02, crest(ub) + 0.02];
      const [wa, wb] = [trackHalf(ua), trackHalf(ub)];
      const [p0, p1, p2, p3] = [
        [-wa, ha, side * ua],
        [wa, ha, side * ua],
        [wb, hb, side * ub],
        [-wb, hb, side * ub],
      ];
      // Its upper side out, on both ends.
      if (side < 0) surface.push(p0, p1, p2, p0, p2, p3);
      else surface.push(p0, p2, p1, p0, p3, p2);
    }
  }
  const triangles = (points) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    // World-scaled texture coordinates (x, z in metres).
    g.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        points.flatMap(([x, , z]) => [x / 3, z / 3]),
        2
      )
    );
    // Faces wound either way: draw both sides, with normals made upward.
    g.computeVertexNormals();
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++)
      if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    return g;
  };
  // The mounds as a smooth surface: shared normals across the grid.
  const mound = (points) => {
    const g = mergeVertices(triangles(points).deleteAttribute('normal'));
    g.computeVertexNormals();
    softenTowardSky(g);
    return g;
  };
  const embankment = new THREE.Mesh(mound(slopes), materials.grass);
  embankment.name = 'Overpass embankments';
  const track = new THREE.Mesh(triangles(surface), materials.track);
  track.name = 'Overpass track';
  // The deck's top surface.
  const deckTop = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.9, halfSpan * 2).rotateX(-Math.PI / 2),
    materials.track
  );
  deckTop.position.y = top + 0.01;
  group.add(concreteMesh, steelMesh, embankment, track, deckTop);
  group.add(deckMesh);
  group.traverse((o) => {
    if (o.isMesh) {
      o.receiveShadow = true;
      o.castShadow = o === deckMesh;
    }
  });
  return group;
}

// The tunnel's cross-section, from the right kerb up the wall, over the
// vault and down the left wall: lateral offset and height.
export function tunnelProfile(segments = 14) {
  const { halfWidth, wall, crown } = structureLayout.tunnel;
  const right = [
    [7.45, 0],
    [7.45, 0.25],
    [halfWidth, 0.25],
    [halfWidth, wall],
  ];
  const arc = [];
  for (let i = 1; i < segments; i++) {
    const a = (i / segments) * Math.PI;
    arc.push([Math.cos(a) * halfWidth, wall + Math.sin(a) * (crown - wall)]);
  }
  const left = right.map(([lat, y]) => [-lat, y]).reverse();
  return [...right, ...arc, ...left];
}

// The tunnel lining from `from` to `to` along the road, in world space.
function tunnelLining(from, to, step = 5) {
  const profile = tunnelProfile();
  const { wall } = structureLayout.tunnel;
  const xs = [];
  for (let x = from; x < to; x += step) xs.push(x);
  xs.push(to);
  const positions = [],
    uvs = [],
    colours = [],
    indices = [];
  // Distance round the profile, for the texture's v.
  const around = [0];
  for (let i = 1; i < profile.length; i++)
    around.push(
      around[i - 1] +
        Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1])
    );
  const point = new THREE.Vector3();
  for (const x of xs)
    profile.forEach(([lat, y], i) => {
      onRoad(x, lat, y, point);
      positions.push(point.x, point.y, point.z);
      uvs.push(x / 2, around[i] / 2);
      // Light tiles up to 3.2 m, then dark paint over the vault; lit most
      // round the lamp lines just under the springing.
      const tiled = y <= 3.2 && Math.abs(lat) > 7.9;
      const glow = Math.exp(-Math.pow((y - (wall + 0.6)) / 1.6, 2));
      const shade = tiled ? 0.24 + 0.16 * glow + 0.05 * (y / 3.2) : 0.05 + 0.13 * glow;
      colours.push(shade, shade * 0.98, shade * 0.93);
    });
  const n = profile.length;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j,
        b = a + 1,
        c = a + n,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const hillReach = 230,
  hillSide = 280,
  wingLength = 24;
// The hill's height at distance x along the road and lateral offset `lat`,
// for the tunnel from `from` to `to` (`inside`: on the tunnel's side of a
// portal's plane).
function hillHeight(x, lat, from, to, inside = x >= from && x <= to) {
  const { hill, halfWidth } = structureLayout.tunnel;
  // Just under the portal's top at each portal, rising to the hill's full
  // height over the tunnel and falling away into the fields outside.
  const shoulder = portalCrest(lat) - 0.2;
  const rise = inside ? smooth(from, from + 90, x) * (1 - smooth(to - 90, to, x)) : 0;
  const along = inside
    ? shoulder + (hill - shoulder) * rise
    : shoulder * smooth(from - hillReach, from, x) * (1 - smooth(to, to + hillReach, x));
  // Outside, the cutting: its slopes stand on the portal's wing walls at
  // first, then open out into gentle slopes down to the verge.
  const before = x < from ? from - x : x - to;
  const side = Math.abs(lat);
  const open =
    portalHalfWidth + 4 + (halfWidth + 34 - portalHalfWidth - 4) * smooth(0, 120, before);
  const foot =
    halfWidth +
    2 +
    (portalHalfWidth - halfWidth - 2) * (1 - smooth(wingLength, wingLength + 12, before));
  const across = 1 - smooth(hillSide * 0.4, hillSide, side);
  // A few long swells over the tunnel, so the hill is not a perfect mound.
  const swell = 1 + 0.18 * rise * Math.sin(x * 0.021 + lat * 0.013) * Math.cos(lat * 0.031);
  let h = along * across * swell;
  if (!inside) {
    h *= smooth(foot, open, side);
    // Behind a wing wall the ground is at least at the wall's top.
    if (before < wingLength && side >= portalHalfWidth + 0.1)
      h = Math.max(h, wingWallTop(before) - 0.3);
  }
  return h - 0.4;
}
// The wing walls beside each portal hold the cutting's slopes: from the
// portal's top down to the verge over `wingLength` metres.
function wingWallTop(before) {
  return 0.5 + (wingStart - 0.5) * (1 - smooth(0, wingLength, before));
}
// A concrete coping along the top of each wing wall, standing a little
// proud of its face.
function wingCopings(x, facing) {
  const positions = [],
    steps = 24;
  const point = new THREE.Vector3();
  const at = (before, lat, y) => onRoad(x + before, lat, y, point).toArray();
  for (const side of [-1, 1])
    for (let i = 0; i < steps; i++) {
      const b0 = (i / steps) * wingLength,
        b1 = ((i + 1) / steps) * wingLength;
      const t0 = wingWallTop(b0),
        t1 = wingWallTop(b1);
      const front = side * (portalHalfWidth - 0.2),
        back = side * (portalHalfWidth + 0.35);
      // Top, then the face toward the road.
      const quads = [
        [
          at(facing * b0, front, t0 + 0.14),
          at(facing * b1, front, t1 + 0.14),
          at(facing * b0, back, t0 + 0.14),
          at(facing * b1, back, t1 + 0.14),
        ],
        [
          at(facing * b0, front, t0 - 0.16),
          at(facing * b1, front, t1 - 0.16),
          at(facing * b0, front, t0 + 0.14),
          at(facing * b1, front, t1 + 0.14),
        ],
      ];
      for (const [a, b, c, d] of quads) positions.push(...a, ...b, ...c, ...b, ...d, ...c);
    }
  return metresGeometry(positions, x);
}
function metresGeometry(positions, x) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv = [];
  for (let i = 0; i < positions.length; i += 3)
    uv.push((positions[i] - x + positions[i + 2]) / 4, positions[i + 1] / 4);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
function wingWalls(x, facing) {
  const positions = [],
    steps = 12;
  const point = new THREE.Vector3();
  for (const side of [-1, 1])
    for (let i = 0; i < steps; i++) {
      const corners = [i, i + 1].flatMap((k) => {
        const before = (k / steps) * wingLength,
          at = x + facing * before;
        return [
          onRoad(at, side * portalHalfWidth, -0.4, point).toArray(),
          onRoad(at, side * portalHalfWidth, wingWallTop(before), point).toArray(),
        ];
      });
      const [a, b, c, d] = corners;
      positions.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Concrete texture across the wall, in metres.
  const uv = [];
  for (let i = 0; i < positions.length; i += 3)
    uv.push((positions[i] - x) / 4, positions[i + 1] / 4);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

// The hill over the tunnel: a heightfield along the road, cut down to the
// road's level in front of each portal.
function hillGeometry(from, to) {
  // Rows every 10 m, every 2 m along the wing walls; columns every 8 m,
  // every 2 m near the road, with a step at each wing wall's face.
  const xs = [];
  for (let x = from - hillReach; x < from - wingLength - 10; x += 10) xs.push(x);
  for (let x = from - wingLength - 10; x < from; x += 2) xs.push(x);
  xs.push(from - 0.01, from);
  for (let x = from + 10; x < to; x += 10) xs.push(x);
  xs.push(to, to + 0.01);
  for (let x = to + 2; x <= to + wingLength + 10; x += 2) xs.push(x);
  for (let x = to + wingLength + 20; x <= to + hillReach; x += 10) xs.push(x);
  const columns = new Set();
  for (let l = 48; l <= hillSide; l += 8) columns.add(l);
  for (let l = 0; l < 48; l += 2) columns.add(l);
  // The ground steps up just behind each wing wall's face.
  columns
    .add(portalHalfWidth + 0.05)
    .add(portalHalfWidth + 0.15)
    .delete(portalHalfWidth);
  const halfLats = [...columns].sort((a, b) => a - b);
  const lats = [
    ...halfLats
      .filter((l) => l > 0)
      .map((l) => -l)
      .reverse(),
    ...halfLats,
  ];
  const positions = [],
    uvs = [],
    indices = [];
  const point = new THREE.Vector3();
  for (const x of xs) {
    const inside = x >= from && x <= to;
    for (const lat of lats) {
      onRoad(x, lat, hillHeight(x, lat, from, to, inside), point);
      positions.push(point.x, point.y, point.z);
      uvs.push(point.x / 4, point.z / 4);
    }
  }
  const n = lats.length;
  for (let i = 0; i < xs.length - 1; i++) {
    // No face across each portal's plane, where the cutting meets the full
    // hill: the portal's wall stands there, with the tunnel's mouth in it.
    if (xs[i + 1] - xs[i] < 0.1) continue;
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j,
        b = a + 1,
        c = a + n,
        d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  softenTowardSky(geometry);
  geometry.computeBoundingSphere();
  return geometry;
}

// A portal at x along the road, facing the traffic (−1 at the entry): a
// stone-clad headwall whose top curves over the tunnel's mouth, an arched
// concrete hood standing out round the mouth, and a coping along the
// headwall's crest. The hill's grass comes down to the crest.
const portalHalfWidth = 12,
  // The headwall's top: low at its ends, where the wing walls carry on, and
  // highest over the crown.
  wingStart = structureLayout.tunnel.wall + 2.8,
  crestTop = structureLayout.tunnel.crown + 2.3,
  headwallDepth = 1;
function portalCrest(lat) {
  const t = Math.min(1, Math.abs(lat) / portalHalfWidth);
  return wingStart + (crestTop - wingStart) * Math.pow(1 - Math.pow(t, 2.4), 1 / 2.4);
}
// Extruded in the portal's frame (lateral, height, depth toward the
// traffic), then laid onto the road at x.
function layPortal(geometry, x, facing, offset = 0) {
  const p = geometry.attributes.position;
  const point = new THREE.Vector3();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const lat = p.getX(i),
      y = p.getY(i),
      depth = p.getZ(i) + offset;
    onRoad(x + facing * depth, lat, y, point);
    p.setXYZ(i, point.x, point.y, point.z);
    uv[i * 2] = (lat + depth) / 4;
    uv[i * 2 + 1] = y / 4;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
// The mouth as a notch up from the shape's foot: along the foot to the
// left kerb, round the tunnel's profile and back down at the right kerb, so
// nothing of the portal lies across the road (a closed hole left a strip of
// concrete there, at the road's level).
function openMouth(shape) {
  const profile = tunnelProfile().reverse();
  shape.lineTo(profile[0][0], -0.4);
  for (const [lat, y] of profile) shape.lineTo(lat, y);
  shape.lineTo(profile.at(-1)[0], -0.4);
}
function headwallGeometry(x, facing) {
  const shape = new THREE.Shape();
  shape.moveTo(-portalHalfWidth, -0.4);
  openMouth(shape);
  shape.lineTo(portalHalfWidth, -0.4);
  for (let i = 0; i <= 32; i++) {
    const lat = portalHalfWidth * (1 - (2 * i) / 32);
    shape.lineTo(lat, portalCrest(lat));
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: headwallDepth,
    bevelEnabled: false,
    curveSegments: 8,
  });
  return layPortal(geometry, x, facing);
}
// The hood: a ring a metre thick round the mouth, its edges rounded, in
// front of the headwall.
function hoodGeometry(x, facing) {
  const { halfWidth, wall, crown } = structureLayout.tunnel;
  const thick = 1.05,
    segments = 24;
  const shape = new THREE.Shape();
  shape.moveTo(halfWidth + thick, -0.4);
  shape.lineTo(halfWidth + thick, wall);
  for (let i = 1; i < segments; i++) {
    const a = (i / segments) * Math.PI;
    shape.lineTo(Math.cos(a) * (halfWidth + thick), wall + Math.sin(a) * (crown - wall + thick));
  }
  shape.lineTo(-halfWidth - thick, wall);
  shape.lineTo(-halfWidth - thick, -0.4);
  openMouth(shape);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.9,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.14,
    bevelSegments: 3,
    curveSegments: 8,
  });
  return layPortal(geometry, x, facing, headwallDepth);
}
// The coping along the headwall's crest: overhanging its face a little.
function crestCopingGeometry(x, facing) {
  const positions = [],
    steps = 40;
  const point = new THREE.Vector3();
  const at = (depth, lat, y) => onRoad(x + facing * depth, lat, y, point).toArray();
  for (let i = 0; i < steps; i++) {
    const l0 = -portalHalfWidth + (2 * portalHalfWidth * i) / steps,
      l1 = -portalHalfWidth + (2 * portalHalfWidth * (i + 1)) / steps;
    const y0 = portalCrest(l0),
      y1 = portalCrest(l1);
    const front = headwallDepth + 0.2,
      back = -0.35;
    const quads = [
      [
        at(front, l0, y0 + 0.14),
        at(front, l1, y1 + 0.14),
        at(back, l0, y0 + 0.14),
        at(back, l1, y1 + 0.14),
      ],
      [
        at(front, l0, y0 - 0.16),
        at(front, l1, y1 - 0.16),
        at(front, l0, y0 + 0.14),
        at(front, l1, y1 + 0.14),
      ],
    ];
    for (const [a, b, c, d] of quads) positions.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  return metresGeometry(positions, x);
}

// A sign of the road's kinds for something else beside it (a checkpoint's),
// with its own back material: its face toward the traffic (−x).
let looseSignBack = null;
export function makeRoadSign(spec) {
  looseSignBack ??= new THREE.MeshStandardMaterial({
    name: 'Sign back',
    color: 0x8d9296,
    metalness: 0.5,
    roughness: 0.5,
  });
  return buildSign(spec, { signBack: looseSignBack });
}
// A sign on two posts, its face toward the traffic (−x in its frame).
function buildSign(spec, materials) {
  const face = signFaces[spec.kind](spec);
  let context = null;
  const map = canvasTexture(face.canvas[0], face.canvas[1], (g, w, h) => {
    context = g;
    face.draw(g, w, h, NaN);
  });
  face.map = map;
  const [w, h] = face.size;
  const group = new THREE.Group();
  group.name = `Sign ${spec.kind}`;
  // A portable sign stands low on a frame on the carriageway itself.
  const bottom = spec.stand ? 0.45 : spec.kind === 'limit' ? 1.6 : 2.1;
  const board = new THREE.Mesh(
    face.round ? new THREE.CircleGeometry(w / 2, 40) : new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      name: `Sign face ${spec.kind}`,
      map: face.map,
      // The canvas is clear outside the sign's rounded outline.
      alphaTest: 0.5,
      roughness: 0.55,
      // Retroreflective sheeting: it stays legible in shade and at night.
      emissive: 0xffffff,
      emissiveMap: face.map,
      emissiveIntensity: 0.12,
    })
  );
  board.rotation.y = -Math.PI / 2;
  board.position.set(-0.03, bottom + h / 2, 0);
  // The back plate follows the outline, a little inside the face's edge.
  const outline = new THREE.Shape();
  if (face.round) outline.absarc(0, 0, w / 2 - 0.01, 0, Math.PI * 2);
  else {
    const r = 0.09,
      x = w / 2 - 0.01,
      y = h / 2 - 0.01;
    outline.moveTo(-x + r, -y);
    outline.lineTo(x - r, -y);
    outline.quadraticCurveTo(x, -y, x, -y + r);
    outline.lineTo(x, y - r);
    outline.quadraticCurveTo(x, y, x - r, y);
    outline.lineTo(-x + r, y);
    outline.quadraticCurveTo(-x, y, -x, y - r);
    outline.lineTo(-x, -y + r);
    outline.quadraticCurveTo(-x, -y, -x + r, -y);
  }
  const back = new THREE.Mesh(new THREE.ShapeGeometry(outline, 8), materials.signBack);
  back.rotation.y = Math.PI / 2;
  back.position.set(0, bottom + h / 2, 0);
  group.add(board, back);
  const posts = face.round ? [0] : [-w * 0.3, w * 0.3];
  for (const z of posts) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, bottom + h - 0.1, 10),
      materials.signBack
    );
    post.position.set(0.05, (bottom + h - 0.1) / 2, z);
    group.add(post);
    if (!spec.stand) continue;
    // On its stand: a foot along the road under each post and a strut
    // from the back of it up to the post.
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.07), materials.signBack);
    foot.position.set(0.25, 0.025, z);
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 1.05, 8),
      materials.signBack
    );
    strut.position.set(0.42, 0.42, z);
    strut.rotation.z = 0.78;
    group.add(foot, strut);
  }
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  // Signs that show distances are redrawn where they are placed.
  group.userData.placeAt = (at) => {
    if (!face.dynamic || !context) return;
    face.draw(context, face.canvas[0], face.canvas[1], at);
    map.needsUpdate = true;
  };
  return group;
}

// Shades a mound's grass as road.js shades the fields: the photograph at two
// scales and offsets in world space, the same summer tint and the same broad
// patches of lusher and drier grass, so hills and embankments match the
// fields they rise from.
function fieldGrass(material, noiseMap) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grassNoise = { value: noiseMap ?? null };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGrassXZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGrassXZ = (modelMatrix * vec4(transformed, 1.)).xz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGrassXZ;
        ${noiseMap ? 'uniform sampler2D grassNoise;' : ''}`
      )
      .replace(
        '#include <map_fragment>',
        `vec2 gdx = dFdx(vGrassXZ), gdy = dFdy(vGrassXZ);
        vec3 grassNear = textureGrad(map, vGrassXZ / 2.6, gdx / 2.6, gdy / 2.6).rgb;
        vec3 grassFar = textureGrad(map, vGrassXZ.yx / 8.7 + .31, gdx.yx / 8.7, gdy.yx / 8.7).rgb;
        vec3 grass = mix(grassNear, grassFar, .4) * vec3(.9, 1.12, .62);
        ${
          noiseMap
            ? `grass *= .78 + .44 * texture2D(grassNoise, vGrassXZ / 23.).r;
        grass = mix(grass, grass * vec3(1.15, 1.02, .7), smoothstep(.62, .85, texture2D(grassNoise, vGrassXZ / 5.3).r) * .45);`
            : ''
        }
        diffuseColor.rgb *= grass;`
      );
  };
  material.customProgramCacheKey = () => `field-grass-${Boolean(noiseMap)}`;
  return material;
}
export function setupRoadStructures(scene, fields = {}) {
  const loader = typeof document === 'undefined' ? null : new THREE.TextureLoader();
  const grassMap = loader
    ? loader.load(new URL('./assets/ground/grass.jpg', import.meta.url).href)
    : new THREE.Texture();
  grassMap.colorSpace = THREE.SRGBColorSpace;
  grassMap.wrapS = grassMap.wrapT = THREE.RepeatWrapping;
  grassMap.anisotropy = 8;
  const concreteMap = concreteTexture();
  concreteMap.wrapS = concreteMap.wrapT = THREE.RepeatWrapping;
  const materials = {
    concrete: new THREE.MeshStandardMaterial({
      name: 'Bridge concrete',
      map: concreteMap,
      roughness: 0.92,
    }),
    railing: new THREE.MeshStandardMaterial({
      name: 'Bridge railing',
      color: 0x7f8a8e,
      metalness: 0.6,
      roughness: 0.45,
    }),
    // The same grass photograph as the fields, shaded alike (see
    // fieldGrass below).
    grass: fieldGrass(
      new THREE.MeshStandardMaterial({
        name: 'Embankment grass',
        map: fields.grassMap ?? grassMap,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
      fields.noiseMap
    ),
    track: new THREE.MeshStandardMaterial({
      name: 'Overpass asphalt',
      color: 0x55555a,
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
    signBack: new THREE.MeshStandardMaterial({
      name: 'Sign back',
      color: 0x8d9296,
      metalness: 0.5,
      roughness: 0.5,
    }),
  };
  const group = new THREE.Group();
  group.name = 'Road structures';
  scene.add(group);

  // Bridges: one placed overpass per bridge position, moved to the nearest
  // occurrence.
  const bridges = structureLayout.bridges.map((u) => {
    const bridge = buildBridge(materials);
    group.add(bridge);
    return { u, bridge, at: NaN };
  });

  // The tunnel: lining, kerbs, lamps, portals and the hill, rebuilt for the
  // nearest occurrence (the road's curve differs for each).
  const tunnelWallMap = tunnelWallTexture();
  tunnelWallMap.wrapS = tunnelWallMap.wrapT = THREE.RepeatWrapping;
  // Lit by its own lamps, day and night: unaffected by the sun.
  const lining = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      name: 'Tunnel lining',
      map: tunnelWallMap,
      vertexColors: true,
      side: THREE.DoubleSide,
    })
  );
  lining.name = 'Tunnel lining';
  const lampSpacing = 6;
  const lampCount = Math.max(
    2,
    Math.ceil((structureLayout.tunnel.to - structureLayout.tunnel.from) / lampSpacing) * 2
  );
  const lamps = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.3, 0.12, 0.32),
    new THREE.MeshBasicMaterial({
      name: 'Tunnel lamp',
      color: new THREE.Color(2.2, 2.05, 1.75),
      toneMapped: false,
    }),
    lampCount
  );
  lamps.name = 'Tunnel lamps';
  const hill = new THREE.Mesh(new THREE.BufferGeometry(), materials.grass);
  hill.name = 'Tunnel hill';
  hill.receiveShadow = true;
  const portals = new THREE.Mesh(new THREE.BufferGeometry(), materials.concrete);
  portals.name = 'Tunnel portals';
  portals.material = materials.concrete.clone();
  portals.material.side = THREE.DoubleSide;
  const stoneMap = stoneTexture();
  stoneMap.wrapS = stoneMap.wrapT = THREE.RepeatWrapping;
  const cladding = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshStandardMaterial({
      name: 'Portal stone',
      map: stoneMap,
      roughness: 0.95,
      side: THREE.DoubleSide,
    })
  );
  cladding.name = 'Tunnel portal cladding';
  group.add(lining, lamps, hill, portals, cladding);
  if (!hasTunnel) for (const m of [lining, lamps, hill, portals, cladding]) m.visible = false;
  let tunnelAt = NaN;
  function placeTunnel(start) {
    const { from, to } = structureLayout.tunnel;
    const a = start,
      b = start + (to - from);
    lining.geometry.dispose();
    lining.geometry = tunnelLining(a, b);
    hill.geometry.dispose();
    hill.geometry = hillGeometry(a, b);
    portals.geometry.dispose();
    const stone = [
      headwallGeometry(a, -1),
      headwallGeometry(b, 1),
      wingWalls(a, -1),
      wingWalls(b, 1),
    ];
    const trim = [
      hoodGeometry(a, -1),
      hoodGeometry(b, 1),
      crestCopingGeometry(a, -1),
      crestCopingGeometry(b, 1),
      wingCopings(a, -1),
      wingCopings(b, 1),
    ];
    cladding.geometry.dispose();
    cladding.geometry = merged(stone.map((geometry) => ({ geometry })));
    cladding.geometry.computeBoundingSphere();
    portals.geometry = merged(trim.map((geometry) => ({ geometry })));
    portals.geometry.computeBoundingSphere();
    for (const g of [...stone, ...trim]) g.dispose();
    const matrix = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      p = new THREE.Vector3(),
      one = new THREE.Vector3(1, 1, 1),
      up = new THREE.Vector3(0, 1, 0);
    const { wall, halfWidth } = structureLayout.tunnel;
    let i = 0;
    for (let x = a + lampSpacing / 2; x < b && i < lampCount; x += lampSpacing)
      for (const side of [-1, 1]) {
        q.setFromAxisAngle(up, -Math.atan(roadCenterSlope(x)));
        onRoad(x, side * (halfWidth - 0.35), wall + 0.55, p);
        lamps.setMatrixAt(i++, matrix.compose(p, q, one));
      }
    lamps.count = i;
    lamps.instanceMatrix.needsUpdate = true;
    lamps.computeBoundingSphere();
    tunnelAt = start;
  }

  // Signs, each at the nearest occurrence of its place.
  const signs = structureLayout.signs.map((spec) => {
    const sign = buildSign(spec, materials);
    group.add(sign);
    return { spec, sign, at: NaN };
  });
  // (The sign at the gore in the middle of the island between the road's
  // edge and the service lane, however many lanes the road has; the rest
  // on the verge, or beyond the service lane where it runs there.)
  const lateralOf = (spec, x) => {
    if (spec.kind !== 'gore') return clearOfServiceLane(x, 9.4);
    const branch = branchOffset(x);
    return branch === null ? 7.5 : (roadEdge + branch - roadBranch.halfWidth) / 2;
  };

  const place = (object, x, lateral, y = 0) => {
    onRoad(x, lateral, y, object.position);
    object.rotation.y = -Math.atan(roadCenterSlope(x));
  };

  return {
    group,
    materials,
    update(x, sunDirection) {
      for (const b of bridges) {
        const at = nearestOccurrence(x, b.u);
        if (at !== b.at) {
          place(b.bridge, at, 0);
          b.at = at;
          const slope = roadCenterSlope(at),
            n = Math.hypot(1, slope);
          structureUniforms.structureBridges.value[bridges.indexOf(b)].set(
            at,
            roadCenterZ(at),
            1 / n,
            slope / n
          );
        }
      }
      const { from } = structureLayout.tunnel;
      const start = nearestOccurrence(x, from);
      if (hasTunnel && start !== tunnelAt) placeTunnel(start);
      for (const s of signs) {
        const at = s.spec.service ? nearestService(x, s.spec.at) : nearestOccurrence(x, s.spec.at);
        if (at !== s.at) {
          place(s.sign, at, lateralOf(s.spec, at));
          s.sign.userData.placeAt(at);
          s.at = at;
        }
      }
      if (sunDirection) {
        const y = Math.max(sunDirection.y, 0.12);
        structureUniforms.structureSunShift.value.set(sunDirection.x / y, sunDirection.z / y);
      }
    },
  };
}
