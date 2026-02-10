import { describe, it, expect } from 'vitest';
import {
  PointEmitter,
  SphereEmitter,
  BoxEmitter,
  ConeEmitter,
  CircleEmitter,
  createEmitter,
} from './emitters.js';

describe('PointEmitter', () => {
  it('has type "point"', () => {
    const emitter = new PointEmitter();
    expect(emitter.type).toBe('point');
  });

  it('getPosition always returns origin', () => {
    const emitter = new PointEmitter();
    expect(emitter.getPosition(0)).toEqual({ x: 0, y: 0, z: 0 });
    expect(emitter.getPosition(0.5)).toEqual({ x: 0, y: 0, z: 0 });
    expect(emitter.getPosition(1)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('getDirection returns unit vector on sphere', () => {
    const emitter = new PointEmitter();
    const dir = emitter.getDirection({ x: 0, y: 0, z: 0 }, 0.25);
    const magnitude = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('getDirection varies with seed', () => {
    const emitter = new PointEmitter();
    const dir1 = emitter.getDirection({ x: 0, y: 0, z: 0 }, 0.1);
    const dir2 = emitter.getDirection({ x: 0, y: 0, z: 0 }, 0.5);
    expect(dir1).not.toEqual(dir2);
  });
});

describe('SphereEmitter', () => {
  it('has type "sphere"', () => {
    const emitter = new SphereEmitter();
    expect(emitter.type).toBe('sphere');
  });

  it('defaults to radius 1 and radiusThickness 1', () => {
    const emitter = new SphereEmitter();
    expect(emitter.radius).toBe(1);
    expect(emitter.radiusThickness).toBe(1);
  });

  it('accepts custom radius and radiusThickness', () => {
    const emitter = new SphereEmitter({ radius: 2, radiusThickness: 0.5 });
    expect(emitter.radius).toBe(2);
    expect(emitter.radiusThickness).toBe(0.5);
  });

  it('getPosition returns point within sphere radius', () => {
    const emitter = new SphereEmitter({ radius: 2 });
    for (let seed = 0; seed < 1; seed += 0.1) {
      const pos = emitter.getPosition(seed);
      const dist = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
      expect(dist).toBeLessThanOrEqual(2.001); // Small tolerance
    }
  });

  it('getPosition with radiusThickness 0 spawns on surface only', () => {
    const emitter = new SphereEmitter({ radius: 1, radiusThickness: 0 });
    for (let seed = 0.1; seed < 1; seed += 0.1) {
      const pos = emitter.getPosition(seed);
      const dist = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
      expect(dist).toBeCloseTo(1, 1);
    }
  });

  it('getDirection returns normalized outward direction', () => {
    const emitter = new SphereEmitter();
    const pos = { x: 1, y: 0, z: 0 };
    const dir = emitter.getDirection(pos, 0);
    expect(dir).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('getDirection handles zero position gracefully', () => {
    const emitter = new SphereEmitter();
    const dir = emitter.getDirection({ x: 0, y: 0, z: 0 }, 0);
    expect(dir).toEqual({ x: 0, y: 1, z: 0 });
  });
});

describe('BoxEmitter', () => {
  it('has type "box"', () => {
    const emitter = new BoxEmitter();
    expect(emitter.type).toBe('box');
  });

  it('defaults to unit cube', () => {
    const emitter = new BoxEmitter();
    expect(emitter.size).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('accepts custom size', () => {
    const emitter = new BoxEmitter({ size: { x: 2, y: 3, z: 4 } });
    expect(emitter.size).toEqual({ x: 2, y: 3, z: 4 });
  });

  it('getPosition returns point within box bounds', () => {
    const emitter = new BoxEmitter({ size: { x: 2, y: 4, z: 6 } });
    for (let seed = 0; seed < 1; seed += 0.1) {
      const pos = emitter.getPosition(seed);
      expect(pos.x).toBeGreaterThanOrEqual(-1);
      expect(pos.x).toBeLessThanOrEqual(1);
      expect(pos.y).toBeGreaterThanOrEqual(-2);
      expect(pos.y).toBeLessThanOrEqual(2);
      expect(pos.z).toBeGreaterThanOrEqual(-3);
      expect(pos.z).toBeLessThanOrEqual(3);
    }
  });

  it('getDirection returns upward direction', () => {
    const emitter = new BoxEmitter();
    const dir = emitter.getDirection({ x: 1, y: 1, z: 1 }, 0);
    expect(dir).toEqual({ x: 0, y: 1, z: 0 });
  });
});

describe('ConeEmitter', () => {
  it('has type "cone"', () => {
    const emitter = new ConeEmitter();
    expect(emitter.type).toBe('cone');
  });

  it('has default values', () => {
    const emitter = new ConeEmitter();
    expect(emitter.angle).toBe(Math.PI / 4);
    expect(emitter.radius).toBe(0.5);
    expect(emitter.length).toBe(1);
  });

  it('accepts custom values', () => {
    const emitter = new ConeEmitter({ angle: Math.PI / 2, radius: 2, length: 3 });
    expect(emitter.angle).toBe(Math.PI / 2);
    expect(emitter.radius).toBe(2);
    expect(emitter.length).toBe(3);
  });

  it('getPosition spawns on base circle (y=0)', () => {
    const emitter = new ConeEmitter({ radius: 1 });
    for (let seed = 0.1; seed < 1; seed += 0.1) {
      const pos = emitter.getPosition(seed);
      expect(pos.y).toBe(0);
      const dist = Math.sqrt(pos.x ** 2 + pos.z ** 2);
      expect(dist).toBeLessThanOrEqual(1.001);
    }
  });

  it('getDirection points within cone angle', () => {
    const emitter = new ConeEmitter({ angle: Math.PI / 4 });
    const dir = emitter.getDirection({ x: 1, y: 0, z: 0 }, 0);
    // Direction should be normalized
    const magnitude = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
    expect(magnitude).toBeCloseTo(1, 5);
    // Y component should be positive (pointing up)
    expect(dir.y).toBeGreaterThanOrEqual(0);
  });
});

describe('CircleEmitter', () => {
  it('has type "circle"', () => {
    const emitter = new CircleEmitter();
    expect(emitter.type).toBe('circle');
  });

  it('defaults to radius 1 and full arc', () => {
    const emitter = new CircleEmitter();
    expect(emitter.radius).toBe(1);
    expect(emitter.arc).toBe(Math.PI * 2);
  });

  it('accepts custom radius and arc', () => {
    const emitter = new CircleEmitter({ radius: 2, arc: Math.PI });
    expect(emitter.radius).toBe(2);
    expect(emitter.arc).toBe(Math.PI);
  });

  it('getPosition spawns on XZ plane (y=0)', () => {
    const emitter = new CircleEmitter();
    for (let seed = 0.1; seed < 1; seed += 0.1) {
      const pos = emitter.getPosition(seed);
      expect(pos.y).toBe(0);
    }
  });

  it('getPosition respects radius', () => {
    const emitter = new CircleEmitter({ radius: 2 });
    for (let seed = 0.1; seed < 1; seed += 0.1) {
      const pos = emitter.getPosition(seed);
      const dist = Math.sqrt(pos.x ** 2 + pos.z ** 2);
      expect(dist).toBeLessThanOrEqual(2.001);
    }
  });

  it('getDirection returns upward direction', () => {
    const emitter = new CircleEmitter();
    const dir = emitter.getDirection({ x: 1, y: 0, z: 1 }, 0);
    expect(dir).toEqual({ x: 0, y: 1, z: 0 });
  });
});

describe('createEmitter', () => {
  it('returns PointEmitter when no config provided', () => {
    const emitter = createEmitter();
    expect(emitter.type).toBe('point');
  });

  it('creates PointEmitter for type "point"', () => {
    const emitter = createEmitter({ type: 'point' });
    expect(emitter.type).toBe('point');
  });

  it('creates SphereEmitter with config', () => {
    const emitter = createEmitter({ type: 'sphere', radius: 3, radiusThickness: 0.5 });
    expect(emitter.type).toBe('sphere');
    expect((emitter as SphereEmitter).radius).toBe(3);
    expect((emitter as SphereEmitter).radiusThickness).toBe(0.5);
  });

  it('creates BoxEmitter with config', () => {
    const emitter = createEmitter({ type: 'box', size: { x: 2, y: 3, z: 4 } as any });
    expect(emitter.type).toBe('box');
    expect((emitter as BoxEmitter).size).toEqual({ x: 2, y: 3, z: 4 });
  });

  it('creates ConeEmitter with config', () => {
    const emitter = createEmitter({ type: 'cone', angle: Math.PI / 3, radius: 1, length: 2 });
    expect(emitter.type).toBe('cone');
    expect((emitter as ConeEmitter).angle).toBe(Math.PI / 3);
  });

  it('creates CircleEmitter with config', () => {
    const emitter = createEmitter({ type: 'circle', radius: 1.5, arc: Math.PI });
    expect(emitter.type).toBe('circle');
    expect((emitter as CircleEmitter).radius).toBe(1.5);
    expect((emitter as CircleEmitter).arc).toBe(Math.PI);
  });

  it('defaults to PointEmitter for unknown type', () => {
    const emitter = createEmitter({ type: 'unknown' as any });
    expect(emitter.type).toBe('point');
  });
});
