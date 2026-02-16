import type * as THREE from 'three';
import type { AnyForce } from './forces.js';

/** Render modes for particles */
export type RenderMode = 'billboard' | 'stretchedBillboard' | 'mesh' | 'trail';

/** Blend modes for particle rendering */
export type BlendMode = 'normal' | 'additive' | 'multiply' | 'screen';

/** Space for particle simulation */
export type SimulationSpace = 'local' | 'world';

/** A value that can be constant or vary */
export interface ValueRange {
  min: number;
  max: number;
}

/** Configuration for a particle system */
export interface ParticleSystemConfig {
  /** Maximum number of particles */
  maxParticles: number;
  
  /** Duration of the particle system in seconds (0 = infinite) */
  duration?: number;
  
  /** Whether to loop the particle system */
  looping?: boolean;
  
  /** Particle lifetime in seconds */
  lifetime?: number | ValueRange;
  
  /** Initial speed of particles */
  startSpeed?: number | ValueRange;
  
  /** Initial size of particles */
  startSize?: number | ValueRange;
  
  /** Initial color of particles (hex or Color) */
  startColor?: number | THREE.Color;
  
  /** Initial opacity of particles */
  startOpacity?: number | ValueRange;
  
  /** Initial rotation in radians */
  startRotation?: number | ValueRange;
  
  /** Emission rate (particles per second) */
  emissionRate?: number;
  
  /** Emitter shape configuration */
  emitter?: EmitterConfig;
  
  /** Render mode */
  renderMode?: RenderMode;
  
  /** Blend mode */
  blendMode?: BlendMode;
  
  /** Simulation space */
  simulationSpace?: SimulationSpace;
  
  /** Particle texture */
  texture?: THREE.Texture;
  
  /** Gravity force applied to particles */
  gravity?: THREE.Vector3;
  
  /** Size over lifetime curve (0-1 normalized age -> scale multiplier) */
  sizeOverLifetime?: number[];
  
  /** Opacity over lifetime curve (0-1 normalized age -> opacity) */
  opacityOverLifetime?: number[];
  
  /** Color over lifetime gradient */
  colorOverLifetime?: GradientStop[];
  
  /** Rotation speed in radians per second */
  rotationSpeed?: number | ValueRange;

  /** Force fields to apply to particles */
  forces?: AnyForce[];

  /** Drag coefficient (0-1, slows particles over time) */
  drag?: number;

  /** Trail rendering configuration */
  trails?: TrailConfig;
}

/** Configuration for particle trails */
export interface TrailConfig {
  /** Whether trails are enabled */
  enabled: boolean;
  /** Number of positions to store per particle (default: 8) */
  length?: number;
  /** Whether to fade trail alpha from newest to oldest (default: true) */
  fadeAlpha?: boolean;
}

/** Emitter shape types */
export type EmitterType = 'point' | 'sphere' | 'box' | 'cone' | 'circle';

/** Emitter configuration */
export interface EmitterConfig {
  type: EmitterType;
  
  // Sphere emitter
  radius?: number;
  radiusThickness?: number; // 0 = surface only, 1 = full volume
  
  // Box emitter
  size?: THREE.Vector3;
  
  // Cone emitter
  angle?: number;
  length?: number;
  
  // Circle emitter
  arc?: number;
  
  // Direction settings
  randomizeDirection?: boolean;
}

/** Gradient color stop */
export interface GradientStop {
  position: number; // 0-1
  color: THREE.Color | number;
}

/** Particle attribute data layout */
export interface ParticleAttributes {
  position: Float32Array;
  velocity: Float32Array;
  color: Float32Array;
  life: Float32Array;      // [currentLife, maxLife] per particle
  size: Float32Array;
  rotation: Float32Array;
  seed: Float32Array;      // Random seed per particle
}

/** Internal particle system state */
export interface ParticleSystemState {
  time: number;
  deltaTime: number;
  particleCount: number;
  emissionAccumulator: number;
  isPlaying: boolean;
}
