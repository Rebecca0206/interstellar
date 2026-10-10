# Interstellar

Mobile-first live sky viewer (camera overlay + AR labels). Point your phone at the sky to see planets, the Sun & Moon, bright stars, constellation lines, Messier deep-sky objects, and satellites (ISS/Tiangong highlighted) with live altitude/speed labels.

## Run locally
Needs HTTPS for camera/sensors on a phone. Serve this folder over HTTPS (GitHub Pages, or a tunnel).

```bash
python3 -m http.server 8080
# then tunnel, e.g. cloudflared tunnel --url http://127.0.0.1:8080
```

Open on phone → **Start sky view** (grants motion + camera on iOS).

## Tests
```bash
node test/astro.test.js
```

## Units
Default imperial (mi, mph). Toggle metric in ☰ settings.

## Data
- astronomy-engine (vendored) — planets/Sun/Moon
- HYG / d3-celestial — stars, names, constellation lines, Messier
- CelesTrak TLEs + satellite.js — satellites (live fetch with bundled fallback)
- WMM2025 via magvar — magnetic declination

## Code layout
`js/core.js` (math) → `js/state.js` (state, catalogs, satellites) → `js/render.js` (canvas, sensors, input) → `js/ui-sheets.js` (tap, detail sheets, search, settings, time) → `js/features.js` (Tonight, pass alerts, calibration, share, onboarding) → `js/app.js` (loop, init, API). Classic scripts sharing one global scope; no build step.

## Tests
- `node test/astro.test.js` — alt/az vs astronomy-engine, projection, ISS altitude/speed
- `node test/ui.shots.js` — headless load (no console errors) + screenshots in `screenshots/` (needs `python3 -m http.server 8080` running)
