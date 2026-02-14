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
  float,
  int,
  If,
  Loop,
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
  private rotationStorage: ReturnType<typeof storage> | null = null;


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
  private colorOverLifetimeSamples: number[] = Array(CURVE_SAMPLES * 4).fill(1); // RGBA interleaved

  // TSL uniform arrays for curves (initialized in initComputeShaders)
  private sizeOverLifetimeUniform: ReturnType<typeof uniformArray> | null = null;
  private colorOverLifetimeUniform: ReturnType<typeof uniformArray> | null = null;

  // Rendering
  private mesh!: THREE.InstancedMesh;
  private material!: THREE.SpriteNodeMaterial;

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
    this.rotationStorage = this.particleStorage.rotation;

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
    this.trailMaterial.positionNode = trailVertexStorage.element(vertexIndex);

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
    const trailLength = this.trailConfig.length;
    const trailsEnabled = this.trailConfig.enabled;

    const positionStorage = this.positionStorage!;
    const velocityStorage = this.velocityStorage!;
    const colorStorage = this.colorStorage!;
    const lifeStorage = this.lifeStorage!;
    const sizeStorage = this.sizeStorage!;
    const rotationStorage = this.rotationStorage!;
    // Trail storage is only available when trails are enabled
    const trailStorage = trailsEnabled ? this.trailStorage! : null;
    const trailIndexStorage = trailsEnabled ? this.trailIndexStorage! : null;
    const trailLengthConst = int(trailLength);
    const uniforms = this.uniforms;

    // Initialize curve uniform arrays
    this.sizeOverLifetimeUniform = uniformArray(this.sizeOverLifetimeSamples);
    this.colorOverLifetimeUniform = uniformArray(this.colorOverLifetimeSamples);
    const sizeOverLifetimeArr = this.sizeOverLifetimeUniform;
    const colorOverLifetimeArr = this.colorOverLifetimeUniform;

    // Initialize compute - sets up initial particle state
    // @ts-expect-error - TSL compute shaders don't return values, but types require Node
    this.initCompute = (Fn(() => {
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

      // Type 0: Point emitter - all at origin
      const pointPos = vec3(0, 0, 0);

      // Type 1: Sphere emitter - random point in sphere
      const r = sqrt(seed3).mul(radius);
      const spherePos = vec3(
        sin(phi).mul(cos(theta)).mul(r),
        sin(phi).mul(sin(theta)).mul(r),
        cos(phi).mul(r)
      );

      // Type 2: Box emitter - random point in box
      const boxSize = uniforms.emitterBoxSize;
      const boxPos = vec3(
        seed.sub(0.5).mul(boxSize.x),
        seed2.sub(0.5).mul(boxSize.y),
        seed3.sub(0.5).mul(boxSize.z)
      );

      // Type 3: Cone emitter - random point on base circle
      const coneRadius = uniforms.emitterConeRadius;
      const coneR = sqrt(seed2).mul(coneRadius);
      const conePos = vec3(
        coneR.mul(cos(theta)),
        float(0),
        coneR.mul(sin(theta))
      );

      // Type 4: Circle emitter - random point on circle
      const circleArc = uniforms.emitterCircleArc;
      const circleTheta = seed.mul(circleArc);
      const circleR = sqrt(seed2).mul(radius);
      const circlePos = vec3(
        circleR.mul(cos(circleTheta)),
        float(0),
        circleR.mul(sin(circleTheta))
      );

      // Select position based on emitter type using cascading mix
      // 0=point, 1=sphere, 2=box, 3=cone, 4=circle
      const isSphere = emitterType.equal(1).toFloat();
      const isBox = emitterType.equal(2).toFloat();
      const isCone = emitterType.equal(3).toFloat();
      const isCircle = emitterType.equal(4).toFloat();

      const pos = vec3(0, 0, 0);
      pos.addAssign(pointPos.mul(float(1).sub(isSphere).sub(isBox).sub(isCone).sub(isCircle)));
      pos.addAssign(spherePos.mul(isSphere));
      pos.addAssign(boxPos.mul(isBox));
      pos.addAssign(conePos.mul(isCone));
      pos.addAssign(circlePos.mul(isCircle));
      pos.addAssign(uniforms.emitterPosition);

      positionStorage.element(i).assign(pos);

      // Random velocity direction
      const speed = mix(
        uniforms.startSpeed.x,
        uniforms.startSpeed.y,
        seed
      );

      // Random spherical direction (for point/sphere emitters)
      const randomDir = vec3(
        sin(phi).mul(cos(theta)),
        sin(phi).mul(sin(theta)),
        cos(phi)
      );

      // Upward direction (for box/circle emitters)
      const upDir = vec3(0, 1, 0);

      // Cone direction - within cone angle
      const coneAngle = uniforms.emitterConeAngle;
      const coneTiltAngle = seed3.mul(coneAngle);
      const coneBaseAngle = theta; // Use same theta for consistency
      const coneDir = vec3(
        sin(coneTiltAngle).mul(cos(coneBaseAngle)),
        cos(coneTiltAngle),
        sin(coneTiltAngle).mul(sin(coneBaseAngle))
      );

      // Select velocity direction based on emitter type
      const velDir = vec3(0, 0, 0);
      velDir.addAssign(randomDir.mul(isSphere.add(float(1).sub(isSphere).sub(isBox).sub(isCone).sub(isCircle))));
      velDir.addAssign(upDir.mul(isBox));
      velDir.addAssign(coneDir.mul(isCone));
      velDir.addAssign(upDir.mul(isCircle));

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

      // Initialize trail: set all trail positions to the initial particle position
      // This prevents trails from having (0,0,0) segments initially
      // Only include trail code when trails are enabled (JavaScript conditional)
      if (trailStorage && trailIndexStorage) {
        const particleTrailBase = i.mul(trailLengthConst);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Loop({ start: int(0), end: trailLengthConst, type: 'int', condition: '<' }, ({ i: j }: { i: any }) => {
          trailStorage.element(particleTrailBase.add(j)).assign(pos);
        });
        // Start trail index at 0
        trailIndexStorage.element(i).assign(int(0));
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })() as any).compute(count, [64]);

    // Update compute - runs every frame to simulate particles
    // @ts-expect-error - TSL compute shaders don't return values, but types require Node
    this.updateCompute = (Fn(() => {
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

        // Type 0: Point emitter
        const pointPos = vec3(0, 0, 0);

        // Type 1: Sphere emitter
        const spherePos = vec3(
          sin(phi).mul(cos(theta)).mul(r),
          sin(phi).mul(sin(theta)).mul(r),
          cos(phi).mul(r)
        );

        // Type 2: Box emitter
        const boxSize = uniforms.emitterBoxSize;
        const boxPos = vec3(
          respawnSeed.sub(0.5).mul(boxSize.x),
          respawnSeed2.sub(0.5).mul(boxSize.y),
          respawnSeed3.sub(0.5).mul(boxSize.z)
        );

        // Type 3: Cone emitter
        const coneRadius = uniforms.emitterConeRadius;
        const coneR = sqrt(respawnSeed2).mul(coneRadius);
        const conePos = vec3(
          coneR.mul(cos(theta)),
          float(0),
          coneR.mul(sin(theta))
        );

        // Type 4: Circle emitter
        const circleArc = uniforms.emitterCircleArc;
        const circleTheta = respawnSeed.mul(circleArc);
        const circleR = sqrt(respawnSeed2).mul(radius);
        const circlePos = vec3(
          circleR.mul(cos(circleTheta)),
          float(0),
          circleR.mul(sin(circleTheta))
        );

        // Select position based on emitter type
        const isSphere = emitterType.equal(1).toFloat();
        const isBox = emitterType.equal(2).toFloat();
        const isCone = emitterType.equal(3).toFloat();
        const isCircle = emitterType.equal(4).toFloat();

        const newPos = vec3(0, 0, 0);
        newPos.addAssign(pointPos.mul(float(1).sub(isSphere).sub(isBox).sub(isCone).sub(isCircle)));
        newPos.addAssign(spherePos.mul(isSphere));
        newPos.addAssign(boxPos.mul(isBox));
        newPos.addAssign(conePos.mul(isCone));
        newPos.addAssign(circlePos.mul(isCircle));
        newPos.addAssign(uniforms.emitterPosition);
        positionStorage.element(i).assign(newPos);

        // Reset velocity with appropriate direction for emitter type
        const speed = mix(uniforms.startSpeed.x, uniforms.startSpeed.y, respawnSeed);

        // Random spherical direction
        const randomDir = vec3(
          sin(phi).mul(cos(theta)),
          sin(phi).mul(sin(theta)),
          cos(phi)
        );

        // Upward direction
        const upDir = vec3(0, 1, 0);

        // Cone direction
        const coneAngle = uniforms.emitterConeAngle;
        const coneTiltAngle = respawnSeed3.mul(coneAngle);
        const coneDir = vec3(
          sin(coneTiltAngle).mul(cos(theta)),
          cos(coneTiltAngle),
          sin(coneTiltAngle).mul(sin(theta))
        );

        // Select velocity direction
        const velDir = vec3(0, 0, 0);
        velDir.addAssign(randomDir.mul(isSphere.add(float(1).sub(isSphere).sub(isBox).sub(isCone).sub(isCircle))));
        velDir.addAssign(upDir.mul(isBox));
        velDir.addAssign(coneDir.mul(isCone));
        velDir.addAssign(upDir.mul(isCircle));

        velocityStorage.element(i).assign(velDir.mul(speed));

        // Reset life
        const newMaxLife = mix(uniforms.lifetime.x, uniforms.lifetime.y, respawnSeed);
        lifeStorage.element(i).assign(vec3(newMaxLife, newMaxLife, 0).xy);

        // Reset size
        const newSize = mix(uniforms.startSize.x, uniforms.startSize.y, respawnSeed2);
        sizeStorage.element(i).assign(newSize);

        // Reset color
        colorStorage.element(i).assign(uniforms.startColor);

        // Reset trail: set all trail positions to new spawn position
        // Only include trail code when trails are enabled (JavaScript conditional)
        if (trailStorage && trailIndexStorage) {
          const particleTrailBase = i.mul(trailLengthConst);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Loop({ start: int(0), end: trailLengthConst, type: 'int', condition: '<' }, ({ i: j }: { i: any }) => {
            trailStorage.element(particleTrailBase.add(j)).assign(newPos);
          });
          // Reset trail index
          trailIndexStorage.element(i).assign(int(0));
        }
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })() as any).compute(count, [64]);

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

    // Run trail compute shader if trails are enabled
    // The compute shader writes positions and colors directly to GPU storage buffers
    // The LineBasicNodeMaterial reads from these buffers via vertexIndex
    if (this.trailConfig.enabled && this.trailCompute) {
      await this.renderer.computeAsync(this.trailCompute);
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
    this.rotationStorage = null;
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
