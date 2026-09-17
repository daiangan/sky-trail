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
