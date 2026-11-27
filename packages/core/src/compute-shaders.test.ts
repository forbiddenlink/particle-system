import { describe, expect, it } from 'vitest';
// @ts-ignore - TSL types are incomplete
import { int } from 'three/tsl';

describe('integer modulo used by the trail ring buffer', () => {
  it('is spelled mod() in the installed three, not modInt()', () => {
    const idx = int(3).add(int(1)) as unknown as Record<string, unknown>;
    expect(typeof idx.mod).toBe('function');
    expect(idx.modInt).toBeUndefined();
  });

  it('chains with an integer ring size', () => {
    const idx = int(3).add(int(1)) as unknown as { mod: (n: unknown) => unknown };
    const eight: unknown = int(8);
    expect(() => idx.mod(eight)).not.toThrow();
  });
});
