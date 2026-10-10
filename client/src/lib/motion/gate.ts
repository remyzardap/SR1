/**
 * When may living art run? Pure decisions, fed by the browser readers below.
 */

export interface DeviceHints {
  /** navigator.hardwareConcurrency */
  cores?: number;
  /** navigator.deviceMemory (GB, Chromium only) */
  memory?: number;
  /** navigator.connection.saveData */
  saveData?: boolean;
}

/** A phone or laptop that would feel a full-screen canvas: few cores, little memory, or data saver. */
export function isLowEndDevice(h: DeviceHints): boolean {
  if (h.saveData) return true;
  if (typeof h.cores === "number" && h.cores > 0 && h.cores < 4) return true;
  if (typeof h.memory === "number" && h.memory > 0 && h.memory < 4) return true;
  return false;
}

export type LivingMode = "off" | "static" | "live";

export interface LivingInputs {
  /** The "Background art" setting. */
  backgroundArt: boolean;
  /** "Art intensity", 0..100 (20..100 in Settings). */
  intensity: number;
  /** prefers-reduced-motion or the in-app Reduce motion switch. */
  reducedMotion: boolean;
  lowEnd: boolean;
}

/**
 * off: nothing drawn. static: one still frame (reduced motion: the art stays, the motion goes).
 * live: animated.
 */
export function livingMode(i: LivingInputs): LivingMode {
  if (!i.backgroundArt || i.lowEnd || !(i.intensity > 0)) return "off";
  if (i.reducedMotion) return "static";
  return "live";
}

/** Art intensity percent to the field's alpha multiplier; 70 (the default) maps to 1. */
export function intensityScale(percent: number): number {
  if (!Number.isFinite(percent)) return 1;
  const p = Math.max(0, Math.min(100, percent));
  return p / 70;
}

export function readDeviceHints(): DeviceHints {
  if (typeof navigator === "undefined") return {};
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return { cores: nav.hardwareConcurrency, memory: nav.deviceMemory, saveData: nav.connection?.saveData };
}
