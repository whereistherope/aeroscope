function routeSamplePoints(airports, maxPoints = 18) {
  const usable = (airports || []).filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));
  if (usable.length < 2) return [];
  const distances = [];
  let total = 0;
  for (let i = 0; i < usable.length - 1; i += 1) {
    const d = map.distance([usable[i].lat, usable[i].lon], [usable[i + 1].lat, usable[i + 1].lon]);
    distances.push(d); total += d;
  }
  const points = [];
  distances.forEach((distance, i) => {
    const share = total > 0 ? distance / total : 1 / distances.length;
    const steps = Math.max(2, Math.round(share * (maxPoints - 1)) + 1);
    for (let j = 0; j < steps; j += 1) {
      if (i > 0 && j === 0) continue;
      const point = greatCirclePoint(usable[i], usable[i + 1], j / (steps - 1));
      points.push(point);
    }
  });
  if (points.length <= maxPoints) return points;
  return Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * (points.length - 1) / (maxPoints - 1))]);
}

function unwrapRoutePoints(points) {
  let previous = null;
  return points.map((point) => {
    let lon = Number(point.lon);
    if (previous !== null) {
      while (lon - previous > 180) lon -= 360;
      while (lon - previous < -180) lon += 360;
    }
    previous = lon;
    return [Number(point.lat), lon];
  });
}

function drawSelectedRoute(route) {
  selectedRouteLayer.clearLayers();
  if (!route?.airports || route.airports.length < 2) return;
  const points = routeSamplePoints(route.airports, 32);
  const displayPoints = unwrapRoutePoints(points);
  L.polyline(displayPoints, {
    pane: 'routePane', color: '#9fb7bb', weight: 1.2, opacity: 0.34,
    dashArray: '2 8', lineCap: 'round', interactive: false
  }).addTo(selectedRouteLayer);
  route.airports.forEach((airport, index) => {
    const code = airport.iata || airport.icao || `APT ${index + 1}`;
    const marker = L.circleMarker([airport.lat, airport.lon], {
      pane: 'routePane', radius: 4, color: '#9fb7bb', weight: 1,
      fillColor: '#071015', fillOpacity: 1, interactive: false
    }).addTo(selectedRouteLayer);
    marker.bindTooltip(escapeHTML(code), { permanent: true, direction: 'top', offset: [0, -4], className: 'route-airport-label' });
  });
}

function drawRouteWeather(data) {
  routeWeatherLayer.clearLayers();
  const points = Array.isArray(data?.points) ? data.points : [];
  if (points.length < 2) return;
  const displayPoints = unwrapRoutePoints(points);
  for (let i = 0; i < displayPoints.length - 1; i += 1) {
    const category = points[i + 1]?.category || points[i]?.category || 'minimal';
    const colour = routePotentialColour(category);
    const segment = [displayPoints[i], displayPoints[i + 1]];
    L.polyline(segment, {
      pane: 'routeWeatherPane', color: colour, weight: 24, opacity: 0.035,
      lineCap: 'round', interactive: false
    }).addTo(routeWeatherLayer);
    L.polyline(segment, {
      pane: 'routeWeatherPane', color: colour, weight: 13, opacity: 0.13,
      lineCap: 'round', interactive: false
    }).addTo(routeWeatherLayer);
    const core = L.polyline(segment, {
      pane: 'routeWeatherPane', color: colour, weight: 4, opacity: 0.90,
      lineCap: 'round', interactive: true
    }).addTo(routeWeatherLayer);
    core.bindTooltip(`<strong>${escapeHTML(category.toUpperCase())} ROUTE TURB POTENTIAL</strong><br>${escapeHTML(state.levelLabel)} · ${escapeHTML(formatOffset(state.timeOffset))}<br><span style="color:#8fa1a6">Experimental model diagnostic — not EDR</span>`, { className: 'turb-tooltip', sticky: true });
  }
  points.forEach((point, index) => {
    const previous = points[index - 1]?.category;
    if (index !== 0 && index !== points.length - 1 && previous === point.category) return;
    L.circleMarker([point.lat, point.lon], {
      pane: 'routeWeatherPane', radius: 3.2, color: '#061015', weight: 1.2,
      fillColor: routePotentialColour(point.category), fillOpacity: 1, interactive: false
    }).addTo(routeWeatherLayer);
  });
}

function fitSelectedRoute() {
  const route = state.selectedRoute;
  if (!route?.airports?.length) return;
  const points = unwrapRoutePoints(routeSamplePoints(route.airports, 32));
  if (state.selectedAircraft && Number.isFinite(state.selectedAircraft.lat) && Number.isFinite(state.selectedAircraft.lon)) {
    let aircraftLon = state.selectedAircraft.lon;
    const referenceLon = points.length ? points[Math.floor(points.length / 2)][1] : aircraftLon;
    while (aircraftLon - referenceLon > 180) aircraftLon -= 360;
    while (aircraftLon - referenceLon < -180) aircraftLon += 360;
    points.push([state.selectedAircraft.lat, aircraftLon]);
  }
  map.fitBounds(points, { padding: [42, 42], maxZoom: 7 });
}

function routeWeatherSummary(data) {
  if (!data?.counts) return state.routeWeatherLoading ? '<span class="route-chip">WX SAMPLING…</span>' : '<span class="route-chip">ROUTE WX UNAVAILABLE</span>';
  const order = ['high', 'elevated', 'low', 'minimal'];
  return order.filter((key) => Number(data.counts[key]) > 0).map((key) => `<span class="route-chip" style="color:${routePotentialColour(key)}">${escapeHTML(key.toUpperCase())} ${Number(data.counts[key])}</span>`).join('');
}

function renderRouteInfo() {
  if (!state.selectedAircraft) { routeInfo.classList.add('hidden'); return; }
  routeInfo.classList.remove('hidden');
  if (state.routeLoading) {
    routeInfo.innerHTML = '<div class="route-row"><div class="route-label">Resolving route…</div><div class="route-source">CALLSIGN LOOKUP</div></div><div class="route-caveat">AeroScope is matching the selected live callsign to a plausible origin/destination route.</div>';
    return;
  }
  const route = state.selectedRoute;
  if (!route || route.unavailable) {
    routeInfo.innerHTML = `<div class="route-row"><div class="route-label">Route unavailable</div><div class="route-source">${escapeHTML(route?.error || 'NO MATCH')}</div></div><div class="route-caveat">Live ADS-B does not transmit origin/destination. AeroScope only shows a route when a separate callsign lookup returns usable airport coordinates.</div>`;
    return;
  }
  const source = `${route.source || 'route lookup'}${route.plausible === false ? ' · UNVERIFIED' : ''}`;
  routeInfo.innerHTML = `
    <div class="route-row"><div class="route-label">${escapeHTML(route.routeLabel || route.routeIcao || 'Route')}</div><div class="route-source">${escapeHTML(source)}</div></div>
    <div class="route-weather-summary">${routeWeatherSummary(state.routeWeather)}</div>
    <div class="route-caveat">The illuminated route ribbon uses AeroScope's experimental model turbulence-potential diagnostic at <strong>${escapeHTML(state.levelLabel)}</strong> / <strong>${escapeHTML(formatOffset(state.timeOffset))}</strong>. ${escapeHTML(route.caveat || 'Plausible callsign route, not a filed flight plan.')}</div>
    <div class="route-actions"><button id="fitRouteButton" type="button">FIT ROUTE + WEATHER</button><button id="refreshRouteWxButton" type="button">REFRESH ROUTE WX</button></div>`;
  document.getElementById('fitRouteButton')?.addEventListener('click', fitSelectedRoute);
  document.getElementById('refreshRouteWxButton')?.addEventListener('click', () => loadRouteWeather(route, state.selectedAircraft, true));
}

function renderAircraftDetails() {
  const item = state.selectedAircraft;
  if (!item) return;
  const flight = displayFlightNumber(item) || item.callsign || item.registration || item.id.toUpperCase();
  detailTitle.textContent = flight;
  detailSub.textContent = [item.registration, item.type, item.description].filter(Boolean).join(' · ') || 'Live ADS-B target';
  const altitude = item.onGround ? 'GROUND' : Number.isFinite(item.altitudeFt) ? `${Math.round(item.altitudeFt).toLocaleString()} ft · FL${Math.round(item.altitudeFt / 100)}` : '—';
  const vertical = Number.isFinite(item.verticalRateFpm) ? `${item.verticalRateFpm > 0 ? '+' : ''}${Math.round(item.verticalRateFpm)} fpm` : '—';
  detailGrid.innerHTML = [
    metric('Altitude', altitude),
    metric('Ground speed', Number.isFinite(item.groundSpeedKt) ? `${Math.round(item.groundSpeedKt)} kt` : '—'),
    metric('Track', Number.isFinite(item.trackDeg) ? `${Math.round(item.trackDeg)}°` : '—'),
    metric('Vertical rate', vertical),
    metric('Squawk', item.squawk || '—'),
    metric('Position age', Number.isFinite(item.seenSeconds) ? `${Math.round(item.seenSeconds)} s` : '—'),
    `<button id="aircraftTurbProfile" class="profile-button" style="grid-column:1/-1" type="button">VERTICAL TURB PROFILE AT POSITION</button>`
  ].join('');
  detailCard.classList.remove('hidden');
  const profileButton = document.getElementById('aircraftTurbProfile');
  if (profileButton && Number.isFinite(item.lat) && Number.isFinite(item.lon)) {
    profileButton.addEventListener('click', () => loadTurbProfile(item.lat, item.lon, flight));
  }
  renderRouteInfo();
}

async function loadRouteWeather(route, item, force = false) {
  if (!route?.airports || route.airports.length < 2 || !item) return;
  const selectedId = item.id;
  const samples = routeSamplePoints(route.airports, 18);
  if (samples.length < 2) return;
  state.routeWeatherLoading = true;
  renderRouteInfo();
  try {
    const pointsParam = samples.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';');
    const data = await getJSON(`/api/route-weather?points=${encodeURIComponent(pointsParam)}&level=${encodeURIComponent(state.level)}&offset=${encodeURIComponent(state.timeOffset)}${force ? `&r=${Date.now()}` : ''}`);
    if (state.selectedAircraftId !== selectedId) return;
    state.routeWeather = data;
    drawRouteWeather(data);
  } catch (error) {
    if (state.selectedAircraftId !== selectedId) return;
    state.routeWeather = { error: error.message, points: [], counts: null };
    routeWeatherLayer.clearLayers();
  } finally {
    if (state.selectedAircraftId === selectedId) {
      state.routeWeatherLoading = false;
      renderRouteInfo();
    }
  }
}
