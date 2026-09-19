import './style.css';

import { createProject, setFallbackCoords, type Project } from './model';
import { DomeView } from './render/dome_view';
import type { PlaybackSnapshot } from './render/playback_controller';
import { loadFallbackCoords } from './model/persistence';
import { VideoExporter } from './export/video_exporter';
import { mountCoordinatesDialog } from './ui/coordinates_dialog';
import { mountControlsPanel } from './ui/controls_panel';
import { mountExportDialog } from './ui/export_dialog';
import { mountOverlay } from './ui/overlay';
import { mountSessionPanel, type AppState } from './ui/session_panel';
import { Store } from './ui/store';
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

const githubLink = document.createElement('a');
githubLink.className = 'canvas-github-link';
githubLink.href = 'https://github.com/daiangan/sky-trail';
githubLink.target = '_blank';
githubLink.rel = 'noopener noreferrer';
githubLink.title = 'View SkyTrail on GitHub';
githubLink.setAttribute('aria-label', 'GitHub repository');
githubLink.innerHTML = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
  </svg>
  <span>GitHub</span>
`;

canvasArea.append(canvas, overlayLayer, githubLink);

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

const domeView = new DomeView({
  canvas,
  defaultPointsPerSecond: 5,
  defaultCameraRotationDegPerSec: 0,
  defaultPointSize: 6,
  onPlaybackChange: (snapshot) => {
    store.set((s) => ({ ...s, playback: snapshot }));
  },
});

mountSessionPanel(sessionPanel, store);
const overlay = mountOverlay(overlayLayer, store);

setupDragAndDrop({
  canvasArea,
  store,
  onPickFolder: async () => {
    const res = await pickDirectory();
    if (res && res.files.length > 0) {
      await ingestFiles(res.files, store);
    }
  },
  onPickFiles: async () => {
    const res = await pickFiles();
    if (res && res.files.length > 0) {
      await ingestFiles(res.files, store);
    }
  },
});

const coordinatesDialog = mountCoordinatesDialog(coordinatesDialogRoot, store);
const exportDialog = mountExportDialog(exportDialogRoot);
const videoExporter = new VideoExporter(domeView, overlay.getSnapshot);

const controlsApi = mountControlsPanel(controlsArea, store, {
  onPointsPerSecondChange: (value) => domeView.setPointsPerSecond(value),
  onCameraSpeedChange: (value) => domeView.setCameraRotationSpeed(value),
  onPointSizeChange: (value) => domeView.setPointSize(value),
  onSurfaceOpacityChange: (value) => domeView.setSurfaceOpacity(value),
  onFloorOpacityChange: (value) => domeView.setFloorOpacity(value),
  onPlayPause: () => domeView.togglePlay(),
  onReset: () => domeView.reset(),
  onCoordinates: () => coordinatesDialog.open(),
  onExport: () => {
    void exportDialog.open(videoExporter);
  },
});

domeView.setProject(store.get().project);

let lastProject: Project = store.get().project;
store.subscribe((state) => {
  if (state.project !== lastProject) {
    lastProject = state.project;
    domeView.setProject(state.project);
  }
  controlsApi.setPlaybackState(store.get().playback);
});

controlsApi.setPlaybackState(store.get().playback);
