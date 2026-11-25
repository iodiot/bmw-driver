"""Builds public/assets/route-<id>.json for a real drive: m06 (Zhytomyr –
Kyiv on the M-06) or n08 (Dnipro – Zaporizhzhia on the N-08).

Sources (fetched once, kept in tools/route-<id>/):
- osrm.json: the driving route (OpenStreetMap data, © OpenStreetMap
  contributors, routed by the OSRM demo server);
- elev.json: SRTM 30 m heights every 250 m along it (OpenTopoData);
- places.json: towns and villages near it (OpenStreetMap, Overpass API).

The game's road runs along x with its centre line at z = f(x), so the real
route is unbent into that shape: x is the distance along it and its bends
are kept where they are and as tight as they are, but the heading the road
settles on afterwards eases back toward the x axis and never exceeds 15°.
Heights are smoothed over a few hundred metres, as the road's engineering
smooths the land. Run: python3 tools/routes/build.py m06 (or n08)
"""
import base64, json, math, os, struct, sys

# Each drive: where its projection is centred (a latitude for the scale, an
# origin), the stretch of the route that is driven (metres along it: past
# the starting city's streets to the edge of the one it ends at), its
# names, and the places its green distance boards count down to (a place
# on the route by name, or the end, or beyond the end by `beyond` km).
ROUTES = {
    'm06': {
        'lat0': 50.36, 'origin': (28.75, 50.264), 'stretch': (4000, 120800),
        'name': 'Житомир — Київ', 'road': 'М-06', 'from': 'Житомир', 'to': 'Київ',
        'toGenitive': 'Києва', 'toLocative': 'Києві',
        'boards': [{'place': 'Стоянка'}, {'name': 'Київ'}, {'name': 'Бориспіль', 'beyond': 38}],
    },
    'n08': {
        'lat0': 48.15, 'origin': (35.0462, 48.4647), 'stretch': (9200, 73000),
        'name': 'Дніпро — Запоріжжя', 'road': 'Н-08', 'from': 'Дніпро', 'to': 'Запоріжжя',
        # Two lanes each way, as the N-08 has (the M-06 has three, the default).
        'lanes': 2,
        # Checkpoints (where their first row of blocks stands, along the
        # drive): clear of the service areas and the overpasses.
        'checkpoints': [30000, 55500],
        'toGenitive': 'Запоріжжя', 'toLocative': 'Запоріжжі',
        'boards': [{'name': 'Запоріжжя'}, {'name': 'Мелітополь', 'beyond': 120},
                   {'name': 'Маріуполь', 'beyond': 233}],
    },
}
ID = sys.argv[1] if len(sys.argv) > 1 else 'm06'
C = ROUTES[ID]
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', f'route-{ID}')
load = lambda name: json.load(open(os.path.join(here, name)))
coords = load('osrm.json')['routes'][0]['geometry']['coordinates']
lat0, R = math.radians(C['lat0']), 6371000.0
lon0, la0 = C['origin']
xy = [(math.radians(lo - lon0) * R * math.cos(lat0), math.radians(la - la0) * R) for lo, la in coords]
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

S0, S1 = C['stretch']
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
    x = math.radians(e['lon'] - lon0) * R * math.cos(lat0)
    y = math.radians(e['lat'] - la0) * R
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

# What stands beside the road (land.json, OpenStreetMap through Overpass,
# within some 500 m of it), in the road's own frame: x along it, `lat`
# across it (to the right positive): ponds as outlines and the buildings as
# rectangles (centre, length, width, angle to the road, height and kind);
# the game builds them where they are. (Woods, tree rows, orchards and
# yards are read too, but the game no longer plants their trees.)
def land():
    path = os.path.join(here, 'land.json')
    if not os.path.exists(path):
        return None
    cell = 100.0
    grid = {}
    for k in range(n):
        grid.setdefault((int(P[k][0] // cell), int(P[k][1] // cell)), []).append(k)
    def frame(lon, lat):
        x = math.radians(lon - lon0) * R * math.cos(lat0)
        y = math.radians(lat - la0) * R
        cx, cy = int(x // cell), int(y // cell)
        for reach in (2, 8, 20):
            near = [k for i in range(-reach, reach + 1) for j in range(-reach, reach + 1)
                    for k in grid.get((cx + i, cy + j), ())]
            if near:
                break
        if not near:
            return None
        k = min(near, key=lambda q: (P[q][0] - x) ** 2 + (P[q][1] - y) ** 2)
        # Onto the segment either side of the nearest sample.
        best = None
        for a_, b_ in ((max(0, k - 1), k), (k, min(n - 1, k + 1))):
            ax, ay = P[a_]; bx, by = P[b_]
            dx, dy = bx - ax, by - ay
            L2 = dx * dx + dy * dy or 1e-9
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / L2))
            px, py = ax + dx * t, ay + dy * t
            dist = math.hypot(x - px, y - py)
            if best is None or dist < best[0]:
                L = math.sqrt(L2)
                cross = (dx * (y - ay) - dy * (x - ax)) / L
                best = (dist, (a_ + t * (b_ - a_)) * STEP - S0, -cross, math.atan2(dy, dx))
        return best[1], best[2], best[3]
    def outline(points):
        out = [frame(lo, la) for lo, la in points]
        if any(q is None for q in out):
            return None
        return out
    def joined(ways):
        # A multipolygon's outer ways, joined end to end into rings.
        rings, open_ = [], [list(w) for w in ways if len(w) > 1]
        while open_:
            ring = open_.pop(0)
            grown = True
            while ring[0] != ring[-1] and grown:
                grown = False
                for w in open_:
                    if w[0] == ring[-1]:
                        ring += w[1:]
                    elif w[-1] == ring[-1]:
                        ring += w[::-1][1:]
                    else:
                        continue
                    open_.remove(w)
                    grown = True
                    break
            rings.append(ring)
        return rings
    length = S1 - S0
    seen = lambda pts: any(-50 < x < length + 50 and abs(l) < 620 for x, l, _ in pts)
    flat = lambda pts: [v for x, l, _ in pts for v in (round(x, 1), round(l, 1))]
    result = {'woods': [], 'rows': [], 'orchards': [], 'yards': [], 'water': [], 'buildings': [],
              'fuel': []}
    for e in json.load(open(path))['elements']:
        tags = e['tags']
        # Fuel stations: where they are along the road and on which side.
        if tags.get('amenity') == 'fuel':
            if 'lat' in e:
                lon, lat = e['lon'], e['lat']
            elif e.get('geometry'):
                lon = sum(q[0] for q in e['geometry']) / len(e['geometry'])
                lat = sum(q[1] for q in e['geometry']) / len(e['geometry'])
            else:
                continue
            q = frame(lon, lat)
            if q and 0 < q[0] < length and abs(q[1]) < 250:
                result['fuel'].append([round(q[0]), round(q[1], 1)])
            continue
        if e['type'] == 'relation':
            ways = [m['geometry'] for m in e.get('members', []) if m['role'] == 'outer']
            shapes = joined(ways)
        elif 'geometry' in e:
            shapes = [e['geometry']]
        else:
            continue
        kind = None
        if tags.get('natural') == 'wood' or tags.get('landuse') == 'forest':
            kind = 'woods'
        elif tags.get('natural') == 'tree_row':
            kind = 'rows'
        elif tags.get('landuse') in ('orchard', 'vineyard'):
            kind = 'orchards'
        elif tags.get('landuse') in ('residential', 'allotments', 'farmyard'):
            kind = 'yards'
        elif tags.get('natural') == 'water' or tags.get('landuse') == 'reservoir':
            kind = 'water'
        elif 'building' in tags:
            kind = 'buildings'
        if not kind:
            continue
        for shape in shapes:
            pts = outline(shape)
            if not pts or not seen(pts):
                continue
            if kind != 'buildings':
                result[kind].append(flat(pts))
                continue
            # The smallest rectangle round the footprint, along one of its
            # sides, in metres on the ground.
            ring = pts[:-1] if len(pts) > 3 and pts[0][:2] == pts[-1][:2] else pts
            if len(ring) < 3:
                continue
            best = None
            for i in range(len(ring)):
                ax, al, _ = ring[i]; bx, bl, _ = ring[(i + 1) % len(ring)]
                ang = math.atan2(bl - al, bx - ax)
                c, s_ = math.cos(ang), math.sin(ang)
                us = [x * c + l * s_ for x, l, _ in ring]
                vs = [-x * s_ + l * c for x, l, _ in ring]
                area = (max(us) - min(us)) * (max(vs) - min(vs))
                if best is None or area < best[0]:
                    uc, vc = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
                    best = (area, uc * c - vc * s_, uc * s_ + vc * c,
                            max(us) - min(us), max(vs) - min(vs), ang)
            _, bx, bl, L, W, ang = best
            if L < W:
                L, W, ang = W, L, ang + math.pi / 2
            if L < 2.5 or W < 2 or not (0 < bx < length) or abs(bl) > 600:
                continue
            b = tags.get('building', 'yes')
            levels = tags.get('building:levels', '')
            levels = int(levels) if levels.isdigit() else 0
            area = L * W
            # 0: a house under a pitched roof; 1: a shed or garage; 2: a
            # large flat-roofed building (a farm's, a shop, a works);
            # 3: a block of flats.
            if b in ('apartments',) or levels >= 3:
                k_ = 3
            elif b in ('garage', 'garages', 'shed', 'hut', 'barn') and area < 120 or area < 22:
                k_ = 1
            elif b in ('industrial', 'warehouse', 'commercial', 'retail', 'farm_auxiliary',
                       'supermarket', 'service', 'cowshed', 'greenhouse', 'hangar') or area > 260:
                k_ = 2
            else:
                k_ = 0
            height = levels * 3 if levels else (2.6 if k_ == 1 else 3 if k_ == 0 else 6 if k_ == 2 else 15)
            ang = (ang + math.pi / 2) % math.pi - math.pi / 2
            result['buildings'] += [round(bx, 1), round(bl, 1), round(L, 1), round(W, 1),
                                    round(math.degrees(ang), 1), round(height, 1), k_]
    return result

out = {
    'name': C['name'],
    'road': C['road'],
    'from': C['from'],
    'to': C['to'],
    'toGenitive': C['toGenitive'],
    'toLocative': C['toLocative'],
    'boards': C['boards'],
    **({'lanes': C['lanes']} if 'lanes' in C else {}),
    **({'checkpoints': C['checkpoints']} if 'checkpoints' in C else {}),
    'step': OUT,
    'length': S1 - S0,
    'centre': pack(centre),
    'height': pack(heights),
    'places': places,
}
grounds = land()
if grounds:
    out['land'] = {'water': grounds['water'], 'buildings': grounds['buildings']}
    # The fuel stations by the road (along, across; right positive), where
    # the game puts its service areas.
    out['fuel'] = sorted(grounds['fuel'])
    print({k: len(v) for k, v in grounds.items()}, 'buildings', len(grounds['buildings']) // 7)
target = os.path.join(here, '..', '..', 'public', 'assets', f'route-{ID}.json')
json.dump(out, open(target, 'w'), ensure_ascii=False, separators=(',', ':'))
print(count, 'samples,', len(places), 'places, z', round(min(centre)), round(max(centre)),
      'height', round(min(heights)), round(max(heights)), os.path.getsize(target), 'bytes')
