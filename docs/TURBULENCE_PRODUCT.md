# Turbulence product direction

## Product thesis

Turbulence should be AeroScope's defining layer, not an occasional warning polygon. The map should distinguish three different concepts rather than blending them together:

1. **Forecast** — a continuous modelled turbulence field by flight level.
2. **Observed** — recent PIREP/AIREP reports at specific positions and levels.
3. **Advisory** — SIGMET/AIRMET areas issued by meteorological authorities.

This separation is essential because an advisory polygon is not the same thing as a gridded forecast and neither is the same as an actual aircraft report.

## Desired severity display

For a medium transport aircraft under typical en-route conditions, current PANS-MET/SADIS guidance maps peak EDR approximately as:

- Nil: EDR <= 0.10
- Light: EDR > 0.10 and < 0.20
- Moderate: EDR >= 0.20 and < 0.45
- Severe: EDR >= 0.45

Where an upstream source provides an Extreme category or aircraft-size-specific thresholds, AeroScope should preserve that distinction rather than inventing one from unrelated data.

Raw EDR should remain available in the detail view. Severity colour bands are a presentation layer and should be labelled as such.

## Hero interactions

### Flight-level turbulence map

The WX altitude selector controls the turbulence field as well as wind. A user should be able to switch FL180 -> FL240 -> FL300 -> FL340 -> FL390 and immediately see the rough-air pattern move vertically.

### Vertical profile at point

Tap anywhere on the map to open a vertical turbulence profile showing EDR by flight level. This answers a question a normal flight tracker cannot: "Is the rough air only at FL340, or does it extend through the whole column?"

### Route cross-section

Search a flight or enter an origin/destination pair and show a distance-vs-flight-level cross-section with turbulence intensity, wind and CB/icing context. This should become one of AeroScope's signature views.

### Along-route roughness strip

For a selected live flight, show a compact strip representing the next 30-90 minutes of forecast turbulence along the projected route/time. Keep this experimental and clearly labelled as forecast, not operational guidance.

### Observed reports

PIREPs/AIREPs should appear as small, time-decaying point markers with altitude and reported intensity. A recent observation should visually sit above the forecast field so users can compare model vs reality.

## Context layers that explain turbulence

- Jet-stream core and maximum wind.
- Horizontal/vertical wind shear indicators.
- Mountain-wave/orographic advisory areas.
- Cumulonimbus extent and cloud tops.
- Convective weather/radar.
- Tropopause height.
- Icing severity.

The aim is to show *why* a region may be rough, not just colour it amber or red.

## WAFS/WIFS target source

The WIFS API provides WAFS gridded turbulence severity at 0.25-degree resolution and 36 vertical levels from FL100 to FL450, along with wind, temperature, icing severity, CB extent/base/top and tropopause/max-wind products. Access is authorised separately and requires an API key.

AeroScope should integrate WIFS server-side once access is approved. Do not expose `WIFS_API_KEY` to the browser.

## Future probabilistic layer

WAFC plans include probabilistic WAFS hazard products. When operationally available, AeroScope should add a probability mode separately from deterministic EDR instead of mixing the two.

## Sources

- https://aviationweather.gov/wifs/
- https://aviationweather.gov/wifs/users_guide/
- https://www.metoffice.gov.uk/services/transport/aviation/regulated/international-aviation/sadis/sadis-api
- https://aviationweather.gov/gfa/help/?page=tutorial
