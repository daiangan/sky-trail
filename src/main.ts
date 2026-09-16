import './style.css';

import { createProject } from './model';
import { DomeView } from './render/dome_view';
import type { PlaybackSnapshot } from './render/playback_controller';
import { mountSessionPanel, type AppState } from './ui/session_panel';
import { Store } from './ui/store';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing #app mount node in index.html');
}

const initialPlayback: PlaybackSnapshot = {
  revealProgress: 0,
  revealCount: 0,
  timelineLength: 0,
  pointsPerSecond: 5,
  isPlaying: false,
  isFinished: false,
};

const initialState: AppState = {
  project: createProject('My project'),
  selectedSessionId: null,
  loading: null,
  playback: initialPlayback,
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
canvasArea.appendChild(canvas);

const controlsArea = document.createElement('aside');
controlsArea.className = 'app-layout__panel app-layout__panel--right';
controlsArea.innerHTML = `
  <div class="controls-placeholder">
    <h2 class="controls-placeholder__title">Controls</h2>
    <p class="controls-placeholder__hint">Phase 5 will land here.</p>
  </div>
`;

layout.append(sessionPanel, canvasArea, controlsArea);
root.replaceChildren(layout);

const domeView = new DomeView({
  canvas,
  onPlaybackChange: (snapshot) => {
    store.set((s) => ({ ...s, playback: snapshot }));
  },
});

mountSessionPanel(sessionPanel, store);

store.subscribe((state) => {
  domeView.setProject(state.project);
});
domeView.setProject(store.get().project);
