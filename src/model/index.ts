export type { LightFrame } from './light_frame';
export { hasPosition } from './light_frame';

export type { Session } from './session';
export {
  DEFAULT_SESSION_PALETTE,
  addLight,
  createSession,
  defaultSessionColor,
  defaultSessionName,
  renameSession,
  sessionDate,
  sessionLightCount,
  sessionTotalBytes,
  sessionTotalExptimeS,
  setSessionColor,
} from './session';

export type { Project } from './project';
export {
  addSession,
  allLights,
  createProject,
  moveSession,
  removeSession,
  setFallbackCoords,
  totalBytes,
  totalExptimeS,
  totalLightCount,
  type LightInProject,
} from './project';

export {
  projectFallback,
  resolveLightPosition,
  type AltAzFn,
  type FallbackCoordinates,
} from './resolve';

export { buildTimeline, formatDuration, formatGb, type TimelinePoint } from './timeline';

export {
  emptyRemembered,
  loadFallbackCoords,
  saveFallbackCoords,
  validateRemembered,
  type RememberedCoordinates,
} from './persistence';
