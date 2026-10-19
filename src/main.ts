import './style.css';

import { createProject, setFallbackCoords, type Project } from './model';
import type { DomeView } from './render/dome_view';
import type { PlaybackSnapshot } from './render/playback_controller';
import { loadFallbackCoords } from './model/persistence';
import { VideoExporter } from './export/video_exporter';
import { mountCoordinatesDialog } from './ui/coordinates_dialog';
import { mountControlsPanel } from './ui/controls_panel';
import { mountExportDialog } from './ui/export_dialog';
import { mountOverlay } from './ui/overlay';
import { mountSessionPanel, type AppState } from './ui/session_panel';
import { mountMobileLayout } from './ui/mobile_layout';
import { mountViewToolbar } from './ui/view_toolbar';
import { reportIngestFailure, setCoordinatesOpener } from './ui/ingest_feedback';
import { Store } from './ui/store';
import { showToast } from './ui/toast';
import { setupDragAndDrop, ingestFiles } from './ui/drag_drop';
import { pickDirectory, pickFiles } from './ui/file_io';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing #app mount node in index.html');
}

const remembered = loadFallbackCoords();

const initialPlayback: PlaybackSnapshot = {
  revealProgress: 0,
  revealCount: 0,
  timelineLength: 0,
  pointsPerSecond: 5,
  isPlaying: false,
  isFinished: false,
};

const initialOverlay = {
  visible: true,
  counter: true,
  stats: true,
  chart: true,
};

const initialProject: Project = setFallbackCoords(createProject('My project'), {
  raDeg: remembered.raDeg,
  decDeg: remembered.decDeg,
  latDeg: remembered.latDeg,
  lonDeg: remembered.lonDeg,
});

const initialState: AppState = {
  project: initialProject,
  selectedSessionId: null,
  loading: null,
  playback: initialPlayback,
  overlay: initialOverlay,
};

const store = new Store<AppState>(initialState);

const layout = document.createElement('div');
layout.className = 'app-layout';

const sessionPanel = document.createElement('aside');
sessionPanel.className = 'app-layout__panel app-layout__panel--left';

const canvasArea = document.createElement('main');
canvasArea.className = 'app-layout__canvas';
const canvas = document.createElement('canvas');
canvas.className = 'dome-canvas';
const overlayLayer = document.createElement('div');
overlayLayer.className = 'overlay-layer';

canvasArea.append(canvas, overlayLayer);

const controlsArea = document.createElement('aside');
controlsArea.className = 'app-layout__panel app-layout__panel--right';

const dialogLayer = document.createElement('div');
dialogLayer.className = 'dialog-layer';

const coordinatesDialogRoot = document.createElement('div');
coordinatesDialogRoot.className = 'dialog-root';

const exportDialogRoot = document.createElement('div');
exportDialogRoot.className = 'dialog-root';

dialogLayer.append(coordinatesDialogRoot, exportDialogRoot);

layout.append(sessionPanel, canvasArea, controlsArea);
root.append(layout, dialogLayer);

// Three.js is the bulk of the download, so the 3D view loads after the panels
// and the welcome screen are on screen (see `startDomeView` below).
let domeView: DomeView | null = null;
let videoExporter: VideoExporter | null = null;
let lastProject: Project = store.get().project;

mountMobileLayout({
  layout,
  canvasArea,
  sessionsPanel: sessionPanel,
  controlsPanel: controlsArea,
  store,
  onPlayPause: () => domeView?.togglePlay(),
});
mountSessionPanel(sessionPanel, store);
const overlay = mountOverlay(overlayLayer, store);

async function pickAndIngest(picker: () => Promise<{ files: File[] } | null>): Promise<void> {
  try {
    const picked = await picker();
    if (picked) await ingestFiles(picked.files, store);
  } catch (error) {
    reportIngestFailure(store, error);
  }
}

setupDragAndDrop({
  canvasArea,
  store,
  onPickFolder: () => pickAndIngest(pickDirectory),
  onPickFiles: () => pickAndIngest(pickFiles),
});

const coordinatesDialog = mountCoordinatesDialog(coordinatesDialogRoot, store);
setCoordinatesOpener(() => coordinatesDialog.open());
const exportDialog = mountExportDialog(exportDialogRoot);

const controlsApi = mountControlsPanel(controlsArea, store, {
  onPointsPerSecondChange: (value) => domeView?.setPointsPerSecond(value),
  onCameraSpeedChange: (value) => domeView?.setCameraRotationSpeed(value),
  onPointSizeChange: (value) => domeView?.setPointSize(value),
  onSurfaceOpacityChange: (value) => domeView?.setSurfaceOpacity(value),
  onFloorOpacityChange: (value) => domeView?.setFloorOpacity(value),
  onPlayPause: () => domeView?.togglePlay(),
  onSeek: (value) => domeView?.seek(value),
  onReset: () => domeView?.reset(),
  onCoordinates: () => coordinatesDialog.open(),
  onExport: () => {
    if (videoExporter) void exportDialog.open(videoExporter);
  },
});

store.subscribe((state) => {
  if (domeView && state.project !== lastProject) {
    lastProject = state.project;
    domeView.setProject(state.project);
  }
  controlsApi.setPlaybackState(store.get().playback);
});

controlsApi.setPlaybackState(store.get().playback);

/**
 * Loads Three.js and starts the 3D view. Anything the user did meanwhile is
 * carried over: the slider values become the view's initial settings, and the
 * lights already loaded are handed to it as soon as it exists.
 */
async function startDomeView(): Promise<void> {
  try {
    const { DomeView } = await import('./render/dome_view');
    const settings = controlsApi.getSettings();
    const view = new DomeView({
      canvas,
      defaultPointsPerSecond: settings.pointsPerSecond,
      defaultCameraRotationDegPerSec: settings.cameraRotationDegPerSec,
      defaultPointSize: settings.pointSize,
      defaultSurfaceOpacity: settings.surfaceOpacity,
      defaultFloorOpacity: settings.floorOpacity,
      onPlaybackChange: (snapshot) => {
        store.set((s) => ({ ...s, playback: snapshot }));
      },
    });
    domeView = view;
    videoExporter = new VideoExporter(view, overlay.getSnapshot);
    mountViewToolbar(canvasArea, view);
    lastProject = store.get().project;
    view.setProject(lastProject);
    canvas.classList.add('dome-canvas--ready');
  } catch (error) {
    console.error('Could not start the 3D view', error);
    showToast({
      kind: 'error',
      message:
        'The 3D view could not start. Check your connection and that WebGL is enabled, then reload the page.',
      durationMs: 0,
    });
  }
}

void startDomeView();
