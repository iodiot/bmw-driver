// On the route, a card at the top right with how far it still is to its
// end (Kyiv, Zaporizhzhia): the kilometres large, the drive as a line with
// the car on it and the villages the road runs through as dots, and the next
// place ahead with its distance.
export function routeProgress(route, x) {
  const done = Math.min(1, Math.max(0, x / route.length));
  const ahead = route.places.find((p) => p.at > x + 30) ?? null;
  return {
    km: route.toGo(x) / 1000,
    done,
    next: ahead ? { name: ahead.name, km: (ahead.at - x) / 1000 } : null,
  };
}

// Kilometres as shown: whole ones from ten up, tenths below.
export const cardKm = (km) => (km >= 10 ? String(Math.round(km)) : km.toFixed(1).replace('.', ','));

export function setupRouteCard(container, route) {
  const card = document.createElement('section');
  card.className = 'route-card';
  card.setAttribute('aria-label', `${route.from} — ${route.to}`);
  const dots = route.places
    .filter((p) => p.through)
    .map((p) => `<i style="left:${((p.at / route.length) * 100).toFixed(2)}%"></i>`)
    .join('');
  card.innerHTML = `
    <div class="route-card-head">
      <span class="route-card-shield">${route.road}</span>
      <span>до ${route.toGenitive}</span>
    </div>
    <div class="route-card-km"><b>0</b><span>км</span></div>
    <div class="route-card-line" aria-hidden="true">
      <div class="route-card-done"></div>
      ${dots}
      <div class="route-card-car"></div>
    </div>
    <div class="route-card-ends"><span>${route.from}</span><span>${route.to}</span></div>
    <div class="route-card-next"></div>`;
  container.append(card);
  const km = card.querySelector('.route-card-km b'),
    done = card.querySelector('.route-card-done'),
    car = card.querySelector('.route-card-car'),
    next = card.querySelector('.route-card-next');
  let wait = 0;
  return {
    card,
    update(dt, x) {
      wait -= dt;
      if (wait > 0) return;
      wait = 0.2;
      const p = routeProgress(route, x);
      km.textContent = cardKm(p.km);
      const percent = `${(p.done * 100).toFixed(2)}%`;
      done.style.width = percent;
      car.style.left = percent;
      next.textContent = p.next
        ? `Далі ${p.next.name} · ${cardKm(p.next.km)} км`
        : p.km > 0.05
          ? `Далі ${route.to}`
          : `Ви в ${route.toLocative}`;
      card.dataset.arrived = String(p.km <= 0.05);
    },
  };
}
