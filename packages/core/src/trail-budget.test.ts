import { describe, it, expect } from 'vitest';
import { fitTrailBudget, MAX_TRAIL_POSITIONS } from './trail-budget.js';

describe('fitTrailBudget', () => {
  it('leaves a config inside the budget untouched', () => {
    expect(fitTrailBudget(100_000, true, 8)).toEqual({ enabled: true, length: 8, adjusted: false });
  });

  it('allows exactly the budget', () => {
    expect(fitTrailBudget(250_000, true, 8)).toEqual({ enabled: true, length: 8, adjusted: false });
  });

  it('reduces length for 1M particles at length 8', () => {
    expect(fitTrailBudget(1_000_000, true, 8)).toEqual({ enabled: true, length: 2, adjusted: true });
  });

  it('reduces length to the largest value that fits', () => {
    const result = fitTrailBudget(400_000, true, 16);
    expect(result).toEqual({ enabled: true, length: 5, adjusted: true });
    expect(400_000 * result.length).toBeLessThanOrEqual(MAX_TRAIL_POSITIONS);
  });

  it('disables trails when even two positions do not fit', () => {
    expect(fitTrailBudget(1_500_000, true, 8)).toEqual({ enabled: false, length: 8, adjusted: true });
  });

  it('ignores the budget when trails are off', () => {
    expect(fitTrailBudget(5_000_000, false, 8)).toEqual({ enabled: false, length: 8, adjusted: false });
  });
});
