# AeroScope v0.9.2 Turbulence Lab — Route Heat

AeroScope is an experimental aviation situational-awareness display built around a different premise from a conventional flight tracker: **the atmosphere is the primary layer and aircraft provide context**.

This test build puts turbulence at the centre of the map. It combines a continuous **model-derived turbulence potential** layer with recent aircraft reports and official advisory areas, while retaining live aircraft, radar, winds and airport weather.

> **Important:** AeroScope is an experimental visualisation. It is not an operational EDR product and must not be used for navigation, dispatch, go/no-go decisions, passenger-safety decisions or any safety-critical purpose.

## Turbulence suite in v0.9.2

### MODEL

A continuous, flight-level-sensitive turbulence-potential grid derived from pressure-level forecast fields. It uses vertical wind shear and gradient Richardson number to identify areas of atmospheric instability/shear.

The categories are intentionally labelled **Minimal / Low / Elevated / High potential**, not Light / Moderate / Severe turbulence, because this diagnostic is **not EDR** and is not an observed turbulence product.

### OBSERVED

Recent PIREP/AIREP turbulence reports from the Aviation Weather Center API, including reported NIL turbulence where available. Reports are filtered around the selected WX altitude and fade with age.

Coverage is strongest in the United States and North Atlantic and may be sparse over Australia and other regions.

### ADVISORY

Official turbulence/mountain-wave advisory geometry from:

- international SIGMETs;
- US domestic SIGMETs;
- US G-AIRMETs;
- Alaska AIRMETs;
- Australian BOM SIGMET/AIRMET bulletins;
- selected terminal TAF turbulence remarks.

Advisories are filtered against the selected WX altitude where a vertical band can be decoded.

### Vertical profile

Tap anywhere on the map, or select a live aircraft and choose **VERTICAL TURB PROFILE AT POSITION**, to see the model diagnostic from approximately 5,000 ft through FL390.


## Selected-aircraft route weather

Selecting a live aircraft now automatically attempts to resolve a plausible origin/destination route. AeroScope draws that route on the map, labels the airport sequence, and samples the existing model turbulence-potential diagnostic along the route at the selected **WX ALTITUDE** and **Weather time**.

The selected-aircraft card shows the route, route-data source and a Minimal / Low / Elevated / High route-potential summary. **FIT ROUTE + WEATHER** zooms the map to the whole route so rain radar, winds, advisories, observations and route-potential samples can be viewed together.

Route lookup uses the free adsb.lol `routeset` endpoint with adsbdb as a fallback. These are callsign-derived/community route sources and are explicitly shown as **plausible context, not a filed flight plan**.

## Other capabilities

- live aircraft traffic with multiple open-provider fallbacks;
- search by airport or flight/callsign;
- RainViewer radar;
- surface and upper-level wind arrows;
- airport METAR weather;
- weather time slider;
- Netlify Edge/CDN/browser/server traffic fallbacks.

## True WAFS/WIFS EDR remains the target

WIFS provides authorised WAFS gridded turbulence severity at 0.25-degree resolution across 36 levels from FL100 to FL450. AeroScope has reserved configuration for `WIFS_API_KEY`, but this test build does **not** pretend the model-derived potential layer is WAFS EDR.

## Development

Requires Node.js 20+.

```bash
npm test
```

## Environment variables

- `OPENSKY_CLIENT_ID` — optional
- `OPENSKY_CLIENT_SECRET` — optional
- `WIFS_API_KEY` — reserved for future authorised WAFS/WIFS integration

## Deployment

Designed for Netlify. The ZIP root contains `index.html`, `netlify.toml`, `package.json`, `netlify/functions/` and `netlify/edge-functions/` so it can be manually deployed directly or connected to GitHub.


## v0.9.2 display refinement

- Replaces coarse rectangular model cells with a soft canvas heat field.
- Minimal/low potential is deliberately faint; elevated/high regions carry most of the visual weight.
- Selecting an aircraft automatically dims the broad model field.
- The selected route becomes a high-contrast, colour-segmented turbulence ribbon with glow and category-change markers.
- Route segments are tappable/hoverable for category + selected flight level/time context.
