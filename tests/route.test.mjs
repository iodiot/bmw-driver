import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { makeRoute, routeDatum } from '../public/route.js';

const data = JSON.parse(readFileSync(new URL('../public/assets/route-m06.json', import.meta.url)));
const route = makeRoute(data);

test('the M-06 from Zhytomyr to Kyiv: its length, heights and places', () => {
  assert.equal(route.from, 'Житомир');
  assert.equal(route.to, 'Київ');
  assert.ok(route.length > 110000 && route.length < 125000);
  // Zhytomyr stands about 220 m up; the Teteriv's valley by Korostyshiv
  // and the Irpin's toward Kyiv lie lower.
  assert.ok(Math.abs(route.height(0) + routeDatum - 220) < 6);
  let low = Infinity;
  for (let x = 0; x < route.length; x += 100) low = Math.min(low, route.height(x) + routeDatum);
  assert.ok(low > 105 && low < 135, `lowest ${low}`);
  const names = route.places.map((p) => p.name);
  for (const name of ['Коростишів', 'Кочерів', 'Стоянка']) assert.ok(names.includes(name), name);
  assert.ok(route.places.every((p, i, all) => i === 0 || all[i - 1].at <= p.at));
  assert.equal(route.toGo(route.length), 0);
  assert.equal(Math.round(route.toGo(0) / 1000), Math.round(route.length / 1000));
});

test('its bends stay drivable: gentle grades, within 15° of the axis', () => {
  for (let x = 5; x < route.length; x += 25) {
    assert.ok(Math.abs(route.grade(x)) < 0.04, `grade at ${x}`);
    assert.ok(Math.abs(route.centreSlope(x)) < Math.tan((15.5 * Math.PI) / 180), `slope at ${x}`);
  }
});

test('signs name the places: entry and exit where the road runs through', async () => {
  const { routeSigns } = await import('../public/route-signs.js');
  const signs = routeSigns(route.places);
  const kocheriv = signs.filter((s) => s.name === 'Кочерів');
  assert.deepEqual(
    kocheriv.map((s) => s.kind),
    ['enter', 'leave']
  );
  assert.ok(kocheriv[0].at < kocheriv[1].at);
  const korostyshiv = signs.find((s) => s.name === 'Коростишів');
  assert.equal(korostyshiv.kind, 'turn');
  assert.ok(['left', 'right'].includes(korostyshiv.side));
});

test('the route has its own link; the main page keeps the endless road', async () => {
  const { routeFor } = await import('../public/route.js');
  assert.equal(routeFor('/bmw-driver/kyiv/', ''), 'm06');
  assert.equal(routeFor('/bmw-driver/kyiv', ''), 'm06');
  assert.equal(routeFor('/bmw-driver/', ''), 'endless');
  assert.equal(routeFor('/bmw-driver/', '?route=m06'), 'm06');
  assert.equal(routeFor('/bmw-driver/kyiv/', '?route=endless'), 'endless');
  assert.equal(routeFor('/bmw-driver/', '?kyiv'), 'm06');
  assert.equal(routeFor('/bmw-driver/', '?kyiv&time=22'), 'm06');
  assert.equal(routeFor('/bmw-driver/', '?time=22&kyiv='), 'm06');
  assert.equal(routeFor('/bmw-driver/', '?kyiv&route=endless'), 'endless');
  assert.equal(routeFor('/bmw-driver/', '?zp'), 'n08');
  assert.equal(routeFor('/bmw-driver/zp/', ''), 'n08');
  assert.equal(routeFor('/bmw-driver/', '?zp&time=22'), 'n08');
});

test('the N-08 from Dnipro to Zaporizhzhia: its length, heights, places and bends', () => {
  const zp = makeRoute(
    JSON.parse(readFileSync(new URL('../public/assets/route-n08.json', import.meta.url)))
  );
  assert.equal(zp.from, 'Дніпро');
  assert.equal(zp.to, 'Запоріжжя');
  assert.equal(zp.road, 'Н-08');
  assert.equal(zp.toGenitive, 'Запоріжжя');
  assert.equal(zp.toLocative, 'Запоріжжі');
  // From Dnipro's edge to Zaporizhzhia's, some 64 km of the N-08.
  assert.ok(zp.length > 60000 && zp.length < 68000);
  // The steppe above the Dnipro's valley: 50–160 m.
  for (let x = 0; x < zp.length; x += 100) {
    const h = zp.height(x) + routeDatum;
    assert.ok(h > 40 && h < 170, `height ${h} at ${x}`);
    assert.ok(Math.abs(zp.grade(x + 5)) < 0.04, `grade at ${x}`);
    assert.ok(Math.abs(zp.centreSlope(x + 5)) < Math.tan((15.5 * Math.PI) / 180), `slope at ${x}`);
  }
  const names = zp.places.map((p) => p.name);
  for (const name of ['Дослідне', 'Петропавлівка']) assert.ok(names.includes(name), name);
  // Its boards count down to Zaporizhzhia and on beyond it.
  assert.deepEqual(
    zp.boards.map((b) => b.name),
    ['Запоріжжя', 'Мелітополь', 'Маріуполь']
  );
});
