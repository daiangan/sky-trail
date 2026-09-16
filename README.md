# SkyTrail

Web client for visualizing astrophotography capture progress as a 3D sky dome.
Runs entirely in the browser; files never leave the user's machine.

## Status

Under active development. See `prompt-web-migration-skytrail.md` (in the parent
folder) for the full specification and phased plan.

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10+

## Development

```sh
npm install
npm run dev          # start Vite dev server
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run format       # Prettier (write)
npm test             # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
```

## Build

```sh
npm run build        # type-check + production bundle into dist/
npm run preview      # serve the production bundle locally
```

## Deployment

Configured for Vercel out of the box (`vercel.json`). Swap to Netlify or
GitHub Pages by replacing the deploy config — no app code changes required.

## Layout

```
src/
  fits/    FITS header parsing (Phase 1)
  astro/   Alt/Az calculation (Phase 2)
  model/   LightFrame / Session / Project (Phase 2)
  render/  Three.js dome + arc (Phase 4)
  ui/      Control panels, overlay (Phases 3 + 5)
  export/  Video export (Phase 6)
```
