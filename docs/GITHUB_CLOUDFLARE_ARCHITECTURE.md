# GitHub + Cloudflare target architecture

## Goal

Remove Netlify as a runtime dependency while keeping GitHub as the source of truth and preserving server-side handling for credentials, CORS, caching and provider aggregation.

## Target

```text
GitHub repository
├── frontend / GitHub Pages
├── Cloudflare Worker source
├── tests
└── GitHub Actions

Browser
  ↓
GitHub Pages (UI)
  ↓ API
Cloudflare Worker
  ├── aircraft providers
  ├── route enrichment
  ├── AWC / BOM aviation weather
  ├── Open-Meteo / RainViewer
  ├── optional OpenSky OAuth
  └── future WIFS/WAFS
```

## Why GitHub Pages is not enough alone

AeroScope has server-side requirements:

- credentials must not be shipped to browser JavaScript;
- some providers restrict browser CORS;
- provider aggregation and caching should happen once, not independently in every client;
- rate limits need coordination;
- BOM bulletin parsing is better isolated from the browser;
- future WIFS/WAFS credentials must remain secret.

## Migration strategy

### Stage 1 — baseline

Keep the v0.9.2 Netlify adapters in the repository as the known-working reference while the UI is refreshed. Do not delete them until parity exists.

### Stage 2 — Worker parity

Create Worker routes corresponding to the current same-origin API contract:

- `/aircraft`
- `/flight`
- `/wind`
- `/radar`
- `/metar`
- `/turbulence`
- `/turbulence-potential`
- `/turbulence-profile`
- `/route`
- `/route-weather`

Reuse provider-normalisation logic where possible.

### Stage 3 — frontend API base

Replace hard-coded `/api/...` assumptions with a single configurable API base URL. Development can point to a local Worker, production to the Cloudflare Worker domain.

### Stage 4 — Pages deploy

Add GitHub Actions Pages deployment. Only switch the public site once:

- all existing assurance tests pass against Worker adapters;
- secrets exist in Cloudflare;
- CORS allows the GitHub Pages origin only;
- traffic/weather/turbulence endpoints pass live smoke tests;
- no browser bundle contains provider secrets.

## Repository shape target

```text
/apps/web
  src/
  public/
/worker
  src/
/tests
/docs
.github/workflows
```

The current single-file app can be migrated incrementally rather than rewritten in one high-risk change.

## Security

Secrets belong in Cloudflare Worker secrets, never in GitHub Pages or committed `.env` files.

Expected secrets/config:

- `OPENSKY_CLIENT_ID`
- `OPENSKY_CLIENT_SECRET`
- `WIFS_API_KEY` when approved

## Deployment model

- PR → tests
- merge to `main` → GitHub Pages frontend deploy
- Worker changes → Worker deployment workflow
- failed tests block release

## Exit criterion for Netlify

Netlify can be removed when the Worker passes feature parity for all currently-used API endpoints and the GitHub Pages build has been smoke-tested against the Worker in production.
