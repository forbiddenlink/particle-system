import { describe, expect, it } from "vitest";
import {
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
