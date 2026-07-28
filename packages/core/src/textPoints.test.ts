import { describe, it, expect } from 'vitest';
import { sampleOpaquePoints } from './textPoints.js';

// Build an RGBA buffer with the given opaque pixel coordinates set to white.
function rgba(width: number, height: number, opaque: Array<[number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of opaque) {
    const i = (y * width + x) * 4;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255; // alpha
  }
  return data;
}

describe('sampleOpaquePoints', () => {
  it('returns no points for a fully transparent image', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4); // all zero alpha
    expect(sampleOpaquePoints(data, 4, 4)).toEqual([]);
  });

  it('emits one point per opaque pixel', () => {
    const data = rgba(4, 4, [[1, 1], [2, 2]]);
    const points = sampleOpaquePoints(data, 4, 4, { step: 1, spread: 4 });
    expect(points).toHaveLength(2);
  });

  it('centers the point cloud around the origin', () => {
    // single opaque pixel at the exact center-ish of a 2x2 grid
    const data = rgba(2, 2, [[0, 0]]);
    const [p] = sampleOpaquePoints(data, 2, 2, { step: 1, spread: 2 });
    // pixel (0,0) is the top-left; mapped x should be negative, y positive (y is flipped)
    expect(p.x).toBeLessThan(0);
    expect(p.y).toBeGreaterThan(0);
    expect(p.z).toBe(0);
  });

  it('subsamples with step to reduce the point count', () => {
    // every pixel opaque in a 4x4 image
    const all: Array<[number, number]> = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) all.push([x, y]);
    const dense = sampleOpaquePoints(rgba(4, 4, all), 4, 4, { step: 1 });
    const sparse = sampleOpaquePoints(rgba(4, 4, all), 4, 4, { step: 2 });
    expect(sparse.length).toBeLessThan(dense.length);
  });
});
