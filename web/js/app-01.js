'use strict';

document.querySelectorAll('.mode-button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.mode-button').forEach((item) => item.classList.toggle('active', item === button));
    const mode = button.dataset.mode;
    const panel = document.getElementById('panel');
    if (panel) panel.classList.remove('hidden');
    if (mode === 'route') {
      setTimeout(() => { if (state?.selectedRoute) fitSelectedRoute(); else showNotice('Select a live aircraft to open Route mode.'); }, 0);
    }
    if (mode === 'turbulence') {
      const toggle = document.getElementById('toggleTurb');
      if (toggle && !toggle.checked) toggle.click();
      showNotice('Turbulence mode: MODEL, OBSERVED and ADVISORY remain independently selectable in Layers.');
    }
    if (mode === 'airport') {
      const toggle = document.getElementById('toggleAirports');
      if (toggle && !toggle.checked) toggle.click();
      showNotice('Airport Ops mode currently foregrounds airport weather. Runway-wind tools are planned for the next build.');
    }
  });
});

const state = {
  level: '30000',
  levelLabel: 'FL300',
  timeOffset: 0,
  airports: [],
  aircraft: [],
  selectedAircraftId: null,
  selectedAircraft: null,
  selectedRoute: null,
  routeWeather: null,
  routeLoading: false,
  routeWeatherLoading: false,
  windPoints: [],
  turbModelPoints: [],
  turbFeatures: [],
  turbModelEnabled: true,
  turbObsEnabled: true,
  turbAdvEnabled: true,
  layers: { aircraft: true, radar: true, wind: true, cloud: false, turbulence: true, airports: true }
};

const statusEls = {
  aircraft: document.getElementById('statusAircraft'),
  wind: document.getElementById('statusWind'),
  radar: document.getElementById('statusRadar'),
  metar: document.getElementById('statusMetar'),
  turb: document.getElementById('statusTurb'),
  turbModel: document.getElementById('statusTurbModel'),
  turbObs: document.getElementById('statusTurbObs')
};
const timestamp = document.getElementById('timestamp');
const notice = document.getElementById('notice');
const timeLabel = document.getElementById('timeLabel');
const detailCard = document.getElementById('detailCard');
const detailTitle = document.getElementById('detailTitle');
const detailSub = document.getElementById('detailSub');
const detailGrid = document.getElementById('detailGrid');
const routeInfo = document.getElementById('routeInfo');
const searchInput = document.getElementById('search');
const routeCache = new Map();
const searchButton = document.getElementById('searchButton');
const turbProfileCard = document.getElementById('turbProfileCard');
const turbProfileTitle = document.getElementById('turbProfileTitle');
const turbProfileSub = document.getElementById('turbProfileSub');
const turbProfileRows = document.getElementById('turbProfileRows');
const turbProfileMeta = document.getElementById('turbProfileMeta');

if (!window.L) {
  document.body.innerHTML = '<div style="padding:24px;color:white">The map library did not load. Check the browser connection and reload.</div>';
  throw new Error('Leaflet failed to load');
}

const map = L.map('map', {
  center: [-27.6, 147.4],
  zoom: 4.7,
  minZoom: 3,
  maxZoom: 12,
  zoomControl: false,
  preferCanvas: true
});
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 18,
  attribution: 'Tiles &copy; Esri'
}).addTo(map);

map.createPane('cloudPane'); map.getPane('cloudPane').style.zIndex = 340;
map.createPane('radarPane'); map.getPane('radarPane').style.zIndex = 350;
map.createPane('turbPotentialPane'); map.getPane('turbPotentialPane').style.zIndex = 358;
map.createPane('turbPane'); map.getPane('turbPane').style.zIndex = 365;
map.createPane('turbObservedPane'); map.getPane('turbObservedPane').style.zIndex = 390;
map.createPane('windPane'); map.getPane('windPane').style.zIndex = 410;
map.createPane('airportPane'); map.getPane('airportPane').style.zIndex = 450;
map.createPane('routeWeatherPane'); map.getPane('routeWeatherPane').style.zIndex = 492;
map.createPane('routePane'); map.getPane('routePane').style.zIndex = 500;
map.createPane('aircraftPane'); map.getPane('aircraftPane').style.zIndex = 520;

const aircraftLayer = L.layerGroup().addTo(map);
const selectedRouteLayer = L.layerGroup().addTo(map);
const routeWeatherLayer = L.layerGroup().addTo(map);
const windLayer = L.layerGroup().addTo(map);
const cloudLayer = L.layerGroup();
const airportLayer = L.layerGroup().addTo(map);
let radarLayer = null;
const TurbulenceHeatLayer = L.Layer.extend({
  options: { pane: 'turbPotentialPane' },
  initialize(options = {}) {
    L.setOptions(this, options);
    this._points = [];
    this._dimFactor = 1;
  },
  onAdd(mapRef) {
    this._map = mapRef;
    this._canvas = L.DomUtil.create('canvas', 'turb-heat-canvas');
    this._canvas.setAttribute('aria-hidden', 'true');
    this._ctx = this._canvas.getContext('2d');
    mapRef.getPane(this.options.pane).appendChild(this._canvas);
    mapRef.on('move zoom resize', this._reset, this);
    this._reset();
  },
  onRemove(mapRef) {
    mapRef.off('move zoom resize', this._reset, this);
    if (this._canvas?.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    this._canvas = null;
    this._ctx = null;
    this._map = null;
  },
  setData(points, dimFactor = 1) {
    this._points = Array.isArray(points) ? points : [];
    this._dimFactor = Math.max(0, Math.min(1, Number(dimFactor) || 0));
    this._reset();
    return this;
  },
  clearLayers() {
    this._points = [];
    if (this._ctx && this._canvas) this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    return this;
  },
  _reset() {
    if (!this._map || !this._canvas || !this._ctx) return;
    const size = this._map.getSize();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this._canvas.width = Math.max(1, Math.round(size.x * dpr));
    this._canvas.height = Math.max(1, Math.round(size.y * dpr));
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._ctx.clearRect(0, 0, size.x, size.y);
    this._draw(size);
  },
  _draw(size) {
    if (!this._points.length || !this._ctx || !this._map) return;
    const hexRgb = (hex) => {
      const clean = String(hex || '').replace('#', '');
      if (clean.length !== 6) return [126, 150, 155];
      return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
    };
    const ranked = [...this._points].sort((a, b) => Number(a.score || 0) - Number(b.score || 0));
    const zoom = this._map.getZoom();
    const radius = Math.max(42, Math.min(150, 74 * Math.pow(1.12, zoom - 5)));
    for (const point of ranked) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
      const cp = this._map.latLngToContainerPoint([point.lat, point.lon]);
      if (cp.x < -radius || cp.y < -radius || cp.x > size.x + radius || cp.y > size.y + radius) continue;
      const category = String(point.category || 'minimal');
      const baseAlpha = ({ minimal: 0.018, low: 0.05, elevated: 0.15, high: 0.235 })[category] ?? 0.03;
      const alpha = baseAlpha * this._dimFactor;
      if (alpha <= 0.003) continue;
      const [r, g, b] = hexRgb(turbulenceColour(category));
      const gradient = this._ctx.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, radius);
      gradient.addColorStop(0, `rgba(${r},${g},${b},${Math.min(.38, alpha * 1.35)})`);
      gradient.addColorStop(.44, `rgba(${r},${g},${b},${alpha})`);
      gradient.addColorStop(.78, `rgba(${r},${g},${b},${alpha * .36})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      this._ctx.fillStyle = gradient;
      this._ctx.beginPath();
      this._ctx.arc(cp.x, cp.y, radius, 0, Math.PI * 2);
      this._ctx.fill();
    }
  }
});
const turbPotentialLayer = new TurbulenceHeatLayer().addTo(map);
let turbulenceLayer = L.geoJSON([], { pane: 'turbPane' }).addTo(map);
let turbObservedLayer = L.geoJSON([], { pane: 'turbObservedPane' }).addTo(map);

function setStatus(key, text, isError = false) {
  const el = statusEls[key];
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? '#ff9b9b' : '';
  el.classList.remove('loading');
}

function setLoading(key) {
  const el = statusEls[key];
  if (el) el.classList.add('loading');
}

function resolveApiUrl(url) {
  const base = String(window.AEROSCOPE_CONFIG?.apiBase || '').replace(/\/$/, '');
  if (!base || !String(url).startsWith('/')) return url;
  if (String(url).startsWith('/api/')) return `${base}${url.slice(4)}`;
  if (String(url).startsWith('/proxy/')) return `${base}${url}`;
  return `${base}${url}`;
}

async function getJSON(url) {
  const response = await fetch(resolveApiUrl(url), { headers: { accept: 'application/json' }, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || body.error || `${response.status} ${response.statusText}`);
  return body;
}

function mergeTrafficLists(...lists) {
  const byId = new Map();
  lists.flat().forEach((item) => {
    if (!item || !item.id) return;
    const prior = byId.get(item.id);
    if (!prior) {
      byId.set(item.id, { ...item, sources: item.sources || [item.source].filter(Boolean) });
      return;
    }
    const itemIsFresher = (item.seenSeconds ?? Infinity) < (prior.seenSeconds ?? Infinity);
    const fresh = itemIsFresher ? item : prior;
    const other = itemIsFresher ? prior : item;
    const prefer = (primary, fallback) => primary !== null && primary !== undefined && primary !== '' ? primary : fallback;
    byId.set(item.id, {
      ...other,
      ...fresh,
      callsign: prefer(fresh.callsign, other.callsign),
      displayCallsign: prefer(fresh.displayCallsign, other.displayCallsign),
      registration: prefer(fresh.registration, other.registration),
      type: prefer(fresh.type, other.type),
      description: prefer(fresh.description, other.description),
      altitudeFt: prefer(fresh.altitudeFt, other.altitudeFt),
      groundSpeedKt: prefer(fresh.groundSpeedKt, other.groundSpeedKt),
      trackDeg: prefer(fresh.trackDeg, other.trackDeg),
      verticalRateFpm: prefer(fresh.verticalRateFpm, other.verticalRateFpm),
      squawk: prefer(fresh.squawk, other.squawk),
      sources: [...new Set([...(prior.sources || [prior.source]), ...(item.sources || [item.source])].filter(Boolean))]
    });
  });
  return [...byId.values()].sort((a, b) => (a.callsign ? 0 : 1) - (b.callsign ? 0 : 1));
}
