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
/**
 * Trails need the trail compute pass, which touches more storage buffers than the
 * 4 transform feedback outputs the WebGL2 fallback is guaranteed to have.
 */
export function trailsSupported(kind: BackendInfo["kind"]): boolean {
  return kind !== "webgl";
}

export const TRAILS_UNSUPPORTED_REASON = "Trails need WebGPU";

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

/**
 * Separate transform feedback outputs the particle update pass needs on the
 * WebGL2 fallback: one per storage buffer it writes (position, velocity, color
 * and life). WebGL2 only guarantees 4, and software GL (SwiftShader) and many
 * real drivers report exactly 4, so the update pass must never write a fifth.
 */
export const REQUIRED_TRANSFORM_FEEDBACK_ATTRIBS = 4;

export interface WebGLLimits {
  maxTransformFeedbackSeparateAttribs: number;
  maxViewportDims: [number, number];
  maxRenderbufferSize: number;
}

/** Read the limits this app depends on from a WebGL2 context. */
export function readWebGLLimits(gl: WebGL2RenderingContext): WebGLLimits {
  const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as ArrayLike<number> | null;
  return {
    maxTransformFeedbackSeparateAttribs:
      Number(gl.getParameter(gl.MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS)) || 0,
    maxViewportDims: [Number(dims?.[0]) || 0, Number(dims?.[1]) || 0],
    maxRenderbufferSize: Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 0,
  };
}

/**
 * Explain why the WebGL2 fallback cannot run the compute passes, or return null
 * when it can. Checking this up front avoids issuing GL calls that raise
 * INVALID_VALUE (GL error 1281) on drivers with too few transform feedback outputs.
 */
export function webglComputeShortfall(
  limits: Pick<WebGLLimits, "maxTransformFeedbackSeparateAttribs">,
  required: number = REQUIRED_TRANSFORM_FEEDBACK_ATTRIBS,
): string | null {
  if (limits.maxTransformFeedbackSeparateAttribs >= required) return null;
  return `This graphics driver allows ${limits.maxTransformFeedbackSeparateAttribs} transform feedback outputs, but the particle simulation needs ${required}.`;
}

/**
 * Largest pixel ratio (at most `desired`) that keeps the drawing buffer inside
 * the GPU's viewport and renderbuffer limits. Never returns 0 or a non-finite
 * value, so a zero-size window cannot produce a zero-size canvas.
 */
export function safePixelRatio(
  desired: number,
  cssWidth: number,
  cssHeight: number,
  limits: Pick<WebGLLimits, "maxViewportDims" | "maxRenderbufferSize">,
): number {
  let ratio = Number.isFinite(desired) && desired > 0 ? desired : 1;
  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  const maxW = Math.min(
    limits.maxViewportDims[0] > 0 ? limits.maxViewportDims[0] : Infinity,
    limits.maxRenderbufferSize > 0 ? limits.maxRenderbufferSize : Infinity,
  );
  const maxH = Math.min(
    limits.maxViewportDims[1] > 0 ? limits.maxViewportDims[1] : Infinity,
    limits.maxRenderbufferSize > 0 ? limits.maxRenderbufferSize : Infinity,
  );
  ratio = Math.min(ratio, maxW / w, maxH / h);
  return Math.max(ratio, 0.1);
}

/** Turn a raw renderer init error into plain language for the fallback panel. */
export function describeInitFailure(message: string): string {
  if (/webgl context could not be created|error creating webgl context|webgl.*(disabled|not supported)|getSupportedExtensions/i.test(message)) {
    return "This browser could not create a graphics context. WebGL and WebGPU appear to be turned off or unavailable.";
  }
  return message;
}
