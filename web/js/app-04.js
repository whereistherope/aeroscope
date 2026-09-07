async function loadAircraftRoute(item, force = false) {
  const callsign = String(item?.callsign || item?.displayCallsign || displayFlightNumber(item) || '').trim().toUpperCase();
  if (!callsign || !item) {
    state.selectedRoute = { unavailable: true, error: 'NO CALLSIGN' };
    renderRouteInfo();
    return;
  }
  const selectedId = item.id;
  const cacheKey = `${callsign}:${Number(item.lat || 0).toFixed(1)}:${Number(item.lon || 0).toFixed(1)}`;
  if (!force && routeCache.has(cacheKey)) {
    state.selectedRoute = routeCache.get(cacheKey);
    state.routeLoading = false;
    drawSelectedRoute(state.selectedRoute);
    renderRouteInfo();
    loadRouteWeather(state.selectedRoute, item);
    return;
  }
  state.routeLoading = true;
  state.selectedRoute = null;
  state.routeWeather = null;
  routeWeatherLayer.clearLayers();
  selectedRouteLayer.clearLayers();
  renderRouteInfo();
  try {
    const data = await getJSON(`/api/route?callsign=${encodeURIComponent(callsign)}&lat=${encodeURIComponent(item.lat)}&lon=${encodeURIComponent(item.lon)}`);
    if (state.selectedAircraftId !== selectedId) return;
    routeCache.set(cacheKey, data);
    state.selectedRoute = data;
    drawSelectedRoute(data);
    await loadRouteWeather(data, item);
  } catch (error) {
    if (state.selectedAircraftId !== selectedId) return;
    state.selectedRoute = { unavailable: true, error: error.message };
    selectedRouteLayer.clearLayers();
    routeWeatherLayer.clearLayers();
  } finally {
    if (state.selectedAircraftId === selectedId) {
      state.routeLoading = false;
      renderRouteInfo();
    }
  }
}

function showAircraftDetails(item) {
  const changed = state.selectedAircraftId !== item.id;
  state.selectedAircraftId = item.id;
  state.selectedAircraft = item;
  drawTurbPotential();
  if (changed) {
    state.selectedRoute = null;
    state.routeWeather = null;
    selectedRouteLayer.clearLayers();
    routeWeatherLayer.clearLayers();
  }
  renderAircraftDetails();
  if (changed || !state.selectedRoute) loadAircraftRoute(item);
}

function hideAircraftDetails() {
  state.selectedAircraftId = null;
  state.selectedAircraft = null;
  state.selectedRoute = null;
  state.routeWeather = null;
  state.routeLoading = false;
  drawTurbPotential();
  selectedRouteLayer.clearLayers();
  routeWeatherLayer.clearLayers();
  routeInfo.classList.add('hidden');
  detailCard.classList.add('hidden');
  renderAircraft();
}

function renderAircraft() {
  aircraftLayer.clearLayers();
  const byId = new Map();
  state.aircraft.forEach((item) => byId.set(item.id, item));
  if (state.selectedAircraft && !byId.has(state.selectedAircraft.id)) byId.set(state.selectedAircraft.id, state.selectedAircraft);

  byId.forEach((item) => {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return;
    const selected = item.id === state.selectedAircraftId;
    const marker = L.marker([item.lat, item.lon], {
      icon: aircraftIcon(item, selected),
      pane: 'aircraftPane',
      keyboard: false,
      opacity: state.timeOffset === 0 ? 1 : 0.42,
      title: displayFlightNumber(item) || item.callsign || ''
    });
    marker.on('click', () => {
      showAircraftDetails(item);
      renderAircraft();
    });
    marker.addTo(aircraftLayer);
  });
}

function windIcon(point) {
  const toDeg = (Number(point.fromDeg) + 180) % 360;
  const speed = Math.round(point.speedKt);
  const html = `<div class="wind-wrap">
    <div class="wind-arrow" style="transform:rotate(${toDeg}deg)">
      <svg viewBox="0 0 28 28" aria-hidden="true"><line x1="14" y1="24" x2="14" y2="6" stroke="#d9f8fc" stroke-width="1.6"/><path d="M10 10 L14 4 L18 10" fill="none" stroke="#d9f8fc" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div><div class="wind-speed">${speed}kt</div></div>`;
  return L.divIcon({ className: 'wind-icon', html, iconSize: [42, 42], iconAnchor: [21, 21] });
}

function airportLabel(a) {
  const zoom = map.getZoom();
  const temp = Number.isFinite(a.temperatureC) ? `${Math.round(a.temperatureC)}°` : '—°';
  let text = `${a.iata || a.icao} ${temp}`;
  if (zoom >= 4.8 && a.available) {
    const dir = a.windFromDeg === 'VRB' ? 'VRB' : Number.isFinite(Number(a.windFromDeg)) ? String(Math.round(Number(a.windFromDeg))).padStart(3, '0') : '---';
    const speed = Number.isFinite(a.windSpeedKt) ? String(Math.round(a.windSpeedKt)).padStart(2, '0') : '--';
    const gust = Number.isFinite(a.windGustKt) ? `G${Math.round(a.windGustKt)}` : '';
    text += ` ${dir}/${speed}${gust}`;
  }
  if (zoom >= 6 && a.ceilingFt) text += ` ${a.cloudCover || ''}${String(Math.round(a.ceilingFt / 100)).padStart(3, '0')}`;
  return text;
}

function airportIcon(a) {
  const unavailable = a.available ? '' : ' airport-unavailable';
  const html = `<div class="airport-wrap${unavailable}"><span class="airport-dot"></span><span class="airport-text">${escapeHTML(airportLabel(a))}</span></div>`;
  return L.divIcon({ className: 'airport-icon', html, iconSize: [180, 20], iconAnchor: [4, 10] });
}
