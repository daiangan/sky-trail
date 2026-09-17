# SkyTrail

> **Turn your astrophotography capture sessions into stunning 3D celestial animations — right in your browser.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-3178C6.svg)](https://www.typescriptlang.org/)
[![3D Engine: Three.js](https://img.shields.io/badge/3D%20Engine-Three.js-black.svg)](https://threejs.org/)
[![Build Tool: Vite](https://img.shields.io/badge/Bundler-Vite-646CFF.svg)](https://vitejs.dev/)

🌌 **Live Web App**: [https://daiangan.github.io/sky-trail/](https://daiangan.github.io/sky-trail/)

---

## The Story & Inspiration

As astrophotographers, we spend entire nights — often spanning multiple weeks or months — hunting faint photons across the night sky. Every subframe is a small piece of a much larger journey as Earth rotates beneath the cosmos.

I was deeply inspired by the celestial dome capture progress posts on Instagram created by [@m102_astro](https://www.instagram.com/m102_astro/), which beautifully trace deep-sky targets ascending and descending across an illuminated sky dome.

I wanted a modern, zero-friction tool that _any_ astrophotographer could use immediately without needing to install Python, Conda environments, or complex desktop packages. I built **SkyTrail** during my free time and decided to release it as a free, open-source web application for the entire astrophotography community.

Whether you are shooting with a portable star tracker from a dark sky site or running a multi-night automated observatory sequence with N.I.N.A., KStars/Ekos, or ASIAIR, SkyTrail lets you visualize your progress and share it with the world.

---

## 🔒 100% Client-Side & Private (Your Data Stays Yours)

Astrophotography raw data files are massive (often tens of gigabytes per session).

- **Zero Uploads**: Your FITS files **never leave your computer**. Everything runs entirely inside your browser's local sandbox memory.
- **Instant Header-Only Ingestion**: SkyTrail reads only the leading ASCII header blocks (first 2,880 bytes up to the `END` card) using the browser's native File API. The heavy multi-megapixel image pixel arrays are never touched or loaded into memory.
- **Lightning Fast**: You can drop an entire night containing hundreds of subframes and SkyTrail will parse all coordinates, dates, and exposure telemetry in just a few milliseconds.

---

## ✨ Features at a Glance

### 🌌 3D Celestial Hemisphere

- **True Horizontal Coordinates**: Interactive 3D celestial dome with 15° altitude rings and 30° azimuth meridians.
- **Cardinal Direction Markers**: Integrated **N**, **E**, **S**, and **W** indicators aligned with the horizon.
- **Customizable Dome Appearance**: Real-time sliders for **Dome Surface Opacity** (translucent celestial glass volume) and **Dome Floor Opacity** (terrestrial ground circle).
- **Cinematic Controls**: Smooth orbit, pitch, and zoom camera controls, paired with automated turntable rotation (`°/sec`).

### 📅 Multi-Night Session Management

- **Organize by Night**: Group subframes into distinct capture sessions (e.g. "Night 1", "Night 2").
- **Custom Palette Coding**: Assign unique colors to each session to visually distinguish target tracks across different dates.
- **Drag & Drop**: Drag entire folder trees or individual `.fits`, `.fit`, or `.fts` files directly onto the central 3D canvas.
- **Manual Coordinates Fallback**: Built-in dialog to provide manual target coordinates (RA/Dec) or observatory site location (Lat/Lon) if your camera software didn't populate them. Coordinates persist automatically across browser visits.

### 📊 Real-Time Telemetry HUD (Overlays)

- **Accumulated Integration Counter**: Top-left digital badge showing cumulative exposure duration (`Xh YYm`).
- **Session Telemetry Panel**: Live statistics showing subframe count, processed data volume (GB), observation date, and session sequence.
- **16-Hour Altitude Mini-Chart**: Bottom-right HUD tracking the target's altitude curve across the session window, with 30° and 60° reference lines and a real-time tracking dot.
- **Independent Toggles**: Master overlay switch and independent visibility toggles for each HUD element.

### 🎥 Deterministic Video Export

- **Frame-by-Frame Generation**: Renders a smooth 30 fps animation walking through your timeline with exact synchronization between the 3D dome, camera rotation, and telemetry overlays.
- **Final Hold State**: Automatically pauses on the final completed arc for 2 seconds to showcase the total capture journey.
- **Ready for Social Media**: Exports directly as a high-quality WebM video ready to share on YouTube, Discord, X, or import into your favorite video editor.

---

## 🚀 How to Use (Quick Start)

1. Open [SkyTrail in your browser](https://daiangan.github.io/sky-trail/).
2. Drag and drop your FITS light frames or folder directly onto the canvas (or click **Select Folder...**).
3. If you have multiple nights, click **+ New session** in the left sidebar and add your next set of lights.
4. Customize your arc speed, camera rotation, dome opacity, and session colors in the right panel.
5. Click **▶ Play** to preview your animation.
6. Click **Export to Video…** to generate and download your video.

---

## 🛠️ Technical Architecture (For Developers)

SkyTrail is built as a pure client-side Single Page Application (SPA) designed for extreme speed, strict type safety, and zero server overhead.

### Core Stack

- **Language**: TypeScript (strict mode, zero implicit `any`)
- **3D Rendering**: [Three.js](https://threejs.org/) (WebGL with `preserveDrawingBuffer` support for video capture)
- **Celestial Mechanics**: [astronomy-engine](https://github.com/cosinekitty/astronomy) (NOVAS-derived high-precision horizontal coordinate transformations)
- **Bundler & Dev Server**: [Vite](https://vitejs.dev/)
- **Test Suite**: [Vitest](https://vitest.dev/) (20 suites, 145 unit and integration tests)
- **Code Quality**: ESLint (flat config) + Prettier

### Coordinate System & Astronomical Transforms

- **FITS Header Extraction**: Raw FITS primary headers adhere to FITS Standard 4.0. The parser extracts `DATE-OBS`, `EXPTIME`, `OBJCTRA`/`RA`, `OBJCTDEC`/`DEC`, `SITELAT`, and `SITELONG`.
- **Horizontal Conversion**: For each subframe timestamp, equatorial coordinates $(\alpha, \delta)$ are transformed to topocentric horizontal coordinates (Altitude $a$, Azimuth $A$) using the observer's geographic coordinates $(\phi, \lambda)$ and Greenwich Mean Sidereal Time (GMST).
- **Dome Orientation**: The 3D hemisphere maps $+Z$ as zenith ($a = 90^\circ$) and the $X$-$Y$ plane as the horizon ($a = 0^\circ$). Azimuth is measured clockwise from North ($0^\circ$). To match Three.js default $+Y$-up world orientation, the dome group applies an internal $X$-axis tilt of $-90^\circ$, keeping camera controls completely natural in standard orbital space.

### Deterministic Video Export Pipeline

Video generation does not rely on screen-recording hacks. Instead:

1. Playback is frozen and stepped deterministically at a fixed $\Delta t = 1/\text{fps}$.
2. Each frame triggers a synchronous WebGL scene render.
3. The WebGL canvas is composited onto an offscreen 2D canvas along with the scaled vector HUD overlays (counter, stats, altitude curve).
4. `HTMLCanvasElement.captureStream(30)` feeds the frame stream directly into the browser's native `MediaRecorder` API.

---

## 💻 Local Development & Contributing

Contributions, bug reports, and ideas from the community are warmly welcome!

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm 10+

### Setup & Commands

```sh
# Clone the repository
git clone https://github.com/daiangan/sky-trail.git
cd sky-trail/sky_trail

# Install dependencies
npm install

# Start local dev server (http://localhost:5173/)
npm run dev

# Run unit and integration tests
npm test

# Run strict TypeScript type checks
npm run typecheck

# Check code formatting & linting
npm run lint
npm run format

# Compile production bundle into dist/
npm run build
```

### Directory Structure

```
src/
├── astro/      # Equatorial (RA/Dec) to Horizontal (Alt/Az) transformations
├── export/     # Video exporter (offscreen canvas compositing & MediaRecorder)
├── fits/       # Low-level 2880-byte FITS header parser & metadata extraction
├── model/      # Data models (LightFrame, Session, Project), fallback resolution & timeline
├── render/     # Three.js 3D hemisphere wireframe, materials, camera & playback controller
└── ui/         # Session manager, controls panel, overlay telemetry HUD & dialogs
tests/          # Comprehensive Vitest test suites (145 tests)
```

---

## 🗺️ Roadmap & Future Ideas

- [ ] **Universal MP4 (H.264) Export**: Integrate `ffmpeg.wasm` as a selectable export format alongside WebM for direct mobile (iOS Camera Roll) and Instagram Reels compatibility.
- [ ] **Stacked Image Reveal**: Optional ending transition that smoothly cross-fades from the completed trajectory into your final processed astrophotography image.
- [ ] **FITS Format Extensions**: Support for additional acquisition software header conventions.

---

## ☕ Support the Project

SkyTrail is an independent passion project created in my free time and shared freely with the astronomy community. If SkyTrail has helped you showcase your astrophotography captures, consider supporting its ongoing development:

> 💙 **Support & Donations**: `[Donation link coming soon]`

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

Developed with ❤️ by **Daian Gan** ([daian@ganmedia.com](mailto:daian@ganmedia.com)).
