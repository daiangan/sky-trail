/**
 * Three.js dome view. Owns the WebGL renderer, the scene graph, the
 * dome wireframe, one polyline + dots per session, and the "current
 * position" marker. Drives playback via the PlaybackController and
 * renders once per requestAnimationFrame tick.
 *
 * Conventions match the Python project's `render.dome_view`:
 *   - Z is up, azimuth is clockwise from +Y (north) toward +X (east).
 *   - DOME_RADIUS is the arbitrary scene unit; camera distance scales
 *     with it (R*3.2 by default) so the framing is the same as the
 *     desktop tool for any chosen radius.
 *   - The auto-orbit only rotates camera azimuth (deg/sec, range 0-60,
 *     default 4); the user can still drag/zoom on top of it via
 *     OrbitControls.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { Project } from '../model';
import { buildTimeline, type TimelinePoint } from '../model/timeline';
import { computeAltAz } from '../astro/altaz';
import { altAzToXyz, DOME_RADIUS, type Vec3 } from './coordinates';
import { buildDomeWireframe } from './dome_geometry';
import { PlaybackController, type PlaybackSnapshot } from './playback_controller';

export interface DomeViewOptions {
  canvas: HTMLCanvasElement;
  radius?: number;
  backgroundColor?: number;
  wireframeColor?: number;
  initialCamera?: { distance?: number; elevationDeg?: number; azimuthDeg?: number };
  defaultPointSize?: number;
  defaultCameraRotationDegPerSec?: number;
  defaultPointsPerSecond?: number;
  onPlaybackChange?: (snapshot: PlaybackSnapshot) => void;
}

const DEFAULT_INITIAL_ELEVATION_DEG = 15;
const DEFAULT_INITIAL_AZIMUTH_DEG = 45;
const DEFAULT_CAMERA_ROTATION_DEG_PER_SEC = 4;

export class DomeView {
  private readonly canvas: HTMLCanvasElement;
  private readonly radius: number;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly playback: PlaybackController;
  private readonly domeGroup: THREE.Group;
  private readonly wireframe: THREE.LineSegments;
  private readonly wireframeMaterial: THREE.LineBasicMaterial;
  private readonly sessionArcs = new Map<number, THREE.LineSegments>();
  private readonly sessionDots = new Map<number, THREE.Points>();
  private readonly currentMarker: THREE.Points;
  private readonly currentMarkerMaterial: THREE.PointsMaterial;
  private pointSize: number;
  private cameraRotationDegPerSec: number;
  private rafHandle: number | null = null;
  private lastFrameTime: number | null = null;
  private project: Project | null = null;
  private timeline: TimelinePoint[] = [];
  private resolvedPositions = new Map<string, Vec3>();

  private readonly dotTexture: THREE.CanvasTexture;
  private readonly ringTexture: THREE.CanvasTexture;
  private readonly cardinalSprites: THREE.Sprite[] = [];

  constructor(options: DomeViewOptions) {
    this.canvas = options.canvas;
    this.radius = options.radius ?? DOME_RADIUS;
    this.pointSize = options.defaultPointSize ?? 6;
    this.cameraRotationDegPerSec =
      options.defaultCameraRotationDegPerSec ?? DEFAULT_CAMERA_ROTATION_DEG_PER_SEC;
    this.playback = new PlaybackController();
    if (options.defaultPointsPerSecond !== undefined) {
      this.playback.setPointsPerSecond(options.defaultPointsPerSecond);
    }
    if (options.onPlaybackChange) {
      this.playback.subscribe(options.onPlaybackChange);
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(options.backgroundColor ?? 0x080a12, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(options.backgroundColor ?? 0x080a12);

    // The dome geometry uses +Z as zenith (matching the Alt/Az convention
    // from astronomy-engine and astropy), but Three.js's default up axis is
    // +Y. Rotate the entire dome group by -90 deg around X so the zenith
    // appears at the top of the rendered scene. Everything that lives in
    // Alt/Az world coordinates (wireframe, session arcs, dots, current
    // marker) is added to this group; the camera stays in standard Three.js
    // Y-up space.
    this.domeGroup = new THREE.Group();
    this.domeGroup.rotation.x = -Math.PI / 2;
    this.scene.add(this.domeGroup);

    const initialDistance = options.initialCamera?.distance ?? this.radius * 3.2;
    const initialElevationDeg =
      options.initialCamera?.elevationDeg ?? DEFAULT_INITIAL_ELEVATION_DEG;
    const initialAzimuthDeg = options.initialCamera?.azimuthDeg ?? DEFAULT_INITIAL_AZIMUTH_DEG;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.positionCameraFromSpherical(initialDistance, initialElevationDeg, initialAzimuthDeg);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = this.radius * 1.2;
    this.controls.maxDistance = this.radius * 12;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    const wireframe = buildDomeWireframe(this.radius);
    this.wireframeMaterial = new THREE.LineBasicMaterial({
      color: options.wireframeColor ?? 0x668cb8,
      transparent: true,
      opacity: 0.35,
      linewidth: 1,
    });
    const wireframeGeometry = new THREE.BufferGeometry();
    wireframeGeometry.setAttribute('position', new THREE.BufferAttribute(wireframe.positions, 3));
    this.wireframe = new THREE.LineSegments(wireframeGeometry, this.wireframeMaterial);
    this.domeGroup.add(this.wireframe);

    this.dotTexture = createDotTexture();
    this.ringTexture = createRingTexture();

    this.currentMarkerMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: this.pointSize * 2.8,
      sizeAttenuation: false,
      map: this.ringTexture,
      transparent: true,
      alphaTest: 0.05,
    });
    const markerGeometry = new THREE.BufferGeometry();
    markerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    this.currentMarker = new THREE.Points(markerGeometry, this.currentMarkerMaterial);
    this.currentMarker.visible = false;
    this.domeGroup.add(this.currentMarker);

    // Cardinal markers along the horizon ring (N, E, S, W)
    const cardinals = [
      { label: 'N', x: 0, y: this.radius * 1.06, z: 0 },
      { label: 'E', x: this.radius * 1.06, y: 0, z: 0 },
      { label: 'S', x: 0, y: -this.radius * 1.06, z: 0 },
      { label: 'W', x: -this.radius * 1.06, y: 0, z: 0 },
    ];
    for (const card of cardinals) {
      const sprite = createCardinalSprite(card.label);
      sprite.position.set(card.x, card.y, card.z);
      this.domeGroup.add(sprite);
      this.cardinalSprites.push(sprite);
    }

    this.resize();
    window.addEventListener('resize', this.resize);
    this.start();
  }

  setProject(project: Project): void {
    this.project = project;
    this.rebuildArcs();
  }

  setPointsPerSecond(value: number): void {
    this.playback.setPointsPerSecond(value);
  }

  setCameraRotationSpeed(degPerSec: number): void {
    this.cameraRotationDegPerSec = degPerSec;
  }

  setPointSize(size: number): void {
    this.pointSize = Math.max(1, size);
    this.currentMarkerMaterial.size = this.pointSize * 2.8;
    for (const dots of this.sessionDots.values()) {
      const material = dots.material as THREE.PointsMaterial;
      material.size = this.pointSize;
    }
  }

  play(): void {
    this.playback.play();
  }

  pause(): void {
    this.playback.pause();
  }

  /** Pauses both playback and the render loop so a manual driver (e.g. the
   *  video exporter) can drive frames one at a time. */
  freeze(): void {
    this.playback.pause();
    this.stop();
  }

  /** Resumes the render loop after `freeze()` was called. */
  resume(): void {
    this.start();
  }

  togglePlay(): void {
    this.playback.togglePlay();
  }

  reset(): void {
    this.playback.reset();
  }

  /** Advance the playback controller by `dt` seconds without touching the
   *  RAF loop -- used by the video exporter between rendered frames. */
  tickPlayback(dt: number): void {
    this.playback.advance(dt);
    this.applyAutoOrbit(dt);
    this.updateRevealedPoints(this.playback.snapshot().revealCount);
  }

  /** Advance auto-orbit and render one frame during final hold. */
  renderHoldFrame(dt: number): void {
    this.applyAutoOrbit(dt);
    this.renderOnce();
  }

  /** Render one frame to the WebGL canvas (no playback advance). */
  renderOnce(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getCanvasDimensions(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  getPointsPerSecond(): number {
    return this.playback.getPointsPerSecond();
  }

  playbackLength(): number {
    return this.playback.snapshot().timelineLength;
  }

  onPlaybackChange(listener: (snapshot: PlaybackSnapshot) => void): () => void {
    return this.playback.subscribe(listener);
  }

  resize = (): void => {
    const { clientWidth, clientHeight } = this.canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.wireframeMaterial.dispose();
    this.currentMarkerMaterial.dispose();
    this.wireframe.geometry.dispose();
    this.currentMarker.geometry.dispose();
    this.dotTexture.dispose();
    this.ringTexture.dispose();
    for (const sprite of this.cardinalSprites) {
      this.domeGroup.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    for (const arc of this.sessionArcs.values()) {
      arc.geometry.dispose();
      (arc.material as THREE.Material).dispose();
    }
    for (const dots of this.sessionDots.values()) {
      dots.geometry.dispose();
      (dots.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
  }

  private start(): void {
    if (this.rafHandle !== null) return;
    const loop = (now: number) => {
      this.rafHandle = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  private stop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private tick(now: number): void {
    const lastTime = this.lastFrameTime ?? now;
    const dt = Math.max(0, Math.min(0.1, (now - lastTime) / 1000));
    this.lastFrameTime = now;

    this.playback.tick(dt);
    this.applyAutoOrbit(dt);
    this.updateRevealedPoints(this.playback.snapshot().revealCount);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private applyAutoOrbit(dt: number): void {
    if (this.cameraRotationDegPerSec <= 0) return;
    const angle = ((this.cameraRotationDegPerSec * Math.PI) / 180) * dt;
    if (angle === 0) return;
    const target = this.controls.target;
    const dx = this.camera.position.x - target.x;
    const dz = this.camera.position.z - target.z;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.camera.position.x = target.x + dx * cos - dz * sin;
    this.camera.position.z = target.z + dx * sin + dz * cos;
    this.camera.lookAt(target);
  }

  private positionCameraFromSpherical(
    distance: number,
    elevationDeg: number,
    azimuthDeg: number,
  ): void {
    const elevation = (elevationDeg * Math.PI) / 180;
    const azimuth = (azimuthDeg * Math.PI) / 180;
    this.camera.position.set(
      distance * Math.cos(elevation) * Math.sin(azimuth),
      distance * Math.sin(elevation),
      distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    this.camera.lookAt(0, 0, 0);
  }

  private rebuildArcs(): void {
    for (const arc of this.sessionArcs.values()) {
      this.domeGroup.remove(arc);
      arc.geometry.dispose();
      (arc.material as THREE.Material).dispose();
    }
    for (const dots of this.sessionDots.values()) {
      this.domeGroup.remove(dots);
      dots.geometry.dispose();
      (dots.material as THREE.Material).dispose();
    }
    this.sessionArcs.clear();
    this.sessionDots.clear();
    this.currentMarker.visible = false;

    if (!this.project) return;
    this.timeline = buildTimeline(this.project);
    this.resolvedPositions = resolveTimelinePositions(this.timeline);
    this.playback.setTimelineLength(this.timeline.length);

    const project = this.project;
    for (let i = 0; i < project.sessions.length; i += 1) {
      const session = project.sessions[i]!;
      const color = new THREE.Color(session.color);
      const arcPositions = this.timeline
        .filter((point) => point.nightIndex === i + 1)
        .map((point) => this.resolvedPositions.get(point.light.path) ?? null);

      const arcGeometry = new THREE.BufferGeometry();
      arcGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(filteredToFloat32(arcPositions), 3),
      );
      const arcMaterial = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
      });
      const arc = new THREE.Line(arcGeometry, arcMaterial);
      this.domeGroup.add(arc);
      this.sessionArcs.set(i, arc as unknown as THREE.LineSegments);

      const dotsGeometry = new THREE.BufferGeometry();
      dotsGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(filteredToFloat32(arcPositions), 3),
      );
      const dotsMaterial = new THREE.PointsMaterial({
        color,
        size: this.pointSize,
        sizeAttenuation: false,
        map: this.dotTexture,
        transparent: true,
        alphaTest: 0.1,
      });
      const dots = new THREE.Points(dotsGeometry, dotsMaterial);
      this.domeGroup.add(dots);
      this.sessionDots.set(i, dots);
    }

    this.updateRevealedPoints(0);
  }

  private updateRevealedPoints(revealCount: number): void {
    const clamped = Math.max(0, Math.min(revealCount, this.timeline.length));

    // Count how many points belonging to each session appear in the revealed portion
    const sessionPointCounts = new Map<number, number>();
    for (let i = 0; i < clamped; i += 1) {
      const sessionIndex = this.timeline[i]!.nightIndex - 1;
      sessionPointCounts.set(sessionIndex, (sessionPointCounts.get(sessionIndex) ?? 0) + 1);
    }

    const sessionTotal = this.project?.sessions.length ?? 0;
    for (let s = 0; s < sessionTotal; s += 1) {
      const count = sessionPointCounts.get(s) ?? 0;
      const dots = this.sessionDots.get(s);
      if (dots) {
        (dots.geometry as THREE.BufferGeometry).setDrawRange(0, count);
      }
      const arc = this.sessionArcs.get(s);
      if (arc) {
        (arc.geometry as THREE.BufferGeometry).setDrawRange(0, count);
      }
    }

    if (clamped > 0) {
      const lastPoint = this.timeline[clamped - 1]!;
      const pos = this.resolvedPositions.get(lastPoint.light.path);
      if (pos) {
        const geometry = this.currentMarker.geometry as THREE.BufferGeometry;
        const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
        attr.setXYZ(0, pos.x, pos.y, pos.z);
        attr.needsUpdate = true;
        const session = this.project?.sessions[lastPoint.nightIndex - 1];
        if (session) {
          this.currentMarkerMaterial.color = new THREE.Color(session.color);
        }
        this.currentMarker.visible = true;
      }
    } else {
      this.currentMarker.visible = false;
    }
  }
}

function resolveTimelinePositions(timeline: readonly TimelinePoint[]): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  for (const point of timeline) {
    const light = point.light;
    if (light.altDeg !== null && light.azDeg !== null) {
      out.set(light.path, altAzToXyz(light.altDeg, light.azDeg));
      continue;
    }
    if (
      light.objRaDeg === null ||
      light.objDecDeg === null ||
      light.siteLatDeg === null ||
      light.siteLonDeg === null ||
      !light.dateObs
    ) {
      continue;
    }
    const when = new Date(light.dateObs);
    if (Number.isNaN(when.getTime())) continue;
    const { altitudeDeg, azimuthDeg } = computeAltAz(
      when,
      {
        latitudeDeg: light.siteLatDeg,
        longitudeDeg: light.siteLonDeg,
      },
      { raDeg: light.objRaDeg, decDeg: light.objDecDeg },
    );
    out.set(light.path, altAzToXyz(altitudeDeg, azimuthDeg));
  }
  return out;
}

function filteredToFloat32(positions: Array<Vec3 | null>): Float32Array {
  const out = new Float32Array(positions.length * 3);
  for (let i = 0; i < positions.length; i += 1) {
    const p = positions[i];
    if (!p) continue;
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
  return out;
}

function createDotTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const center = size / 2;
    const grad = ctx.createRadialGradient(center, center, 0, center, center, center * 0.95);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(center, center, center * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function createRingTexture(): THREE.CanvasTexture {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const center = size / 2;
    // Outer reticle ring
    ctx.beginPath();
    ctx.arc(center, center, center * 0.72, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Subtle inner glowing dot
    ctx.beginPath();
    ctx.arc(center, center, center * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function createCardinalSprite(label: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(130, 165, 215, 0.85)';
    ctx.fillText(label, 32, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.4, 1.4, 1.4);
  return sprite;
}
