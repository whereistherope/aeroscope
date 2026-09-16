const AWC_BASE = 'https://aviationweather.gov/api/data';
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const USER_AGENT = 'AeroScope/1.0 preview (aviation situational-awareness prototype)';

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, Number(v) || 0));

const PRESSURE = {
  1000: { altFt: 364, label: '1000 hPa' },
  925: { altFt: 2500, label: '925 hPa' },
  850: { altFt: 4780, label: '850 hPa' },
  700: { altFt: 9880, label: '700 hPa' },
  600: { altFt: 13800, label: '600 hPa' },
  500: { altFt: 18290, label: '500 hPa' },
  400: { altFt: 23620, label: '400 hPa' },
  300: { altFt: 30070, label: '300 hPa' },
  250: { altFt: 33980, label: '250 hPa' },
  200: { altFt: 38660, label: '200 hPa' },
  150: { altFt: 44650, label: '150 hPa' }
};

const MODEL_LEVELS = {
  surface: { label: 'SFC', centreFt: 2500, p1: 925, p2: 850 },
  '5000': { label: '5K', centreFt: 5000, p1: 925, p2: 850 },
  '10000': { label: 'FL100', centreFt: 10000, p1: 850, p2: 700 },
  '18000': { label: 'FL180', centreFt: 18000, p1: 600, p2: 500 },
  '24000': { label: 'FL240', centreFt: 24000, p1: 500, p2: 400 },
  '30000': { label: 'FL300', centreFt: 30000, p1: 400, p2: 300 },
  '34000': { label: 'FL340', centreFt: 34000, p1: 300, p2: 250 },
  '39000': { label: 'FL390', centreFt: 39000, p1: 250, p2: 200 }
};

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(JSON.stringify(data));
}

async function fetchJson(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': USER_AGENT,
        ...(options.headers || {})
      }
    });
    if (response.status === 204) return null;
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}${text ? ` · ${text.slice(0, 180)}` : ''}`);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

function bboxFrom(url) {
  const west = Number(url.searchParams.get('west'));
  const south = Number(url.searchParams.get('south'));
  const east = Number(url.searchParams.get('east'));
  const north = Number(url.searchParams.get('north'));
  if (![west, south, east, north].every(Number.isFinite)) return { west: 110, south: -45, east: 155, north: -10 };
  return { west, south, east, north };
}

function gridPoints(bbox, zoom = 4.7) {
  const cols = zoom >= 7 ? 7 : zoom >= 5.5 ? 7 : 6;
  const rows = zoom >= 7 ? 6 : zoom >= 5.5 ? 5 : 5;
  const points = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      points.push({
        lat: bbox.south + ((y + 0.5) / rows) * (bbox.north - bbox.south),
        lon: bbox.west + ((x + 0.5) / cols) * (bbox.east - bbox.west)
      });
    }
  }
  return points;
}

function nearestTimeIndex(times, targetSeconds) {
  let best = 0;
  let delta = Infinity;
  (times || []).forEach((time, index) => {
    const d = Math.abs(Number(time) - targetSeconds);
    if (d < delta) { delta = d; best = index; }
  });
  return best;
}

function windVector(speedKt, fromDeg) {
  const speed = Number(speedKt) * 0.514444;
  const angle = Number(fromDeg) * Math.PI / 180;
  return { u: -speed * Math.sin(angle), v: -speed * Math.cos(angle) };
}

function modelCategory(score) {
  if (score >= 0.72) return 'high';
  if (score >= 0.48) return 'elevated';
  if (score >= 0.24) return 'low';
  return 'minimal';
}

function diagnosePair({ speed1, dir1, temp1, speed2, dir2, temp2, p1, p2 }) {
  const z1Ft = PRESSURE[p1]?.altFt;
  const z2Ft = PRESSURE[p2]?.altFt;
  if (![speed1, dir1, temp1, speed2, dir2, temp2, z1Ft, z2Ft].every((v) => Number.isFinite(Number(v)))) return null;

  const a = windVector(speed1, dir1);
  const b = windVector(speed2, dir2);
  const deltaMps = Math.hypot(b.u - a.u, b.v - a.v);
  const deltaFt = Math.max(800, Math.abs(z2Ft - z1Ft));
  const deltaM = deltaFt * 0.3048;
  const shearKtPer1000ft = (deltaMps / 0.514444) / (deltaFt / 1000);

  const kappa = 0.286;
  const theta1 = (Number(temp1) + 273.15) * Math.pow(1000 / p1, kappa);
  const theta2 = (Number(temp2) + 273.15) * Math.pow(1000 / p2, kappa);
  const thetaMean = Math.max(180, (theta1 + theta2) / 2);
  const dThetaDz = (theta2 - theta1) / deltaM;
  const dVdz = deltaMps / deltaM;
  const ri = (9.80665 / thetaMean) * dThetaDz / Math.max(1e-8, dVdz * dVdz);

  const shearRisk = clamp((shearKtPer1000ft - 1.0) / 7.5);
  const stabilityRisk = ri <= 0 ? 1 : ri < 0.25 ? 0.9 : ri < 1 ? (1 - ri) * 0.75 / 0.75 : 0;
  const score = clamp((shearRisk * 0.72) + (stabilityRisk * 0.28));

  return {
    score,
    category: modelCategory(score),
    shearKtPer1000ft,
    ri,
    wind1Kt: Number(speed1),
    wind2Kt: Number(speed2),
    temperature1C: Number(temp1),
    temperature2C: Number(temp2)
  };
}

function variablesForPair(level) {
  const { p1, p2 } = level;
  return [
    `wind_speed_${p1}hPa`, `wind_direction_${p1}hPa`, `temperature_${p1}hPa`,
    `wind_speed_${p2}hPa`, `wind_direction_${p2}hPa`, `temperature_${p2}hPa`
  ];
}

async function openMeteoForPoints(points, variables, offsetHours = 0) {
  if (!points.length) return { results: [], target: Math.floor(Date.now() / 1000) };
  const api = new URL(OPEN_METEO);
  api.searchParams.set('latitude', points.map((p) => Number(p.lat).toFixed(4)).join(','));
  api.searchParams.set('longitude', points.map((p) => Number(p.lon).toFixed(4)).join(','));
  api.searchParams.set('hourly', [...new Set(variables)].join(','));
  api.searchParams.set('wind_speed_unit', 'kn');
  api.searchParams.set('timeformat', 'unixtime');
  api.searchParams.set('timezone', 'UTC');
  api.searchParams.set('forecast_days', '2');
  api.searchParams.set('past_days', '1');
  const raw = await fetchJson(api.toString(), {}, 28000);
  const results = Array.isArray(raw) ? raw : [raw];
  return { results, target: Math.floor((Date.now() + Number(offsetHours || 0) * 3600000) / 1000) };
}

async function modelAtPoints(points, levelKey = '30000', offsetHours = 0) {
  const level = MODEL_LEVELS[levelKey] || MODEL_LEVELS['30000'];
  const variables = variablesForPair(level);
  const { results, target } = await openMeteoForPoints(points, variables, offsetHours);
  const output = [];

  results.forEach((row, index) => {
    const point = points[index];
    const times = row?.hourly?.time || [];
    if (!point || !times.length) return;
    const i = nearestTimeIndex(times, target);
    const { p1, p2 } = level;
    const diagnostic = diagnosePair({
      p1, p2,
      speed1: Number(row.hourly?.[`wind_speed_${p1}hPa`]?.[i]),
      dir1: Number(row.hourly?.[`wind_direction_${p1}hPa`]?.[i]),
      temp1: Number(row.hourly?.[`temperature_${p1}hPa`]?.[i]),
      speed2: Number(row.hourly?.[`wind_speed_${p2}hPa`]?.[i]),
      dir2: Number(row.hourly?.[`wind_direction_${p2}hPa`]?.[i]),
      temp2: Number(row.hourly?.[`temperature_${p2}hPa`]?.[i])
    });
    if (!diagnostic) return;
    output.push({
      ...point,
      ...diagnostic,
      level: levelKey,
      levelLabel: level.label,
      validTime: new Date(Number(times[i]) * 1000).toISOString(),
      source: 'Open-Meteo pressure-level diagnostic'
    });
  });

  return output;
}

function countCategories(points) {
  const counts = { minimal: 0, low: 0, elevated: 0, high: 0 };
  for (const point of points) if (counts[point.category] !== undefined) counts[point.category] += 1;
  return counts;
}

export async function handleTurbulencePotential(url, res) {
  try {
    const bbox = bboxFrom(url);
    const zoom = Number(url.searchParams.get('zoom') || 4.7);
    const level = url.searchParams.get('level') || '30000';
    const offset = Number(url.searchParams.get('offset') || 0);
    const points = await modelAtPoints(gridPoints(bbox, zoom), level, offset);
    sendJson(res, {
      source: 'AeroScope shear/stability diagnostic via Open-Meteo',
      model: 'experimental-not-edr',
      level,
      offsetHours: offset,
      timestamp: new Date().toISOString(),
      counts: countCategories(points),
      points,
      caveat: 'Experimental turbulence-potential diagnostic derived from pressure-level wind shear and stability. Not EDR.'
    });
  } catch (error) {
    sendJson(res, { error: 'Turbulence model unavailable', detail: String(error), points: [], counts: {} }, 502);
  }
}

export async function handleRouteWeather(url, res) {
  try {
    const level = url.searchParams.get('level') || '30000';
    const offset = Number(url.searchParams.get('offset') || 0);
    const raw = String(url.searchParams.get('points') || '');
    const points = raw.split(';').slice(0, 24).map((pair) => {
      const [lat, lon] = pair.split(',').map(Number);
      return { lat, lon };
    }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (points.length < 2) return sendJson(res, { error: 'At least two route points are required.' }, 400);
    const output = await modelAtPoints(points, level, offset);
    sendJson(res, {
      source: 'AeroScope route turbulence diagnostic',
      model: 'experimental-not-edr',
      level,
      offsetHours: offset,
      counts: countCategories(output),
      points: output,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    sendJson(res, { error: 'Route weather unavailable', detail: String(error), points: [], counts: null }, 502);
  }
}

const PROFILE_LEVELS = ['5000', '10000', '18000', '24000', '30000', '34000', '39000'];

export async function handleTurbulenceProfile(url, res) {
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  const offset = Number(url.searchParams.get('offset') || 0);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return sendJson(res, { error: 'Valid lat/lon are required.' }, 400);

  try {
    const pressureLevels = [...new Set(PROFILE_LEVELS.flatMap((key) => {
      const level = MODEL_LEVELS[key];
      return [level.p1, level.p2];
    }))];
    const variables = pressureLevels.flatMap((p) => [`wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `temperature_${p}hPa`]);
    const { results, target } = await openMeteoForPoints([{ lat, lon }], variables, offset);
    const row = results[0];
    const times = row?.hourly?.time || [];
    if (!times.length) throw new Error('No model times returned');
    const i = nearestTimeIndex(times, target);
    const levels = [];

    for (const key of PROFILE_LEVELS) {
      const level = MODEL_LEVELS[key];
      const { p1, p2 } = level;
      const diagnostic = diagnosePair({
        p1, p2,
        speed1: Number(row.hourly?.[`wind_speed_${p1}hPa`]?.[i]),
        dir1: Number(row.hourly?.[`wind_direction_${p1}hPa`]?.[i]),
        temp1: Number(row.hourly?.[`temperature_${p1}hPa`]?.[i]),
        speed2: Number(row.hourly?.[`wind_speed_${p2}hPa`]?.[i]),
        dir2: Number(row.hourly?.[`wind_direction_${p2}hPa`]?.[i]),
        temp2: Number(row.hourly?.[`temperature_${p2}hPa`]?.[i])
      });
      if (diagnostic) levels.push({ label: level.label, altitudeFt: level.centreFt, ...diagnostic });
    }

    sendJson(res, {
      source: 'AeroScope shear/stability diagnostic via Open-Meteo',
      model: 'experimental-not-edr',
      lat, lon,
      validTime: new Date(Number(times[i]) * 1000).toISOString(),
      offsetHours: offset,
      levels,
      caveat: 'Vertical model diagnostic only. Not EDR and not operational flight-planning guidance.'
    });
  } catch (error) {
    sendJson(res, { error: 'Turbulence profile unavailable', detail: String(error), levels: [] }, 502);
  }
}

function severityFromText(value) {
  const text = String(value || '').toUpperCase();
  if (/SEV|SEVERE|EXTREME/.test(text)) return 'severe';
  if (/MOD|MODERATE/.test(text)) return 'moderate';
  if (/LGT|LIGHT/.test(text)) return 'light';
  if (/NEG|NIL|NONE|SMOOTH/.test(text)) return 'none';
  return 'unspecified';
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pirepFeature(row) {
  const lat = numberOrNull(row?.lat ?? row?.latitude);
  const lon = numberOrNull(row?.lon ?? row?.longitude);
  if (lat == null || lon == null) return null;
  const raw = row?.rawOb ?? row?.raw_text ?? row?.rawPirep ?? '';
  const turbText = row?.turbInten ?? row?.turbulenceIntensity ?? row?.turbulence ?? row?.turbulence_intensity ?? raw.match(/\/TB\s+([^/]+)/i)?.[1] ?? '';
  if (!turbText && !/\/TB\b/i.test(raw)) return null;
  const severity = severityFromText(turbText || raw);
  let altitudeFt = numberOrNull(row?.fltlvl ?? row?.flightLevel ?? row?.altitude);
  if (altitudeFt != null && altitudeFt < 1000) altitudeFt *= 100;
  const reportTime = row?.reportTime ?? row?.obsTime ?? row?.observationTime ?? row?.receiptTime ?? row?.time ?? null;
  const timeMs = reportTime ? new Date(reportTime).getTime() : NaN;
  const ageMinutes = Number.isFinite(timeMs) ? Math.max(0, (Date.now() - timeMs) / 60000) : null;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      featureType: 'observation',
      severity,
      altitudeFt,
      lowerFt: altitudeFt,
      upperFt: altitudeFt,
      verticalBand: altitudeFt != null ? `FL${String(Math.round(altitudeFt / 100)).padStart(3, '0')}` : null,
      ageMinutes,
      sourceType: 'PIREP/AIREP · AWC',
      label: raw || `Turbulence report · ${severity}`
    }
  };
}

function geometryTouchesBbox(geometry, bbox) {
  if (!geometry) return false;
  const test = ([lon, lat]) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && Number(lat) >= bbox.south && Number(lat) <= bbox.north && Number(lon) >= bbox.west && Number(lon) <= bbox.east;
  const walk = (coords) => Array.isArray(coords?.[0]) ? coords.some(walk) : test(coords || []);
  return walk(geometry.coordinates);
}

function advisoryFeature(feature, sourceType) {
  const props = feature?.properties || {};
  const joined = Object.values(props).filter((v) => typeof v === 'string' || typeof v === 'number').join(' ');
  if (!/(TURB|MTW|MOUNTAIN WAVE|LLWS)/i.test(joined)) return null;
  const severity = severityFromText(joined);
  const lower = numberOrNull(props.base ?? props.bottom ?? props.lower ?? props.minFt ?? props.min_ft ?? props.altitudeLow);
  const upper = numberOrNull(props.top ?? props.upper ?? props.maxFt ?? props.max_ft ?? props.altitudeHigh);
  const scale = (n) => n != null && n < 1000 ? n * 100 : n;
  const lowerFt = scale(lower);
  const upperFt = scale(upper);
  const label = (props.rawAirSigmet ?? props.rawSigmet ?? props.rawText ?? props.rawOb ?? props.name ?? props.hazard ?? joined.slice(0, 220)) || 'Turbulence advisory';
  return {
    type: 'Feature',
    geometry: feature.geometry,
    properties: {
      ...props,
      featureType: 'advisory',
      severity,
      lowerFt,
      upperFt,
      verticalBand: lowerFt != null || upperFt != null ? `${lowerFt != null ? `FL${Math.round(lowerFt / 100)}` : 'SFC'}–${upperFt != null ? `FL${Math.round(upperFt / 100)}` : 'TOP'}` : null,
      sourceType,
      label
    }
  };
}

async function awcPireps(bbox) {
  const api = new URL(`${AWC_BASE}/pirep`);
  api.searchParams.set('bbox', `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`);
  api.searchParams.set('format', 'json');
  const raw = await fetchJson(api.toString(), {}, 16000);
  return (Array.isArray(raw) ? raw : []).map(pirepFeature).filter(Boolean);
}

async function awcAdvisories(bbox) {
  const endpoints = [
    ['International SIGMET · AWC', `${AWC_BASE}/isigmet?format=geojson`],
    ['Domestic SIGMET · AWC', `${AWC_BASE}/airsigmet?hazard=turb&format=geojson`]
  ];
  const output = [];
  const attempts = [];
  for (const [source, endpoint] of endpoints) {
    try {
      const raw = await fetchJson(endpoint, {}, 18000);
      const features = Array.isArray(raw?.features) ? raw.features : [];
      const accepted = features.filter((f) => geometryTouchesBbox(f.geometry, bbox)).map((f) => advisoryFeature(f, source)).filter(Boolean);
      output.push(...accepted);
      attempts.push({ source, raw: features.length, accepted: accepted.length });
    } catch (error) {
      attempts.push({ source, raw: 0, accepted: 0, error: String(error) });
    }
  }
  return { features: output, attempts };
}

export async function handleTurbulence(url, res) {
  const bbox = bboxFrom(url);
  const [pirepResult, advisoryResult] = await Promise.allSettled([awcPireps(bbox), awcAdvisories(bbox)]);
  const observations = pirepResult.status === 'fulfilled' ? pirepResult.value : [];
  const advisories = advisoryResult.status === 'fulfilled' ? advisoryResult.value.features : [];
  const features = [...advisories, ...observations];
  const counts = { severe: 0, moderate: 0, light: 0, none: 0, unspecified: 0 };
  features.forEach((feature) => {
    const severity = feature?.properties?.severity || 'unspecified';
    counts[severity] = (counts[severity] || 0) + 1;
  });
  sendJson(res, {
    type: 'FeatureCollection',
    source: 'AWC PIREP/AIREP + international/domestic SIGMET',
    timestamp: new Date().toISOString(),
    counts,
    features,
    diagnostics: {
      pirep: pirepResult.status === 'rejected' ? String(pirepResult.reason) : `ok · ${observations.length}`,
      advisory: advisoryResult.status === 'rejected' ? String(advisoryResult.reason) : advisoryResult.value.attempts
    },
    caveat: 'Observed reports and advisories are separate from AeroScope MODEL potential. No report/advisory does not imply smooth air.'
  });
}
