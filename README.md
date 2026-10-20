# SkyTrail

> **Turn your astrophotography capture sessions into stunning 3D celestial animations — right in your browser.**

<a href="https://github.com/daiangan/sky-trail/actions/workflows/ci.yml" target="_blank" rel="noopener noreferrer"><img src="https://github.com/daiangan/sky-trail/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
<a href="LICENSE" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
<a href="https://www.typescriptlang.org/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Built%20with-TypeScript-3178C6.svg" alt="Built with TypeScript"></a>
<a href="https://threejs.org/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/3D%20Engine-Three.js-black.svg" alt="3D Engine: Three.js"></a>
<a href="https://vitejs.dev/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Bundler-Vite-646CFF.svg" alt="Build Tool: Vite"></a>
<a href="https://www.paypal.com/donate/?hosted_button_id=4VC6DD8AH6TRA" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Donate-PayPal-00457C.svg?logo=paypal&logoColor=white" alt="Donate via PayPal"></a>

🌌 **Live Web App**: <a href="https://daiangan.github.io/sky-trail/" target="_blank" rel="noopener noreferrer">https://daiangan.github.io/sky-trail/</a>

---

## The Story & Inspiration

As astrophotographers, we spend entire nights — often spanning multiple weeks or months — hunting faint photons across the night sky. Every subframe is a small piece of a much larger journey as Earth rotates beneath the cosmos.

I was deeply inspired by the celestial dome capture progress posts on Instagram created by <a href="https://www.instagram.com/m102_astro/" target="_blank" rel="noopener noreferrer">@m102_astro</a>, which beautifully trace deep-sky targets ascending and descending across an illuminated sky dome.

I wanted a modern, zero-friction tool that _any_ astrophotographer could use immediately without needing to install Python, Conda environments, or complex desktop packages. I built **SkyTrail** during my free time and decided to release it as a free, open-source web application for the entire astrophotography community.

Whether you are shooting with a portable star tracker from a dark sky site or running a multi-night automated observatory sequence with N.I.N.A., KStars/Ekos, or ASIAIR, SkyTrail lets you visualize your progress and share it with the world.

---

## 🔒 100% Client-Side & Private (Your Data Stays Yours)

Astrophotography raw data files are massive (often tens of gigabytes per session).

- **Zero Uploads**: Your FITS files **never leave your computer**. Everything runs entirely inside your browser's local sandbox memory.
- **Instant Header-Only Ingestion**: SkyTrail reads only the leading ASCII header blocks (the first 5,760 bytes at most, up to the `END` card) using the browser's native File API. The heavy multi-megapixel image pixel arrays are never touched or loaded into memory.
- **Lightning Fast**: You can drop an entire night containing hundreds of subframes and SkyTrail will parse all coordinates, dates, and exposure telemetry in just a few milliseconds.

---

## ✨ Features at a Glance

### 🌌 3D Celestial Hemisphere

- **True Horizontal Coordinates**: Interactive 3D celestial dome with 15° altitude rings, 30° azimuth meridians and a brighter horizon ring.
- **Cardinal Direction Markers**: Integrated **N**, **E**, **S**, and **W** indicators aligned with the horizon.
- **Glowing Arcs**: Each night's path is drawn as a soft, glowing line whose thickness follows the point size, with a pulsing marker on the current position.
- **Customizable Dome Appearance**: Real-time sliders for **Dome Surface** (translucent celestial glass volume) and **Dome Floor** (terrestrial ground circle).
- **Always Framed**: The dome stays centred and fully in view at any window size. Zoom, a move (pan) mode and a one-click recenter sit over the canvas; double-click also recenters.
- **Cinematic Controls**: Smooth orbit, pitch, and zoom camera controls, plus an automated turntable rotation (`°/sec`, a gentle 1°/sec by default; set it to 0 to keep the camera still).
- **Timeline Scrubber**: Drag the Progress slider to jump to any frame of the animation.

### 📅 Multi-Night Session Management

- **Organize by Night**: Group subframes into distinct capture sessions (e.g. "Night 1", "Night 2"), then rename, reorder or delete them.
- **Custom Palette Coding**: Assign unique colors to each session to visually distinguish target tracks across different dates. Numbered badges at the start of each arc keep nights distinguishable without relying on color.
- **Try a Demo**: No FITS files at hand? **Try a demo** on the welcome screen loads a simulated night in which a single telescope images two invented objects one after the other, and starts playing. The objects are fictional but the sky is real: positions come from the same horizontal-coordinate maths as your own lights, with an imaging cadence that includes a dither pause after every third frame. A notification explains that it is simulated and stays open until you close it; its **Clear demo** button removes the demo without touching anything you have added. **Clear all sessions**, always at the bottom of the session list, empties the project whenever you want to start over.
- **Drag & Drop**: Drag entire folder trees or individual `.fits`, `.fit`, or `.fts` files directly onto the central 3D canvas, or use **Select Folder** and **Choose Files**.
- **Works With Your Capture Software**: Headers written by N.I.N.A., ASIAIR, StellaVita/ToupTek, KStars/Ekos, APT, SharpCap and Siril are understood (see [Supported FITS headers](#supported-fits-headers)).
- **Manual Coordinates Fallback**: Built-in dialog to provide manual target coordinates (RA/Dec) or observatory site location (Lat/Lon) if your camera software didn't populate them, with a button to detect your current location. Coordinates persist automatically across browser visits.
- **Clear Feedback**: Notifications confirm what was added and flag files that aren't FITS or whose headers lack a date, target or site, with a shortcut to the coordinates dialog. A file that can't be read never leaves the app stuck.

### 📊 Real-Time Telemetry HUD (Overlays)

- **Accumulated Integration Counter and Stats**: One top-left panel showing cumulative exposure duration (`Xh YYm`), subframe count, data volume (shown in KB, MB or GB as it grows), observation date, and session sequence.
- **Altitude Chart**: Bottom-right HUD showing how high the target climbs over the whole imaging night, with a shaded band for the time you actually imaged, a UTC time axis, 30° and 60° reference lines and a dot that follows the animation.
- **Independent Toggles**: Master overlay switch and independent visibility toggles for each HUD element.
- **Movable Overlays**: Drag the stats panel and the altitude chart anywhere over the dome. Your layout is remembered between visits and used by the exported video, and **Reset overlay positions** in the settings puts them back in their default corners. Where they end up, on or off the dome and over each other, is up to you.

### 🎥 Video Export

- **Frame-by-Frame Generation**: Renders a 30 fps animation walking through your timeline with exact synchronization between the 3D dome, camera rotation, and telemetry overlays.
- **Final Hold State**: Automatically pauses on the final completed arc for 2 seconds to showcase the total capture journey.
- **Ready to Share**: Exports directly as a WebM video you can post on YouTube, Discord or X, or import into your favorite video editor.
- **Real-Time Pace**: The export runs at your configured arc speed, so a slow arc takes as long to export as it does to watch.

### 📱 Phones, Tablets & Accessibility

- **Phone & Tablet Friendly**: Below 900 px the dome fills the screen, and the sessions and controls become slide-over drawers. A small bar over the dome opens them and keeps Play and Pause within reach.
- **Keyboard Friendly**: Focus the dome to move it with the arrow keys, zoom with `+` and `-`, and recenter with `0`. Every control has a visible focus ring.
- **Screen-Reader Friendly**: Sliders announce their values and explain themselves, and the animation announces each new night and when it completes.
- **Motion Preferences**: People who prefer reduced motion get no marker pulse, no fade-in and instant recentering.
- **Readable by Design**: High-contrast text, and a single HUD panel instead of scattered badges.

---

## 🚀 How to Use (Quick Start)

1. Open <a href="https://daiangan.github.io/sky-trail/" target="_blank" rel="noopener noreferrer">SkyTrail in your browser</a>.
2. Drag and drop your FITS light frames or folder directly onto the canvas (or click **Select Folder…**). No files at hand? Click **✦ Try a demo** to see a simulated night first.
3. If you have multiple nights, click **+ New session** in the left sidebar and add your next set of lights.
4. If a notification says some lights can't be placed on the dome, open **Target & site coordinates…** and fill in what your headers lack.
5. Tune the arc speed, camera rotation, point size, dome appearance and session colors in the right panel.
6. Click **▶ Play** to preview your animation, or drag the **Progress** slider to jump to any frame.
7. Click **Export video…** to generate and download your video.

### Mouse, Keyboard & Touch

| Action              | Mouse                                      | Keyboard (dome focused) | Touch           |
| ------------------- | ------------------------------------------ | ----------------------- | --------------- |
| Rotate the view     | Drag                                       | —                       | One-finger drag |
| Move (pan) the dome | Right-drag, Shift + drag, or the move mode | Arrow keys              | Two-finger drag |
| Zoom                | Scroll, or the `+` and `-` buttons         | `+` and `-`             | Pinch           |
| Recenter the dome   | Double-click, or the recenter button       | `0`                     | Recenter button |
| Close a drawer      | Click outside it                           | `Esc`                   | Tap outside it  |

---

## 🛠️ Technical Architecture (For Developers)

SkyTrail is built as a pure client-side Single Page Application (SPA) designed for extreme speed, strict type safety, and zero server overhead.

### Core Stack

- **Language**: TypeScript (strict mode, zero implicit `any`)
- **3D Rendering**: <a href="https://threejs.org/" target="_blank" rel="noopener noreferrer">Three.js</a> (WebGL with `preserveDrawingBuffer` support for video capture, fat lines for the arcs)
- **Celestial Mechanics**: <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener noreferrer">astronomy-engine</a> (NOVAS-derived high-precision horizontal coordinate transformations)
- **Bundler & Dev Server**: <a href="https://vitejs.dev/" target="_blank" rel="noopener noreferrer">Vite</a>
- **Test Suite**: <a href="https://vitest.dev/" target="_blank" rel="noopener noreferrer">Vitest</a> (28 suites, 232 unit and integration tests)
- **Code Quality**: ESLint (flat config) + Prettier
- **CI/CD**: GitHub Actions type-check, lint, test and build every pull request and every push to `main`; the same checks gate the deployment to GitHub Pages.

### Supported FITS headers

The parser reads only the primary header and never fails on a missing keyword: anything absent simply becomes "unknown", and the manual coordinates fill the gap.

| Data                   | Keywords tried, in order                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Capture time (UTC)     | `DATE-OBS`, `DATE-AVG`, `DATE` (with `TIME-OBS`, `UT-START` or `UTC-OBS` when the date has no time) |
| Exposure               | `EXPTIME`, `EXPOSURE`                                                                               |
| Filter                 | `FILTER`, `FILTNAME`                                                                                |
| Target right ascension | `OBJCTRA`, `RA`, `CRVAL1` (sexagesimal or decimal)                                                  |
| Target declination     | `OBJCTDEC`, `DEC`, `CRVAL2` (sexagesimal or decimal)                                                |
| Site latitude          | `SITELAT`, `LATITUDE`, `OBS-LAT`, `SITELATD`                                                        |
| Site longitude         | `SITELONG`, `LONGITUD`, `OBS-LONG`, `SITELOND` (west longitudes written as 180–360° are normalised) |

Timestamps without a time zone are treated as UTC, as the FITS standard prescribes. Left to the browser they would be read as local time and rotate the dome by 15° for every hour of offset.

### Coordinate System & Astronomical Transforms

- **FITS Header Extraction**: Raw FITS primary headers adhere to FITS Standard 4.0 (80-character cards in 2,880-byte blocks).
- **Horizontal Conversion**: For each subframe timestamp, equatorial coordinates $(\alpha, \delta)$ are transformed to topocentric horizontal coordinates (Altitude $a$, Azimuth $A$) using the observer's geographic coordinates $(\phi, \lambda)$ and Greenwich Mean Sidereal Time (GMST).
- **Timeline**: Lights are ordered by their parsed capture instant, not by the raw text of `DATE-OBS`, so mixed spellings (space or `T` separator, with or without `Z` or an offset) always play in the right order.
- **Dome Orientation**: The 3D hemisphere maps $+Z$ as zenith ($a = 90^\circ$) and the $X$-$Y$ plane as the horizon ($a = 0^\circ$). Azimuth is measured clockwise from North ($0^\circ$). To match Three.js default $+Y$-up world orientation, the dome group applies an internal $X$-axis tilt of $-90^\circ$, keeping camera controls completely natural in standard orbital space.
- **Camera Framing**: The camera orbits the dome's visual centre rather than the middle of its horizon plane, and derives its distance from the field of view and the canvas aspect ratio, so the whole dome fits at any window shape.

### Performance

- **Small First Load**: The panels and the welcome screen render from about 27 kB of gzipped JavaScript and CSS. Three.js (about 142 kB gzipped, and the part that cannot shrink further) and the 3D view load right after, in the background, and the dome fades in when they arrive. Anything you do in the meantime is carried over: dropped files are loaded and handed to the view as soon as it starts, and slider values become its initial settings.
- **Cache-Friendly Chunks**: Three.js and astronomy-engine ship as separate files that rarely change, so returning visitors reuse them from the browser cache across deploys.
- **Graceful Failure**: If the 3D view cannot start (a failed download or no WebGL), a persistent notification explains it and the rest of the app keeps working.

### Demo Data

The "Try a demo" button loads simulated sessions built by a small seeded generator (`src/demo/demo_data.ts`), so the same demo appears every time and it can be tested.

- **Objects**: two invented objects ("Object 1" and "Object 2"), about 7° apart, imaged on one night by one telescope: Object 1 first (180 s exposures), then a 4 to 6 minute pause to slew, then Object 2 (240 s exposures). That is about 100 frames and 6 hours of exposure, one session per object.
- **Real sky**: nothing about the motion is faked. Each frame carries ordinary header values (date, exposure, target, site) and goes through the same horizontal-coordinate transform as a real light. The night is centred on the objects' meridian transit (`src/astro/transit.ts`), so the first arc climbs towards the meridian while the second sinks after it, and every frame is in the dark and above 30° of altitude.
- **Imaging cadence**: a few seconds of download time after every frame and a longer dither pause (15 to 30 s) after every third frame, with seeded jitter, so the dots along each arc come in groups of three.
- **Tests**: the tests check, among other things, that the frames are deterministic for a seed, that the Sun is below −18° and the objects above 30° for every frame, that the dither gaps follow the every-third-frame pattern, and that the arcs rise and fall as they should.

### Video Export Pipeline

Video generation does not rely on screen-recording hacks. Instead:

1. Playback is frozen and stepped at a fixed $\Delta t = 1/\text{fps}$.
2. Each frame triggers a synchronous WebGL scene render.
3. The WebGL canvas is composited onto an offscreen 2D canvas along with the scaled vector HUD overlays (counter, stats, altitude chart), and the frame size is snapped to even dimensions.
4. `HTMLCanvasElement.captureStream(30)` feeds the frame stream directly into the browser's native `MediaRecorder` API, paced at real time.

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
cd sky-trail

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

# Serve the production build locally
npm run preview
```

Before opening a pull request, run `npm run typecheck`, `npm run lint` and `npm test`: the CI runs the same checks.

### Directory Structure

```
src/
├── astro/      # Equatorial (RA/Dec) to Horizontal (Alt/Az) transformations, meridian transit, date and coordinate parsing
├── demo/       # Seeded generator of the simulated sessions behind "Try a demo"
├── export/     # Video exporter (offscreen canvas compositing & MediaRecorder)
├── fits/       # Low-level FITS header parser & metadata extraction
├── model/      # Data models (LightFrame, Session, Project), fallback resolution, timeline & persistence
├── render/     # Three.js dome (wireframe, arcs, camera framing), playback controller & shared defaults
└── ui/         # Session manager, controls panel, HUD overlay, altitude chart, view toolbar,
                # mobile drawers, notifications, file loading & dialogs
tests/          # Vitest test suites (232 tests), mirroring the structure of src/
```

---

## 🗺️ Roadmap & Future Ideas

- [ ] **Universal MP4 (H.264) Export**: Integrate `ffmpeg.wasm` as a selectable export format alongside WebM for direct mobile (iOS Camera Roll) and Instagram Reels compatibility. It would also allow exporting faster than real time.
- [ ] **Stacked Image Reveal**: Optional ending transition that smoothly cross-fades from the completed trajectory into your final processed astrophotography image.
- [ ] **More FITS Conventions**: If your acquisition software writes headers SkyTrail doesn't recognise, please open an issue with a sample header (the first few lines are enough).

---

## ☕ Support the Project

SkyTrail is an independent passion project created in my free time and shared freely with the astronomy community. If SkyTrail has helped you showcase your astrophotography captures, consider supporting its ongoing development:

> 💙 **Support & Donations**: <a href="https://www.paypal.com/donate/?hosted_button_id=4VC6DD8AH6TRA" target="_blank" rel="noopener noreferrer">**Donate via PayPal**</a>

---

## 📄 License

Distributed under the **MIT License**. See <a href="LICENSE" target="_blank" rel="noopener noreferrer">LICENSE</a> for more information.

Developed with ❤️ by <a href="https://daiangan.com/" target="_blank" rel="noopener noreferrer">**Daian Gan**</a>.
