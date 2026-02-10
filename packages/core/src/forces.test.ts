import { describe, it, expect } from 'vitest';
import {
  GravityForce,
  WindForce,
  TurbulenceForce,
  PointAttractor,
  VortexForce,
  DragForce,
  CurlNoiseForce,
} from './forces.js';

describe('GravityForce', () => {
  it('has type "gravity"', () => {
    const force = new GravityForce();
    expect(force.type).toBe('gravity');
  });

  it('defaults to Earth gravity pointing down', () => {
    const force = new GravityForce();
    expect(force.strength).toBe(9.8);
    expect(force.direction).toEqual({ x: 0, y: -1, z: 0 });
  });

  it('accepts custom strength and direction', () => {
    const force = new GravityForce({
      strength: 5,
      direction: { x: 1, y: 0, z: 0 },
    });
    expect(force.strength).toBe(5);
    expect(force.direction).toEqual({ x: 1, y: 0, z: 0 });
  });
});

describe('WindForce', () => {
  it('has type "wind"', () => {
    const force = new WindForce();
    expect(force.type).toBe('wind');
  });

  it('has default values', () => {
    const force = new WindForce();
    expect(force.strength).toBe(5);
    expect(force.direction).toEqual({ x: 1, y: 0, z: 0 });
    expect(force.turbulence).toBe(0.5);
    expect(force.frequency).toBe(1);
  });

  it('accepts custom values', () => {
    const force = new WindForce({
      strength: 10,
      direction: { x: 0, y: 0, z: 1 },
      turbulence: 0.8,
      frequency: 2,
    });
    expect(force.strength).toBe(10);
    expect(force.direction).toEqual({ x: 0, y: 0, z: 1 });
    expect(force.turbulence).toBe(0.8);
    expect(force.frequency).toBe(2);
  });
});

describe('TurbulenceForce', () => {
  it('has type "turbulence"', () => {
    const force = new TurbulenceForce();
    expect(force.type).toBe('turbulence');
  });

  it('has default values', () => {
    const force = new TurbulenceForce();
    expect(force.strength).toBe(2);
    expect(force.frequency).toBe(1);
    expect(force.octaves).toBe(3);
    expect(force.roughness).toBe(0.5);
  });

  it('accepts custom values', () => {
    const force = new TurbulenceForce({
      strength: 5,
      frequency: 2,
      octaves: 4,
      roughness: 0.7,
    });
    expect(force.strength).toBe(5);
    expect(force.frequency).toBe(2);
    expect(force.octaves).toBe(4);
    expect(force.roughness).toBe(0.7);
  });
});

describe('PointAttractor', () => {
  it('has type "pointAttractor"', () => {
    const force = new PointAttractor();
    expect(force.type).toBe('pointAttractor');
  });

  it('has default values', () => {
    const force = new PointAttractor();
    expect(force.strength).toBe(10);
    expect(force.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(force.radius).toBe(5);
    expect(force.falloff).toBe('quadratic');
  });

  it('accepts custom values', () => {
    const force = new PointAttractor({
      strength: -5, // Repulsion
      position: { x: 1, y: 2, z: 3 },
      radius: 10,
      falloff: 'linear',
    });
    expect(force.strength).toBe(-5);
    expect(force.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(force.radius).toBe(10);
    expect(force.falloff).toBe('linear');
  });

  it('supports "none" falloff', () => {
    const force = new PointAttractor({ falloff: 'none' });
    expect(force.falloff).toBe('none');
  });
});

describe('VortexForce', () => {
  it('has type "vortex"', () => {
    const force = new VortexForce();
    expect(force.type).toBe('vortex');
  });

  it('has default values', () => {
    const force = new VortexForce();
    expect(force.strength).toBe(5);
    expect(force.axis).toEqual({ x: 0, y: 1, z: 0 });
    expect(force.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(force.radius).toBe(3);
    expect(force.pullStrength).toBe(0);
  });

  it('accepts custom values', () => {
    const force = new VortexForce({
      strength: 10,
      axis: { x: 1, y: 0, z: 0 },
      position: { x: 5, y: 5, z: 5 },
      radius: 8,
      pullStrength: 2,
    });
    expect(force.strength).toBe(10);
    expect(force.axis).toEqual({ x: 1, y: 0, z: 0 });
    expect(force.position).toEqual({ x: 5, y: 5, z: 5 });
    expect(force.radius).toBe(8);
    expect(force.pullStrength).toBe(2);
  });
});

describe('DragForce', () => {
  it('has type "drag"', () => {
    const force = new DragForce();
    expect(force.type).toBe('drag');
  });

  it('has default strength', () => {
    const force = new DragForce();
    expect(force.strength).toBe(0.1);
  });

  it('accepts custom strength', () => {
    const force = new DragForce({ strength: 0.5 });
    expect(force.strength).toBe(0.5);
  });
});

describe('CurlNoiseForce', () => {
  it('has type "curlNoise"', () => {
    const force = new CurlNoiseForce();
    expect(force.type).toBe('curlNoise');
  });

  it('has default values', () => {
    const force = new CurlNoiseForce();
    expect(force.strength).toBe(3);
    expect(force.scale).toBe(0.5);
    expect(force.speed).toBe(1);
  });

  it('accepts custom values', () => {
    const force = new CurlNoiseForce({
      strength: 5,
      scale: 1,
      speed: 2,
    });
    expect(force.strength).toBe(5);
    expect(force.scale).toBe(1);
    expect(force.speed).toBe(2);
  });
});
