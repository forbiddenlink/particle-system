import { describe, expect, it } from "vitest";
import {
  describeInitFailure,
  safePixelRatio,
  REQUIRED_TRANSFORM_FEEDBACK_ATTRIBS,
  webglComputeShortfall,
  trailsSupported,
  FailureStreak,
  FrameClock,
  MAX_FRAME_DT,
  clampDelta,
  describeBackend,
} from "./runtime";

describe("describeBackend", () => {
  // Minified production builds rename the classes, so these stand-ins carry
  // meaningless constructor names on purpose.
  class EP {
    isWebGPUBackend = true;
  }
  class Zt {
    isWebGLBackend = true;
  }

  it("detects WebGPU by flag, not constructor name", () => {
    expect(describeBackend(new EP())).toEqual({ kind: "webgpu", label: "WebGPU ✓" });
  });

  it("detects WebGL by flag", () => {
    expect(describeBackend(new Zt())).toEqual({ kind: "webgl", label: "WebGL (fallback)" });
  });

  it("reports unknown for anything else", () => {
    expect(describeBackend(undefined).kind).toBe("unknown");
    expect(describeBackend(null).kind).toBe("unknown");
    expect(describeBackend({}).kind).toBe("unknown");
    expect(describeBackend({ isWebGPUBackend: "yes" }).kind).toBe("unknown");
  });
});

describe("clampDelta", () => {
  it("passes normal frame times through", () => {
    expect(clampDelta(1 / 60)).toBeCloseTo(1 / 60);
  });

  it("caps long steps", () => {
    expect(clampDelta(12)).toBe(MAX_FRAME_DT);
  });

  it("rejects negative and non-finite values", () => {
    expect(clampDelta(-1)).toBe(0);
    expect(clampDelta(Number.NaN)).toBe(0);
    expect(clampDelta(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("FrameClock", () => {
  it("returns 0 on the first tick", () => {
    expect(new FrameClock().tick(1000)).toBe(0);
  });

  it("returns clamped deltas in seconds", () => {
    const clock = new FrameClock();
    clock.tick(0);
    expect(clock.tick(16)).toBeCloseTo(0.016);
    expect(clock.tick(10_016)).toBe(MAX_FRAME_DT);
  });

  it("drops the hidden gap after suspend", () => {
    const clock = new FrameClock();
    clock.tick(0);
    clock.tick(16);
    clock.suspend();
    expect(clock.tick(60_000)).toBe(0);
    expect(clock.tick(60_016)).toBeCloseTo(0.016);
  });
});

describe("FailureStreak", () => {
  it("trips after the limit of consecutive failures", () => {
    const streak = new FailureStreak(3);
    expect(streak.fail()).toBe(false);
    expect(streak.fail()).toBe(false);
    expect(streak.fail()).toBe(true);
  });

  it("resets on success", () => {
    const streak = new FailureStreak(3);
    streak.fail();
    streak.fail();
    streak.ok();
    expect(streak.fail()).toBe(false);
  });
});

describe("webglComputeShortfall", () => {
  it("accepts a driver with enough transform feedback outputs", () => {
    expect(webglComputeShortfall({ maxTransformFeedbackSeparateAttribs: 8 })).toBeNull();
    expect(webglComputeShortfall({ maxTransformFeedbackSeparateAttribs: 4 })).toBeNull();
  });

  it("accepts the WebGL2 spec minimum, which SwiftShader reports", () => {
    expect(REQUIRED_TRANSFORM_FEEDBACK_ATTRIBS).toBe(4);
    expect(
      webglComputeShortfall({
        maxTransformFeedbackSeparateAttribs: REQUIRED_TRANSFORM_FEEDBACK_ATTRIBS,
      }),
    ).toBeNull();
  });

  it("explains the shortfall when a driver offers fewer than 4", () => {
    const msg = webglComputeShortfall({ maxTransformFeedbackSeparateAttribs: 3 });
    expect(msg).toContain("3");
    expect(msg).toContain("4");
  });
});

describe("safePixelRatio", () => {
  const limits = { maxViewportDims: [8192, 8192] as [number, number], maxRenderbufferSize: 8192 };

  it("keeps the desired ratio when the buffer fits", () => {
    expect(safePixelRatio(2, 1440, 900, limits)).toBe(2);
  });

  it("reduces the ratio so the buffer stays within limits", () => {
    expect(safePixelRatio(2, 6000, 900, limits)).toBeCloseTo(8192 / 6000);
  });

  it("never returns zero or NaN, even for a zero-size window", () => {
    expect(safePixelRatio(0, 0, 0, limits)).toBe(1);
    expect(safePixelRatio(Number.NaN, 100, 100, limits)).toBe(1);
    expect(safePixelRatio(2, 0, 0, limits)).toBe(2);
    expect(safePixelRatio(2, 1e9, 1e9, limits)).toBeGreaterThan(0);
  });

  it("ignores unknown (zero) limits", () => {
    expect(safePixelRatio(2, 1000, 1000, { maxViewportDims: [0, 0], maxRenderbufferSize: 0 })).toBe(2);
  });
});

describe("describeInitFailure", () => {
  it("rewrites the three.js context creation error", () => {
    expect(describeInitFailure("THREE.WebGLRenderer: Error creating WebGL context.")).toMatch(/turned off or unavailable/);
  });
  it("rewrites the null-context error three.js throws when WebGL is disabled", () => {
    expect(
      describeInitFailure("Cannot read properties of null (reading 'getSupportedExtensions')"),
    ).toMatch(/turned off or unavailable/);
  });
  it("passes other messages through", () => {
    expect(describeInitFailure("boom")).toBe("boom");
  });
});

describe("trailsSupported", () => {
  it("allows trails on WebGPU only", () => {
    expect(trailsSupported("webgpu")).toBe(true);
    expect(trailsSupported("webgl")).toBe(false);
  });
});
