import { describe, it, expect } from 'vitest';
import { analyzeFrequencyBands } from './audio.js';

describe('analyzeFrequencyBands', () => {
  it('returns zero energy for silence', () => {
    const freq = new Uint8Array(64); // all zeros
    expect(analyzeFrequencyBands(freq)).toEqual({ bass: 0, mid: 0, treble: 0 });
  });

  it('returns full energy for a maxed-out spectrum', () => {
    const freq = new Uint8Array(64).fill(255);
    const bands = analyzeFrequencyBands(freq);
    expect(bands.bass).toBeCloseTo(1, 5);
    expect(bands.mid).toBeCloseTo(1, 5);
    expect(bands.treble).toBeCloseTo(1, 5);
  });

  it('attributes low-bin energy to bass, not treble', () => {
    const freq = new Uint8Array(64);
    for (let i = 0; i < 4; i++) freq[i] = 255; // only the lowest bins
    const bands = analyzeFrequencyBands(freq);
    expect(bands.bass).toBeGreaterThan(bands.mid);
    expect(bands.bass).toBeGreaterThan(bands.treble);
    expect(bands.treble).toBeCloseTo(0, 5);
  });

  it('does not produce NaN for an empty spectrum', () => {
    const bands = analyzeFrequencyBands(new Uint8Array(0));
    expect(bands.bass).toBe(0);
    expect(bands.mid).toBe(0);
    expect(bands.treble).toBe(0);
  });
});
