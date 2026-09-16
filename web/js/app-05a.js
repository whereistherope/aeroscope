function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

let trafficLoading = false;
let trafficQueued = false;
let trafficDelayTimer = null;
let lastTrafficLoadAt = 0;

async function loadAircraft(force = false) {
  if (trafficLoading) {
    trafficQueued = true;
    return;
  }
  const minimumGapMs = 12000;
  const waitMs = minimumGapMs - (Date.now() - lastTrafficLoadAt);
  if (!force && waitMs > 0) {
    clearTimeout(trafficDelayTimer);
    trafficDelayTimer = setTimeout(() => loadAircraft(false), waitMs + 50);
    return;
  }
  trafficLoading = true;
  trafficQueued = false;
  lastTrafficLoadAt = Date.now();
  try {
    setLoading('aircraft');
    try {
      const query = boundsQuery().toString();
      let traffic = null;
      let route = '';
      const failures = [];

      try {
        traffic = await getJSON(`/api/traffic-edge?${query}`);
        route = 'EDGE';
      } catch (error) {
        failures.push(`edge: ${error.message}`);
      }

      if (!traffic || !(traffic.aircraft || []).length) {
        try {
          const proxy = await directBrowserTraffic('proxy');
          if ((proxy.aircraft || []).length || !traffic) {
            traffic = traffic ? { ...traffic, aircraft: mergeTrafficLists(traffic.aircraft || [], proxy.aircraft || []), proxy } : proxy;
            route = route ? `${route}+PROXY` : 'PROXY';
          }
        } catch (error) {
          failures.push(`CDN proxy: ${error.message}`);
        }
      }

      if (!traffic || !(traffic.aircraft || []).length) {
        try {
          const direct = await directBrowserTraffic('browser');
          if ((direct.aircraft || []).length || !traffic) {
            traffic = traffic ? { ...traffic, aircraft: mergeTrafficLists(traffic.aircraft || [], direct.aircraft || []), direct } : direct;
            route = route ? `${route}+BROWSER` : 'BROWSER';
          }
        } catch (error) {
          failures.push(`browser: ${error.message}`);
        }
      }

      if (!traffic || !(traffic.aircraft || []).length) {
        try {
          const supplement = await getJSON(`/api/aircraft?${query}`);
          const serverAircraft = supplement.aircraft || [];
          if (serverAircraft.length || !traffic) {
            traffic = { provider: 'Server ADS-B fallback', aircraft: mergeTrafficLists(traffic?.aircraft || [], serverAircraft), timestamp: supplement.timestamp || new Date().toISOString(), server: { supplement } };
            route = route ? `${route}+SERVER` : 'SERVER';
          }
        } catch (error) {
          failures.push(`server supplement: ${error.message}`);
        }
      }

      state.aircraft = mergeTrafficLists(traffic?.aircraft || []);
      state.aircraft.forEach((item) => { item.displayCallsign = item.displayCallsign || displayFlightNumber(item); });
      if (state.selectedAircraft) {
        const updated = state.aircraft.find((item) => item.id === state.selectedAircraft.id);
        if (updated) state.selectedAircraft = updated;
      }
      renderAircraft();

      const openSkyStatus = traffic?.openSky?.authenticated ? 'OS AUTH'
        : traffic?.openSky?.count > 0 ? 'OS ANON'
        : '';
      const source = traffic?.provider || 'Traffic';
      const timestampValue = traffic?.timestamp || new Date().toISOString();
      setStatus('aircraft', `${source} · ${state.aircraft.length} targets · ${route || 'FALLBACK'}${openSkyStatus ? ` · ${openSkyStatus}` : ''} · ${formatTime(timestampValue)}`, state.aircraft.length === 0);

      if (state.timeOffset === 0) {
        if (state.aircraft.length === 0) {
          notice.textContent = 'Traffic could not be reached through Edge, CDN proxy, browser-direct or server fallback. AeroScope will retry automatically; flight-number search may still locate a target.';
          notice.classList.remove('hidden');
        } else {
          notice.classList.add('hidden');
        }
      }
      if (failures.length) console.info('AeroScope traffic fallback diagnostics', failures);
    } catch (error) {
      aircraftLayer.clearLayers();
      setStatus('aircraft', `Unavailable · ${error.message}`, true);
      if (state.timeOffset === 0) {
        notice.textContent = 'Traffic temporarily unavailable. AeroScope will retry automatically.';
        notice.classList.remove('hidden');
      }
    }
  } finally {
    trafficLoading = false;
    if (trafficQueued) {
      trafficQueued = false;
      clearTimeout(trafficDelayTimer);
      const queuedDelay = Math.max(50, 12000 - (Date.now() - lastTrafficLoadAt));
      trafficDelayTimer = setTimeout(() => loadAircraft(false), queuedDelay);
    }
  }
}

async function loadWind() {
  setLoading('wind');
  try {
    const q = boundsQuery();
    q.set('level', state.level);
    q.set('offset', String(state.timeOffset));
    const data = await getJSON(`/api/wind?${q.toString()}`);
    state.windPoints = data.points || [];
    windLayer.clearLayers();
    cloudLayer.clearLayers();
    const radius = Math.max(30000, 210000 / Math.pow(1.23, map.getZoom() - 4));
    state.windPoints.forEach((p) => {
      L.marker([p.lat, p.lon], { icon: windIcon(p), pane: 'windPane', interactive: false }).addTo(windLayer);
      if (Number.isFinite(p.cloudCover)) {
        const opacity = Math.max(0, Math.min(.42, (p.cloudCover / 100) * .42));
        L.circle([p.lat, p.lon], { pane: 'cloudPane', radius, stroke: false, fill: true, fillColor: '#dce8ee', fillOpacity: opacity, interactive: false }).addTo(cloudLayer);
      }
    });
    const valid = state.windPoints[0]?.validTime;
    setStatus('wind', `${data.level} · ${state.windPoints.length} points · valid ${formatTime(valid)}`);
  } catch (error) {
    windLayer.clearLayers(); cloudLayer.clearLayers();
    setStatus('wind', `Unavailable · ${error.message}`, true);
  }
}

async function loadRadar() {
  setLoading('radar');
  try {
    const data = await getJSON(`/api/radar?offset=${state.timeOffset}`);
    if (radarLayer) map.removeLayer(radarLayer);
    radarLayer = L.tileLayer(data.tileUrl, { pane: 'radarPane', opacity: .58, maxNativeZoom: 7, maxZoom: 12, attribution: 'Radar: RainViewer' });
    radarLayer.on('tileerror', () => setStatus('radar', 'Metadata loaded · radar tile unavailable', true));
    if (state.layers.radar) radarLayer.addTo(map);
    const note = data.forecastUnavailable ? ' · latest frame (no future frame)' : '';
    setStatus('radar', `${formatTime(data.time)}${note}`);
  } catch (error) {
    if (radarLayer) map.removeLayer(radarLayer);
    radarLayer = null;
    setStatus('radar', `Unavailable · ${error.message}`, true);
  }
}

async function loadMetar() {
  setLoading('metar');
  try {
    const data = await getJSON('/api/metar');
    state.airports = data.airports || [];
    drawAirports();
    const available = state.airports.filter((a) => a.available).length;
    setStatus('metar', `${available}/${state.airports.length} airports · ${formatTime(data.timestamp)}`);
  } catch (error) {
    setStatus('metar', `Unavailable · ${error.message}`, true);
  }
}

function drawAirports() {
  airportLayer.clearLayers();
  state.airports.forEach((a) => {
    const marker = L.marker([a.lat, a.lon], { icon: airportIcon(a), pane: 'airportPane', keyboard: false });
    const raw = a.rawMetar ? escapeHTML(a.rawMetar) : 'No current METAR returned';
    marker.bindTooltip(`<strong>${escapeHTML(a.icao)} · ${escapeHTML(a.name)}</strong><br>${raw}`, { className: 'metar-tooltip', direction: 'top' });
    marker.addTo(airportLayer);
  });
}
