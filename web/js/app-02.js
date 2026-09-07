function directRowsFrom(data) {
  if (Array.isArray(data?.ac)) return data.ac;
  if (Array.isArray(data?.aircraft)) return data.aircraft;
  if (Array.isArray(data?.data?.ac)) return data.data.ac;
  return [];
}

function normaliseBrowserAircraft(raw, source) {
  const lat = Number(raw?.lat ?? raw?.latitude ?? raw?.lastPosition?.lat);
  const lon = Number(raw?.lon ?? raw?.lng ?? raw?.longitude ?? raw?.lastPosition?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const rawAlt = raw.alt_baro ?? raw.alt_geom ?? raw.altitude ?? raw.alt;
  const callsign = String(raw.flight ?? raw.callsign ?? '').trim().toUpperCase() || null;
  const seen = raw.seen_pos ?? raw.lastPosition?.seen_pos ?? raw.seen;
  return {
    id: String(raw.hex ?? raw.icao ?? raw.icao24 ?? `${lat}-${lon}`).toLowerCase(),
    callsign,
    displayCallsign: null,
    registration: raw.r ?? raw.reg ?? raw.registration ?? null,
    type: raw.t ?? raw.type ?? raw.type_code ?? null,
    description: raw.desc ?? raw.description ?? null,
    lat, lon,
    altitudeFt: rawAlt === 'ground' ? 0 : Number.isFinite(Number(rawAlt)) ? Number(rawAlt) : null,
    groundSpeedKt: Number.isFinite(Number(raw.gs ?? raw.ground_speed ?? raw.speed)) ? Number(raw.gs ?? raw.ground_speed ?? raw.speed) : null,
    trackDeg: Number.isFinite(Number(raw.track ?? raw.true_track ?? raw.heading)) ? Number(raw.track ?? raw.true_track ?? raw.heading) : null,
    verticalRateFpm: Number.isFinite(Number(raw.baro_rate ?? raw.geom_rate ?? raw.vert_rate)) ? Number(raw.baro_rate ?? raw.geom_rate ?? raw.vert_rate) : null,
    squawk: raw.squawk ? String(raw.squawk) : null,
    emergency: raw.emergency && raw.emergency !== 'none' ? String(raw.emergency) : null,
    onGround: rawAlt === 'ground' || raw.on_ground === true,
    seenSeconds: Number.isFinite(Number(seen)) ? Number(seen) : null,
    source,
    sources: [source]
  };
}

async function externalJSON(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return body;
  } finally { clearTimeout(timer); }
}

function directSectorPlan() {
  const b = map.getBounds();
  const centre = map.getCenter();
  const radiusNm = map.distance(centre, b.getNorthEast()) / 1852;
  if (radiusNm <= 245) return [{ lat: centre.lat, lon: centre.lng, radius: Math.max(25, Math.min(245, Math.ceil(radiusNm + 10))) }];
  const count = map.getZoom() >= 6.5 ? 2 : map.getZoom() >= 5.2 ? 3 : 5;
  const vertical = Math.abs(b.getNorth() - b.getSouth()) >= Math.abs(b.getEast() - b.getWest()) * .72;
  return Array.from({ length: count }, (_, i) => {
    const f = (i + .5) / count;
    return {
      lat: vertical ? b.getSouth() + (b.getNorth() - b.getSouth()) * f : centre.lat,
      lon: vertical ? centre.lng : b.getWest() + (b.getEast() - b.getWest()) * f,
      radius: 245
    };
  });
}

async function directBrowserTraffic(mode = 'browser') {
  const b = map.getBounds();
  const inside = (item) => b.contains([item.lat, item.lon]);
  const points = directSectorPlan();
  const all = [];
  const attempts = [];
  for (let i = 0; i < points.length; i += 1) {
    if (i) await new Promise((resolve) => setTimeout(resolve, 1050));
    const point = points[i];
    const proxied = mode === 'proxy';
    const providers = [
      [proxied ? 'adsb.fi CDN proxy' : 'adsb.fi browser', proxied
        ? `/proxy/adsbfi/api/v3/lat/${point.lat.toFixed(4)}/lon/${point.lon.toFixed(4)}/dist/${point.radius}`
        : `https://opendata.adsb.fi/api/v3/lat/${point.lat.toFixed(4)}/lon/${point.lon.toFixed(4)}/dist/${point.radius}`],
      [proxied ? 'Airplanes.live CDN proxy' : 'Airplanes.live browser', proxied
        ? `/proxy/airplanes/v2/point/${point.lat.toFixed(4)}/${point.lon.toFixed(4)}/${point.radius}`
        : `https://api.airplanes.live/v2/point/${point.lat.toFixed(4)}/${point.lon.toFixed(4)}/${point.radius}`]
    ];
    const results = await Promise.allSettled(providers.map(([, url]) => externalJSON(url)));
    results.forEach((result, index) => {
      const provider = providers[index][0];
      if (result.status === 'rejected') { attempts.push({ provider, raw: 0, accepted: 0, error: result.reason?.message || String(result.reason) }); return; }
      const rows = directRowsFrom(result.value);
      const accepted = rows.map((row) => normaliseBrowserAircraft(row, provider)).filter(Boolean).filter(inside).filter((item) => item.seenSeconds == null || item.seenSeconds <= 240);
      all.push(...accepted);
      attempts.push({ provider, raw: rows.length, accepted: accepted.length });
    });
  }
  return { provider: mode === 'proxy' ? 'Netlify CDN ADS-B proxy' : 'Browser-direct ADS-B', aircraft: mergeTrafficLists(all), attempts, timestamp: new Date().toISOString(), partial: attempts.some((a) => a.error) };
}

async function directFlightSearch(q, mode = 'browser') {
  const cleaned = cleanSearch(q);
  const iata = cleaned.match(/^([A-Z0-9]{2})([0-9].*)$/);
  const mapIata = { QF:'QFA', VA:'VOZ', JQ:'JST', ZL:'RXA', NZ:'ANZ', SQ:'SIA', EK:'UAE', CX:'CPA', QR:'QTR', FJ:'FJI' };
  const variants = [];
  if (iata && mapIata[iata[1]]) { variants.push(`${mapIata[iata[1]]}${iata[2]}`); if (iata[1] === 'QF') variants.push(`QLK${iata[2]}`); }
  variants.push(cleaned);
  for (const callsign of [...new Set(variants)]) {
    const proxied = mode === 'proxy';
    const providers = [
      [proxied ? 'adsb.fi CDN proxy' : 'adsb.fi browser', proxied
        ? `/proxy/adsbfi/api/v2/callsign/${encodeURIComponent(callsign)}`
        : `https://opendata.adsb.fi/api/v2/callsign/${encodeURIComponent(callsign)}`],
      [proxied ? 'Airplanes.live CDN proxy' : 'Airplanes.live browser', proxied
        ? `/proxy/airplanes/v2/callsign/${encodeURIComponent(callsign)}`
        : `https://api.airplanes.live/v2/callsign/${encodeURIComponent(callsign)}`]
    ];
    const results = await Promise.allSettled(providers.map(([, url]) => externalJSON(url)));
    for (let i = 0; i < results.length; i += 1) {
      if (results[i].status !== 'fulfilled') continue;
      const rows = directRowsFrom(results[i].value);
      const aircraft = rows.map((row) => normaliseBrowserAircraft(row, providers[i][0])).filter(Boolean).filter((item) => item.seenSeconds == null || item.seenSeconds <= 300);
      if (aircraft.length) return { provider: providers[i][0], aircraft, matchedCallsign: callsign };
    }
  }
  throw new Error('No live target matched that flight number.');
}

function boundsQuery() {
  const b = map.getBounds();
  return new URLSearchParams({
    west: b.getWest().toFixed(4), south: b.getSouth().toFixed(4),
    east: b.getEast().toFixed(4), north: b.getNorth().toFixed(4),
    zoom: map.getZoom().toFixed(1)
  });
}

function formatTime(iso) {
  if (!iso) return 'unknown time';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatOffset(hours) {
  if (hours === 0) return 'NOW';
  return `${hours > 0 ? '+' : '−'}${Math.abs(hours)}H`;
}

function updateHeader() {
  timestamp.textContent = `${state.levelLabel} · ${formatOffset(state.timeOffset)}`;
  timeLabel.textContent = formatOffset(state.timeOffset);
  if (state.timeOffset !== 0) {
    notice.textContent = 'Weather is shown at a different time from the live aircraft layer. Traffic is faded to make that mismatch clear.';
    notice.classList.remove('hidden');
  } else {
    notice.classList.add('hidden');
  }
  aircraftLayer.eachLayer((layer) => layer.setOpacity && layer.setOpacity(state.timeOffset === 0 ? 1 : 0.42));
}

const ICAO_TO_IATA = {
  QFA: 'QF', QLK: 'QF', VOZ: 'VA', JST: 'JQ', RXA: 'ZL', ANZ: 'NZ', SIA: 'SQ', UAE: 'EK',
  UAL: 'UA', AAL: 'AA', DAL: 'DL', ACA: 'AC', BAW: 'BA', CPA: 'CX', QTR: 'QR', ETD: 'EY',
  FJI: 'FJ', PAL: 'PR', MAS: 'MH', THA: 'TG', HVN: 'VN', JAL: 'JL', ANA: 'NH', AAR: 'OZ'
};

function displayFlightNumber(item) {
  if (item?.displayCallsign) return item.displayCallsign;
  const callsign = String(item?.callsign || '').trim().toUpperCase();
  const match = callsign.match(/^([A-Z]{3})([0-9].*)$/);
  return match && ICAO_TO_IATA[match[1]] ? `${ICAO_TO_IATA[match[1]]}${match[2]}` : callsign;
}

function aircraftIcon(item, selected = false) {
  const showLabel = map.getZoom() >= 4.4 || selected;
  const heading = Number.isFinite(item.trackDeg) ? item.trackDeg : 0;
  const callsign = displayFlightNumber(item);
  const html = `<div class="plane-wrap${selected ? ' selected' : ''}">
    <div class="plane" style="transform:rotate(${heading}deg)">
      <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M15.25 1.4h1.5l1.15 10.25 10.25 5.15v2.05l-10.05-2.35-.72 8.55 4.2 3.05v1.65L16 28.55l-5.58 1.2V28.1l4.2-3.05-.72-8.55-10.05 2.35V16.8l10.25-5.15L15.25 1.4Z" fill="currentColor"/></svg>
    </div>${showLabel && callsign ? `<div class="plane-label">${escapeHTML(callsign)}</div>` : ''}</div>`;
  return L.divIcon({ className: 'aircraft-icon', html, iconSize: [86, 18], iconAnchor: [8, 9] });
}

function metric(label, value) {
  return `<div class="detail-metric"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value ?? '—')}</strong></div>`;
}

function routePotentialColour(category) {
  return ({ minimal: '#58757a', low: '#788977', elevated: '#a77c4d', high: '#9d5853' })[category] || '#73868a';
}

function greatCirclePoint(a, b, t) {
  const toRad = (v) => v * Math.PI / 180;
  const toDeg = (v) => v * 180 / Math.PI;
  const phi1 = toRad(a.lat), lambda1 = toRad(a.lon);
  const phi2 = toRad(b.lat), lambda2 = toRad(b.lon);
  const dot = Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  const delta = Math.acos(Math.max(-1, Math.min(1, dot)));
  if (!Number.isFinite(delta) || delta < 1e-8) return { lat: a.lat, lon: a.lon };
  const sinDelta = Math.sin(delta);
  const A = Math.sin((1 - t) * delta) / sinDelta;
  const B = Math.sin(t * delta) / sinDelta;
  const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
  const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
  const z = A * Math.sin(phi1) + B * Math.sin(phi2);
  return { lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon: toDeg(Math.atan2(y, x)) };
}
