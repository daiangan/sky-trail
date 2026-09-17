/**
 * Left-hand session panel. Phase 3 surface -- lets the user create,
 * rename, delete, and reorder capture sessions; pick a per-session
 * color; assign FITS files / folders to the selected session; and see
 * a per-session summary (light count, total exposure, earliest date).
 *
 * Inputs commit on `change` (blur) rather than `input` (keystroke), so
 * the panel never re-renders while the user is typing and focus is
 * preserved naturally. Light-assignment and structural changes
 * (add/remove/reorder) trigger a full re-render.
 */

import type { LightFileInfo } from '../fits';
import type { LightFrame, Project, Session } from '../model';
import type { PlaybackSnapshot } from '../render/playback_controller';
import { addSession, moveSession, removeSession } from '../model/project';
import {
  addLight,
  createSession,
  renameSession,
  sessionDate,
  sessionLightCount,
  sessionTotalExptimeS,
  setSessionColor,
} from '../model/session';
import { formatDuration } from '../model/timeline';
import { clear, confirm, el } from './dom';
import { hasFitsExtension, pickDirectory, pickFiles, readLightBatches } from './file_io';
import type { Store } from './store';

export interface OverlayVisibility {
  visible: boolean;
  counter: boolean;
  stats: boolean;
  chart: boolean;
}

export interface AppState {
  project: Project;
  selectedSessionId: number | null;
  loading: { current: number; total: number; fileName: string } | null;
  playback: PlaybackSnapshot;
  overlay: OverlayVisibility;
}

export function mountSessionPanel(root: HTMLElement, store: Store<AppState>): () => void {
  clear(root);
  const listEl = el('div', { class: 'session-list' });
  const actionsEl = el('div', { class: 'session-actions' });
  const progressEl = el('div', { class: 'session-progress' });

  root.appendChild(
    el('div', { class: 'session-panel' }, [
      el('header', { class: 'session-panel__header' }, [
        el('h2', {}, ['Sessions']),
        el('button', { class: 'btn btn--primary', id: 'session-create', type: 'button' }, [
          '+ New session',
        ]),
      ]),
      listEl,
      actionsEl,
      progressEl,
    ]),
  );

  const unsubscribe = store.subscribe((state) => {
    renderList(listEl, state, store);
    renderActions(actionsEl, state, store);
    renderProgress(progressEl, state);
  });

  const createBtn = root.querySelector<HTMLButtonElement>('#session-create')!;
  createBtn.addEventListener('click', () => {
    store.set((s) => {
      const index = s.project.sessions.length;
      const session = createSession(index);
      return {
        ...s,
        project: addSession(s.project, session),
        selectedSessionId: index,
      };
    });
  });

  return () => {
    unsubscribe();
  };
}

function renderList(host: HTMLElement, state: AppState, store: Store<AppState>): void {
  const sessions = state.project.sessions;
  if (sessions.length === 0) {
    clear(host);
    host.appendChild(
      el('p', { class: 'session-list__empty' }, [
        'No sessions yet. Click "+ New session" to start.',
      ]),
    );
    return;
  }

  // Structural diff: rebuild only when the list of session identities
  // changes. Per-session field changes are applied in place below.
  const prevIds = new Set(
    Array.from(host.children).map((row) => (row as HTMLElement).dataset['sessionId'] ?? ''),
  );
  const nextIds = sessions.map((_, i) => String(i));
  const sameStructure =
    prevIds.size === nextIds.length && nextIds.every((_id, i) => prevIds.has(String(i)));

  if (!sameStructure) {
    clear(host);
    for (let i = 0; i < sessions.length; i += 1) {
      host.appendChild(buildRow(sessions[i]!, i, state, store));
    }
    return;
  }

  for (let i = 0; i < sessions.length; i += 1) {
    const row = host.children[i] as HTMLElement;
    updateRow(row, sessions[i]!, i, state, store);
  }
}

function buildRow(
  session: Session,
  index: number,
  state: AppState,
  store: Store<AppState>,
): HTMLElement {
  const isSelected = state.selectedSessionId === index;
  const row = el('div', {
    class: `session-row${isSelected ? ' session-row--selected' : ''}`,
    dataset: { sessionId: String(index) },
    role: 'button',
    tabindex: '0',
  });

  const swatch = el('input', {
    class: 'session-row__swatch',
    type: 'color',
    value: session.color,
    title: 'Session color',
    'aria-label': `Color for ${session.name}`,
  });
  swatch.addEventListener('click', (event) => event.stopPropagation());
  swatch.addEventListener('change', () => {
    store.set((s) => ({
      ...s,
      project: replaceSession(s.project, index, (current) =>
        setSessionColor(current, swatch.value),
      ),
    }));
  });

  const nameInput = el('input', {
    class: 'session-row__name',
    type: 'text',
    value: session.name,
    'aria-label': 'Session name',
  });
  nameInput.addEventListener('click', (event) => event.stopPropagation());
  nameInput.addEventListener('change', () => {
    const next = nameInput.value.trim() || session.name;
    if (next === session.name) return;
    store.set((s) => ({
      ...s,
      project: replaceSession(s.project, index, (current) => renameSession(current, next)),
    }));
  });

  const summary = el('div', { class: 'session-row__summary' });
  const count = el('span', { class: 'session-row__count' }, [
    `${sessionLightCount(session)} lights`,
  ]);
  const exptime = el('span', { class: 'session-row__time' }, [
    formatDuration(sessionTotalExptimeS(session)),
  ]);
  const dateText = sessionDate(session);
  const date = el('span', { class: 'session-row__date' }, [dateText ? dateText.slice(0, 10) : '—']);
  summary.append(count, ' · ', exptime, ' · ', date);

  const upBtn = el(
    'button',
    {
      class: 'iconbtn',
      type: 'button',
      title: 'Move up',
      'aria-label': 'Move session up',
      disabled: index === 0,
    },
    ['↑'],
  );
  const downBtn = el(
    'button',
    {
      class: 'iconbtn',
      type: 'button',
      title: 'Move down',
      'aria-label': 'Move session down',
      disabled: index === state.project.sessions.length - 1,
    },
    ['↓'],
  );
  const deleteBtn = el(
    'button',
    {
      class: 'iconbtn iconbtn--danger',
      type: 'button',
      title: 'Delete session',
      'aria-label': 'Delete session',
    },
    ['✕'],
  );

  for (const [btn, action] of [
    [upBtn, 'up'],
    [downBtn, 'down'],
    [deleteBtn, 'delete'],
  ] as const) {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleRowAction(action, index, store);
    });
  }

  row.append(
    swatch,
    el('div', { class: 'session-row__main' }, [nameInput, summary]),
    upBtn,
    downBtn,
    deleteBtn,
  );
  row.addEventListener('click', () => {
    store.set((s) => ({ ...s, selectedSessionId: index }));
  });
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      store.set((s) => ({ ...s, selectedSessionId: index }));
    }
  });

  return row;
}

function updateRow(
  row: HTMLElement,
  session: Session,
  index: number,
  state: AppState,
  _store: Store<AppState>,
): void {
  const isSelected = state.selectedSessionId === index;
  row.classList.toggle('session-row--selected', isSelected);

  const swatch = row.querySelector<HTMLInputElement>('.session-row__swatch');
  if (swatch && swatch.value !== session.color) swatch.value = session.color;

  const nameInput = row.querySelector<HTMLInputElement>('.session-row__name');
  if (nameInput && document.activeElement !== nameInput && nameInput.value !== session.name) {
    nameInput.value = session.name;
  }

  const count = row.querySelector('.session-row__count');
  if (count) count.textContent = `${sessionLightCount(session)} lights`;
  const time = row.querySelector('.session-row__time');
  if (time) time.textContent = formatDuration(sessionTotalExptimeS(session));
  const dateEl = row.querySelector('.session-row__date');
  if (dateEl) dateEl.textContent = sessionDate(session) ? sessionDate(session)!.slice(0, 10) : '—';

  const upBtn = row.querySelector<HTMLButtonElement>('button[aria-label="Move session up"]');
  if (upBtn) upBtn.disabled = index === 0;
  const downBtn = row.querySelector<HTMLButtonElement>('button[aria-label="Move session down"]');
  if (downBtn) downBtn.disabled = index === state.project.sessions.length - 1;
}

function handleRowAction(
  action: 'up' | 'down' | 'delete',
  index: number,
  store: Store<AppState>,
): void {
  if (action === 'up') {
    store.set((s) => ({ ...s, project: moveSession(s.project, index, index - 1) }));
    return;
  }
  if (action === 'down') {
    store.set((s) => ({ ...s, project: moveSession(s.project, index, index + 1) }));
    return;
  }
  const s = store.get();
  const session = s.project.sessions[index];
  if (!session) return;
  const summary = `${sessionLightCount(session)} lights, ${formatDuration(sessionTotalExptimeS(session))}`;
  if (!confirm(`Delete "${session.name}" (${summary})? This cannot be undone.`)) {
    return;
  }
  store.set((current) => {
    const nextProject = removeSession(current.project, index);
    const nextSelected = clampSelected(current.selectedSessionId, nextProject.sessions.length);
    return { ...current, project: nextProject, selectedSessionId: nextSelected };
  });
}

function clampSelected(selected: number | null, length: number): number | null {
  if (length === 0) return null;
  if (selected === null) return 0;
  return Math.min(selected, length - 1);
}

function replaceSession(
  project: Project,
  index: number,
  transform: (session: Session) => Session,
): Project {
  const sessions = project.sessions.slice();
  const current = sessions[index];
  if (!current) return project;
  sessions[index] = transform(current);
  return { ...project, sessions };
}

function renderActions(host: HTMLElement, state: AppState, store: Store<AppState>): void {
  clear(host);
  if (state.project.sessions.length === 0) return;

  const selectedIndex = state.selectedSessionId ?? 0;
  const disabled = state.loading !== null;

  const addFiles = el(
    'button',
    {
      class: 'btn',
      type: 'button',
      disabled,
      id: 'add-files',
    },
    ['+ Add files…'],
  );
  const addFolder = el(
    'button',
    {
      class: 'btn',
      type: 'button',
      disabled,
      id: 'add-folder',
    },
    ['+ Add folder…'],
  );

  addFiles.addEventListener('click', () => {
    void runPick(pickFiles, store);
  });
  addFolder.addEventListener('click', () => {
    void runPick(pickDirectory, store);
  });

  const session = state.project.sessions[selectedIndex];
  if (session) {
    host.appendChild(el('p', { class: 'session-actions__hint' }, [`Selected: ${session.name}`]));
  }

  host.append(addFiles, addFolder);
}

async function runPick(
  picker: () => Promise<{ files: File[] } | null>,
  store: Store<AppState>,
): Promise<void> {
  const pickResult = await picker();
  if (!pickResult || pickResult.files.length === 0) return;

  const files = pickResult.files.filter((file) => hasFitsExtension(file.name));
  if (files.length === 0) return;

  const infos = await readLightBatches(files, {
    onProgress: (current, total, fileName) => {
      store.set((s) => ({ ...s, loading: { current, total, fileName } }));
    },
  });

  store.set((s) => {
    let project = s.project;
    let targetIndex = s.selectedSessionId;
    if (project.sessions.length === 0) {
      const session = createSession(0, 'Night 1');
      project = addSession(project, session);
      targetIndex = 0;
    } else if (targetIndex === null) {
      targetIndex = 0;
    }

    const session = project.sessions[targetIndex];
    if (!session) return s;
    let next = session;
    for (let i = 0; i < files.length; i += 1) {
      next = addLight(next, lightFrameFromInfo(infos[i]!, files[i]!.name));
    }
    return {
      ...s,
      project: replaceSession(project, targetIndex, () => next),
      selectedSessionId: targetIndex,
      loading: null,
    };
  });
}

export function lightFrameFromInfo(info: LightFileInfo, name: string): LightFrame {
  return {
    path: name,
    dateObs: info.dateObs,
    exptime: info.exptime,
    filterName: info.filterName,
    sizeBytes: info.sizeBytes,
    objRaDeg: info.objRaDeg,
    objDecDeg: info.objDecDeg,
    siteLatDeg: info.siteLatDeg,
    siteLonDeg: info.siteLonDeg,
    altDeg: null,
    azDeg: null,
  };
}

function renderProgress(host: HTMLElement, state: AppState): void {
  clear(host);
  if (!state.loading) return;
  const { current, total, fileName } = state.loading;
  const pct = total === 0 ? 0 : Math.round((current / total) * 100);
  host.appendChild(
    el('div', { class: 'session-progress__inner' }, [
      el('div', { class: 'session-progress__bar' }, [
        el('div', {
          class: 'session-progress__fill',
          style: `width: ${pct}%`,
        }),
      ]),
      el('div', { class: 'session-progress__text' }, [
        `Reading ${current} of ${total} (${pct}%) — ${fileName}`,
      ]),
    ]),
  );
}
