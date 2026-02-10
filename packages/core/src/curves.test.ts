import { describe, it, expect } from 'vitest';
import { AnimationCurve, ColorGradient } from './curves.js';

describe('AnimationCurve', () => {
  describe('constructor', () => {
    it('sorts keyframes by time', () => {
      const curve = new AnimationCurve([
        { time: 0.5, value: 0.5 },
        { time: 0, value: 1 },
        { time: 1, value: 0 },
      ]);
      // Evaluate at boundaries to verify ordering
      expect(curve.evaluate(0)).toBe(1);
      expect(curve.evaluate(1)).toBe(0);
    });

    it('defaults to linear 1->0 curve', () => {
      const curve = new AnimationCurve();
      expect(curve.evaluate(0)).toBe(1);
      expect(curve.evaluate(1)).toBe(0);
    });
  });

  describe('evaluate', () => {
    it('returns 0 for empty keyframes', () => {
      const curve = new AnimationCurve([]);
      expect(curve.evaluate(0.5)).toBe(0);
    });

    it('returns single keyframe value for any time', () => {
      const curve = new AnimationCurve([{ time: 0.5, value: 0.75 }]);
      expect(curve.evaluate(0)).toBe(0.75);
      expect(curve.evaluate(0.5)).toBe(0.75);
      expect(curve.evaluate(1)).toBe(0.75);
    });

    it('clamps t to 0-1 range', () => {
      const curve = new AnimationCurve([
        { time: 0, value: 1 },
        { time: 1, value: 0 },
      ]);
      expect(curve.evaluate(-0.5)).toBe(1);
      expect(curve.evaluate(1.5)).toBe(0);
    });

    it('interpolates between keyframes using smoothstep', () => {
      const curve = new AnimationCurve([
        { time: 0, value: 0 },
        { time: 1, value: 1 },
      ]);
      // At t=0.5, smoothstep returns 0.5
      expect(curve.evaluate(0.5)).toBe(0.5);
      // At t=0.25, smoothstep returns 0.15625 (0.25^2 * (3 - 2*0.25))
      expect(curve.evaluate(0.25)).toBeCloseTo(0.15625, 5);
    });

    it('returns last keyframe value beyond last time', () => {
      const curve = new AnimationCurve([
        { time: 0, value: 1 },
        { time: 0.5, value: 0.5 },
      ]);
      expect(curve.evaluate(1)).toBe(0.5);
    });
  });

  describe('presets', () => {
    it('linear() creates 1->0 curve', () => {
      const curve = AnimationCurve.linear();
      expect(curve.evaluate(0)).toBe(1);
      expect(curve.evaluate(1)).toBe(0);
    });

    it('easeIn() starts slow', () => {
      const curve = AnimationCurve.easeIn();
      expect(curve.evaluate(0)).toBe(1);
      expect(curve.evaluate(1)).toBe(0);
      // At midpoint, should be > 0.5 (starts slow, value still high)
      expect(curve.evaluate(0.5)).toBeGreaterThan(0.5);
    });

    it('easeOut() ends slow', () => {
      const curve = AnimationCurve.easeOut();
      expect(curve.evaluate(0)).toBe(1);
      expect(curve.evaluate(1)).toBe(0);
      // At midpoint, should be < 0.5 (fast start, value already low)
      expect(curve.evaluate(0.5)).toBeLessThan(0.5);
    });

    it('pulse() goes 0->1->1->0', () => {
      const curve = AnimationCurve.pulse();
      expect(curve.evaluate(0)).toBe(0);
      expect(curve.evaluate(0.5)).toBe(1);
      expect(curve.evaluate(1)).toBe(0);
    });

    it('constant() returns same value throughout', () => {
      const curve = AnimationCurve.constant(0.8);
      expect(curve.evaluate(0)).toBe(0.8);
      expect(curve.evaluate(0.5)).toBe(0.8);
      expect(curve.evaluate(1)).toBe(0.8);
    });
  });
});

describe('ColorGradient', () => {
  describe('evaluate', () => {
    it('returns white with alpha 1 for empty keyframes', () => {
      const gradient = new ColorGradient([]);
      const color = gradient.evaluate(0.5);
      expect(color).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    });

    it('returns single keyframe color for any time', () => {
      const gradient = new ColorGradient([
        { time: 0.5, color: { r: 1, g: 0, b: 0 }, alpha: 0.5 },
      ]);
      const color = gradient.evaluate(0);
      expect(color).toEqual({ r: 1, g: 0, b: 0, a: 0.5 });
    });

    it('defaults alpha to 1 if not specified', () => {
      const gradient = new ColorGradient([
        { time: 0, color: { r: 0.5, g: 0.5, b: 0.5 } },
      ]);
      expect(gradient.evaluate(0).a).toBe(1);
    });

    it('interpolates colors linearly', () => {
      const gradient = new ColorGradient([
        { time: 0, color: { r: 0, g: 0, b: 0 }, alpha: 0 },
        { time: 1, color: { r: 1, g: 1, b: 1 }, alpha: 1 },
      ]);
      const color = gradient.evaluate(0.5);
      expect(color.r).toBeCloseTo(0.5, 5);
      expect(color.g).toBeCloseTo(0.5, 5);
      expect(color.b).toBeCloseTo(0.5, 5);
      expect(color.a).toBeCloseTo(0.5, 5);
    });

    it('clamps t to 0-1 range', () => {
      const gradient = new ColorGradient([
        { time: 0, color: { r: 0, g: 0, b: 0 } },
        { time: 1, color: { r: 1, g: 1, b: 1 } },
      ]);
      expect(gradient.evaluate(-1).r).toBe(0);
      expect(gradient.evaluate(2).r).toBe(1);
    });
  });

  describe('toArray', () => {
    it('converts keyframes to flat array', () => {
      const gradient = new ColorGradient([
        { time: 0, color: { r: 1, g: 0, b: 0 }, alpha: 1 },
        { time: 1, color: { r: 0, g: 0, b: 1 }, alpha: 0 },
      ]);
      const arr = gradient.toArray();
      expect(arr).toBeInstanceOf(Float32Array);
      expect(arr.length).toBe(10); // 2 keyframes * 5 values
      // First keyframe: time, r, g, b, a
      expect(arr[0]).toBe(0);
      expect(arr[1]).toBe(1);
      expect(arr[2]).toBe(0);
      expect(arr[3]).toBe(0);
      expect(arr[4]).toBe(1);
      // Second keyframe
      expect(arr[5]).toBe(1);
      expect(arr[6]).toBe(0);
      expect(arr[7]).toBe(0);
      expect(arr[8]).toBe(1);
      expect(arr[9]).toBe(0);
    });
  });

  describe('presets', () => {
    it('fire() starts yellow-white and fades to dark red', () => {
      const gradient = ColorGradient.fire();
      const start = gradient.evaluate(0);
      const end = gradient.evaluate(1);
      // Start is bright (near white/yellow)
      expect(start.r).toBeGreaterThan(0.9);
      expect(start.a).toBe(1);
      // End is dark red with no alpha
      expect(end.r).toBeLessThan(0.3);
      expect(end.a).toBe(0);
    });

    it('smoke() is gray throughout with fading alpha', () => {
      const gradient = ColorGradient.smoke();
      const start = gradient.evaluate(0);
      const end = gradient.evaluate(1);
      // Gray values (r ≈ g ≈ b)
      expect(Math.abs(start.r - start.g)).toBeLessThan(0.01);
      expect(start.a).toBeGreaterThan(0.5);
      expect(end.a).toBe(0);
    });

    it('magic() goes white->purple->dark blue', () => {
      const gradient = ColorGradient.magic();
      const start = gradient.evaluate(0);
      // Start is white
      expect(start.r).toBe(1);
      expect(start.g).toBe(1);
      expect(start.b).toBe(1);
    });

    it('rainbow() cycles through colors', () => {
      const gradient = ColorGradient.rainbow();
      // Red at start
      expect(gradient.evaluate(0).r).toBe(1);
      expect(gradient.evaluate(0).g).toBe(0);
      // Green in middle
      const mid = gradient.evaluate(0.5);
      expect(mid.g).toBe(1);
    });

    it('electric() is white->cyan->blue', () => {
      const gradient = ColorGradient.electric();
      const start = gradient.evaluate(0);
      expect(start.r).toBe(1);
      expect(start.b).toBe(1);
    });
  });
});
