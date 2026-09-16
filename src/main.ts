import './style.css';

import { createProject } from './model';
import { mountSessionPanel, type AppState } from './ui/session_panel';
import { Store } from './ui/store';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing #app mount node in index.html');
}

const initialState: AppState = {
  project: createProject('My project'),
  selectedSessionId: null,
  loading: null,
};

const store = new Store<AppState>(initialState);

const layout = document.createElement('div');
layout.className = 'app-layout';

const sessionPanel = document.createElement('aside');
sessionPanel.className = 'app-layout__panel app-layout__panel--left';

const canvasArea = document.createElement('main');
canvasArea.className = 'app-layout__canvas';
canvasArea.innerHTML = `
  <div class="canvas-placeholder">
    <h1 class="canvas-placeholder__title">SkyTrail</h1>
    <p class="canvas-placeholder__subtitle">3D sky-dome preview — Phase 4 will render here.</p>
    <p class="canvas-placeholder__hint">Pick or drag FITS files into the left panel to start.</p>
  </div>
`;

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

mountSessionPanel(sessionPanel, store);
