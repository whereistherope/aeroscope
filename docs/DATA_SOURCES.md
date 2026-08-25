# Data sources

Last reviewed: 2026-08-25

## Turbulence

### Open-Meteo pressure-level forecasts

Use: experimental continuous turbulence-potential diagnostic and vertical profile.

Fields: pressure-level wind speed/direction, temperature and geopotential height. AeroScope derives vector wind shear and gradient Richardson number. This is a **diagnostic**, not EDR and not an operational turbulence forecast.

### Aviation Weather Center Data API v4

Use: PIREP/AIREP observations, international SIGMETs, domestic SIGMETs, G-AIRMETs, Alaska AIRMETs, METAR and TAF.

Notes: PIREP/AIREP coverage is strongest in the US and North Atlantic. API requests are server-side because CORS is restricted. Rate limits are respected by caching and low refresh frequency.

### Australian Bureau of Meteorology

Use: Australian SIGMET/AIRMET turbulence and mountain-wave bulletin content.

Notes: current prototype parses public human-readable bulletin pages. This is inherently more brittle than a structured API and should be replaced if a suitable structured authoritative feed becomes available.

### WAFS / WIFS API — target authoritative gridded source

Target use: global gridded turbulence severity, icing, CB, wind, temperature, tropopause and max-wind products.

Current WIFS documentation lists 0.25-degree turbulence severity across 36 levels from FL100 to FL450. Access requires an authorised account/API key. v0.9 does not substitute its experimental diagnostic for WAFS EDR.

## Aircraft

### adsb.fi

Use: primary/supplementary live ADS-B point queries and callsign lookup.

### Airplanes.live

Use: supplementary point and callsign queries.

### adsb.lol

Use: additional fallback traffic source.

### OpenSky Network

Use: optional enrichment/coverage source via OAuth. AeroScope never depends on OpenSky as the sole traffic source.

## Other weather

### RainViewer

Use: weather-radar frames. Future nowcast frames are not always available.

### Open-Meteo

Use: surface and pressure-level wind/cloud fields in addition to the experimental turbulence diagnostic.

## Maintenance policy

Each provider adapter should expose source/status/validity, fail independently, avoid simulated live data, cache at a sensible interval and retain raw upstream metadata when possible.


## Route enrichment

- **adsb.lol `/api/0/routeset`** — first choice for plausible callsign route + airport geometry.
- **adsbdb `/v0/callsign/{callsign}`** — fallback route database.

These are enrichment sources, not ADS-B fields and not authoritative filed-flight-plan data. AeroScope labels this distinction in the selected-aircraft UI.

## Route weather

AeroScope samples the same Open-Meteo pressure-level vertical-shear / Richardson-number diagnostic used by MODEL along the selected route. Colours therefore mean Minimal / Low / Elevated / High **potential**, not Light / Moderate / Severe EDR.
