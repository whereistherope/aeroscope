# AeroScope v1 Refresh Spec

## Product position

AeroScope is not a consumer flight tracker. It is a **weather-first aviation intelligence surface**: aircraft provide context while the atmosphere, route exposure and operational weather are the primary subject.

The v1 refresh should feel credible beside modern OSINT / mission-analysis software without imitating a radar scope or becoming a theatrical military UI. The visual target is **tactical, premium, calm and information-dense**.

## Core experience

A user should be able to answer these questions quickly:

1. What is this aircraft flying through?
2. Where along its route is the roughest air?
3. Is the rough layer vertically shallow or deep?
4. What is forecast, what has actually been observed, and what has been formally advised?
5. What weather is operationally relevant at the departure and arrival airports?
6. Why might an area be turbulent: jet, shear, convection, mountain wave or another cause?

## Design principles

- **Atmosphere first, aircraft second.** Traffic stays legible but never dominates weather.
- **Tactical, not cosplay.** Avoid fake scopes, CRT effects, excessive green, crosshairs or decorative telemetry.
- **Glass for hierarchy.** Use restrained translucent panes for inspectors, drawers and modal analysis surfaces.
- **Map remains rich.** Preserve terrain / satellite texture and atmospheric overlays rather than flattening the map to monochrome radar styling.
- **Progressive disclosure.** Default map is clean. Detail appears in inspectors, dropdowns and focused modes.
- **Semantic colour.** Cyan/mint = interaction/live, amber = elevated/caution, red = severe/critical, green = healthy/available. Avoid rainbow UI chrome.
- **Never conflate data classes.** Forecast/model, observed reports and official advisories remain visually and verbally distinct.

## Layout

### Top command bar

Persistent slim command surface containing:

- AeroScope identity and environment state;
- global search / command field;
- current mode;
- selected WX altitude and time context;
- systems/layers access;
- health summary.

### Left systems rail

Collapsible groups rather than a flat checkbox wall:

- Traffic
- Weather
- Turbulence
- Airports
- Routes
- Data health

Multi-choice controls use dropdowns, segmented controls or accordions.

### Right intelligence inspector

Context-sensitive pane:

- aircraft selected → aircraft, route, route weather, roughness ahead, vertical profile;
- airport selected → METAR/TAF, runway wind, ceiling/visibility, LLWS and nearby convection;
- map point selected → vertical atmosphere profile, reports and advisories nearby;
- nothing selected → atmospheric picture and notable conditions.

### Bottom temporal rail

A proper analysis timeline, not just a bare range input:

- radar history;
- model forecast time;
- advisory validity;
- report age;
- later: replay and flight-relative route progression.

## Visual language

### Base

- graphite/near-black canvas;
- subdued satellite/terrain hybrid base map;
- fine coast/boundary linework;
- restrained elevation texture;
- glass panes with subtle blur and 1 px cool borders;
- minimal shadows, used to separate panes from the map.

### Typography

- clean sans-serif for UI and narrative data;
- monospace reserved for callsigns, flight levels, headings, coordinates and compact telemetry;
- uppercase micro-labels with generous tracking for system labels only.

### Motion

- short fades and layer cross-fades;
- subtle route illumination;
- no perpetual sci-fi animation;
- respect reduced-motion settings.

## Primary modes

### Overview

Traffic + airport weather + radar + restrained turbulence context.

### Route

Selected route becomes dominant. Background weather dims slightly. Route segments illuminate according to atmospheric exposure.

### Turbulence

MODEL / OBSERVED / ADVISORY become first-class analytical layers with vertical and along-route tools.

### Airport Ops

Terminal-focused view with runway-relative wind, visibility, ceiling, nearby cells and arrival/departure context.

### Replay

Later phase: scrub historical radar, reports, advisories and traffic to understand how a system evolved.

## Turbulence product

Turbulence remains AeroScope's defining capability.

### Forecast / model

Current experimental wind-shear/stability potential remains clearly labelled **Minimal / Low / Elevated / High potential**, never Light / Moderate / Severe until an authoritative EDR source is available.

### Observed

PIREP/AIREP reports sit above the model layer and decay visually by age. NIL reports are valuable and should remain visible at low emphasis.

### Advisory

SIGMET/AIRMET/G-AIRMET geometry remains crisp and bounded, visually distinct from soft forecast fields.

### Signature interactions

- route ribbon coloured by turbulence exposure;
- vertical turbulence profile at point or aircraft;
- along-route roughness strip for the next 30–90 minutes;
- future distance-vs-altitude route cross-section;
- model-vs-observed comparison;
- future WAFS/WIFS EDR severity and confidence.

## Expansion priorities

### Atmospheric context

- WAFS/WIFS EDR
- CB extent / bases / tops
- jet core / max wind
- icing severity
- tropopause
- wind-shear diagnostics
- mountain-wave context

### Airport operations

- runway layout emphasis at terminal zoom
- runway head/cross/tailwind components
- gusts
- ceiling / visibility
- LLWS
- nearby convective cells
- arrival/departure track context

### Route intelligence

- roughest segment summary
- smoothest-altitude comparison
- forecast-time matching along route
- route cross-section
- roughness-ahead strip
- confidence / source agreement

## v1 implementation order

1. Freeze v0.9.2 as the functional reference baseline.
2. Refresh visual shell without altering data behaviour.
3. Split monolithic UI into components/modules.
4. Move hosting centre of gravity to GitHub.
5. Port server-side API work to Cloudflare Worker with parity tests.
6. Enable GitHub Pages deployment only after Worker parity is green.
7. Add richer map base-layer selection.
8. Build Route mode and Turbulence mode as signature workflows.
9. Add Airport Ops.
10. Integrate authoritative WAFS/WIFS products when access is available.

## Safety posture

AeroScope remains experimental and non-operational. It must not imply dispatch, navigation, go/no-go or passenger-safety authority. Data provenance, age and validity remain visible wherever feasible.
