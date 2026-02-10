import * as THREE from 'three/webgpu';
// @ts-ignore - TSL types are incomplete
import {
  Fn,
  storage,
  instanceIndex,
  uniform,
  uniformArray,
  vec3,
  vec4,
  float,
  int,
  If,
  hash,
  mix,
  sin,
  cos,
  sqrt,
  acos,
  floor,
  PI2,
  deltaTime,
  billboarding,
} from 'three/tsl';
import type { ParticleSystemConfig, ValueRange } from './types.js';
import { createEmitter } from './emitters.js';
import { AnimationCurve, ColorGradient } from './curves.js';

/** Number of samples for curve lookup tables */
const CURVE_SAMPLES = 16;

/**
 * GPU-accelerated particle system using WebGPU compute shaders via TSL
 * 
 * Simulates millions of particles at 60fps by running physics entirely on the GPU.
 */
export class ParticleSystem extends THREE.Object3D {
  readonly maxParticles: number;
  readonly config: Required<
    Pick<ParticleSystemConfig, 'lifetime' | 'emissionRate' | 'looping' | 'duration'>
  > & ParticleSystemConfig;
  
  private renderer: THREE.WebGPURenderer | null = null;
  
  // GPU Storage Buffers
  private positionBuffer!: THREE.StorageBufferAttribute;
  private velocityBuffer!: THREE.StorageBufferAttribute;
  private colorBuffer!: THREE.StorageBufferAttribute;
  private lifeBuffer!: THREE.StorageBufferAttribute; // x: currentLife, y: maxLife
  private sizeBuffer!: THREE.StorageBufferAttribute;
  private rotationBuffer!: THREE.StorageBufferAttribute;
  
  // TSL Storage nodes
  private positionStorage: ReturnType<typeof storage> | null = null;
  private velocityStorage: ReturnType<typeof storage> | null = null;
  private colorStorage: ReturnType<typeof storage> | null = null;
  private lifeStorage: ReturnType<typeof storage> | null = null;
  private sizeStorage: ReturnType<typeof storage> | null = null;
  private rotationStorage: ReturnType<typeof storage> | null = null;
  
  // Compute shaders
  // @ts-ignore - TSL compute type
  private initCompute: any = null;
  // @ts-ignore - TSL compute type
  private updateCompute: any = null;
  
  // Uniforms
  private uniforms = {
    time: uniform(0),
    emitterPosition: uniform(new THREE.Vector3()),
    gravity: uniform(new THREE.Vector3(0, -9.8, 0)),
    startSpeed: uniform(new THREE.Vector2(1, 1)), // min, max
    startSize: uniform(new THREE.Vector2(0.1, 0.1)), // min, max
    startColor: uniform(new THREE.Vector4(1, 1, 1, 1)),
    lifetime: uniform(new THREE.Vector2(1, 2)), // min, max
    emissionRate: uniform(100),
    emitterRadius: uniform(0),
    emitterType: uniform(0), // 0: point, 1: sphere, 2: box, 3: cone
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

  // Curve lookup tables (baked from AnimationCurve/ColorGradient)
  private sizeOverLifetimeSamples: number[] = Array(CURVE_SAMPLES).fill(1);
  private colorOverLifetimeSamples: number[] = Array(CURVE_SAMPLES * 4).fill(1); // RGBA interleaved

  // TSL uniform arrays for curves (initialized in initComputeShaders)
  private sizeOverLifetimeUniform: ReturnType<typeof uniformArray> | null = null;
  private colorOverLifetimeUniform: ReturnType<typeof uniformArray> | null = null;
  
  // Rendering
  private mesh!: THREE.InstancedMesh;
  private material!: THREE.SpriteNodeMaterial;
  
  // State
  private isInitialized = false;
  private isPlaying = false;
  private elapsedTime = 0;
  
  constructor(config: ParticleSystemConfig) {
    super();
    
    this.maxParticles = config.maxParticles;
    this.config = {
      ...config,
      emissionRate: config.emissionRate ?? 100,
      looping: config.looping ?? true,
      duration: config.duration ?? 0,
    };
    
    // Initialize emitter (used for CPU-side config)
    createEmitter(config.emitter);
    
    this.initBuffers();
    this.initMaterial();
    this.initMesh();
  }
  
  /**
   * Initialize GPU storage buffers for particle data
   */
  private initBuffers(): void {
    const count = this.maxParticles;
    
    // Position: vec3 per particle
    this.positionBuffer = new THREE.StorageBufferAttribute(
      new Float32Array(count * 3),
      3
    );
    
    // Velocity: vec3 per particle
    this.velocityBuffer = new THREE.StorageBufferAttribute(
      new Float32Array(count * 3),
      3
    );
    
    // Color: vec4 per particle (RGBA)
    this.colorBuffer = new THREE.StorageBufferAttribute(
      new Float32Array(count * 4),
      4
    );
    
    // Life: vec2 per particle (currentLife, maxLife)
    this.lifeBuffer = new THREE.StorageBufferAttribute(
      new Float32Array(count * 2),
      2
    );
    
    // Size: float per particle
    this.sizeBuffer = new THREE.StorageBufferAttribute(
      new Float32Array(count),
      1
    );
    
    // Rotation: float per particle
    this.rotationBuffer = new THREE.StorageBufferAttribute(
      new Float32Array(count),
      1
    );
    
    // Create TSL storage nodes
    this.positionStorage = storage(this.positionBuffer, 'vec3', count);
    this.velocityStorage = storage(this.velocityBuffer, 'vec3', count);
    this.colorStorage = storage(this.colorBuffer, 'vec4', count);
    this.lifeStorage = storage(this.lifeBuffer, 'vec2', count);
    this.sizeStorage = storage(this.sizeBuffer, 'float', count);
    this.rotationStorage = storage(this.rotationBuffer, 'float', count);
  }
  
  /**
   * Initialize particle material with billboarding
   */
  private initMaterial(): void {
    this.material = new THREE.SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: this.config.blendMode === 'additive' 
        ? THREE.AdditiveBlending 
        : THREE.NormalBlending,
    });
    
    // Set texture if provided
    if (this.config.texture) {
      this.material.map = this.config.texture;
    }
    
    // Color from storage buffer
    const colorStorage = this.colorStorage!;
    this.material.colorNode = colorStorage.element(instanceIndex);
  }
  
  /**
   * Initialize instanced mesh for rendering
   */
  private initMesh(): void {
    // Simple quad geometry for sprites
    const geometry = new THREE.PlaneGeometry(1, 1);
    
    this.mesh = new THREE.InstancedMesh(geometry, this.material, this.maxParticles);
    this.mesh.count = 0; // Start with no visible particles
    this.mesh.frustumCulled = false;
    
    // Bind position from storage buffer
    const positionStorage = this.positionStorage!;
    const sizeStorage = this.sizeStorage!;
    
    // Custom vertex shader for positioning and billboarding
    this.material.positionNode = Fn(() => {
      const particlePos = positionStorage.element(instanceIndex);
      const particleSize = sizeStorage.element(instanceIndex);
      
      // Apply billboarding and scale
      return billboarding().mul(particleSize).add(particlePos);
    })();
    
    this.add(this.mesh);
  }
  
  /**
   * Create compute shaders for particle simulation
   */
  private initComputeShaders(): void {
    const count = this.maxParticles;
    const positionStorage = this.positionStorage!;
    const velocityStorage = this.velocityStorage!;
    const colorStorage = this.colorStorage!;
    const lifeStorage = this.lifeStorage!;
    const sizeStorage = this.sizeStorage!;
    const rotationStorage = this.rotationStorage!;
    const uniforms = this.uniforms;

    // Initialize curve uniform arrays
    this.sizeOverLifetimeUniform = uniformArray(this.sizeOverLifetimeSamples);
    this.colorOverLifetimeUniform = uniformArray(this.colorOverLifetimeSamples);
    const sizeOverLifetimeArr = this.sizeOverLifetimeUniform;
    const colorOverLifetimeArr = this.colorOverLifetimeUniform;
    
    // Initialize compute - sets up initial particle state
    // @ts-ignore - TSL Fn typing
    this.initCompute = Fn(() => {
      const i = instanceIndex;
      
      // Use particle index as seed for deterministic randomness
      const seed = hash(i);
      const seed2 = hash(i.add(1000));
      const seed3 = hash(i.add(2000));
      
      // Random position based on emitter type
      const emitterType = uniforms.emitterType;
      const radius = uniforms.emitterRadius;
      
      // Spherical coordinates for random direction
      const theta = seed.mul(PI2);
      const phi = acos(seed2.mul(2).sub(1));
      
      // Point emitter: all at origin
      const pointPos = vec3(0, 0, 0);
      
      // Sphere emitter: random point in sphere
      const r = sqrt(seed3).mul(radius);
      const spherePos = vec3(
        sin(phi).mul(cos(theta)).mul(r),
        sin(phi).mul(sin(theta)).mul(r),
        cos(phi).mul(r)
      );
      
      // Select position based on emitter type
      const pos = mix(pointPos, spherePos, emitterType.greaterThan(0).toFloat());
      pos.addAssign(uniforms.emitterPosition);
      
      positionStorage.element(i).assign(pos);
      
      // Random velocity direction
      const speed = mix(
        uniforms.startSpeed.x,
        uniforms.startSpeed.y,
        seed
      );
      
      const velDir = vec3(
        sin(phi).mul(cos(theta)),
        sin(phi).mul(sin(theta)),
        cos(phi)
      );
      velocityStorage.element(i).assign(velDir.mul(speed));
      
      // Color
      colorStorage.element(i).assign(uniforms.startColor);
      
      // Life: x = current (starts at max), y = max
      const maxLife = mix(uniforms.lifetime.x, uniforms.lifetime.y, seed);
      lifeStorage.element(i).assign(vec3(maxLife, maxLife, 0).xy);
      
      // Size
      const size = mix(uniforms.startSize.x, uniforms.startSize.y, seed2);
      sizeStorage.element(i).assign(size);
      
      // Rotation
      rotationStorage.element(i).assign(seed3.mul(PI2));
      
      return vec3(0, 0, 0); // TSL requires return
    })().compute(count, [64]);
    
    // Update compute - runs every frame to simulate particles
    // @ts-ignore - TSL Fn typing
    this.updateCompute = Fn(() => {
      const i = instanceIndex;

      // Read current state
      const pos = positionStorage.element(i);
      const vel = velocityStorage.element(i);
      const life = lifeStorage.element(i);

      // Get current and max life
      const currentLife = life.x;
      const maxLife = life.y;

      // Only update if particle is alive
      If(currentLife.greaterThan(0), () => {
        // Calculate all forces and accumulate into velocity
        // Gravity
        const gravityForce = uniforms.gravity.mul(deltaTime);

        // Drag (velocity damping) - apply as multiplier
        const dragFactor = float(1).sub(uniforms.drag.mul(deltaTime));

        // Wind force
        const windForce = uniforms.windDirection.mul(deltaTime);

        // Point attractor
        const toAttractor = uniforms.attractorPosition.sub(pos);
        const distToAttractor = toAttractor.length().max(0.001); // Avoid division by zero
        const attractorInfluence = float(1).sub(
          distToAttractor.div(uniforms.attractorRadius).clamp(0, 1)
        );
        const attractorForce = toAttractor
          .div(distToAttractor) // normalize
          .mul(uniforms.attractorStrength)
          .mul(attractorInfluence)
          .mul(deltaTime);

        // Vortex force (rotation around axis)
        const toVortexCenter = pos.sub(uniforms.vortexPosition);
        // Cross product with axis gives tangent direction
        const tangent = uniforms.vortexAxis.cross(toVortexCenter);
        const tangentLen = tangent.length().max(0.001);
        const vortexForce = tangent
          .div(tangentLen) // normalize
          .mul(uniforms.vortexStrength)
          .mul(deltaTime);

        // Combine all forces: first apply drag to existing velocity, then add forces
        const newVel = vel
          .mul(dragFactor)
          .add(gravityForce)
          .add(windForce)
          .add(attractorForce)
          .add(vortexForce);

        // Store updated velocity
        velocityStorage.element(i).assign(newVel);

        // Update position
        const newPos = pos.add(newVel.mul(deltaTime));
        positionStorage.element(i).assign(newPos);

        // Update life
        const newLife = currentLife.sub(deltaTime);
        lifeStorage.element(i).x.assign(newLife);

        // Calculate normalized age (0 = born, 1 = dead)
        const normalizedAge = float(1).sub(newLife.div(maxLife));

        // Sample size curve if enabled
        // Map age to array index (0-15)
        const curveIndex = floor(normalizedAge.mul(float(CURVE_SAMPLES - 1))).toInt();
        const sizeMultiplier = mix(
          float(1),
          sizeOverLifetimeArr.element(curveIndex),
          uniforms.useSizeOverLifetime
        );
        // Update size in storage (base size * curve multiplier)
        const baseSize = mix(uniforms.startSize.x, uniforms.startSize.y, hash(i.add(1000)));
        sizeStorage.element(i).assign(baseSize.mul(sizeMultiplier));

        // Sample color curve if enabled
        const colorIdx = curveIndex.mul(int(4)); // 4 values per color (RGBA)
        const curveR = colorOverLifetimeArr.element(colorIdx);
        const curveG = colorOverLifetimeArr.element(colorIdx.add(int(1)));
        const curveB = colorOverLifetimeArr.element(colorIdx.add(int(2)));
        const curveA = colorOverLifetimeArr.element(colorIdx.add(int(3)));

        // Default alpha: quadratic fadeout
        const defaultAlpha = float(1).sub(normalizedAge.mul(normalizedAge));

        // Mix between default behavior and curve
        const finalR = mix(uniforms.startColor.x, curveR, uniforms.useColorOverLifetime);
        const finalG = mix(uniforms.startColor.y, curveG, uniforms.useColorOverLifetime);
        const finalB = mix(uniforms.startColor.z, curveB, uniforms.useColorOverLifetime);
        const finalA = mix(defaultAlpha, curveA, uniforms.useColorOverLifetime);

        colorStorage.element(i).assign(vec4(finalR, finalG, finalB, finalA));
      });

      // Respawn dead particles
      If(currentLife.lessThanEqual(0), () => {
        // Generate new random seeds using particle index + time uniform
        const respawnSeed = hash(i.add(uniforms.time.mul(1000).toInt()));
        const respawnSeed2 = hash(i.add(uniforms.time.mul(1000).toInt()).add(1000));
        const respawnSeed3 = hash(i.add(uniforms.time.mul(1000).toInt()).add(2000));

        // Spherical coordinates for random direction
        const theta = respawnSeed.mul(PI2);
        const phi = acos(respawnSeed2.mul(2).sub(1));

        // Reset position at emitter
        const radius = uniforms.emitterRadius;
        const r = sqrt(respawnSeed3).mul(radius);
        const emitterType = uniforms.emitterType;

        const pointPos = vec3(0, 0, 0);
        const spherePos = vec3(
          sin(phi).mul(cos(theta)).mul(r),
          sin(phi).mul(sin(theta)).mul(r),
          cos(phi).mul(r)
        );

        const newPos = mix(pointPos, spherePos, emitterType.greaterThan(0).toFloat());
        newPos.addAssign(uniforms.emitterPosition);
        positionStorage.element(i).assign(newPos);

        // Reset velocity with random direction
        const speed = mix(uniforms.startSpeed.x, uniforms.startSpeed.y, respawnSeed);
        const velDir = vec3(
          sin(phi).mul(cos(theta)),
          sin(phi).mul(sin(theta)),
          cos(phi)
        );
        velocityStorage.element(i).assign(velDir.mul(speed));

        // Reset life
        const newMaxLife = mix(uniforms.lifetime.x, uniforms.lifetime.y, respawnSeed);
        lifeStorage.element(i).assign(vec3(newMaxLife, newMaxLife, 0).xy);

        // Reset size
        const newSize = mix(uniforms.startSize.x, uniforms.startSize.y, respawnSeed2);
        sizeStorage.element(i).assign(newSize);

        // Reset color
        colorStorage.element(i).assign(uniforms.startColor);
      });

      return vec3(0, 0, 0); // TSL requires return
    })().compute(count, [64]);
  }
  
  /**
   * Initialize the particle system (must be called with renderer)
   */
  async init(renderer: THREE.WebGPURenderer): Promise<void> {
    if (this.isInitialized) return;
    
    this.renderer = renderer;
    this.initComputeShaders();
    
    // Run init compute to set up particles
    if (this.initCompute) {
      await renderer.computeAsync(this.initCompute);
    }
    
    this.isInitialized = true;
  }
  
  /**
   * Start playing the particle system
   */
  play(): void {
    this.isPlaying = true;
  }
  
  /**
   * Stop the particle system
   */
  stop(): void {
    this.isPlaying = false;
  }
  
  /**
   * Reset the particle system
   */
  async reset(): Promise<void> {
    this.elapsedTime = 0;
    
    if (this.renderer && this.initCompute) {
      await this.renderer.computeAsync(this.initCompute);
    }
  }
  
  /**
   * Update the particle system (call every frame)
   */
  async update(dt: number): Promise<void> {
    if (!this.isInitialized || !this.isPlaying || !this.renderer) return;
    
    this.elapsedTime += dt;
    this.uniforms.time.value = this.elapsedTime;
    
    // Update emitter position from world matrix
    this.getWorldPosition(this.uniforms.emitterPosition.value);
    
    // Run update compute shader
    if (this.updateCompute) {
      await this.renderer.computeAsync(this.updateCompute);
    }
    
    // Update visible particle count (simplified - show all for now)
    this.mesh.count = this.maxParticles;
  }
  
  /**
   * Set gravity
   */
  setGravity(x: number, y: number, z: number): void {
    this.uniforms.gravity.value.set(x, y, z);
  }

  /**
   * Set drag coefficient (0-1, higher = more resistance)
   */
  setDrag(drag: number): void {
    this.uniforms.drag.value = Math.max(0, Math.min(1, drag));
  }

  /**
   * Set wind force
   */
  setWind(x: number, y: number, z: number, turbulence: number = 0): void {
    this.uniforms.windDirection.value.set(x, y, z);
    this.uniforms.windTurbulence.value = turbulence;
  }

  /**
   * Set point attractor
   */
  setAttractor(
    x: number,
    y: number,
    z: number,
    strength: number,
    radius: number = 10
  ): void {
    this.uniforms.attractorPosition.value.set(x, y, z);
    this.uniforms.attractorStrength.value = strength;
    this.uniforms.attractorRadius.value = radius;
  }

  /**
   * Set vortex force
   */
  setVortex(
    posX: number,
    posY: number,
    posZ: number,
    axisX: number,
    axisY: number,
    axisZ: number,
    strength: number
  ): void {
    this.uniforms.vortexPosition.value.set(posX, posY, posZ);
    this.uniforms.vortexAxis.value.set(axisX, axisY, axisZ).normalize();
    this.uniforms.vortexStrength.value = strength;
  }

  /**
   * Clear all additional forces (keeps gravity)
   */
  clearForces(): void {
    this.uniforms.drag.value = 0;
    this.uniforms.windDirection.value.set(0, 0, 0);
    this.uniforms.windTurbulence.value = 0;
    this.uniforms.attractorStrength.value = 0;
    this.uniforms.vortexStrength.value = 0;
  }

  /**
   * Set size over lifetime curve
   * @param curve AnimationCurve, array of values, or null to disable
   */
  setSizeOverLifetime(curve: AnimationCurve | number[] | null): void {
    if (curve === null) {
      this.uniforms.useSizeOverLifetime.value = 0;
      return;
    }

    // Bake curve to samples
    if (curve instanceof AnimationCurve) {
      for (let i = 0; i < CURVE_SAMPLES; i++) {
        const t = i / (CURVE_SAMPLES - 1);
        this.sizeOverLifetimeSamples[i] = curve.evaluate(t);
      }
    } else {
      // Direct array - interpolate if different length
      for (let i = 0; i < CURVE_SAMPLES; i++) {
        const t = i / (CURVE_SAMPLES - 1);
        const idx = t * (curve.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.min(lo + 1, curve.length - 1);
        const frac = idx - lo;
        this.sizeOverLifetimeSamples[i] = curve[lo] * (1 - frac) + curve[hi] * frac;
      }
    }

    // Update uniform array
    if (this.sizeOverLifetimeUniform) {
      this.sizeOverLifetimeUniform.array = this.sizeOverLifetimeSamples;
    }
    this.uniforms.useSizeOverLifetime.value = 1;
  }

  /**
   * Set color over lifetime gradient
   * @param gradient ColorGradient or null to disable
   */
  setColorOverLifetime(gradient: ColorGradient | null): void {
    if (gradient === null) {
      this.uniforms.useColorOverLifetime.value = 0;
      return;
    }

    // Bake gradient to samples (RGBA interleaved)
    for (let i = 0; i < CURVE_SAMPLES; i++) {
      const t = i / (CURVE_SAMPLES - 1);
      const color = gradient.evaluate(t);
      const baseIdx = i * 4;
      this.colorOverLifetimeSamples[baseIdx] = color.r;
      this.colorOverLifetimeSamples[baseIdx + 1] = color.g;
      this.colorOverLifetimeSamples[baseIdx + 2] = color.b;
      this.colorOverLifetimeSamples[baseIdx + 3] = color.a;
    }

    // Update uniform array
    if (this.colorOverLifetimeUniform) {
      this.colorOverLifetimeUniform.array = this.colorOverLifetimeSamples;
    }
    this.uniforms.useColorOverLifetime.value = 1;
  }

  /**
   * Clear size and color curves (return to default behavior)
   */
  clearCurves(): void {
    this.uniforms.useSizeOverLifetime.value = 0;
    this.uniforms.useColorOverLifetime.value = 0;
  }
  
  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    
    // Dispose buffers
    this.positionBuffer.array = new Float32Array(0);
    this.velocityBuffer.array = new Float32Array(0);
    this.colorBuffer.array = new Float32Array(0);
    this.lifeBuffer.array = new Float32Array(0);
    this.sizeBuffer.array = new Float32Array(0);
    this.rotationBuffer.array = new Float32Array(0);
  }
}

/**
 * Helper to get min/max from a value that can be number or range
 */
export function getMinMax(value: number | ValueRange): { min: number; max: number } {
  if (typeof value === 'number') {
    return { min: value, max: value };
  }
  return value;
}
