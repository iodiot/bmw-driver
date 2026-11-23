"""Builds public/assets/route-m06.json, the Zhytomyr – Kyiv drive on the M-06.

Sources (fetched once, kept beside this script):
- osrm.json: the driving route from Zhytomyr to Kyiv's edge (OpenStreetMap
  data, © OpenStreetMap contributors, routed by the OSRM demo server);
- elev.json: SRTM 30 m heights every 250 m along it (OpenTopoData);
- places.json: towns and villages near it (OpenStreetMap, Overpass API).

The game's road runs along x with its centre line at z = f(x), so the real
route is unbent into that shape: x is the distance along it and its bends
are kept where they are and as tight as they are, but the heading the road
settles on afterwards eases back toward the x axis and never exceeds 15°.
Heights are smoothed over a few hundred metres, as the road's engineering
smooths the land. Run: python3 tools/route-m06/build.py
"""
import base64, json, math, os, struct

here = os.path.dirname(os.path.abspath(__file__))
load = lambda name: json.load(open(os.path.join(here, name)))
coords = load('osrm.json')['routes'][0]['geometry']['coordinates']
lat0, R = math.radians(50.36), 6371000.0
xy = [(math.radians(lo - 28.75) * R * math.cos(lat0), math.radians(la - 50.264) * R) for lo, la in coords]
s = [0.0]
for i in range(1, len(xy)):
    s.append(s[-1] + math.dist(xy[i - 1], xy[i]))

STEP = 5
n = int(s[-1] // STEP) + 1
P, j = [], 0
for k in range(n):
    t = k * STEP
    while j < len(s) - 2 and s[j + 1] < t:
        j += 1
    f = min(1, max(0, (t - s[j]) / max(1e-9, s[j + 1] - s[j])))
    P.append((xy[j][0] + (xy[j + 1][0] - xy[j][0]) * f, xy[j][1] + (xy[j + 1][1] - xy[j][1]) * f))

def smooth(values, sigma, step):
    r = int(3 * sigma / step)
    w = [math.exp(-0.5 * (i * step / sigma) ** 2) for i in range(-r, r + 1)]
    out = []
    for k in range(len(values)):
        acc = ws = 0.0
        for i in range(-r, r + 1):
            q = min(len(values) - 1, max(0, k + i))
            acc += values[q] * w[i + r]
            ws += w[i + r]
        out.append(acc / ws)
    return out

H = []
for k in range(n):
    a, b = P[max(0, k - 2)], P[min(n - 1, k + 2)]
    H.append(math.atan2(b[1] - a[1], b[0] - a[0]))
for k in range(1, n):
    while H[k] - H[k - 1] > math.pi:
        H[k] -= 2 * math.pi
    while H[k] - H[k - 1] < -math.pi:
        H[k] += 2 * math.pi
H = smooth(H, 15, STEP)

# From the end of Zhytomyr's ramps to Kyiv's edge.
S0, S1 = 4000, 120800
LAMBDA, CAP = 1300.0, math.radians(15)
psi = z = 0.0
Z = [0.0]
for k in range(S0 // STEP, S1 // STEP):
    curvature = (H[k + 1] - H[k - 1]) / (2 * STEP)
    psi = max(-CAP, min(CAP, psi + (curvature - 2 * psi / LAMBDA - z / LAMBDA**2) * STEP))
    z += math.tan(psi) * STEP
    # (The world's z points the other way from north.)
    Z.append(-z)

el = load('elev.json')
E = smooth(el['elev'], 400, el['step'])
def height(at):
    f = at / el['step']
    i = min(len(E) - 2, int(f))
    return E[i] + (E[i + 1] - E[i]) * (f - i)

OUT = 10
count = (S1 - S0) // OUT + 1
centre = [Z[min(len(Z) - 1, k * OUT // STEP)] for k in range(count)]
heights = [height(S0 + k * OUT) for k in range(count)]
pack = lambda v: base64.b64encode(struct.pack(f'<{len(v)}f', *v)).decode()

places = []
for e in load('places.json')['elements']:
    tags = e['tags']
    x = math.radians(e['lon'] - 28.75) * R * math.cos(lat0)
    y = math.radians(e['lat'] - 50.264) * R
    best = min(range(0, n, 4), key=lambda k: (P[k][0] - x) ** 2 + (P[k][1] - y) ** 2)
    d = math.dist(P[best], (x, y))
    town = tags['place'] in ('town', 'city')
    at = best * STEP - S0
    if not (0 < at < S1 - S0) or d > (4000 if town else 1800):
        continue
    a, b = P[max(0, best - 2)], P[min(n - 1, best + 2)]
    left = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) > 0
    places.append({
        'at': round(at),
        'name': tags.get('name:uk') or tags['name'],
        'side': 'left' if left else 'right',
        'through': d < 450,
        'town': town,
    })
places.sort(key=lambda p: p['at'])

out = {
    'name': 'Житомир — Київ',
    'road': 'М-06',
    'from': 'Житомир',
    'to': 'Київ',
    'step': OUT,
    'length': S1 - S0,
    'centre': pack(centre),
    'height': pack(heights),
    'places': places,
}
target = os.path.join(here, '..', '..', 'public', 'assets', 'route-m06.json')
json.dump(out, open(target, 'w'), ensure_ascii=False, separators=(',', ':'))
print(count, 'samples,', len(places), 'places, z', round(min(centre)), round(max(centre)),
      'height', round(min(heights)), round(max(heights)), os.path.getsize(target), 'bytes')
