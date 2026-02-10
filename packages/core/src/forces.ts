/**
 * Base force interface
 */
export interface Force {
  readonly type: string;
  /** Strength multiplier */
  strength: number;
}

/**
 * Gravity force - constant directional acceleration
 */
export class GravityForce implements Force {
  readonly type = 'gravity';
  strength: number;
  direction: { x: number; y: number; z: number };
  
  constructor(config: {
    strength?: number;
    direction?: { x: number; y: number; z: number };
  } = {}) {
    this.strength = config.strength ?? 9.8;
    this.direction = config.direction ?? { x: 0, y: -1, z: 0 };
  }
}

/**
 * Wind force - directional force with turbulence
 */
export class WindForce implements Force {
  readonly type = 'wind';
  strength: number;
  direction: { x: number; y: number; z: number };
  turbulence: number;
  frequency: number;
  
  constructor(config: {
    strength?: number;
    direction?: { x: number; y: number; z: number };
    turbulence?: number;
    frequency?: number;
  } = {}) {
    this.strength = config.strength ?? 5;
    this.direction = config.direction ?? { x: 1, y: 0, z: 0 };
    this.turbulence = config.turbulence ?? 0.5;
    this.frequency = config.frequency ?? 1;
  }
}

/**
 * Turbulence force - 3D noise-based force field
 */
export class TurbulenceForce implements Force {
  readonly type = 'turbulence';
  strength: number;
  frequency: number;
  octaves: number;
  roughness: number;
  
  constructor(config: {
    strength?: number;
    frequency?: number;
    octaves?: number;
    roughness?: number;
  } = {}) {
    this.strength = config.strength ?? 2;
    this.frequency = config.frequency ?? 1;
    this.octaves = config.octaves ?? 3;
    this.roughness = config.roughness ?? 0.5;
  }
}

/**
 * Point attractor - pulls or pushes particles toward/away from a point
 */
export class PointAttractor implements Force {
  readonly type = 'pointAttractor';
  strength: number;
  position: { x: number; y: number; z: number };
  radius: number;
  falloff: 'linear' | 'quadratic' | 'none';
  
  constructor(config: {
    strength?: number;
    position?: { x: number; y: number; z: number };
    radius?: number;
    falloff?: 'linear' | 'quadratic' | 'none';
  } = {}) {
    this.strength = config.strength ?? 10; // Negative = repel
    this.position = config.position ?? { x: 0, y: 0, z: 0 };
    this.radius = config.radius ?? 5;
    this.falloff = config.falloff ?? 'quadratic';
  }
}

/**
 * Vortex force - rotational force around an axis
 */
export class VortexForce implements Force {
  readonly type = 'vortex';
  strength: number;
  axis: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  radius: number;
  pullStrength: number;
  
  constructor(config: {
    strength?: number;
    axis?: { x: number; y: number; z: number };
    position?: { x: number; y: number; z: number };
    radius?: number;
    pullStrength?: number;
  } = {}) {
    this.strength = config.strength ?? 5;
    this.axis = config.axis ?? { x: 0, y: 1, z: 0 };
    this.position = config.position ?? { x: 0, y: 0, z: 0 };
    this.radius = config.radius ?? 3;
    this.pullStrength = config.pullStrength ?? 0;
  }
}

/**
 * Drag force - slows particles based on velocity
 */
export class DragForce implements Force {
  readonly type = 'drag';
  strength: number;
  
  constructor(config: { strength?: number } = {}) {
    this.strength = config.strength ?? 0.1;
  }
}

/**
 * Curl noise force - creates swirling, smoke-like motion
 */
export class CurlNoiseForce implements Force {
  readonly type = 'curlNoise';
  strength: number;
  scale: number;
  speed: number;
  
  constructor(config: {
    strength?: number;
    scale?: number;
    speed?: number;
  } = {}) {
    this.strength = config.strength ?? 3;
    this.scale = config.scale ?? 0.5;
    this.speed = config.speed ?? 1;
  }
}

export type AnyForce = 
  | GravityForce 
  | WindForce 
  | TurbulenceForce 
  | PointAttractor 
  | VortexForce 
  | DragForce
  | CurlNoiseForce;
