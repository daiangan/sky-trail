# SkyTrail

A web-based 3D visualization tool for astrophotographers to animate capture session progress as a celestial sky dome. Traces the target's trajectory across capture nights with progressive arcs, real-time telemetry overlays, and video export.

Runs completely client-side in the browser: user files are processed locally and never leave the machine.

---

## Features

- **Local & Private Ingestion**: Reads only ASCII FITS header blocks (2880-byte chunks up to `END`). Light frame pixel data is never loaded, ensuring instant parsing and complete privacy.
- **Drag & Drop Ingestion**: Drag FITS files or directory trees directly onto the central 3D canvas or use the native folder picker.
- **3D Celestial Dome**: Interactive WebGL hemisphere (15° altitude rings, 30° azimuth meridians) with cardinal markers (N, E, S, W), configurable auto-orbit, and manual orbital camera controls.
- **Multi-Session Management**: Organize capture nights with custom or rotating color palettes, rename sessions, and reorder capture sequences.
- **Progressive Arc & Reticle Reveal**: Smooth time-series reveal of target coordinates, session-colored paths, circular dots, and a highlighted target reticle marking the active subframe position.
- **Real-Time Overlays**:
  - Accumulated exposure duration counter (`Xh YYm`).
  - Session statistics panel (subframes, processed gigabytes, capture date, night count).
  - 16-hour altitude trend mini-chart with reference altitude lines and target indicator.
- **Local Storage Persistence**: Fallback target (RA/Dec) and observatory site (Lat/Lon) coordinates persist across browser sessions.
- **In-Browser Video Export**: Frame-by-frame deterministic rendering to WebM via `MediaRecorder` and offscreen canvas compositing at 30 fps, featuring progress tracking and direct download.

---

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10+

---

## Development & Testing

```sh
npm install
npm run dev          # start Vite development server
npm run typecheck    # verify TypeScript strict types (tsc --noEmit)
npm run lint         # verify ESLint standards
npm run format       # format code via Prettier
npm test             # run Vitest test suite
```

---

## Production Build

```sh
npm run build        # compile TypeScript and generate production bundle in dist/
npm run preview      # locally preview production bundle
```

---

## Project Structure

```
src/
  fits/      FITS header block parsing & coordinate extraction
  astro/     Equatorial to horizontal (Alt/Az) celestial coordinate transforms
  model/     Data models (LightFrame, Session, Project), fallback resolution & timeline
  render/    Three.js 3D hemisphere wireframe, orbital camera, and animation controller
  ui/        Session manager, controls panel, overlay telemetry, altitude chart & dialogs
  export/    Video exporter (canvas compositing & MediaRecorder stream)
```

---

## License

MIT © Daian Gan
