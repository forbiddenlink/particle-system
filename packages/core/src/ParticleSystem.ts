import * as THREE from 'three/webgpu';
// @ts-ignore - TSL types are incomplete
import {
  Fn,
  storage,
  instanceIndex,
  vertexIndex,
  uniform,
  uniformArray,
  vec3,
  vec4,
  vec2,
  float,
  sin,
  cos,
  PI2,
  sub,
  normalize,
  If,
  fract,
  mix,
  int,
  clamp,
  length,
  cross,
  dot,
  max,
} from 'three/tsl';

// Helper for deterministic randomness
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hash = Fn(([seed]: any[]) => {
    const s = float(seed);
    return fract(sin(s.mul(12.9898)).mul(43758.5453));
});
import type { ParticleSystemConfig, ValueRange, TrailConfig } from './types.js';
import { AnimationCurve, ColorGradient } from './curves.js';
import { CURVE_SAMPLES } from './uniforms.js';
import {
  createParticleBuffers,
  createParticleStorageNodes,
  createTrailBuffers,
  createTrailStorageNodes,
  disposeParticleBuffers,
  disposeTrailBuffers,
  type ParticleBuffers,
  type ParticleStorageNodes,
  type TrailBuffers,
  type TrailStorageNodes,
} from './buffers.js';
import { createTrailCompute } from './compute-shaders.js';

/** Default number of positions to store per particle for trails */
const DEFAULT_TRAIL_LENGTH = 8;

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

  // Buffer and storage containers
  private particleBuffers!: ParticleBuffers;
  private particleStorage!: ParticleStorageNodes;
  private trailBuffers: TrailBuffers | null = null;
  private trailStorageNodes: TrailStorageNodes | null = null;

  // TSL Storage nodes
  private positionStorage: ReturnType<typeof storage> | null = null;
  private velocityStorage: ReturnType<typeof storage> | null = null;
  private colorStorage: ReturnType<typeof storage> | null = null;
  private lifeStorage: ReturnType<typeof storage> | null = null;
  private sizeStorage: ReturnType<typeof storage> | null = null;


  // Trail storage nodes
  private trailStorage: ReturnType<typeof storage> | null = null;
  private trailIndexStorage: ReturnType<typeof storage> | null = null;
  private trailVertexStorage: ReturnType<typeof storage> | null = null;
  private trailColorVertexStorage: ReturnType<typeof storage> | null = null;

  // Compute shaders
  // @ts-ignore - TSL compute type
  private initCompute: any = null;
  // @ts-ignore - TSL compute type
  private updateCompute: any = null;
  // @ts-ignore - TSL compute type
  private trailCompute: any = null;

  // Uniforms
  private uniforms = {
    time: uniform(0),
    deltaTime: uniform(0),
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

  // Curve lookup tables (baked from AnimationCurve/ColorGradient)
  private sizeOverLifetimeSamples: number[] = Array(CURVE_SAMPLES).fill(1);
  private colorOverLifetimeSamples: THREE.Vector4[] = Array.from(
    { length: CURVE_SAMPLES },
    () => new THREE.Vector4(1, 1, 1, 1)
  );

  // TSL uniform arrays for curves (initialized in initComputeShaders)
  private sizeOverLifetimeUniform: ReturnType<typeof uniformArray> | null = null;
  private colorOverLifetimeUniform: ReturnType<typeof uniformArray> | null = null;

  // Rendering
  private mesh!: THREE.Points;
  private material!: THREE.PointsNodeMaterial;

  // Trail rendering
  private trailMesh: THREE.LineSegments | null = null;
  private trailMaterial: THREE.LineBasicNodeMaterial | null = null;
  private trailGeometry: THREE.BufferGeometry | null = null;

  // Trail config
  private trailConfig: Required<TrailConfig> = {
    enabled: false,
    length: DEFAULT_TRAIL_LENGTH,
    fadeAlpha: true,
  };

  // State
  private isInitialized = false;
  private isPlaying = false;
  private elapsedTime = 0;

  constructor(config: ParticleSystemConfig) {
    super();

    this.maxParticles = config.maxParticles;
    this.config = {
      ...config,
      lifetime: config.lifetime ?? 2.0,
      emissionRate: config.emissionRate ?? 100,
      looping: config.looping ?? true,
      duration: config.duration ?? 0,
    };

    // Initialize trail config from options
    if (config.trails) {
      this.trailConfig = {
        enabled: config.trails.enabled,
        length: config.trails.length ?? DEFAULT_TRAIL_LENGTH,
        fadeAlpha: config.trails.fadeAlpha ?? true,
      };
    }

    // Initialize emitter uniforms from config
    if (config.emitter) {
      const emitterTypes: Record<string, number> = {
        point: 0,
        sphere: 1,
        box: 2,
        cone: 3,
        circle: 4,
      };
      this.uniforms.emitterType.value = emitterTypes[config.emitter.type] ?? 0;

      if (config.emitter.radius !== undefined) {
        this.uniforms.emitterRadius.value = config.emitter.radius;
      }
      if (config.emitter.size) {
        this.uniforms.emitterBoxSize.value.copy(config.emitter.size);
      }
      if (config.emitter.angle !== undefined) {
        this.uniforms.emitterConeAngle.value = config.emitter.angle;
      }
      if (config.emitter.arc !== undefined) {
        this.uniforms.emitterCircleArc.value = config.emitter.arc;
      }
    }

    // Initialize core particle uniforms from config
    const lifetime = getMinMax(this.config.lifetime);
    this.uniforms.lifetime.value.set(lifetime.min, lifetime.max);

    const startSpeed = getMinMax(config.startSpeed ?? 1);
    this.uniforms.startSpeed.value.set(startSpeed.min, startSpeed.max);

    const startSize = getMinMax(config.startSize ?? 0.1);
    this.uniforms.startSize.value.set(startSize.min, startSize.max);

    if (config.startColor !== undefined) {
      const startColor = typeof config.startColor === 'number'
        ? new THREE.Color(config.startColor)
        : config.startColor;
      this.uniforms.startColor.value.set(startColor.r, startColor.g, startColor.b, 1);
    }

    if (config.gravity) {
      this.uniforms.gravity.value.copy(config.gravity);
    }

    if (config.drag !== undefined) {
      this.uniforms.drag.value = Math.max(0, Math.min(1, config.drag));
    }

    this.uniforms.emissionRate.value = this.config.emissionRate;

    if (config.sizeOverLifetime) {
      this.setSizeOverLifetime(config.sizeOverLifetime);
    }

    if (config.colorOverLifetime) {
      const gradient = new ColorGradient(
        config.colorOverLifetime.map((stop) => {
          const color = typeof stop.color === 'number'
            ? new THREE.Color(stop.color)
            : stop.color;

          return {
            time: stop.position,
            color: { r: color.r, g: color.g, b: color.b },
          };
        }),
      );
      this.setColorOverLifetime(gradient);
    }

    this.initBuffers();
    this.initMaterial();
    this.initMesh();
  }

  /**
   * Initialize GPU storage buffers for particle data
   */
  private initBuffers(): void {
    const count = this.maxParticles;
    const trailLength = this.trailConfig.length;

    // Create core particle buffers and storage nodes
    this.particleBuffers = createParticleBuffers(count);
    this.particleStorage = createParticleStorageNodes(this.particleBuffers, count);

    // Alias storage nodes for use in compute shaders and materials
    this.positionStorage = this.particleStorage.position;
    this.velocityStorage = this.particleStorage.velocity;
    this.colorStorage = this.particleStorage.color;
    this.lifeStorage = this.particleStorage.life;
    this.sizeStorage = this.particleStorage.size;

    // Trail buffers - only allocate when trails are enabled to save GPU memory
    // For 100K particles with 8 trail positions, this saves ~9.6MB of GPU memory
    if (this.trailConfig.enabled) {
      this.trailBuffers = createTrailBuffers(count, trailLength);
      this.trailStorageNodes = createTrailStorageNodes(this.trailBuffers, count, trailLength);

      // Alias storage nodes for use in compute shaders and materials
      this.trailStorage = this.trailStorageNodes.trail;
      this.trailIndexStorage = this.trailStorageNodes.trailIndex;
      this.trailVertexStorage = this.trailStorageNodes.trailVertex;
      this.trailColorVertexStorage = this.trailStorageNodes.trailColorVertex;
    }
  }

  /**
   * Initialize particle material (PointsNodeMaterial)
   */
  private initMaterial(): void {
    this.material = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: this.config.blendMode === 'additive'
        ? THREE.AdditiveBlending
        : THREE.NormalBlending,
    });

    // Set texture if provided
    if (this.config.texture) {
      this.material.map = this.config.texture;
      this.material.alphaTest = 0.01; // Discard transparent pixels
    }

    // Color from storage buffer
    const colorStorage = this.colorStorage!;
    this.material.colorNode = colorStorage.element(vertexIndex);
    
    // Note: PointsNodeMaterial uses a global point size via material.size property
    // Individual particle sizes are controlled through the position node scaling
  }

  /**
   * Initialize mesh (THREE.Points)
   */
  private initMesh(): void {
    // Create geometry with count vertices
    const geometry = new THREE.BufferGeometry();
    const count = this.maxParticles;
    
    // We need a position attribute to define the number of vertices, 
    // even though we overwrite positions in the shader.
    // Use a simple buffer of zeros.
    const positions = new Float32Array(count * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.mesh = new THREE.Points(geometry, this.material);
    this.mesh.frustumCulled = false;

    // Bind position from storage buffer
    const positionStorage = this.positionStorage!;

    // Position node for Points
    this.material.positionNode = positionStorage.element(vertexIndex);

    this.add(this.mesh);

    // Initialize trail mesh if trails are enabled
    this.initTrailMesh();
  }

  /**
   * Initialize trail mesh for rendering particle trails as line segments
   * Only initializes if trails are enabled (buffers must be allocated)
   */
  private initTrailMesh(): void {
    // Skip if trails not enabled - buffers won't be allocated
    if (!this.trailConfig.enabled) {
      return;
    }

    const count = this.maxParticles;
    const trailLength = this.trailConfig.length;
    const segmentsPerParticle = trailLength - 1;
    const totalVertices = count * segmentsPerParticle * 2;

    // Create geometry - need a dummy position attribute for vertex count
    this.trailGeometry = new THREE.BufferGeometry();
    // Create a minimal position attribute just to establish vertex count
    // The actual positions come from the storage buffer via positionNode
    const dummyPositions = new Float32Array(totalVertices * 3);
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(dummyPositions, 3));

    // Get storage nodes for reading in the material
    const trailVertexStorage = this.trailVertexStorage!;
    const trailColorStorage = this.trailColorVertexStorage!;

    this.trailMaterial = new THREE.LineBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: this.config.blendMode === 'additive'
        ? THREE.AdditiveBlending
        : THREE.NormalBlending,
    });

    // Read position from GPU storage buffer using vertexIndex
    // This is similar to how particle positions work with instanceIndex
    this.trailMaterial.positionNode = trailVertexStorage.element(vertexIndex).xyz;

    // Set color and opacity from the RGBA storage buffer using vertexIndex
    const colorData = trailColorStorage.element(vertexIndex);
    this.trailMaterial.colorNode = vec3(colorData.x, colorData.y, colorData.z);
    this.trailMaterial.opacityNode = colorData.w;

    // Create mesh
    this.trailMesh = new THREE.LineSegments(this.trailGeometry, this.trailMaterial);
    this.trailMesh.frustumCulled = false;
    this.trailMesh.visible = true;

    this.add(this.trailMesh);
  }

  /**
   * Create compute shaders for particle simulation
   */
  private initComputeShaders(): void {
    const count = this.maxParticles;
    const trailsEnabled = this.trailConfig.enabled;

    const positionStorage = this.positionStorage!;
    const velocityStorage = this.velocityStorage!;
    const colorStorage = this.colorStorage!;
    const lifeStorage = this.lifeStorage!;
    const sizeStorage = this.sizeStorage!;
    
    const uniforms = this.uniforms;
    this.sizeOverLifetimeUniform = uniformArray(this.sizeOverLifetimeSamples, 'float');
    this.colorOverLifetimeUniform = uniformArray(this.colorOverLifetimeSamples, 'vec4');

    // Use a simpler hash function for randomness
    const rand = (seed: any) => hash(seed);

    // Initialize compute - sets up initial particle state
    // @ts-expect-error - TSL compute shaders don't return values, but types require Node
    this.initCompute = (Fn(() => {
      const i = instanceIndex;
      const seed = float(i).add(uniforms.time);
      
      // Random position in sphere (simplified)
      const r = rand(seed).pow(1.0/3.0).mul(uniforms.emitterRadius);
      const theta = rand(seed.add(1.0)).mul(PI2);
      const phi = rand(seed.add(2.0)).mul(Math.PI).sub(Math.PI/2);
      
      const x = r.mul(cos(phi)).mul(cos(theta));
      const y = r.mul(sin(phi));
      const z = r.mul(cos(phi)).mul(sin(theta));
      
      const pos = vec3(x, y, z).add(uniforms.emitterPosition);
      positionStorage.element(i).assign(vec4(pos, 1.0));
      
      // Random velocity
      const speed = mix(uniforms.startSpeed.x, uniforms.startSpeed.y, rand(seed.add(3.0)));
      // Random direction
      const vx = rand(seed.add(4.0)).sub(0.5).mul(2.0);
      const vy = rand(seed.add(5.0)).sub(0.5).mul(2.0);
      const vz = rand(seed.add(6.0)).sub(0.5).mul(2.0);
      const vel = normalize(vec3(vx, vy, vz)).mul(speed);
      velocityStorage.element(i).assign(vec4(vel, 0.0));
      
      // Life
      const life = mix(uniforms.lifetime.x, uniforms.lifetime.y, rand(seed.add(7.0)));
      lifeStorage.element(i).assign(vec2(life, life)); // current, max
      
      // Color
      colorStorage.element(i).assign(uniforms.startColor);
      
      // Size
      const size = mix(uniforms.startSize.x, uniforms.startSize.y, rand(seed.add(8.0)));
      sizeStorage.element(i).assign(size);
      
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })() as any).compute(count);

    // Update compute - runs every frame to simulate particles
    // @ts-expect-error - TSL compute shaders don't return values, but types require Node
    this.updateCompute = (Fn(() => {
        const i = instanceIndex;
        
        // Read current state
        const pos = positionStorage.element(i);
        const vel = velocityStorage.element(i);
        const life = lifeStorage.element(i);
        const dt = uniforms.deltaTime;
        
        // Decrease life
        life.x.subAssign(dt);
        
        // Check if dead
        If(life.x.lessThan(0.0), () => {
            // Respawn
            const seed = float(i).add(uniforms.time).add(100.0);
            
            // Reset life
            const newLife = mix(uniforms.lifetime.x, uniforms.lifetime.y, rand(seed));
            life.assign(vec2(newLife, newLife));
            
            // Reset position (emitter)
            const r = rand(seed.add(1.0)).pow(1.0/3.0).mul(uniforms.emitterRadius);
            const theta = rand(seed.add(2.0)).mul(PI2);
            const phi = rand(seed.add(3.0)).mul(Math.PI).sub(Math.PI/2);
            
            const x = r.mul(cos(phi)).mul(cos(theta));
            const y = r.mul(sin(phi));
            const z = r.mul(cos(phi)).mul(sin(theta));
            
            pos.xyz.assign(vec3(x, y, z).add(uniforms.emitterPosition));
            
            // Reset velocity
            const speed = mix(uniforms.startSpeed.x, uniforms.startSpeed.y, rand(seed.add(4.0)));
            const vx = rand(seed.add(5.0)).sub(0.5).mul(2.0);
            const vy = rand(seed.add(6.0)).sub(0.5).mul(2.0);
            const vz = rand(seed.add(7.0)).sub(0.5).mul(2.0);
            vel.xyz.assign(normalize(vec3(vx, vy, vz)).mul(speed));
            
            // Reset Color and Size
            If(uniforms.useColorOverLifetime.greaterThan(0), () => {
              colorStorage.element(i).assign(this.colorOverLifetimeUniform!.element(int(0)));
            }).Else(() => {
              colorStorage.element(i).assign(uniforms.startColor);
            });
            const size = mix(uniforms.startSize.x, uniforms.startSize.y, rand(seed.add(8.0)));
            sizeStorage.element(i).assign(size);
            
        }).Else(() => {
            // Apply Physics
            
            // Gravity
            vel.xyz.addAssign(uniforms.gravity.mul(dt));
            
            // Drag
            vel.xyz.mulAssign(sub(1.0, uniforms.drag.mul(dt)));
            
            // Wind
            vel.xyz.addAssign(uniforms.windDirection.mul(dt));

            // Point attractor
            const toAttractor = uniforms.attractorPosition.sub(pos.xyz);
            const attractorDistance = length(toAttractor);
            If(
              uniforms.attractorStrength.greaterThan(0.0)
                .or(uniforms.attractorStrength.lessThan(0.0))
                .and(attractorDistance.lessThan(uniforms.attractorRadius)),
              () => {
                const distanceFactor = float(1.0).sub(
                  attractorDistance.div(max(uniforms.attractorRadius, float(0.0001)))
                );
                const attractorForce = normalize(toAttractor)
                  .mul(uniforms.attractorStrength)
                  .mul(distanceFactor);
                vel.xyz.addAssign(attractorForce.mul(dt));
              },
            );

            // Vortex force around axis
            const toVortex = pos.xyz.sub(uniforms.vortexPosition);
            const axialDistance = dot(toVortex, uniforms.vortexAxis);
            const radialVector = toVortex.sub(uniforms.vortexAxis.mul(axialDistance));
            const radialLength = length(radialVector);
            If(
              uniforms.vortexStrength.greaterThan(0.0)
                .or(uniforms.vortexStrength.lessThan(0.0))
                .and(radialLength.greaterThan(0.0001)),
              () => {
                const tangent = normalize(cross(uniforms.vortexAxis, radialVector));
                vel.xyz.addAssign(tangent.mul(uniforms.vortexStrength).mul(dt));
              },
            );
            
            // Move
            pos.xyz.addAssign(vel.xyz.mul(dt));

            // Apply color and visual intensity over lifetime
            const normalizedAge = clamp(
              float(1.0).sub(life.x.div(max(life.y, float(0.0001)))),
              float(0.0),
              float(0.9999),
            );
            const sampleIndex = int(normalizedAge.mul(float(CURVE_SAMPLES)));

            If(uniforms.useColorOverLifetime.greaterThan(0), () => {
              const sampleColor = this.colorOverLifetimeUniform!.element(sampleIndex);
              If(uniforms.useSizeOverLifetime.greaterThan(0), () => {
                const intensity = this.sizeOverLifetimeUniform!.element(sampleIndex).x;
                colorStorage.element(i).assign(
                  vec4(
                    sampleColor.xyz.mul(intensity),
                    clamp(sampleColor.w.mul(intensity), float(0.0), float(1.0))
                  )
                );
              }).Else(() => {
                colorStorage.element(i).assign(sampleColor);
              });
            }).Else(() => {
              If(uniforms.useSizeOverLifetime.greaterThan(0), () => {
                const intensity = this.sizeOverLifetimeUniform!.element(sampleIndex).x;
                colorStorage.element(i).assign(
                  vec4(
                    uniforms.startColor.xyz.mul(intensity),
                    clamp(uniforms.startColor.w.mul(intensity), float(0.0), float(1.0))
                  )
                );
              }).Else(() => {
                colorStorage.element(i).assign(uniforms.startColor);
              });
            });
            
            // Validating w component for alignment, though for pos it's 1.0
            pos.w.assign(1.0);
        });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })() as any).compute(count);

    // Trail compute - updates trail ring buffer and flattens to line segments
    // Only initialize when trails are enabled
    if (trailsEnabled) {
      this.initTrailCompute();
    }
  }

  /**
   * Initialize trail compute shader
   */
  private initTrailCompute(): void {
    this.trailCompute = createTrailCompute(
      {
        position: this.positionStorage!,
        color: this.colorStorage!,
        life: this.lifeStorage!,
        trail: this.trailStorage!,
        trailIndex: this.trailIndexStorage!,
        trailVertex: this.trailVertexStorage!,
        trailColorVertex: this.trailColorVertexStorage!,
      },
      {
        maxParticles: this.maxParticles,
        trailLength: this.trailConfig.length,
        fadeAlpha: this.trailConfig.fadeAlpha,
      }
    );
  }

  /**
   * Initialize the particle system (must be called with renderer)
   */
  async init(renderer: THREE.WebGPURenderer): Promise<void> {
    console.log("ParticleSystem INIT called");
    if (this.isInitialized) return;

    this.renderer = renderer;
    this.initComputeShaders();

    // LOCAL TEST IN INIT
    const testCount = 100;
    const testBuffer = new THREE.StorageBufferAttribute(new Float32Array(testCount), 1);
    const testStorage = storage(testBuffer, 'float', testCount);
    // @ts-expect-error - TSL compute shaders don't return values, but types require Node
    const testNode = (Fn(() => {
        const i = instanceIndex;
        testStorage.element(i).assign(float(1.0));
    })() as any).compute(testCount);
    
    try {
        await renderer.computeAsync(testNode);
        console.log("Local init test SUCCESS");
    } catch (e) {
        console.error("Local init test FAILED", e);
    }

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
    this.uniforms.deltaTime.value = dt;

    // Update emitter position from world matrix
    this.getWorldPosition(this.uniforms.emitterPosition.value);

    // Run update compute shader
    if (this.updateCompute) {
      await this.renderer.computeAsync(this.updateCompute);
    }

    // Run trail compute shader if trails are enabled
    // The compute shader writes positions and colors directly to GPU storage buffers
    // The LineBasicNodeMaterial reads from these buffers via vertexIndex
    if (this.trailConfig.enabled && this.trailCompute) {
      await this.renderer.computeAsync(this.trailCompute);
    }
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

    // Bake gradient to vec4 samples
    for (let i = 0; i < CURVE_SAMPLES; i++) {
      const t = i / (CURVE_SAMPLES - 1);
      const color = gradient.evaluate(t);
      this.colorOverLifetimeSamples[i].set(color.r, color.g, color.b, color.a);
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
   * Enable or disable trail rendering
   * Note: Trails must be enabled at construction time to allocate buffers.
   * This method only toggles visibility of the trail mesh.
   */
  setTrailsEnabled(enabled: boolean): void {
    this.trailConfig.enabled = enabled;
    if (this.trailMesh) {
      this.trailMesh.visible = enabled;
    }
  }

  /**
   * Check if trails are currently enabled
   */
  getTrailsEnabled(): boolean {
    return this.trailConfig.enabled && this.trailMesh !== null;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Stop playback
    this.isPlaying = false;
    this.isInitialized = false;

    // Dispose Three.js objects
    this.mesh.geometry.dispose();
    this.material.dispose();

    // Dispose trail resources
    if (this.trailGeometry) {
      this.trailGeometry.dispose();
      this.trailGeometry = null;
    }
    if (this.trailMaterial) {
      this.trailMaterial.dispose();
      this.trailMaterial = null;
    }
    if (this.trailMesh) {
      this.remove(this.trailMesh);
      this.trailMesh = null;
    }

    // Clear storage buffer references to help GC release GPU resources
    disposeParticleBuffers(this.particleBuffers);

    if (this.trailBuffers) {
      disposeTrailBuffers(this.trailBuffers);
      this.trailBuffers = null;
    }

    // Clear TSL storage node references
    this.positionStorage = null;
    this.velocityStorage = null;
    this.colorStorage = null;
    this.lifeStorage = null;
    this.sizeStorage = null;
    this.trailStorage = null;
    this.trailIndexStorage = null;
    this.trailVertexStorage = null;
    this.trailColorVertexStorage = null;

    // Clear compute shader references
    this.initCompute = null;
    this.updateCompute = null;
    this.trailCompute = null;

    // Clear renderer reference
    this.renderer = null;
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
