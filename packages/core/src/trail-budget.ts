/**
 * Upper bound on trail positions (maxParticles x trailLength) per system.
 * Trail storage is 4 float32 arrays sized from this product, so at the budget it is
 * roughly 2M positions x 16 B for the ring buffer plus line-segment vertex and color
 * buffers that grow with (length - 1) * 2 per particle. Without a cap, 1M particles at
 * the default length of 8 allocates about 576 MB of CPU-side typed arrays.
 */
export const MAX_TRAIL_POSITIONS = 2_000_000;

/** A trail needs at least two positions to form one line segment. */
const MIN_TRAIL_LENGTH = 2;

export interface TrailBudgetResult {
  enabled: boolean;
  length: number;
  /** True when the requested config was changed to fit the budget. */
  adjusted: boolean;
}

/**
 * Fit a requested trail config inside MAX_TRAIL_POSITIONS. Reduces the length first and
 * disables trails when even the minimum length would not fit.
 */
export function fitTrailBudget(
  maxParticles: number,
  enabled: boolean,
  length: number,
  budget: number = MAX_TRAIL_POSITIONS
): TrailBudgetResult {
  if (!enabled) {
    return { enabled, length, adjusted: false };
  }
  if (maxParticles * length <= budget) {
    return { enabled, length, adjusted: false };
  }
  const fitted = Math.floor(budget / maxParticles);
  if (fitted < MIN_TRAIL_LENGTH) {
    return { enabled: false, length, adjusted: true };
  }
  return { enabled, length: fitted, adjusted: true };
}
