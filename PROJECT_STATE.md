# Project State Analysis

Date: 2026-04-26
Repository: `ar_charts`

## 1) Current Snapshot

- Git branch: `main` (tracking `origin/main`)
- Working tree status: 1 modified file (`frontend/plan.md`)
- Top-level structure:
  - `frontend/` (active app code)
  - `README.md` (deployment and live links)

## 2) Product Direction (as implemented)

This project is currently a **WebAR prototype/demo** with:

- A Vite-based frontend app with two entry points:
  - Landing page (`frontend/index.html` + `src/main.ts`)
  - AR page (`frontend/ar/index.html` + `ar/app.js` + `ar/style.css`)
- Deployment-oriented setup for GitHub Pages-style hosting:
  - Live links documented in `README.md`
  - Relative base path in Vite config (`base: "./"`)

## 3) What Is Already Implemented

### Core AR stack

- A-Frame `1.7.0` and AR.js (A-Frame build) are loaded via CDN.
- `<a-scene>` is configured for webcam AR (`sourceType: webcam`, `trackingMethod: best`, debug UI off).
- A Hiro marker preset is configured, with a placeholder 3D box for validation.

### User experience / HUD layer

- Full-screen mission-style HUD with:
  - Splash/start overlay
  - Header/live indicator
  - Central crosshair with search/lock states
  - Bottom control bar with zoom control and signal meter
  - Settings drawer (camera input selection + debug log)
- Toast system for runtime feedback and onboarding cues.

### Camera and resilience behavior

- Manual camera fallback logic if AR.js video binding is delayed/fails.
- Video element re-parenting to ensure camera feed remains visible under WebGL canvas.
- Camera enumeration, camera switching, and preferred device persistence.
- Zoom constraints handling when supported by device/browser.

### Observability and diagnostics

- Extensive boot/runtime logging with timestamps.
- Error and unhandled rejection hooks.
- Scene introspection, script loading introspection, lifecycle and viewport logging.
- Debug panel rendering capped log buffer.

### Build/tooling quality

- TypeScript + ESLint configured.
- Multi-page Vite build configured (`main`, `ar` inputs).
- Utility script exists to generate AR QR code image.

## 4) Validation Results (current run)

From this analysis session:

- `pnpm lint` -> pass
- `pnpm typecheck` -> pass
- `pnpm build` -> pass
- Build outputs generated in `frontend/dist` with both main and AR pages.

## 5) Gaps / Risks Noted

- `frontend/plan.md` is currently modified and appears to be planning/procedure content, not strict implementation documentation.
- `public/data/chartData.json` exists, but AR rendering currently shows a placeholder box; chart-data-driven AR visuals do not appear wired yet.
- `ar/assets/models`, `ar/assets/textures`, and `ar/assets/markers` are present as scaffolds (`.gitkeep`), suggesting asset integration is pending.

## 6) Readiness Assessment

- **Foundation status:** Strong for Phase 1/WebAR scaffolding.
- **Demo readiness:** Good for marker detection + camera/HUD demo.
- **Feature completeness for “AR charts”:** Partial (infrastructure and UX are ahead of data visualization features).

## 7) Recommended Next Steps

1. Define Phase 2 implementation scope in code terms (which data maps to which AR objects/interactions).
2. Replace placeholder box with first chart primitive bound to `public/data/chartData.json`.
3. Add marker-targeted interaction states for data transitions (found/lost/lock-on mapped to chart behavior).
4. Add lightweight test checklist for mobile browsers (Android Chrome, iOS Safari limitations, permission edge cases).
5. Update root and frontend docs so plan, implementation, and deployment instructions stay synchronized.

## 8) Phase 2 Update (implemented)

Phase 2 dummy asset integration is now started in the AR page:

- Replaced the marker placeholder cube with a textured, animated Sun sphere in `frontend/ar/index.html`.
- Added a point light on the marker anchor for stronger depth cues.
- Kept external texture hosting for speed (as accepted for this phase).

HUD and event behavior updates in `frontend/ar/app.js`:

- `markerFound` now triggers HELIOS-style lock toast copy.
- `markerLost` now triggers HELIOS-style rescan toast copy.
- Marker debug payload references the solar dummy model instead of the old box.

Chart data wiring (stub-only, no visual binding yet):

- Added a safe loader for `public/data/chartData.json` and normalization logic.
- Computes a preview scale signal and logs it for future AR binding work.
- Does not mutate model scale yet (intentionally stub-only for this pass).

