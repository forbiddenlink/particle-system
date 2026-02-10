import type { EmitterConfig, EmitterType } from './types.js';

/**
 * Base emitter class
 */
export abstract class Emitter {
  abstract readonly type: EmitterType;
  
  abstract getPosition(seed: number): { x: number; y: number; z: number };
  abstract getDirection(
    position: { x: number; y: number; z: number },
    seed: number
  ): { x: number; y: number; z: number };
}

/**
 * Point emitter - all particles spawn from a single point
 */
export class PointEmitter extends Emitter {
  readonly type: EmitterType = 'point';
  
  getPosition(_seed: number) {
    return { x: 0, y: 0, z: 0 };
  }
  
  getDirection(_position: { x: number; y: number; z: number }, seed: number) {
    // Random direction on unit sphere
    const theta = seed * Math.PI * 2;
    const phi = Math.acos(2 * ((seed * 1.618) % 1) - 1);
    return {
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.sin(phi) * Math.sin(theta),
      z: Math.cos(phi),
    };
  }
}

/**
 * Sphere emitter - particles spawn within or on a sphere
 */
export class SphereEmitter extends Emitter {
  readonly type: EmitterType = 'sphere';
  readonly radius: number;
  readonly radiusThickness: number;
  
  constructor(config: { radius?: number; radiusThickness?: number } = {}) {
    super();
    this.radius = config.radius ?? 1;
    this.radiusThickness = config.radiusThickness ?? 1;
  }
  
  getPosition(seed: number) {
    // Random point in sphere
    const theta = seed * Math.PI * 2;
    const phi = Math.acos(2 * ((seed * 1.618) % 1) - 1);
    
    // Radius from inner to outer based on thickness
    const innerRadius = this.radius * (1 - this.radiusThickness);
    const r = innerRadius + ((seed * 2.718) % 1) * (this.radius - innerRadius);
    
    return {
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
    };
  }
  
  getDirection(position: { x: number; y: number; z: number }, _seed: number) {
    // Direction is outward from center
    const len = Math.sqrt(
      position.x * position.x + position.y * position.y + position.z * position.z
    );
    if (len < 0.001) {
      return { x: 0, y: 1, z: 0 };
    }
    return {
      x: position.x / len,
      y: position.y / len,
      z: position.z / len,
    };
  }
}

/**
 * Box emitter - particles spawn within a box
 */
export class BoxEmitter extends Emitter {
  readonly type: EmitterType = 'box';
  readonly size: { x: number; y: number; z: number };
  
  constructor(config: { size?: { x: number; y: number; z: number } } = {}) {
    super();
    this.size = config.size ?? { x: 1, y: 1, z: 1 };
  }
  
  getPosition(seed: number) {
    // Random point in box centered at origin
    const s1 = (seed * 1.1) % 1;
    const s2 = (seed * 1.618) % 1;
    const s3 = (seed * 2.718) % 1;
    
    return {
      x: (s1 - 0.5) * this.size.x,
      y: (s2 - 0.5) * this.size.y,
      z: (s3 - 0.5) * this.size.z,
    };
  }
  
  getDirection(_position: { x: number; y: number; z: number }, _seed: number) {
    // Default upward direction
    return { x: 0, y: 1, z: 0 };
  }
}

/**
 * Cone emitter - particles spawn and move in a cone shape
 */
export class ConeEmitter extends Emitter {
  readonly type: EmitterType = 'cone';
  readonly angle: number;
  readonly radius: number;
  readonly length: number;
  
  constructor(
    config: { angle?: number; radius?: number; length?: number } = {}
  ) {
    super();
    this.angle = config.angle ?? Math.PI / 4;
    this.radius = config.radius ?? 0.5;
    this.length = config.length ?? 1;
  }
  
  getPosition(seed: number) {
    // Random point on base circle
    const theta = seed * Math.PI * 2;
    const r = Math.sqrt((seed * 1.618) % 1) * this.radius;
    
    return {
      x: r * Math.cos(theta),
      y: 0,
      z: r * Math.sin(theta),
    };
  }
  
  getDirection(position: { x: number; y: number; z: number }, seed: number) {
    // Direction within cone angle
    const baseAngle = Math.atan2(position.z, position.x);
    const coneAngle = ((seed * 2.718) % 1) * this.angle;
    
    return {
      x: Math.sin(coneAngle) * Math.cos(baseAngle),
      y: Math.cos(coneAngle),
      z: Math.sin(coneAngle) * Math.sin(baseAngle),
    };
  }
}

/**
 * Circle emitter - particles spawn on a 2D circle
 */
export class CircleEmitter extends Emitter {
  readonly type: EmitterType = 'circle';
  readonly radius: number;
  readonly arc: number;
  
  constructor(config: { radius?: number; arc?: number } = {}) {
    super();
    this.radius = config.radius ?? 1;
    this.arc = config.arc ?? Math.PI * 2;
  }
  
  getPosition(seed: number) {
    const theta = seed * this.arc;
    const r = Math.sqrt((seed * 1.618) % 1) * this.radius;
    
    return {
      x: r * Math.cos(theta),
      y: 0,
      z: r * Math.sin(theta),
    };
  }
  
  getDirection(_position: { x: number; y: number; z: number }, _seed: number) {
    // Default upward direction
    return { x: 0, y: 1, z: 0 };
  }
}

/**
 * Create an emitter from config
 */
export function createEmitter(config?: EmitterConfig): Emitter {
  if (!config) {
    return new PointEmitter();
  }
  
  switch (config.type) {
    case 'point':
      return new PointEmitter();
    case 'sphere':
      return new SphereEmitter({
        radius: config.radius,
        radiusThickness: config.radiusThickness,
      });
    case 'box':
      return new BoxEmitter({ size: config.size });
    case 'cone':
      return new ConeEmitter({
        angle: config.angle,
        radius: config.radius,
        length: config.length,
      });
    case 'circle':
      return new CircleEmitter({
        radius: config.radius,
        arc: config.arc,
      });
    default:
      return new PointEmitter();
  }
}
