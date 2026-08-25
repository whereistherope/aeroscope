# AeroScope v0.9.2 Turbulence Lab — route heat test notes

## What to try first

1. Deploy the ZIP to the existing Netlify AeroScope project.
2. Open **LAYERS** and leave all three turbulence modes enabled: MODEL / OBSERVED / ADVISORY.
3. Switch WX ALTITUDE between FL180, FL240, FL300, FL340 and FL390. The model-potential field and altitude-filtered advisories/reports should change.
4. Tap any point on the map to open a vertical turbulence-potential profile.
5. Search a live flight number and select the aircraft. AeroScope should automatically resolve and draw its plausible route.
6. Tap **FIT ROUTE + WEATHER** in the aircraft card. The whole route should appear with coloured route-potential segments plus the normal radar/wind/turbulence overlays.
7. Change WX ALTITUDE or Weather time while the aircraft remains selected. Route-weather sampling should refresh for that level/time.
8. Choose **VERTICAL TURB PROFILE AT POSITION** for the aircraft itself.

## Reading the turbulence display

- **MODEL**: Minimal / Low / Elevated / High *potential*. This is derived from model wind shear and atmospheric stability. It is **not EDR** and should not be read as a Light/Moderate/Severe forecast.
- **OBSERVED**: recent PIREP/AIREP turbulence reports, including NIL reports where available. Coverage may be sparse outside the US/North Atlantic.
- **ADVISORY**: official SIGMET/AIRMET/G-AIRMET/TAF turbulence information where available.

A blank advisory or observed layer does not mean smooth air.

## Safety / purpose

Experimental visualisation only. Not for navigation, dispatch, go/no-go decisions, passenger-safety decisions or operational use. Airline crews and dispatchers use certified/authoritative operational weather products.


## Route caveat

ADS-B position broadcasts do not contain origin/destination or a filed flight plan. Route geometry is enriched from callsign databases (adsb.lol routeset first, adsbdb fallback). If neither returns usable airport coordinates AeroScope leaves the route unavailable rather than inventing one.


## Display checks

- Model potential uses `TurbulenceHeatLayer` canvas rendering; no `L.rectangle` model grid remains.
- Selecting an aircraft dims the broad heat field to 24% and prioritises the route ribbon.
- Route weather uses three-pass glow/core lines and only marks category transitions/endpoints.
