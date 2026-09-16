import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(__dirname, 'web');
const PORT = Number(process.env.PORT || 8080);

const AIRPORTS = [
  { icao:'YMML', iata:'MEL', name:'Melbourne', lat:-37.6733, lon:144.8433 },
  { icao:'YSSY', iata:'SYD', name:'Sydney', lat:-33.9461, lon:151.1772 },
  { icao:'YBBN', iata:'BNE', name:'Brisbane', lat:-27.3842, lon:153.1175 },
  { icao:'YBCS', iata:'CNS', name:'Cairns', lat:-16.8858, lon:145.7553 },
  { icao:'YPAD', iata:'ADL', name:'Adelaide', lat:-34.9450, lon:138.5306 },
  { icao:'YPPH', iata:'PER', name:'Perth', lat:-31.9403, lon:115.9669 },
  { icao:'YMHB', iata:'HBA', name:'Hobart', lat:-42.8361, lon:147.5103 },
  { icao:'YSCB', iata:'CBR', name:'Canberra', lat:-35.3069, lon:149.1950 },
  { icao:'YPDN', iata:'DRW', name:'Darwin', lat:-12.4147, lon:130.8767 },
  { icao:'YBTL', iata:'TSV', name:'Townsville', lat:-19.2525, lon:146.7653 },
  { icao:'YBAS', iata:'ASP', name:'Alice Springs', lat:-23.8067, lon:133.9022 },
  { icao:'YBRK', iata:'ROK', name:'Rockhampton', lat:-23.3819, lon:150.4753 },
  { icao:'YBMK', iata:'MKY', name:'Mackay', lat:-21.1717, lon:149.1797 },
  { icao:'YBCG', iata:'OOL', name:'Gold Coast', lat:-28.1644, lon:153.5047 },
  { icao:'YMAV', iata:'AVV', name:'Avalon', lat:-38.0394, lon:144.4694 },
  { icao:'YBNA', iata:'BNK', name:'Ballina', lat:-28.8339, lon:153.5625 },
  { icao:'YMLT', iata:'LST', name:'Launceston', lat:-41.5453, lon:147.2142 }
];

const IATA_TO_ICAO = { QF:'QFA', VA:'VOZ', JQ:'JST', ZL:'RXA', NZ:'ANZ', SQ:'SIA', EK:'UAE', CX:'CPA', QR:'QTR', FJ:'FJI' };
const ICAO_TO_IATA = Object.fromEntries(Object.entries(IATA_TO_ICAO).map(([a,b]) => [b,a]));
ICAO_TO_IATA.QLK = 'QF';

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'access-control-allow-origin':'*'
  });
  res.end(JSON.stringify(data));
}

function cleanCallsign(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12);
}

function publicFlightNumber(value) {
  const c = cleanCallsign(value);
  const m = c.match(/^([A-Z]{3})([0-9].*)$/);
  return m && ICAO_TO_IATA[m[1]] ? `${ICAO_TO_IATA[m[1]]}${m[2]}` : c || null;
}

function rowsFrom(data) {
  if (Array.isArray(data?.ac)) return data.ac;
  if (Array.isArray(data?.aircraft)) return data.aircraft;
  if (Array.isArray(data?.data?.ac)) return data.data.ac;
  if (Array.isArray(data?.data?.aircraft)) return data.data.aircraft;
  return [];
}

function normaliseAircraft(raw, source = 'ADS-B') {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.lat ?? raw.latitude ?? raw.lastPosition?.lat);
  const lon = Number(raw.lon ?? raw.lng ?? raw.longitude ?? raw.lastPosition?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const rawAlt = raw.alt_baro ?? raw.alt_geom ?? raw.altitude ?? raw.alt;
  const callsign = String(raw.flight ?? raw.callsign ?? '').trim().toUpperCase() || null;
  const seen = raw.seen_pos ?? raw.lastPosition?.seen_pos ?? raw.seen;
  return {
    id: String(raw.hex ?? raw.icao ?? raw.icao24 ?? raw.id ?? `${lat}-${lon}`).toLowerCase(),
    callsign,
    displayCallsign: publicFlightNumber(callsign),
    registration: raw.r ?? raw.reg ?? raw.registration ?? null,
    type: raw.t ?? raw.type ?? raw.type_code ?? null,
    description: raw.desc ?? raw.description ?? null,
    lat, lon,
    altitudeFt: rawAlt === 'ground' ? 0 : Number.isFinite(Number(rawAlt)) ? Number(rawAlt) : null,
    groundSpeedKt: Number.isFinite(Number(raw.gs ?? raw.ground_speed ?? raw.speed)) ? Number(raw.gs ?? raw.ground_speed ?? raw.speed) : null,
    trackDeg: Number.isFinite(Number(raw.track ?? raw.true_track ?? raw.heading)) ? Number(raw.track ?? raw.true_track ?? raw.heading) : null,
    verticalRateFpm: Number.isFinite(Number(raw.baro_rate ?? raw.geom_rate ?? raw.vert_rate ?? raw.vertical_rate)) ? Number(raw.baro_rate ?? raw.geom_rate ?? raw.vert_rate ?? raw.vertical_rate) : null,
    squawk: raw.squawk ? String(raw.squawk) : null,
    emergency: raw.emergency && raw.emergency !== 'none' ? String(raw.emergency) : null,
    onGround: rawAlt === 'ground' || raw.on_ground === true,
    seenSeconds: Number.isFinite(Number(seen)) ? Number(seen) : null,
    source,
    sources:[source]
  };
}

function mergeAircraft(list) {
  const byId = new Map();
  for (const item of list) {
    const prior = byId.get(item.id);
    if (!prior || (item.seenSeconds ?? Infinity) < (prior.seenSeconds ?? Infinity)) byId.set(item.id,item);
  }
  return [...byId.values()];
}

async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal:controller.signal, headers:{ accept:'application/json', ...(options.headers || {}) } });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return text ? JSON.parse(text) : {};
  } finally { clearTimeout(timer); }
}

function bboxFrom(url) {
  const west = Number(url.searchParams.get('west'));
  const south = Number(url.searchParams.get('south'));
  const east = Number(url.searchParams.get('east'));
  const north = Number(url.searchParams.get('north'));
  if (![west,south,east,north].every(Number.isFinite)) return { west:110, south:-45, east:155, north:-10 };
  return { west,south,east,north };
}

function pointPlan(bbox, zoom) {
  const cols = zoom >= 6 ? 2 : 3;
  const rows = zoom >= 6 ? 2 : 2;
  const out = [];
  for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
    out.push({
      lat:bbox.south + ((y+.5)/rows)*(bbox.north-bbox.south),
      lon:bbox.west + ((x+.5)/cols)*(bbox.east-bbox.west),
      radius:245
    });
  }
  return out;
}

async function handleAircraft(url, res) {
  const bbox = bboxFrom(url);
  const zoom = Number(url.searchParams.get('zoom') || 4.5);
  const points = pointPlan(bbox, zoom);
  const attempts = [];
  const all = [];
  const tasks = points.map(async (p) => {
    const providers = [
      ['adsb.fi', `https://opendata.adsb.fi/api/v3/lat/${p.lat.toFixed(4)}/lon/${p.lon.toFixed(4)}/dist/${p.radius}`],
      ['Airplanes.live', `https://api.airplanes.live/v2/point/${p.lat.toFixed(4)}/${p.lon.toFixed(4)}/${p.radius}`]
    ];
    for (const [name,endpoint] of providers) {
      try {
        const data = await fetchJson(endpoint, {}, 9000);
        const rows = rowsFrom(data);
        const accepted = rows.map(r => normaliseAircraft(r,name)).filter(Boolean).filter(a => a.lat >= bbox.south && a.lat <= bbox.north && a.lon >= bbox.west && a.lon <= bbox.east && (a.seenSeconds == null || a.seenSeconds <= 240));
        attempts.push({ provider:name, raw:rows.length, accepted:accepted.length });
        all.push(...accepted);
        if (accepted.length) return;
      } catch (e) {
        attempts.push({ provider:name, raw:0, accepted:0, error:String(e) });
      }
    }
  });
  await Promise.allSettled(tasks);
  const aircraft = mergeAircraft(all);
  sendJson(res, { provider:'Codespace preview ADS-B proxy', aircraft, attempts, acceptedCount:aircraft.length, timestamp:new Date().toISOString(), partial:attempts.some(a=>a.error) });
}

function flightVariants(q) {
  const cleaned = cleanCallsign(q);
  const m = cleaned.match(/^([A-Z0-9]{2})([0-9].*)$/);
  const out = [];
  if (m && IATA_TO_ICAO[m[1]]) {
    out.push(`${IATA_TO_ICAO[m[1]]}${m[2]}`);
    if (m[1] === 'QF') out.push(`QLK${m[2]}`);
  }
  out.push(cleaned);
  return [...new Set(out.filter(Boolean))];
}

async function handleFlight(url,res) {
  const q = url.searchParams.get('q') || '';
  const attempts = [];
  for (const callsign of flightVariants(q)) {
    const providers = [
      ['adsb.fi', `https://opendata.adsb.fi/api/v2/callsign/${encodeURIComponent(callsign)}`],
      ['Airplanes.live', `https://api.airplanes.live/v2/callsign/${encodeURIComponent(callsign)}`],
      ['adsb.lol', `https://api.adsb.lol/v2/callsign/${encodeURIComponent(callsign)}`]
    ];
    for (const [name,endpoint] of providers) {
      try {
        const data = await fetchJson(endpoint,{},8000);
        const aircraft = rowsFrom(data).map(r=>normaliseAircraft(r,name)).filter(Boolean).filter(a=>a.seenSeconds==null || a.seenSeconds<=300);
        attempts.push({ provider:name,callsign,usable:aircraft.length });
        if (aircraft.length) return sendJson(res,{ query:q,matchedCallsign:callsign,provider:name,aircraft,attempts,timestamp:new Date().toISOString() });
      } catch(e) { attempts.push({ provider:name,callsign,usable:0,error:String(e) }); }
    }
  }
  sendJson(res,{ query:q,provider:'none',aircraft:[],attempts,error:'No live ADS-B target matched that flight number.' },404);
}

const LEVELS = {
  surface:{ speed:'wind_speed_10m', direction:'wind_direction_10m', cloud:'cloud_cover_low', label:'Surface / low cloud' },
  '5000':{ speed:'wind_speed_850hPa', direction:'wind_direction_850hPa', cloud:'cloud_cover_850hPa', label:'850 hPa (~5,000 ft)' },
  '10000':{ speed:'wind_speed_700hPa', direction:'wind_direction_700hPa', cloud:'cloud_cover_700hPa', label:'700 hPa (~10,000 ft)' },
  '18000':{ speed:'wind_speed_500hPa', direction:'wind_direction_500hPa', cloud:'cloud_cover_500hPa', label:'500 hPa (~18,000 ft)' },
  '24000':{ speed:'wind_speed_400hPa', direction:'wind_direction_400hPa', cloud:'cloud_cover_400hPa', label:'400 hPa (~24,000 ft)' },
  '30000':{ speed:'wind_speed_300hPa', direction:'wind_direction_300hPa', cloud:'cloud_cover_300hPa', label:'300 hPa (~30,000 ft)' },
  '34000':{ speed:'wind_speed_250hPa', direction:'wind_direction_250hPa', cloud:'cloud_cover_250hPa', label:'250 hPa (~34,000 ft)' },
  '39000':{ speed:'wind_speed_200hPa', direction:'wind_direction_200hPa', cloud:'cloud_cover_200hPa', label:'200 hPa (~39,000 ft)' }
};

async function handleWind(url,res) {
  const bbox = bboxFrom(url);
  const levelKey = url.searchParams.get('level') || '30000';
  const level = LEVELS[levelKey] || LEVELS['30000'];
  const offset = Math.max(-6,Math.min(24,Number(url.searchParams.get('offset') || 0)));
  const zoom = Math.max(2,Math.min(12,Number(url.searchParams.get('zoom') || 4)));
  const cols = Math.max(5,Math.min(8,Math.round(zoom+1)));
  const rows = Math.max(4,Math.min(6,Math.round(cols*.65)));
  const points=[];
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) points.push({ lat:bbox.south+((y+.5)/rows)*(bbox.north-bbox.south), lon:bbox.west+((x+.5)/cols)*(bbox.east-bbox.west) });
  const api = new URL('https://api.open-meteo.com/v1/forecast');
  api.searchParams.set('latitude',points.map(p=>p.lat.toFixed(4)).join(','));
  api.searchParams.set('longitude',points.map(p=>p.lon.toFixed(4)).join(','));
  api.searchParams.set('hourly',`${level.speed},${level.direction},${level.cloud}`);
  api.searchParams.set('wind_speed_unit','kn'); api.searchParams.set('timeformat','unixtime'); api.searchParams.set('timezone','UTC'); api.searchParams.set('forecast_days','2'); api.searchParams.set('past_days','1');
  try {
    const raw = await fetchJson(api.toString(),{},25000);
    const results = Array.isArray(raw) ? raw : [raw];
    const target = Math.floor((Date.now()+offset*3600000)/1000);
    const output=[];
    results.forEach((r,i)=>{
      const times=r?.hourly?.time||[]; if(!times.length||!points[i]) return;
      let idx=0,delta=Infinity; times.forEach((t,j)=>{ const d=Math.abs(Number(t)-target); if(d<delta){delta=d;idx=j;} });
      const speedKt=Number(r.hourly?.[level.speed]?.[idx]); const fromDeg=Number(r.hourly?.[level.direction]?.[idx]); const cloudCover=Number(r.hourly?.[level.cloud]?.[idx]);
      if(Number.isFinite(speedKt)&&Number.isFinite(fromDeg)) output.push({ ...points[i], speedKt, fromDeg, cloudCover:Number.isFinite(cloudCover)?cloudCover:null, validTime:new Date(Number(times[idx])*1000).toISOString() });
    });
    sendJson(res,{ source:'Open-Meteo',level:level.label,levelKey,offsetHours:offset,timestamp:new Date().toISOString(),points:output });
  } catch(e) { sendJson(res,{error:'Wind feed unavailable',detail:String(e),points:[]},502); }
}

async function handleRadar(url,res) {
  try {
    const offset=Math.max(-2,Math.min(6,Number(url.searchParams.get('offset')||0)));
    const metadata=await fetchJson('https://api.rainviewer.com/public/weather-maps.json',{},12000);
    const past=Array.isArray(metadata?.radar?.past)?metadata.radar.past:[]; const nowcast=Array.isArray(metadata?.radar?.nowcast)?metadata.radar.nowcast:[];
    const frames=offset>0&&nowcast.length?[...past,...nowcast]:past;
    if(!frames.length) throw new Error('No radar frames returned');
    const target=Date.now()/1000+offset*3600; const frame=frames.reduce((best,c)=>Math.abs(c.time-target)<Math.abs(best.time-target)?c:best,frames[0]);
    sendJson(res,{ source:'RainViewer',time:new Date(frame.time*1000).toISOString(),tileUrl:`${metadata.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,requestedOffsetHours:offset,forecastUnavailable:offset>0&&!nowcast.length,timestamp:new Date().toISOString() });
  } catch(e) { sendJson(res,{error:'Radar feed unavailable',detail:String(e)},502); }
}

async function handleMetar(_url,res) {
  try {
    const ids=AIRPORTS.map(a=>a.icao).join(',');
    const rows=await fetchJson(`https://aviationweather.gov/api/data/metar?ids=${ids}&format=json`,{},20000);
    const byId=new Map((Array.isArray(rows)?rows:[]).map(r=>[r.icaoId??r.station_id??r.id,r]));
    const airports=AIRPORTS.map(a=>{
      const row=byId.get(a.icao)||{}; const clouds=Array.isArray(row.clouds)?row.clouds:[]; const ceiling=clouds.find(c=>['BKN','OVC','OVX'].includes(String(c.cover||'').toUpperCase()));
      return { ...a, temperatureC:Number.isFinite(Number(row.temp??row.temp_c))?Number(row.temp??row.temp_c):null, windFromDeg:row.wdir==='VRB'?'VRB':Number.isFinite(Number(row.wdir??row.wind_dir_degrees))?Number(row.wdir??row.wind_dir_degrees):null, windSpeedKt:Number.isFinite(Number(row.wspd??row.wind_speed_kt))?Number(row.wspd??row.wind_speed_kt):null, windGustKt:Number.isFinite(Number(row.wgst??row.wind_gust_kt))?Number(row.wgst??row.wind_gust_kt):null, visibilitySm:row.visib??null, flightCategory:row.fltCat??null, ceilingFt:Number.isFinite(Number(ceiling?.base))?Number(ceiling.base):null, cloudCover:ceiling?.cover??clouds[0]?.cover??null, rawMetar:row.rawOb??row.raw_text??null, observedAt:row.reportTime??row.observation_time??row.receiptTime??null, available:Object.keys(row).length>0 };
    });
    sendJson(res,{ source:'Aviation Weather Center',timestamp:new Date().toISOString(),airports });
  } catch(e) { sendJson(res,{error:'METAR feed unavailable',detail:String(e),airports:AIRPORTS.map(a=>({...a,available:false}))},502); }
}

function normaliseAirport(raw={}) {
  const lat=Number(raw.lat??raw.latitude),lon=Number(raw.lon??raw.lng??raw.longitude); if(!Number.isFinite(lat)||!Number.isFinite(lon)) return null;
  return { iata:String(raw.iata??raw.iata_code??'').toUpperCase()||null,icao:String(raw.icao??raw.icao_code??'').toUpperCase()||null,name:String(raw.name||raw.location||raw.municipality||'').trim()||null,city:String(raw.location||raw.municipality||'').trim()||null,lat,lon,elevationFt:Number.isFinite(Number(raw.alt_feet??raw.elevation))?Number(raw.alt_feet??raw.elevation):null };
}

async function handleRoute(url,res) {
  const callsign=cleanCallsign(url.searchParams.get('callsign')||url.searchParams.get('q'));
  const lat=Number(url.searchParams.get('lat')||0),lon=Number(url.searchParams.get('lon')||0);
  if(!callsign) return sendJson(res,{error:'Callsign is required.'},400);
  const attempts=[];
  try {
    const raw=await fetchJson('https://api.adsb.lol/api/0/routeset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({planes:[{callsign,lat,lng:lon}]})},9000);
    const row=(Array.isArray(raw)?raw:[]).find(r=>r&&(r.callsign||r._airports));
    const airports=(Array.isArray(row?._airports)?row._airports:[]).map(normaliseAirport).filter(Boolean);
    attempts.push({provider:'adsb.lol routeset',usable:airports.length>=2});
    if(airports.length>=2) return sendJson(res,{source:'adsb.lol routeset',callsign:row.callsign||callsign,routeLabel:String(row._airport_codes_iata||'').replace(/-/g,' → ')||airports.map(a=>a.iata||a.icao).join(' → '),routeIcao:String(row.airport_codes||'').replace(/-/g,' → ')||airports.map(a=>a.icao||a.iata).join(' → '),plausible:row.plausible===true||row.plausible===1,airports,attempts,timestamp:new Date().toISOString(),caveat:'Plausible route inferred from callsign data, not a filed flight plan.'});
  } catch(e){attempts.push({provider:'adsb.lol routeset',usable:false,error:String(e)});}
  try {
    const raw=await fetchJson(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`,{},7000); const route=raw?.response?.flightroute;
    const airports=[route?.origin,route?.midpoint,route?.destination].map(normaliseAirport).filter(Boolean);
    attempts.push({provider:'adsbdb',usable:airports.length>=2});
    if(airports.length>=2) return sendJson(res,{source:'adsbdb',callsign,routeLabel:airports.map(a=>a.iata||a.icao).join(' → '),routeIcao:airports.map(a=>a.icao||a.iata).join(' → '),airports,attempts,timestamp:new Date().toISOString(),caveat:'Community callsign route match, not a filed flight plan.'});
  } catch(e){attempts.push({provider:'adsbdb',usable:false,error:String(e)});}
  sendJson(res,{callsign,airports:[],attempts,error:'No plausible route was available for this callsign.'},404);
}

async function proxyExternal(req,res,url) {
  try {
    const target=new URL(url);
    const upstream=await fetch(target,{headers:{accept:req.headers.accept||'*/*'}});
    const body=Buffer.from(await upstream.arrayBuffer());
    const headers={ 'content-type':upstream.headers.get('content-type')||'application/octet-stream','cache-control':'no-store','access-control-allow-origin':'*' };
    res.writeHead(upstream.status,headers); res.end(body);
  } catch(e){ sendJson(res,{error:'Proxy request failed',detail:String(e)},502); }
}

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
async function serveStatic(url,res){
  let rel=decodeURIComponent(url.pathname); if(rel==='/'||rel==='') rel='/index.html';
  const target=path.normalize(path.join(WEB_ROOT,rel));
  if(!target.startsWith(WEB_ROOT)) return sendJson(res,{error:'Forbidden'},403);
  try{ const data=await fs.readFile(target); res.writeHead(200,{'content-type':MIME[path.extname(target)]||'application/octet-stream','cache-control':'no-store'}); res.end(data); }
  catch{ try{ const data=await fs.readFile(path.join(WEB_ROOT,'index.html')); res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}); res.end(data); } catch{ sendJson(res,{error:'Not found'},404); } }
}

const server=http.createServer(async (req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(url.pathname==='/api/aircraft') return handleAircraft(url,res);
  if(url.pathname==='/api/flight') return handleFlight(url,res);
  if(url.pathname==='/api/wind') return handleWind(url,res);
  if(url.pathname==='/api/radar') return handleRadar(url,res);
  if(url.pathname==='/api/metar') return handleMetar(url,res);
  if(url.pathname==='/api/route') return handleRoute(url,res);
  if(url.pathname.startsWith('/proxy/adsbfi/')) return proxyExternal(req,res,`https://opendata.adsb.fi/${url.pathname.slice('/proxy/adsbfi/'.length)}${url.search}`);
  if(url.pathname.startsWith('/proxy/airplanes/')) return proxyExternal(req,res,`https://api.airplanes.live/${url.pathname.slice('/proxy/airplanes/'.length)}${url.search}`);
  if(url.pathname.startsWith('/proxy/adsblol/')) return proxyExternal(req,res,`https://api.adsb.lol/${url.pathname.slice('/proxy/adsblol/'.length)}${url.search}`);
  return serveStatic(url,res);
});

server.listen(PORT,'0.0.0.0',()=>{
  console.log(`AeroScope preview running on http://0.0.0.0:${PORT}`);
  console.log('Live preview API: traffic, flight search, wind, radar, METAR and route lookup enabled.');
});
