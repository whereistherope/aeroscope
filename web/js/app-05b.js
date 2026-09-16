function selectedAltitudeFt() {
  return state.level === 'surface' ? 2500 : Number(state.level);
}

function turbulenceColour(value) {
  const colours = {
    none: '#76d9a5', light: '#e4d06a', moderate: '#e5a35d', severe: '#ef6f72', unspecified: '#cbb769',
    minimal: '#506a70', low: '#768a83', elevated: '#a77c4d', high: '#9d5853'
  };
  return colours[value] || colours.unspecified;
}

function featureMatchesAltitude(feature) {
  const props = feature?.properties || {};
  const levelFt = selectedAltitudeFt();
  const lower = Number(props.lowerFt);
  const upper = Number(props.upperFt);
  if (Number.isFinite(lower) && Number.isFinite(upper)) return levelFt >= lower && levelFt <= upper;
  const altitude = Number(props.altitudeFt);
  if (Number.isFinite(altitude)) return Math.abs(altitude - levelFt) <= 4000;
  return true;
}

function drawTurbulenceFeatures() {
  if (turbulenceLayer) map.removeLayer(turbulenceLayer);
  if (turbObservedLayer) map.removeLayer(turbObservedLayer);
  const allFeatures = state.turbFeatures || [];
  const observations = allFeatures.filter((feature) => feature?.properties?.featureType === 'observation' && featureMatchesAltitude(feature));
  const advisories = allFeatures.filter((feature) => feature?.properties?.featureType !== 'observation' && featureMatchesAltitude(feature));

  turbulenceLayer = L.geoJSON({ type: 'FeatureCollection', features: advisories }, {
    pane: 'turbPane',
    style: (feature) => {
      const sev = feature?.properties?.severity || 'unspecified';
      const geometry = feature?.geometry?.type;
      const corridor = geometry === 'LineString' || geometry === 'MultiLineString';
      return {
        color: turbulenceColour(sev),
        weight: corridor ? 5 : sev === 'severe' ? 1.8 : 1.35,
        opacity: corridor ? .62 : .95,
        dashArray: sev === 'severe' ? '8 4' : '4 5',
        fillColor: turbulenceColour(sev),
        fillOpacity: corridor ? 0 : sev === 'severe' ? .20 : .11
      };
    },
    pointToLayer: (feature, latlng) => {
      const sev = feature?.properties?.severity || 'unspecified';
      const radiusNm = Number(feature?.properties?.radiusNm || 30);
      return L.circle(latlng, { pane: 'turbPane', radius: radiusNm * 1852, color: turbulenceColour(sev), weight: 1.4, dashArray: '3 5', fillColor: turbulenceColour(sev), fillOpacity: .06 });
    },
    onEachFeature: (feature, layer) => {
      const props = feature?.properties || {};
      const source = props.sourceType ? `<br><span style="color:#8fa1a6">${escapeHTML(props.sourceType)}</span>` : '';
      const band = props.verticalBand ? `<br><span style="color:#aebfc3">${escapeHTML(props.verticalBand)}</span>` : '';
      layer.bindTooltip(`${escapeHTML(props.label || 'Turbulence advisory')}${band}${source}`, { className: 'turb-tooltip', sticky: true });
    }
  });

  turbObservedLayer = L.geoJSON({ type: 'FeatureCollection', features: observations }, {
    pane: 'turbObservedPane',
    pointToLayer: (feature, latlng) => {
      const props = feature?.properties || {};
      const age = Number(props.ageMinutes);
      const fade = Number.isFinite(age) ? Math.max(.35, 1 - age / 480) : .8;
      const colour = turbulenceColour(props.severity || 'unspecified');
      return L.circleMarker(latlng, { pane: 'turbObservedPane', radius: 5.2, color: '#071015', weight: 1.2, fillColor: colour, fillOpacity: fade });
    },
    onEachFeature: (feature, layer) => {
      const props = feature?.properties || {};
      const age = Number.isFinite(Number(props.ageMinutes)) ? `${Math.round(Number(props.ageMinutes))} min ago` : 'time unavailable';
      const level = props.verticalBand ? ` · ${escapeHTML(props.verticalBand)}` : '';
      layer.bindTooltip(`<strong>${escapeHTML(String(props.severity || 'reported').toUpperCase())}</strong>${level}<br>${escapeHTML(age)}<br>${escapeHTML(props.label || 'PIREP/AIREP turbulence report')}`, { className: 'turb-tooltip', sticky: true });
    }
  });

  if (state.layers.turbulence && state.turbAdvEnabled) turbulenceLayer.addTo(map);
  if (state.layers.turbulence && state.turbObsEnabled) turbObservedLayer.addTo(map);
  return { observations, advisories };
}

async function loadTurbulence() {
  setLoading('turb');
  setLoading('turbObs');
  try {
    const q = boundsQuery();
    const data = await getJSON(`/api/turbulence?${q.toString()}`);
    state.turbFeatures = data.features || [];
    const visible = drawTurbulenceFeatures();
    const counts = data.counts || {};
    const advSummary = [
      counts.severe ? `${counts.severe} SEV` : '',
      counts.moderate ? `${counts.moderate} MOD` : '',
      counts.light ? `${counts.light} LGT` : ''
    ].filter(Boolean).join(' · ');
    setStatus('turb', `${visible.advisories.length} visible @ ${state.levelLabel}${advSummary ? ` · ${advSummary}` : ''} · ${formatTime(data.timestamp)}`);
    const obsAll = (data.features || []).filter((feature) => feature?.properties?.featureType === 'observation');
    const obsSummary = [
      obsAll.filter((f) => f.properties?.severity === 'severe').length ? `${obsAll.filter((f) => f.properties?.severity === 'severe').length} SEV` : '',
      obsAll.filter((f) => f.properties?.severity === 'moderate').length ? `${obsAll.filter((f) => f.properties?.severity === 'moderate').length} MOD` : '',
      obsAll.filter((f) => f.properties?.severity === 'light').length ? `${obsAll.filter((f) => f.properties?.severity === 'light').length} LGT` : '',
      obsAll.filter((f) => f.properties?.severity === 'none').length ? `${obsAll.filter((f) => f.properties?.severity === 'none').length} NIL` : ''
    ].filter(Boolean).join(' · ');
    setStatus('turbObs', `${visible.observations.length}/${obsAll.length} visible${obsSummary ? ` · ${obsSummary}` : ''}`);
  } catch (error) {
    setStatus('turb', `Unavailable · ${error.message}`, true);
    setStatus('turbObs', `Unavailable · ${error.message}`, true);
  }
}

function drawTurbPotential() {
  if (!(state.layers.turbulence && state.turbModelEnabled)) {
    turbPotentialLayer.clearLayers();
    return;
  }
  const points = state.turbModelPoints || [];
  if (!points.length) {
    turbPotentialLayer.clearLayers();
    return;
  }
  const dimFactor = state.selectedAircraft ? 0.24 : 1;
  turbPotentialLayer.setData(points, dimFactor);
}

async function loadTurbPotential() {
  setLoading('turbModel');
  try {
    const q = boundsQuery();
    q.set('level', state.level);
    q.set('offset', String(state.timeOffset));
    const data = await getJSON(`/api/turbulence-potential?${q.toString()}`);
    state.turbModelPoints = data.points || [];
    drawTurbPotential();
    const counts = data.counts || {};
    const summary = [counts.high ? `${counts.high} HIGH` : '', counts.elevated ? `${counts.elevated} ELEV` : ''].filter(Boolean).join(' · ');
    const valid = state.turbModelPoints[0]?.validTime;
    setStatus('turbModel', `${state.turbModelPoints.length} pts · ${state.levelLabel}${summary ? ` · ${summary}` : ''} · ${formatTime(valid)}`);
  } catch (error) {
    state.turbModelPoints = [];
    turbPotentialLayer.clearLayers();
    setStatus('turbModel', `Unavailable · ${error.message}`, true);
  }
}

async function loadTurbProfile(lat, lon, label = null) {
  turbProfileCard.classList.remove('hidden');
  turbProfileTitle.textContent = label ? `TURB PROFILE · ${label}` : 'TURB PROFILE';
  turbProfileSub.textContent = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} · ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'} · loading…`;
  turbProfileRows.innerHTML = '<div class="small loading">Loading vertical model diagnostics…</div>';
  turbProfileMeta.textContent = '';
  try {
    const data = await getJSON(`/api/turbulence-profile?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&offset=${encodeURIComponent(state.timeOffset)}`);
    turbProfileSub.textContent = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} · ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'} · valid ${formatTime(data.validTime)}`;
    turbProfileRows.innerHTML = (data.levels || []).slice().reverse().map((row) => {
      const pct = Math.max(5, Math.round(Number(row.score || 0) * 100));
      const cat = String(row.category || 'unknown').toUpperCase();
      const colour = turbulenceColour(row.category);
      const shear = Number.isFinite(row.shearKtPer1000ft) ? `${row.shearKtPer1000ft.toFixed(1)} kt/1kft` : 'shear —';
      const ri = Number.isFinite(row.ri) ? `Ri ${row.ri.toFixed(2)}` : 'Ri —';
      return `<div class="profile-row" title="${escapeHTML(`${shear} · ${ri}`)}"><div class="profile-level">${escapeHTML(row.label)}</div><div class="profile-track"><div class="profile-fill" style="width:${pct}%;background:${colour}"></div></div><div class="profile-cat" style="color:${colour}">${escapeHTML(cat)}</div></div>`;
    }).join('');
    turbProfileMeta.innerHTML = `Model-derived potential from vertical wind shear + atmospheric stability. <strong>Not EDR and not a passenger-safety forecast.</strong><br>Valid ${escapeHTML(formatTime(data.validTime))}. Tap the map for a vertical shear/stability profile.`;
  } catch (error) {
    turbProfileRows.innerHTML = `<div class="small">Profile unavailable · ${escapeHTML(error.message)}</div>`;
  }
}

const levels = [
  ['surface', 'SFC'], ['5000', '5K'], ['10000', 'FL100'], ['18000', 'FL180'],
  ['24000', 'FL240'], ['30000', 'FL300'], ['34000', 'FL340'], ['39000', 'FL390']
];
const altbar = document.getElementById('altbar');
levels.forEach(([value, label]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = value === state.level ? 'active' : '';
  button.addEventListener('click', () => {
    state.level = value; state.levelLabel = label;
    [...altbar.querySelectorAll('button')].forEach((b) => b.classList.remove('active'));
    button.classList.add('active');
    updateHeader();
    loadWind();
    loadTurbPotential();
    drawTurbulenceFeatures();
    if (state.selectedRoute && state.selectedAircraft) loadRouteWeather(state.selectedRoute, state.selectedAircraft);
  });
  altbar.appendChild(button);
});

document.getElementById('timeSlider').addEventListener('input', (event) => {
  state.timeOffset = Number(event.target.value);
  updateHeader();
});
document.getElementById('timeSlider').addEventListener('change', () => {
  loadWind(); loadRadar(); loadTurbPotential();
  if (state.selectedRoute && state.selectedAircraft) loadRouteWeather(state.selectedRoute, state.selectedAircraft);
});

function setLayer(name, enabled) {
  state.layers[name] = enabled;
  const actions = {
    aircraft: () => enabled ? aircraftLayer.addTo(map) : map.removeLayer(aircraftLayer),
    wind: () => enabled ? windLayer.addTo(map) : map.removeLayer(windLayer),
    cloud: () => enabled ? cloudLayer.addTo(map) : map.removeLayer(cloudLayer),
    airports: () => enabled ? airportLayer.addTo(map) : map.removeLayer(airportLayer),
    radar: () => { if (radarLayer) enabled ? radarLayer.addTo(map) : map.removeLayer(radarLayer); },
    turbulence: () => {
      if (enabled) {
        drawTurbPotential();
        if (state.turbAdvEnabled && turbulenceLayer) turbulenceLayer.addTo(map);
        if (state.turbObsEnabled && turbObservedLayer) turbObservedLayer.addTo(map);
      } else {
        turbPotentialLayer.clearLayers();
        if (turbulenceLayer && map.hasLayer(turbulenceLayer)) map.removeLayer(turbulenceLayer);
        if (turbObservedLayer && map.hasLayer(turbObservedLayer)) map.removeLayer(turbObservedLayer);
      }
    }
  };
  actions[name]?.();
}

const toggles = {
  toggleAircraft: 'aircraft', toggleRadar: 'radar', toggleWind: 'wind', toggleCloud: 'cloud', toggleTurb: 'turbulence', toggleAirports: 'airports'
};
Object.entries(toggles).forEach(([id, name]) => document.getElementById(id).addEventListener('change', (e) => setLayer(name, e.target.checked)));

function bindTurbModeButton(id, stateKey) {
  const button = document.getElementById(id);
  button.addEventListener('click', () => {
    state[stateKey] = !state[stateKey];
    button.classList.toggle('active', state[stateKey]);
    if (stateKey === 'turbModelEnabled') {
      drawTurbPotential();
    } else if (stateKey === 'turbObsEnabled') {
      if (state.layers.turbulence && state.turbObsEnabled) turbObservedLayer.addTo(map);
      else if (map.hasLayer(turbObservedLayer)) map.removeLayer(turbObservedLayer);
    } else {
      if (state.layers.turbulence && state.turbAdvEnabled) turbulenceLayer.addTo(map);
      else if (map.hasLayer(turbulenceLayer)) map.removeLayer(turbulenceLayer);
    }
  });
}
bindTurbModeButton('turbModelButton', 'turbModelEnabled');
bindTurbModeButton('turbObsButton', 'turbObsEnabled');
bindTurbModeButton('turbAdvButton', 'turbAdvEnabled');

document.getElementById('trafficRetry').addEventListener('click', () => loadAircraft(true));

document.getElementById('layersButton').addEventListener('click', () => {
  const panel = document.getElementById('panel');
  panel.classList.toggle('hidden');
  document.getElementById('layersButton').classList.toggle('active', !panel.classList.contains('hidden'));
});

function cleanSearch(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function focusAircraft(item) {
  state.selectedAircraftId = item.id;
  state.selectedAircraft = item;
  if (!state.aircraft.some((existing) => existing.id === item.id)) state.aircraft.push(item);
  renderAircraft();
  showAircraftDetails(item);
  map.flyTo([item.lat, item.lon], Math.max(7, map.getZoom()), { duration: 1.0 });
}

async function searchTarget() {
  const q = searchInput.value.trim();
  if (!q) return;
  const cleaned = cleanSearch(q);

  const airport = state.airports.find((item) => item.icao === cleaned || item.iata === cleaned || item.name.toUpperCase().includes(q.toUpperCase()));
  if (airport) {
    hideAircraftDetails();
    map.flyTo([airport.lat, airport.lon], 7, { duration: 1.0 });
    return;
  }

  const loaded = state.aircraft.find((item) => {
    const candidates = [item.callsign, item.displayCallsign, displayFlightNumber(item), item.registration].map(cleanSearch);
    return candidates.includes(cleaned);
  });
  if (loaded) {
    focusAircraft(loaded);
    return;
  }

  searchButton.classList.add('busy');
  searchButton.textContent = '…';
  notice.textContent = `Searching live ADS-B feeds for ${cleaned}…`;
  notice.classList.remove('hidden');
  try {
    let data;
    try { data = await getJSON(`/api/flight-edge?q=${encodeURIComponent(q)}`); }
    catch (edgeError) {
      try { data = await directFlightSearch(q, 'proxy'); }
      catch (proxyError) {
        try { data = await getJSON(`/api/flight?q=${encodeURIComponent(q)}`); }
        catch (serverError) { data = await directFlightSearch(q, 'browser'); }
      }
    }
    const item = data.aircraft?.[0];
    if (!item) throw new Error('No live target matched that flight number.');
    item.displayCallsign = item.displayCallsign || displayFlightNumber(item);
    focusAircraft(item);
    notice.textContent = `${displayFlightNumber(item) || item.callsign} located via ${data.provider}.`;
    notice.classList.remove('hidden');
    setTimeout(() => { if (state.timeOffset === 0) notice.classList.add('hidden'); }, 2600);
  } catch (error) {
    notice.textContent = `${error.message} Try the operational callsign as well, for example QFA922 instead of QF922.`;
    notice.classList.remove('hidden');
  } finally {
    searchButton.classList.remove('busy');
    searchButton.textContent = 'SEARCH';
  }
}

searchButton.addEventListener('click', searchTarget);
searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') searchTarget(); });
document.getElementById('detailClose').addEventListener('click', hideAircraftDetails);
document.getElementById('turbProfileClose').addEventListener('click', () => turbProfileCard.classList.add('hidden'));
map.on('click', (event) => {
  if (!event?.latlng) return;
  loadTurbProfile(event.latlng.lat, event.latlng.lng);
});
document.getElementById('routeButton').addEventListener('click', () => {
  hideAircraftDetails();
  map.fitBounds([[-44.5, 137], [-10, 155.8]], { padding: [26, 26] });
});

let moveTimer = null;
let lastTurbulenceLoadAt = Date.now();
map.on('moveend', () => {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    loadAircraft(); loadWind(); loadTurbPotential();
    if (Date.now() - lastTurbulenceLoadAt > 60_000) {
      lastTurbulenceLoadAt = Date.now();
      loadTurbulence();
    }
  }, 1500);
});
map.on('zoomend', () => {
  drawAirports();
  renderAircraft();
});

updateHeader();
Promise.allSettled([loadMetar(), loadTurbulence(), loadTurbPotential(), loadRadar(), loadAircraft(), loadWind()]);
setInterval(loadAircraft, 120000);
setInterval(loadRadar, 4 * 60 * 1000);
setInterval(loadMetar, 3 * 60 * 1000);
setInterval(loadTurbulence, 6 * 60 * 1000);
setInterval(loadTurbPotential, 10 * 60 * 1000);
