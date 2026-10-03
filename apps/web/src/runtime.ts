/**
 * Small, DOM-free helpers for the demo runtime. Kept separate from main.ts so
 * they can be unit-tested without a browser or GPU.
 */

/** Longest simulation step we will ever feed the compute shaders (seconds). */
export const MAX_FRAME_DT = 1 / 30;

/** Consecutive failed frames tolerated before the loop is stopped. */
export const MAX_CONSECUTIVE_FRAME_ERRORS = 10;

export type BackendKind = "webgpu" | "webgl" | "unknown";

export interface BackendInfo {
  kind: BackendKind;
  label: string;
}

/**
 * Identify the renderer backend with the flags Three.js sets on each backend
 * class. `constructor.name` is minified in production builds, so it can never
 * be used to tell WebGPU from WebGL.
 */
export function describeBackend(backend: unknown): BackendInfo {
  const flags = backend as { isWebGPUBackend?: boolean; isWebGLBackend?: boolean } | null | undefined;
  if (flags?.isWebGPUBackend === true) return { kind: "webgpu", label: "WebGPU ✓" };
  if (flags?.isWebGLBackend === true) return { kind: "webgl", label: "WebGL (fallback)" };
  return { kind: "unknown", label: "Unknown" };
}

/** Clamp a raw frame delta (seconds) so the simulation never takes a huge step. */
export function clampDelta(dt: number, max: number = MAX_FRAME_DT): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, max);
}

/**
 * Frame timer that clamps every delta and drops the gap left by a suspension
 * (hidden tab), so the first frame after resuming is a normal step instead of
 * the full time spent hidden.
 */
export class FrameClock {
  private last: number | null = null;

  constructor(private readonly maxDt: number = MAX_FRAME_DT) {}

  /** Seconds since the previous tick, clamped. 0 on the first tick after a suspend. */
  tick(nowMs: number): number {
    const previous = this.last;
    this.last = nowMs;
    if (previous === null) return 0;
    return clampDelta((nowMs - previous) / 1000, this.maxDt);
  }

  /** Forget the previous timestamp. Call when the loop stops (tab hidden). */
  suspend(): void {
    this.last = null;
  }
}

/**
 * Counts consecutive failures. Returns true from `fail()` once the limit is
 * reached, and `ok()` clears the streak.
 */
export class FailureStreak {
  private count = 0;

  constructor(private readonly limit: number = MAX_CONSECUTIVE_FRAME_ERRORS) {}

  fail(): boolean {
    this.count += 1;
    return this.count >= this.limit;
  }

  ok(): void {
    this.count = 0;
  }
}
