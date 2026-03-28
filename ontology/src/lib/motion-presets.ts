/**
 * v3 Design System: Unified motion presets
 *
 * Based on motion v12 spring parameters.
 * All animation values go through these presets
 * for consistent feel across the app.
 */

/** Spring config for panel slide animations (Explorer, RightPanel) */
export const panelSlide = {
  type: 'spring' as const,
  damping: 22,
  stiffness: 280,
};

/** Spring config for node enter animations (ClassNode, InstanceNode) */
export const nodeEnter = {
  type: 'spring' as const,
  damping: 14,
  stiffness: 300,
};

/** Tween config for collapsible tree items */
export const collapse = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

/** Tween config for popover/modal overlays */
export const overlay = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

/** Node exit animation (shrink + fade) */
export const nodeExit = {
  duration: 0.15,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

/** Snap bounce for node drag stop */
export const snapBounce = {
  type: 'spring' as const,
  damping: 20,
  stiffness: 400,
  duration: 0.05,
};

/** Edge connection path drawing animation */
export const edgeDraw = {
  type: 'tween' as const,
  duration: 0.3,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

/** Filter mode dim/highlight transition */
export const focusTransition = {
  duration: 0.25,
  ease: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

/** Auto-save indicator pulse */
export const savePulse = {
  type: 'tween' as const,
  duration: 0.4,
  ease: 'easeInOut',
};

/** AI streaming glow */
export const aiGlow = {
  type: 'tween' as const,
  duration: 1.5,
  ease: 'easeInOut',
  repeat: Infinity,
  repeatType: 'reverse' as const,
};

/** Bundled presets for convenience import */
export const motionPresets = {
  panelSlide,
  nodeEnter,
  collapse,
  overlay,
  nodeExit,
  snapBounce,
  edgeDraw,
  focusTransition,
  savePulse,
  aiGlow,
} as const;

/**
 * Returns identity (no-op) transitions when the user
 * prefers reduced motion.
 *
 * Usage:
 *   const transition = prefersReducedMotion()
 *     ? reducedMotion
 *     : motionPresets.nodeEnter;
 */
export const reducedMotion = {
  duration: 0.01,
} as const;

/**
 * Detects prefers-reduced-motion media query.
 * Safe for SSR -- returns false on the server.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Helper that picks the appropriate transition
 * based on reduced-motion preference.
 */
export function safeTransition<T extends Record<string, unknown>>(
  preset: T,
): T | typeof reducedMotion {
  return prefersReducedMotion() ? reducedMotion : preset;
}
