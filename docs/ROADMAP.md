# AeroScope roadmap

## v0.9 — Turbulence Lab test build

- [x] continuous model-derived turbulence potential by WX altitude
- [x] Minimal / Low / Elevated / High potential presentation
- [x] vertical wind-shear + Richardson-number diagnostics
- [x] tap-point vertical turbulence profile
- [x] aircraft-position vertical turbulence profile
- [x] PIREP/AIREP turbulence observations with age fade
- [x] NIL/smooth reports when supplied upstream
- [x] separate MODEL / OBSERVED / ADVISORY controls
- [x] selected-altitude filtering for observed/advisory products
- [x] G-AIRMET and Alaska AIRMET support in addition to SIGMETs
- [ ] WIFS account/API-key integration
- [ ] GRIB2/WAFS EDR ingestion service
- [ ] true Nil / Light / Moderate / Severe EDR presentation

## v0.10 — Atmospheric operations picture

- [ ] WAFS CB extent and tops
- [ ] icing severity
- [ ] jet/max-wind layer
- [ ] tropopause layer
- [ ] Australian ACCESS model preference for regional wind/weather
- [ ] improved rain-radar time semantics

## v0.11 — Route intelligence

- [ ] route entry and flight-aware route extraction
- [ ] distance-vs-altitude turbulence cross-section
- [ ] along-route roughness strip
- [ ] forecast-time matching along route
- [ ] airport runway-wind/crosswind detail at terminal zoom

## Design rules

- Weather-first; aircraft context-second.
- Map labels stay minimal.
- Forecast/model diagnostics, observations and advisories are never visually conflated.
- Every layer displays age/validity where upstream data supports it.
- No simulated fallback in the live build.
- Experimental/non-operational status remains prominent.
