/** Defaults shared by the dome renderer and the controls that expose them. */

/** Faint glass volume so the dome reads as a solid object, not a loose grid. */
export const DEFAULT_SURFACE_OPACITY = 0.1;
/** Ground disc under the dome that anchors the horizon. */
export const DEFAULT_FLOOR_OPACITY = 0.3;
/** A gentle turntable drift that keeps the dome alive; set the Camera rotation slider to 0 to stop it. */
export const DEFAULT_CAMERA_ROTATION_DEG_PER_SEC = 1;
