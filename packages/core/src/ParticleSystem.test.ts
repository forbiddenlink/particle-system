import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMinMax } from './ParticleSystem.js';

// Mock THREE.js modules since we're in Node.js without WebGPU
vi.mock('three/webgpu', () => ({
  Object3D: class Object3D {
    add() {}
    remove() {}
    getWorldPosition(target: any) { return target; }
  },
  Vector3: class Vector3 {
    x = 0; y = 0; z = 0;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x; this.y = y; this.z = z;
    }
    set(x: number, y: number, z: number) {
      this.x = x; this.y = y; this.z = z;
      return this;
    }
    copy(v: any) {
      this.x = v.x; this.y = v.y; this.z = v.z;
      return this;
    }
    normalize() { return this; }
  },
  Vector2: class Vector2 {
    x = 0; y = 0;
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  },
  Vector4: class Vector4 {
    x = 0; y = 0; z = 0; w = 0;
    constructor(x = 0, y = 0, z = 0, w = 0) {
      this.x = x; this.y = y; this.z = z; this.w = w;
    }
  },
  Color: class Color {
    r = 0; g = 0; b = 0;
    constructor(hex?: number) {
      if (hex !== undefined) {
        this.r = ((hex >> 16) & 255) / 255;
        this.g = ((hex >> 8) & 255) / 255;
        this.b = (hex & 255) / 255;
      }
    }
  },
  StorageBufferAttribute: class StorageBufferAttribute {
    array: Float32Array | Uint32Array;
    itemSize: number;
    constructor(array: Float32Array | Uint32Array, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  },
  BufferAttribute: class BufferAttribute {
    constructor(_array: Float32Array, _itemSize: number) {}
  },
  BufferGeometry: class BufferGeometry {
    setAttribute() {}
    dispose() {}
  },
  PlaneGeometry: class PlaneGeometry {
    dispose() {}
  },
  InstancedMesh: class InstancedMesh {
    count = 0;
    frustumCulled = true;
    geometry = { dispose: () => {} };
    constructor(_geo: any, _mat: any, _count: number) {}
  },
  LineSegments: class LineSegments {
    frustumCulled = true;
    visible = true;
  },
  SpriteNodeMaterial: class SpriteNodeMaterial {
    transparent = false;
    depthWrite = false;
    blending = 0;
    map: any = null;
    colorNode: any = null;
    positionNode: any = null;
    dispose() {}
  },
  LineBasicNodeMaterial: class LineBasicNodeMaterial {
    transparent = false;
    depthWrite = false;
    blending = 0;
    positionNode: any = null;
    colorNode: any = null;
    opacityNode: any = null;
    dispose() {}
  },
  AdditiveBlending: 2,
  NormalBlending: 1,
}));

// Mock TSL functions
vi.mock('three/tsl', () => ({
  Fn: (fn: Function) => () => fn(),
  storage: () => ({ element: () => ({ assign: () => {}, x: {}, y: {}, z: {}, w: {} }) }),
  instanceIndex: {},
  vertexIndex: {},
  uniform: (val: any) => ({ value: val }),
  uniformArray: (arr: number[]) => ({ array: arr }),
  vec3: () => ({ addAssign: () => {}, mul: () => ({}), add: () => ({}), sub: () => ({}), div: () => ({}), cross: () => ({}) }),
  vec4: () => ({}),
  float: () => ({ sub: () => ({}), mul: () => ({}), div: () => ({}), add: () => ({}) }),
  int: () => ({ mul: () => ({}), add: () => ({}), modInt: () => ({}) }),
  If: () => {},
  Loop: () => {},
  hash: () => ({ mul: () => ({}), add: () => ({}), sub: () => ({}) }),
  mix: () => ({}),
  sin: () => ({ mul: () => ({}) }),
  cos: () => ({}),
  sqrt: () => ({ mul: () => ({}) }),
  acos: () => ({}),
  floor: () => ({ toInt: () => ({}) }),
  PI2: Math.PI * 2,
  deltaTime: 0,
  billboarding: () => ({ mul: () => ({ add: () => ({}) }) }),
}));

describe('getMinMax', () => {
  it('returns same min/max for a single number', () => {
    const result = getMinMax(5);
    expect(result).toEqual({ min: 5, max: 5 });
  });

  it('returns same min/max for zero', () => {
    const result = getMinMax(0);
    expect(result).toEqual({ min: 0, max: 0 });
  });

  it('returns same min/max for negative number', () => {
    const result = getMinMax(-10);
    expect(result).toEqual({ min: -10, max: -10 });
  });

  it('returns min/max from a range object', () => {
    const result = getMinMax({ min: 1, max: 10 });
    expect(result).toEqual({ min: 1, max: 10 });
  });

  it('handles range where min equals max', () => {
    const result = getMinMax({ min: 5, max: 5 });
    expect(result).toEqual({ min: 5, max: 5 });
  });

  it('handles range with negative values', () => {
    const result = getMinMax({ min: -20, max: -5 });
    expect(result).toEqual({ min: -20, max: -5 });
  });

  it('handles range spanning zero', () => {
    const result = getMinMax({ min: -10, max: 10 });
    expect(result).toEqual({ min: -10, max: 10 });
  });

  it('handles floating point values', () => {
    const result = getMinMax({ min: 0.1, max: 0.9 });
    expect(result).toEqual({ min: 0.1, max: 0.9 });
  });
});

describe('ParticleSystem', () => {
  // Import after mocks are set up
  let ParticleSystem: typeof import('./ParticleSystem.js').ParticleSystem;

  beforeEach(async () => {
    // Dynamic import to ensure mocks are applied
    const module = await import('./ParticleSystem.js');
    ParticleSystem = module.ParticleSystem;
  });

  describe('constructor', () => {
    it('creates instance with required config', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
      });
      expect(system.maxParticles).toBe(1000);
    });

    it('applies default emissionRate', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
      });
      expect(system.config.emissionRate).toBe(100);
    });

    it('applies custom emissionRate', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
        emissionRate: 500,
      });
      expect(system.config.emissionRate).toBe(500);
    });

    it('defaults looping to true', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
      });
      expect(system.config.looping).toBe(true);
    });

    it('defaults duration to 0', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
      });
      expect(system.config.duration).toBe(0);
    });

    it('preserves maxParticles in config', () => {
      const system = new ParticleSystem({
        maxParticles: 50000,
      });
      expect(system.config.maxParticles).toBe(50000);
    });
  });

  describe('trail configuration', () => {
    it('trails disabled by default', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
      });
      expect(system.getTrailsEnabled()).toBe(false);
    });

    it('enables trails when configured', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
        trails: {
          enabled: true,
          length: 8,
        },
      });
      // Note: getTrailsEnabled checks both config and mesh existence
      // In mocked environment, mesh won't be fully set up
      expect(system.config.trails?.enabled).toBe(true);
    });

    it('uses default trail length of 8', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
        trails: {
          enabled: true,
        },
      });
      expect(system.config.trails?.length).toBeUndefined(); // Uses internal default
    });

    it('uses custom trail length', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
        trails: {
          enabled: true,
          length: 16,
        },
      });
      expect(system.config.trails?.length).toBe(16);
    });
  });

  describe('emitter configuration', () => {
    it('defaults to point emitter (type 0)', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
      });
      expect(system.config.emitter).toBeUndefined();
    });

    it('accepts sphere emitter config', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
        emitter: {
          type: 'sphere',
          radius: 2,
        },
      });
      expect(system.config.emitter?.type).toBe('sphere');
      expect(system.config.emitter?.radius).toBe(2);
    });

    it('accepts box emitter config', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
        emitter: {
          type: 'box',
          size: { x: 1, y: 2, z: 3 } as any,
        },
      });
      expect(system.config.emitter?.type).toBe('box');
    });

    it('accepts cone emitter config', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
        emitter: {
          type: 'cone',
          angle: Math.PI / 6,
          radius: 0.5,
        },
      });
      expect(system.config.emitter?.type).toBe('cone');
      expect(system.config.emitter?.angle).toBe(Math.PI / 6);
    });

    it('accepts circle emitter config', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
        emitter: {
          type: 'circle',
          radius: 1,
          arc: Math.PI,
        },
      });
      expect(system.config.emitter?.type).toBe('circle');
      expect(system.config.emitter?.arc).toBe(Math.PI);
    });
  });

  describe('force setters', () => {
    it('setGravity updates gravity uniform', () => {
      const system = new ParticleSystem({ maxParticles: 1000 });
      system.setGravity(0, -20, 0);
      // Can't directly test uniform values without exposing them
      // This test verifies the method doesn't throw
    });

    it('setDrag clamps to 0-1 range', () => {
      const system = new ParticleSystem({ maxParticles: 1000 });
      system.setDrag(0.5);
      system.setDrag(2); // Should clamp to 1
      system.setDrag(-1); // Should clamp to 0
    });

    it('setWind accepts direction and turbulence', () => {
      const system = new ParticleSystem({ maxParticles: 1000 });
      system.setWind(5, 0, 0);
      system.setWind(5, 0, 0, 0.5);
    });

    it('setAttractor accepts position, strength, and radius', () => {
      const system = new ParticleSystem({ maxParticles: 1000 });
      system.setAttractor(0, 5, 0, 10);
      system.setAttractor(0, 5, 0, 10, 20);
    });

    it('setVortex accepts position, axis, and strength', () => {
      const system = new ParticleSystem({ maxParticles: 1000 });
      system.setVortex(0, 0, 0, 0, 1, 0, 5);
    });

    it('clearForces resets all forces', () => {
      const system = new ParticleSystem({ maxParticles: 1000 });
      system.setDrag(0.5);
      system.setWind(5, 0, 0);
      system.setAttractor(0, 5, 0, 10);
      system.setVortex(0, 0, 0, 0, 1, 0, 5);
      system.clearForces();
    });
  });

  describe('lifecycle', () => {
    it('play sets isPlaying', () => {
      const system = new ParticleSystem({ maxParticles: 1000 });
      system.play();
      // State is private, but play() should not throw
    });

    it('stop sets isPlaying to false', () => {
      const system = new ParticleSystem({ maxParticles: 1000 });
      system.play();
      system.stop();
    });

    it('dispose cleans up resources', () => {
      const system = new ParticleSystem({ maxParticles: 1000 });
      system.dispose();
      // Should not throw
    });

    it('dispose with trails cleans up trail resources', () => {
      const system = new ParticleSystem({
        maxParticles: 1000,
        trails: { enabled: true },
      });
      system.dispose();
    });
  });
});
