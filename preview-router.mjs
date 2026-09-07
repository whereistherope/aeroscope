import http from 'node:http';
import {
  handleTurbulence,
  handleTurbulencePotential,
  handleTurbulenceProfile,
  handleRouteWeather
} from './preview-turbulence.mjs';

const PORT = Number(process.env.PORT || 8080);
const UPSTREAM_PORT = Number(process.env.AEROSCOPE_UPSTREAM_PORT || 8081);

function proxy(req, res, pathnameOverride = null) {
  const original = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = pathnameOverride ? `${pathnameOverride}${original.search}` : `${original.pathname}${original.search}`;
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: UPSTREAM_PORT,
    path,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` }
  }, (response) => {
    res.writeHead(response.statusCode || 502, response.headers);
    response.pipe(res);
  });
  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: 'Preview upstream unavailable', detail: String(error) }));
  });
  req.pipe(upstream);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/turbulence') return handleTurbulence(url, res);
    if (url.pathname === '/api/turbulence-potential') return handleTurbulencePotential(url, res);
    if (url.pathname === '/api/turbulence-profile') return handleTurbulenceProfile(url, res);
    if (url.pathname === '/api/route-weather') return handleRouteWeather(url, res);
    if (url.pathname === '/api/traffic-edge') return proxy(req, res, '/api/aircraft');
    return proxy(req, res);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: 'Preview API failure', detail: String(error) }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AeroScope full preview gateway running on http://0.0.0.0:${PORT}`);
  console.log(`Base preview server upstream: http://127.0.0.1:${UPSTREAM_PORT}`);
  console.log('Turbulence model, observations/advisories, vertical profiles and route-weather are enabled.');
});
