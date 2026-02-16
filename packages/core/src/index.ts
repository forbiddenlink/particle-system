// Nova Particles Core - GPU-accelerated particle system for Three.js
// Uses WebGPU compute shaders via TSL for million-particle simulations

export { ParticleSystem, getMinMax } from './ParticleSystem.js';

export {
  Emitter,
  PointEmitter,
  SphereEmitter,
  BoxEmitter,
  ConeEmitter,
  CircleEmitter,
  createEmitter,
} from './emitters.js';

export {
  GravityForce,
  WindForce,
  TurbulenceForce,
  PointAttractor,
  VortexForce,
  DragForce,
  CurlNoiseForce,
} from './forces.js';

export type { Force, AnyForce } from './forces.js';

export { AnimationCurve, ColorGradient } from './curves.js';

export type { Keyframe, ColorKeyframe } from './curves.js';

export type {
  ParticleSystemConfig,
  EmitterConfig,
  EmitterType,
  RenderMode,
  BlendMode,
  SimulationSpace,
  ValueRange,
  GradientStop,
  ParticleAttributes,
  ParticleSystemState,
  TrailConfig,
} from './types.js';

export { ParticleTextureGenerator, ParticleTextureAtlas, type ParticleTextureType } from './textures/index.js';
