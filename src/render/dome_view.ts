/**
 * Three.js dome view. Owns the WebGL renderer, the scene graph, the
 * dome wireframe, one polyline + dots per session, and the "current
 * position" marker. Drives playback via the PlaybackController and
 * renders once per requestAnimationFrame tick.
 *
 * Conventions match the Python project's `render.dome_view`:
 *   - Z is up, azimuth is clockwise from +Y (north) toward +X (east).
 *   - DOME_RADIUS is the arbitrary scene unit. The camera orbits the
 *     dome's visual centre and its distance is derived from the field of
 *     view and canvas aspect, so the whole dome is framed and centred for
 *     any window shape (see camera_framing.ts). Until the user moves the
 *     camera the framing follows resizes; `recenter()` restores it.
 *   - The auto-orbit only rotates camera azimuth (deg/sec, range 0-60,
 *     default 4); the user can still drag/zoom on top of it via
 *     OrbitControls.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import type { Project } from '../model';
import { buildTimeline, type TimelinePoint } from '../model/timeline';
import { computeAltAz } from '../astro/altaz';
import { parseFitsDate } from '../astro/date_parse';
import { computeDomeFraming } from './camera_framing';
import { altAzToXyz, DOME_RADIUS, type Vec3 } from './coordinates';
import {
  DEFAULT_CAMERA_ROTATION_DEG_PER_SEC,
  DEFAULT_FLOOR_OPACITY,
  DEFAULT_SURFACE_OPACITY,
} from './defaults';
import { buildDomeWireframe } from './dome_geometry';
import { PlaybackController, type PlaybackSnapshot } from './playback_controller';

export interface DomeViewOptions {
  canvas: HTMLCanvasElement;
  radius?: number;
  backgroundColor?: number;
  wireframeColor?: number;
  initialCamera?: { elevationDeg?: number; azimuthDeg?: number };
  defaultPointSize?: number;
  defaultCameraRotationDegPerSec?: number;
  defaultPointsPerSecond?: number;
  defaultSurfaceOpacity?: number;
  defaultFloorOpacity?: number;
  onPlaybackChange?: (snapshot: PlaybackSnapshot) => void;
}

const DEFAULT_INITIAL_ELEVATION_DEG = 15;
const DEFAULT_INITIAL_AZIMUTH_DEG = 45;

export type InteractionMode = 'orbit' | 'pan';

interface SessionLayer {
  /** Bright arc line; null when the session has fewer than two positioned points. */
  core: Line2 | null;
  /** Wide, soft additive line underneath the core that gives the arc its glow. */
  glow: Line2 | null;
  dots: THREE.Points;
}

interface CameraTween {
  elapsed: number;
  duration: number;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
}

const RECENTER_SECONDS = 0.55;
const ZOOM_STEP = 1.25;
const MARKER_PULSE_HZ = 0.7;

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
  private readonly horizonRing: THREE.LineSegments;
  private readonly horizonMaterial: THREE.LineBasicMaterial;
  private readonly surfaceMesh: THREE.Mesh;
  private readonly surfaceMaterial: THREE.MeshBasicMaterial;
  private readonly floorMesh: THREE.Mesh;
  private readonly floorMaterial: THREE.MeshBasicMaterial;
  private readonly layers = new Map<number, SessionLayer>();
  private readonly currentMarker: THREE.Points;
  private readonly currentMarkerMaterial: THREE.PointsMaterial;
  private readonly markerHalo: THREE.Points;
  private readonly markerHaloMaterial: THREE.PointsMaterial;
  private pointSize: number;
  private cameraRotationDegPerSec: number;
  private rafHandle: number | null = null;
  private lastFrameTime: number | null = null;
  private project: Project | null = null;
  private timeline: TimelinePoint[] = [];
  private resolvedPositions = new Map<string, Vec3>();

  private readonly initialElevationRad: number;
  private readonly initialAzimuthRad: number;
  private userMovedCamera = false;
  private hasFramed = false;
  private cameraTween: CameraTween | null = null;
  private interactionMode: InteractionMode = 'orbit';
  private readonly cameraInteractionListeners = new Set<() => void>();
  private readonly resizeObserver: ResizeObserver;

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

    this.initialElevationRad =
      ((options.initialCamera?.elevationDeg ?? DEFAULT_INITIAL_ELEVATION_DEG) * Math.PI) / 180;
    this.initialAzimuthRad =
      ((options.initialCamera?.azimuthDeg ?? DEFAULT_INITIAL_AZIMUTH_DEG) * Math.PI) / 180;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = this.radius * 1.2;
    this.controls.maxDistance = this.radius * 12;
    this.controls.addEventListener('start', this.handleCameraStart);
    this.canvas.addEventListener('dblclick', this.handleDoubleClick);

    const wireframe = buildDomeWireframe(this.radius);
    const horizonVertexCount = wireframe.horizonSegments * 2 * 3;
    this.wireframeMaterial = new THREE.LineBasicMaterial({
      color: options.wireframeColor ?? 0x7ea3d6,
      transparent: true,
      opacity: 0.42,
      linewidth: 1,
    });
    const wireframeGeometry = new THREE.BufferGeometry();
    wireframeGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(wireframe.positions.slice(horizonVertexCount), 3),
    );
    this.wireframe = new THREE.LineSegments(wireframeGeometry, this.wireframeMaterial);
    this.domeGroup.add(this.wireframe);

    // The horizon ring is brighter than the other rings: it is the edge of the
    // visible sky and anchors the whole dome.
    this.horizonMaterial = new THREE.LineBasicMaterial({
      color: 0xa9c6ee,
      transparent: true,
      opacity: 0.85,
      linewidth: 1,
    });
    const horizonGeometry = new THREE.BufferGeometry();
    horizonGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(wireframe.positions.slice(0, horizonVertexCount), 3),
    );
    this.horizonRing = new THREE.LineSegments(horizonGeometry, this.horizonMaterial);
    this.domeGroup.add(this.horizonRing);

    // Dome surface hemisphere
    const surfaceGeometry = new THREE.SphereGeometry(
      this.radius * 0.998,
      64,
      32,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    surfaceGeometry.rotateX(Math.PI / 2);
    const initialSurfaceOpacity = options.defaultSurfaceOpacity ?? DEFAULT_SURFACE_OPACITY;
    this.surfaceMaterial = new THREE.MeshBasicMaterial({
      color: 0x162842,
      transparent: true,
      opacity: initialSurfaceOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.surfaceMesh = new THREE.Mesh(surfaceGeometry, this.surfaceMaterial);
    this.surfaceMesh.visible = initialSurfaceOpacity > 0.001;
    this.domeGroup.add(this.surfaceMesh);

    // Dome floor circle (horizon ground plane)
    const floorGeometry = new THREE.CircleGeometry(this.radius * 0.998, 64);
    const initialFloorOpacity = options.defaultFloorOpacity ?? DEFAULT_FLOOR_OPACITY;
    this.floorMaterial = new THREE.MeshBasicMaterial({
      color: 0x0a1322,
      transparent: true,
      opacity: initialFloorOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.floorMesh = new THREE.Mesh(floorGeometry, this.floorMaterial);
    this.floorMesh.visible = initialFloorOpacity > 0.001;
    this.domeGroup.add(this.floorMesh);

    this.dotTexture = createDotTexture();
    this.ringTexture = createRingTexture();

    const markerGeometry = new THREE.BufferGeometry();
    markerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));

    // Soft additive halo behind the marker ring; both pulse gently while idle.
    this.markerHaloMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: this.pointSize * 7,
      sizeAttenuation: false,
      map: this.dotTexture,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.markerHalo = new THREE.Points(markerGeometry, this.markerHaloMaterial);
    this.markerHalo.visible = false;
    this.domeGroup.add(this.markerHalo);

    this.currentMarkerMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: this.pointSize * 2.8,
      sizeAttenuation: false,
      map: this.ringTexture,
      transparent: true,
      alphaTest: 0.05,
    });
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
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
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
    this.markerHaloMaterial.size = this.pointSize * 7;
    for (const layer of this.layers.values()) {
      (layer.dots.material as THREE.PointsMaterial).size = this.pointSize;
    }
    this.applyArcWidths();
  }

  setSurfaceOpacity(opacity: number): void {
    const clamped = Math.max(0, Math.min(1, opacity));
    this.surfaceMaterial.opacity = clamped;
    this.surfaceMesh.visible = clamped > 0.001;
  }

  getSurfaceOpacity(): number {
    return this.surfaceMaterial.opacity;
  }

  setFloorOpacity(opacity: number): void {
    const clamped = Math.max(0, Math.min(1, opacity));
    this.floorMaterial.opacity = clamped;
    this.floorMesh.visible = clamped > 0.001;
  }

  getFloorOpacity(): number {
    return this.floorMaterial.opacity;
  }

  // -- camera interaction ---------------------------------------------------

  /** Smoothly returns to the centred, fully framed view, keeping the current viewing angle. */
  recenter(): void {
    this.userMovedCamera = false;
    const destination = this.framingDestination(true);
    this.cameraTween = {
      elapsed: 0,
      duration: RECENTER_SECONDS,
      fromTarget: this.controls.target.clone(),
      toTarget: destination.target,
      fromPosition: this.camera.position.clone(),
      toPosition: destination.position,
    };
  }

  zoomBy(factor: number): void {
    this.cameraTween = null;
    this.userMovedCamera = true;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(
      offset.length() * factor,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    this.camera.position.copy(this.controls.target).add(offset.setLength(distance));
  }

  zoomIn(): void {
    this.zoomBy(1 / ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoomBy(ZOOM_STEP);
  }

  /** In 'pan' mode a plain drag moves the dome; in 'orbit' mode it rotates the view. */
  setInteractionMode(mode: InteractionMode): void {
    this.interactionMode = mode;
    this.controls.mouseButtons.LEFT = mode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.controls.touches.ONE = mode === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  }

  getInteractionMode(): InteractionMode {
    return this.interactionMode;
  }

  /** Fires when the user starts dragging or zooming the view. Returns an unsubscribe function. */
  onCameraInteraction(listener: () => void): () => void {
    this.cameraInteractionListeners.add(listener);
    return () => {
      this.cameraInteractionListeners.delete(listener);
    };
  }

  private readonly handleCameraStart = (): void => {
    this.cameraTween = null;
    this.userMovedCamera = true;
    for (const listener of this.cameraInteractionListeners) listener();
  };

  private readonly handleDoubleClick = (): void => {
    this.recenter();
  };

  /** Where the camera should sit to frame the whole dome, optionally keeping the current angle. */
  private framingDestination(keepAngles: boolean): {
    target: THREE.Vector3;
    position: THREE.Vector3;
  } {
    const { targetY, distance } = computeDomeFraming({
      radius: this.radius,
      verticalFovDeg: this.camera.fov,
      aspect: this.camera.aspect,
    });
    const target = new THREE.Vector3(0, targetY, 0);
    let azimuth = this.initialAzimuthRad;
    let elevation = this.initialElevationRad;
    if (keepAngles) {
      const spherical = new THREE.Spherical().setFromVector3(
        this.camera.position.clone().sub(this.controls.target),
      );
      azimuth = spherical.theta;
      elevation = Math.PI / 2 - spherical.phi;
    }
    const position = new THREE.Vector3(
      distance * Math.cos(elevation) * Math.sin(azimuth),
      distance * Math.sin(elevation),
      distance * Math.cos(elevation) * Math.cos(azimuth),
    ).add(target);
    return { target, position };
  }

  private fitCameraNow(): void {
    const destination = this.framingDestination(this.hasFramed);
    this.hasFramed = true;
    this.controls.target.copy(destination.target);
    this.camera.position.copy(destination.position);
    this.camera.lookAt(destination.target);
    this.controls.update();
  }

  private advanceCameraTween(dt: number): void {
    const tween = this.cameraTween;
    if (!tween) return;
    tween.elapsed += dt;
    const progress = Math.min(1, tween.elapsed / tween.duration);
    const eased = 1 - (1 - progress) ** 3;
    this.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
    this.camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
    this.camera.lookAt(this.controls.target);
    if (progress >= 1) this.cameraTween = null;
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
    for (const layer of this.layers.values()) {
      for (const line of [layer.core, layer.glow]) {
        line?.material.resolution.set(clientWidth, clientHeight);
      }
    }
    if (!this.userMovedCamera && !this.cameraTween) this.fitCameraNow();
  };

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('start', this.handleCameraStart);
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
    this.controls.dispose();
    this.wireframeMaterial.dispose();
    this.horizonMaterial.dispose();
    this.currentMarkerMaterial.dispose();
    this.markerHaloMaterial.dispose();
    this.wireframe.geometry.dispose();
    this.horizonRing.geometry.dispose();
    this.currentMarker.geometry.dispose();
    this.surfaceMesh.geometry.dispose();
    this.surfaceMaterial.dispose();
    this.floorMesh.geometry.dispose();
    this.floorMaterial.dispose();
    this.dotTexture.dispose();
    this.ringTexture.dispose();
    for (const sprite of this.cardinalSprites) {
      this.domeGroup.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    this.disposeLayers();
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
    this.advanceCameraTween(dt);
    this.updateRevealedPoints(this.playback.snapshot().revealCount);
    this.pulseMarker(now / 1000);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private pulseMarker(seconds: number): void {
    const pulse = 1 + 0.12 * Math.sin(seconds * 2 * Math.PI * MARKER_PULSE_HZ);
    this.currentMarkerMaterial.size = this.pointSize * 2.8 * pulse;
    this.markerHaloMaterial.size = this.pointSize * 7 * pulse;
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

  private arcCoreWidth(): number {
    return Math.min(9, Math.max(1.5, this.pointSize * 0.45));
  }

  private applyArcWidths(): void {
    const core = this.arcCoreWidth();
    for (const layer of this.layers.values()) {
      if (layer.core) layer.core.material.linewidth = core;
      if (layer.glow) layer.glow.material.linewidth = core * 3.5;
    }
  }

  private disposeLayers(): void {
    for (const layer of this.layers.values()) {
      for (const line of [layer.core, layer.glow]) {
        if (!line) continue;
        this.domeGroup.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      }
      this.domeGroup.remove(layer.dots);
      layer.dots.geometry.dispose();
      (layer.dots.material as THREE.Material).dispose();
    }
    this.layers.clear();
  }

  private makeArcLine(flat: Float32Array, color: THREE.Color, width: number, glow: boolean): Line2 {
    const geometry = new LineGeometry();
    geometry.setPositions(flat);
    const material = new LineMaterial({
      color,
      linewidth: width,
      transparent: true,
      opacity: glow ? 0.22 : 1,
      depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    material.resolution.set(this.canvas.clientWidth || 1, this.canvas.clientHeight || 1);
    const line = new Line2(geometry, material);
    line.frustumCulled = false;
    return line;
  }

  private rebuildArcs(): void {
    this.disposeLayers();
    this.currentMarker.visible = false;
    this.markerHalo.visible = false;

    if (!this.project) return;
    this.timeline = buildTimeline(this.project);
    this.resolvedPositions = resolveTimelinePositions(this.timeline);
    this.playback.setTimelineLength(this.timeline.length);

    const project = this.project;
    const coreWidth = this.arcCoreWidth();
    for (let i = 0; i < project.sessions.length; i += 1) {
      const session = project.sessions[i]!;
      const color = new THREE.Color(session.color);
      const arcPositions = this.timeline
        .filter((point) => point.nightIndex === i + 1)
        .map((point) => this.resolvedPositions.get(point.light.path) ?? null);
      const flat = filteredToFloat32(arcPositions);

      let core: Line2 | null = null;
      let glow: Line2 | null = null;
      if (flat.length >= 6) {
        glow = this.makeArcLine(flat, color, coreWidth * 3.5, true);
        core = this.makeArcLine(flat, color, coreWidth, false);
        this.domeGroup.add(glow, core);
      }

      const dotsGeometry = new THREE.BufferGeometry();
      dotsGeometry.setAttribute('position', new THREE.BufferAttribute(flat, 3));
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
      this.layers.set(i, { core, glow, dots });
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

    for (const [sessionIndex, layer] of this.layers) {
      const count = sessionPointCounts.get(sessionIndex) ?? 0;
      layer.dots.geometry.setDrawRange(0, count);
      for (const line of [layer.core, layer.glow]) {
        if (line) line.geometry.instanceCount = Math.max(0, count - 1);
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
          this.currentMarkerMaterial.color.set(session.color);
          this.markerHaloMaterial.color.set(session.color);
        }
        this.currentMarker.visible = true;
        this.markerHalo.visible = true;
      }
    } else {
      this.currentMarker.visible = false;
      this.markerHalo.visible = false;
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
    const when = parseFitsDate(light.dateObs);
    if (!when) continue;
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
