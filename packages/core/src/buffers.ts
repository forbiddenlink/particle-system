import * as THREE from 'three/webgpu';
// @ts-ignore - TSL types are incomplete
import { storage } from 'three/tsl';

/**
 * Core particle buffers - always allocated
 */
export interface ParticleBuffers {
  position: THREE.StorageBufferAttribute;
  velocity: THREE.StorageBufferAttribute;
  color: THREE.StorageBufferAttribute;
  life: THREE.StorageBufferAttribute;
  size: THREE.StorageBufferAttribute;
  rotation: THREE.StorageBufferAttribute;
}

/**
 * TSL storage nodes for particle data
 */
export interface ParticleStorageNodes {
  position: ReturnType<typeof storage>;
  velocity: ReturnType<typeof storage>;
  color: ReturnType<typeof storage>;
  life: ReturnType<typeof storage>;
  size: ReturnType<typeof storage>;
  rotation: ReturnType<typeof storage>;
}

/**
 * Trail buffers - only allocated when trails are enabled
 */
export interface TrailBuffers {
  trail: THREE.StorageBufferAttribute;
  trailIndex: THREE.StorageBufferAttribute;
  trailVertex: THREE.StorageBufferAttribute;
  trailColorVertex: THREE.StorageBufferAttribute;
}

/**
 * TSL storage nodes for trail data
 */
export interface TrailStorageNodes {
  trail: ReturnType<typeof storage>;
  trailIndex: ReturnType<typeof storage>;
  trailVertex: ReturnType<typeof storage>;
  trailColorVertex: ReturnType<typeof storage>;
}

/**
 * Create core particle storage buffers
 */
export function createParticleBuffers(maxParticles: number): ParticleBuffers {
  return {
    // Position: vec3 per particle
    position: new THREE.StorageBufferAttribute(
      new Float32Array(maxParticles * 3),
      3
    ),
    // Velocity: vec3 per particle
    velocity: new THREE.StorageBufferAttribute(
      new Float32Array(maxParticles * 3),
      3
    ),
    // Color: vec4 per particle (RGBA)
    color: new THREE.StorageBufferAttribute(
      new Float32Array(maxParticles * 4),
      4
    ),
    // Life: vec2 per particle (currentLife, maxLife)
    life: new THREE.StorageBufferAttribute(
      new Float32Array(maxParticles * 2),
      2
    ),
    // Size: float per particle
    size: new THREE.StorageBufferAttribute(
      new Float32Array(maxParticles),
      1
    ),
    // Rotation: float per particle
    rotation: new THREE.StorageBufferAttribute(
      new Float32Array(maxParticles),
      1
    ),
  };
}

/**
 * Create TSL storage nodes from particle buffers
 */
export function createParticleStorageNodes(
  buffers: ParticleBuffers,
  maxParticles: number
): ParticleStorageNodes {
  return {
    position: storage(buffers.position, 'vec3', maxParticles),
    velocity: storage(buffers.velocity, 'vec3', maxParticles),
    color: storage(buffers.color, 'vec4', maxParticles),
    life: storage(buffers.life, 'vec2', maxParticles),
    size: storage(buffers.size, 'float', maxParticles),
    rotation: storage(buffers.rotation, 'float', maxParticles),
  };
}

/**
 * Create trail storage buffers
 * Only call when trails are enabled to save GPU memory
 */
export function createTrailBuffers(
  maxParticles: number,
  trailLength: number
): TrailBuffers {
  // Trail positions: trailLength vec3s per particle
  const trail = new THREE.StorageBufferAttribute(
    new Float32Array(maxParticles * trailLength * 3),
    3
  );

  // Trail index: current write position in ring buffer per particle
  const trailIndex = new THREE.StorageBufferAttribute(
    new Uint32Array(maxParticles),
    1
  );

  // Trail vertex buffers for line segment rendering
  // Each particle has (trailLength - 1) line segments = 2 * (trailLength - 1) vertices
  const trailVertexCount = maxParticles * (trailLength - 1) * 2;
  const trailVertex = new THREE.StorageBufferAttribute(
    new Float32Array(trailVertexCount * 3),
    3
  );
  const trailColorVertex = new THREE.StorageBufferAttribute(
    new Float32Array(trailVertexCount * 4),
    4
  );

  return { trail, trailIndex, trailVertex, trailColorVertex };
}

/**
 * Create TSL storage nodes from trail buffers
 */
export function createTrailStorageNodes(
  buffers: TrailBuffers,
  maxParticles: number,
  trailLength: number
): TrailStorageNodes {
  const trailVertexCount = maxParticles * (trailLength - 1) * 2;

  return {
    trail: storage(buffers.trail, 'vec3', maxParticles * trailLength),
    trailIndex: storage(buffers.trailIndex, 'uint', maxParticles),
    trailVertex: storage(buffers.trailVertex, 'vec3', trailVertexCount),
    trailColorVertex: storage(buffers.trailColorVertex, 'vec4', trailVertexCount),
  };
}

/**
 * Clear buffer arrays to help GC release GPU resources
 */
export function disposeParticleBuffers(buffers: ParticleBuffers): void {
  buffers.position.array = new Float32Array(0);
  buffers.velocity.array = new Float32Array(0);
  buffers.color.array = new Float32Array(0);
  buffers.life.array = new Float32Array(0);
  buffers.size.array = new Float32Array(0);
  buffers.rotation.array = new Float32Array(0);
}

/**
 * Clear trail buffer arrays to help GC release GPU resources
 */
export function disposeTrailBuffers(buffers: TrailBuffers): void {
  buffers.trail.array = new Float32Array(0);
  buffers.trailIndex.array = new Uint32Array(0);
  buffers.trailVertex.array = new Float32Array(0);
  buffers.trailColorVertex.array = new Float32Array(0);
}
