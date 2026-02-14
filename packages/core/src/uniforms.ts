import * as THREE from 'three/webgpu';
// @ts-ignore - TSL types are incomplete
import { uniform, uniformArray } from 'three/tsl';

/** Number of samples for curve lookup tables */
export const CURVE_SAMPLES = 16;

/**
 * Particle system uniforms - all GPU-accessible parameters
 */
export interface ParticleUniforms {
  time: ReturnType<typeof uniform>;
  emitterPosition: ReturnType<typeof uniform>;
  gravity: ReturnType<typeof uniform>;
  startSpeed: ReturnType<typeof uniform>;
  startSize: ReturnType<typeof uniform>;
  startColor: ReturnType<typeof uniform>;
  lifetime: ReturnType<typeof uniform>;
  emissionRate: ReturnType<typeof uniform>;
  emitterRadius: ReturnType<typeof uniform>;
  emitterType: ReturnType<typeof uniform>;
  emitterBoxSize: ReturnType<typeof uniform>;
  emitterConeAngle: ReturnType<typeof uniform>;
  emitterConeRadius: ReturnType<typeof uniform>;
  emitterCircleArc: ReturnType<typeof uniform>;
  // Force uniforms
  drag: ReturnType<typeof uniform>;
  windDirection: ReturnType<typeof uniform>;
  windTurbulence: ReturnType<typeof uniform>;
  attractorPosition: ReturnType<typeof uniform>;
  attractorStrength: ReturnType<typeof uniform>;
  attractorRadius: ReturnType<typeof uniform>;
  vortexAxis: ReturnType<typeof uniform>;
  vortexStrength: ReturnType<typeof uniform>;
  vortexPosition: ReturnType<typeof uniform>;
  // Curve uniforms
  useSizeOverLifetime: ReturnType<typeof uniform>;
  useColorOverLifetime: ReturnType<typeof uniform>;
}

/**
 * Create default particle system uniforms
 */
export function createParticleUniforms(): ParticleUniforms {
  return {
    time: uniform(0),
    emitterPosition: uniform(new THREE.Vector3()),
    gravity: uniform(new THREE.Vector3(0, -9.8, 0)),
    startSpeed: uniform(new THREE.Vector2(1, 1)), // min, max
    startSize: uniform(new THREE.Vector2(0.1, 0.1)), // min, max
    startColor: uniform(new THREE.Vector4(1, 1, 1, 1)),
    lifetime: uniform(new THREE.Vector2(1, 2)), // min, max
    emissionRate: uniform(100),
    emitterRadius: uniform(0),
    emitterType: uniform(0), // 0: point, 1: sphere, 2: box, 3: cone, 4: circle
    emitterBoxSize: uniform(new THREE.Vector3(1, 1, 1)), // Box emitter size
    emitterConeAngle: uniform(Math.PI / 4), // Cone emitter angle (radians)
    emitterConeRadius: uniform(0.5), // Cone emitter base radius
    emitterCircleArc: uniform(Math.PI * 2), // Circle emitter arc (radians)
    // Force uniforms
    drag: uniform(0), // Drag coefficient (0-1)
    windDirection: uniform(new THREE.Vector3(0, 0, 0)), // Wind direction * strength
    windTurbulence: uniform(0), // Wind turbulence amount
    attractorPosition: uniform(new THREE.Vector3(0, 0, 0)), // Point attractor position
    attractorStrength: uniform(0), // Point attractor strength (negative = repel)
    attractorRadius: uniform(1), // Point attractor radius of influence
    vortexAxis: uniform(new THREE.Vector3(0, 1, 0)), // Vortex rotation axis
    vortexStrength: uniform(0), // Vortex rotation strength
    vortexPosition: uniform(new THREE.Vector3(0, 0, 0)), // Vortex center position
    // Curve uniforms - use flags to enable/disable
    useSizeOverLifetime: uniform(0), // 0 = disabled, 1 = enabled
    useColorOverLifetime: uniform(0), // 0 = disabled, 1 = enabled
  };
}

/**
 * Curve uniform arrays for size and color over lifetime
 */
export interface CurveUniforms {
  sizeOverLifetime: ReturnType<typeof uniformArray>;
  colorOverLifetime: ReturnType<typeof uniformArray>;
  // Raw sample arrays for updating
  sizeOverLifetimeSamples: number[];
  colorOverLifetimeSamples: number[];
}

/**
 * Create curve uniform arrays with default values
 */
export function createCurveUniforms(): CurveUniforms {
  const sizeOverLifetimeSamples = Array(CURVE_SAMPLES).fill(1);
  const colorOverLifetimeSamples = Array(CURVE_SAMPLES * 4).fill(1); // RGBA interleaved

  return {
    sizeOverLifetime: uniformArray(sizeOverLifetimeSamples),
    colorOverLifetime: uniformArray(colorOverLifetimeSamples),
    sizeOverLifetimeSamples,
    colorOverLifetimeSamples,
  };
}
