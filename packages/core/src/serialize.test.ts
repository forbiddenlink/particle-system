import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from './serialize.js';

describe('encodeState / decodeState', () => {
  it('round-trips an object back to an equal value', () => {
    const state = { count: 250000, gravity: 9.8, trails: true, preset: 'Nebula' };
    const encoded = encodeState(state);
    expect(decodeState(encoded)).toEqual(state);
  });

  it('returns null for malformed input instead of throwing', () => {
    expect(decodeState('not-valid-@@@')).toBeNull();
    expect(decodeState('')).toBeNull();
  });

  it('preserves non-ASCII characters through the round-trip', () => {
    const state = { name: 'Nôva ✨ 粒子' };
    expect(decodeState(encodeState(state))).toEqual(state);
  });
});
