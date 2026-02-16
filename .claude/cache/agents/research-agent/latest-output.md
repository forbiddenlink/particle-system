# Research Report: WebGPU Particle System Best Practices and Improvements
Generated: 2026-02-10

## Executive Summary

This research covers WebGPU compute shader optimization patterns, GPU particle system performance techniques, Three.js TSL best practices, and advanced features like trails and collisions. The Nova Particles system has a solid foundation but can be significantly improved with workgroup optimizations, indirect rendering, proper particle pooling, and GPU-side curve evaluation.

## Research Question

What are the current best practices and improvements for WebGPU particle systems, focusing on compute shader optimization, performance techniques, modern features (trails, collisions, instancing), Three.js TSL patterns, and animation curve implementations?

---

## Key Findings

### Finding 1: WebGPU Compute Shader Optimization Patterns

**Workgroup Sizing**
- Use a workgroup size of **64** as the default unless there's a specific reason to choose otherwise
- Most GPUs can efficiently run 64 threads in lockstep
- Current Nova implementation uses `.compute(count)` without explicit workgroup sizing - this should be optimized

**Memory Hierarchy Optimization**
WebGPU exposes three levels of memory through WGSL:
1. **Private memory** - per thread (fastest, smallest)
2. **Workgroup shared memory** - accessible to threads in same workgroup
3. **Global storage buffers** - slowest, largest

**Key insight**: Getting data into the right level at the right time is where real optimization happens. Workgroup memory lets threads cooperate without hammering global memory.

**Reduce CPU-GPU Transfers**
- The biggest bottleneck is often CPU-to-GPU buffer copies, not computation
- Restructure algorithms to keep data on GPU longer
- Nova already does this well with storage buffers - maintain this pattern

**Modern WebGPU Features (2025-2026)**
- **Bindless textures**: Boost performance 3x for complex texture operations
- **Subgroup operations** (shuffle/add): 2x faster than barriers for reductions
- These are experimental but worth watching

- Source: [Toji.dev WebGPU Best Practices](https://toji.dev/webgpu-best-practices/)
- Source: [WebGPU Fundamentals - Optimization](https://webgpufundamentals.org/webgpu/lessons/webgpu-optimization.html)

---

### Finding 2: GPU Particle System Performance Techniques

**Indirect Draw Calls**
This is a major improvement opportunity for Nova:
- Indirect draws allow GPU to define work in a shader rather than CPU
- A properly implemented GPU particle system can handle **1M+ particles with only 2 dispatch and 1 draw call**
- Enables GPU-side frustum culling without CPU readback

**Implementation Pattern**:
```
1. Compute shader updates particles AND writes draw parameters
2. Indirect draw buffer contains: instanceCount, vertexCount, etc.
3. GPU culls dead particles and updates count atomically
4. Single indirect draw call renders all live particles
```

**Particle Pooling Strategy**
Current Nova implementation always renders `maxParticles`. Better approach:
- Use atomic counter for live particle count
- Dead particles get recycled via free list
- Only render actual live count via indirect draw

**Memory Layout Optimization**
- Structure of Arrays (SoA) vs Array of Structures (AoS)
- SoA is generally better for GPU: separate buffers for position, velocity, color
- Nova already uses SoA pattern - good!

**LOD for Particles**
- Use simpler materials for distant particles
- Reduce particle count based on distance/importance
- Consider billboard LOD switching

- Source: [Game Developer - Million Particle System](https://www.gamedeveloper.com/programming/building-a-million-particle-system)
- Source: [GPU Particles GitHub](https://github.com/Brian-Jiang/GPUParticles)
- Source: [Toji.dev Indirect Draws](https://toji.dev/webgpu-best-practices/indirect-draws.html)

---

### Finding 3: Three.js TSL Best Practices

**Automatic Cross-Platform Compilation**
TSL compiles to both GLSL and WGSL automatically. This means Nova shaders work on WebGL fallback without extra work.

**Node Material Pattern**
```typescript
// Use node materials for TSL integration
const material = new THREE.SpriteNodeMaterial({
  transparent: true,
  depthWrite: false,
});

// Color from storage buffer
material.colorNode = colorStorage.element(instanceIndex);
```

**Uniform Management**
```typescript
// Create updatable uniforms
const time = uniform(0);

// Update without recompilation
time.value = elapsedTime;
```

**Fn Pattern for Compute Shaders**
```typescript
const computeUpdate = Fn(() => {
  const pos = positions.element(instanceIndex);
  const vel = velocities.element(instanceIndex);

  // Physics update
  vel.addAssign(gravity.mul(deltaTime));
  pos.addAssign(vel.mul(deltaTime));

  return vec3(0, 0, 0); // TSL requires return
})().compute(particleCount);
```

**Async Initialization Required**
```typescript
// WebGPU requires async init since r171
await renderer.init();
await particles.init(renderer);
```

**Composability**
Package shader effects as functions that return nodes for reuse:
```typescript
const applyGravity = Fn((vel, dt) => {
  return vel.add(gravity.mul(dt));
});
```

- Source: [Three.js Shading Language Wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- Source: [Maxime Heckel - Field Guide to TSL](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/)
- Source: [Three.js Roadmap - TSL](https://threejsroadmap.com/blog/tsl-a-better-way-to-write-shaders-in-threejs)

---

### Finding 4: Particle Trail Rendering

**Ring Buffer Approach**
Trails are typically implemented using a ring buffer of positions per particle:
```
- Store N previous positions per particle
- Current position index cycles through buffer
- Render as line strip or ribbon geometry
```

**GPU Trail Implementation**
```typescript
// Trail buffer: [particleCount * trailLength * 3]
const trailBuffer = new StorageBufferAttribute(
  new Float32Array(particleCount * trailLength * 3), 3
);

// In compute shader:
const trailIndex = particleIndex.mul(trailLength).add(currentFrame.mod(trailLength));
trailStorage.element(trailIndex).assign(currentPosition);
```

**Trail Rendering Options**
1. **Line Strip**: Simple, low overhead
2. **Ribbon/Quad**: Camera-facing, better appearance
3. **Tube Geometry**: Most expensive, best quality

**Fading Trails**
Apply alpha based on trail segment age:
```typescript
const alpha = float(1).sub(segmentAge.div(trailLength));
```

- Source: [Mike Turitzin - Rendering Particles with Compute Shaders](https://miketuritzin.com/post/rendering-particles-with-compute-shaders/)

---

### Finding 5: GPU Particle Collision Detection

**Spatial Hashing for Particle-Particle Collisions**
- Subdivide space into bins/cells
- Create lists of particles per bin
- Only test particles in same and neighboring bins
- Achieves O(1) complexity with properly sized bins

**Implementation Strategy**
```
1. Compute shader 1: Hash particles to cells
2. Compute shader 2: Sort particles by cell
3. Compute shader 3: Build cell start/end indices
4. Compute shader 4: Collision detection using cell neighbors
```

**Simple Ground/Plane Collision** (Nova already has this)
```typescript
If(position.y.lessThan(0), () => {
  position.y = 0;
  velocity.y = velocity.y.negate().mul(bounce);
});
```

**Sphere Collision**
```typescript
const dist = position.distance(sphereCenter);
If(dist.lessThan(sphereRadius), () => {
  const normal = position.sub(sphereCenter).normalize();
  position.assign(sphereCenter.add(normal.mul(sphereRadius)));

  // Reflect velocity
  const dot = velocity.dot(normal);
  velocity.subAssign(normal.mul(dot.mul(2)).mul(bounce));
});
```

**Performance Consideration**
- For particle-environment only: Simple distance checks suffice
- For particle-particle: Spatial hashing required for >1000 particles
- Consider GPU ray tracing for complex scene collisions (new in 2025)

- Source: [NVIDIA GPU Gems - Broad Phase Collision](https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-32-broad-phase-collision-detection-cuda)
- Source: [GPU Particle Collision Thesis](https://theses.fh-hagenberg.at/system/files/pdf/Pointner18.pdf)

---

### Finding 6: Animation Curves and Easing on GPU

**Current Nova Implementation**
The `AnimationCurve` class uses CPU-side evaluation. For GPU particle systems, curves should be evaluated in the compute shader.

**GPU Curve Evaluation Approaches**

**Option 1: Texture Lookup (Recommended)**
```typescript
// Pre-bake curve to 1D texture
const curveTexture = new THREE.DataTexture(
  curveData, 256, 1, THREE.RedFormat, THREE.FloatType
);

// In shader:
const curveValue = curveTexture.sample(normalizedAge);
```

**Option 2: Polynomial Approximation**
```typescript
// Smoothstep for ease-in-out
const t = normalizedAge;
const eased = t.mul(t).mul(float(3).sub(t.mul(2)));

// Quadratic ease-out (current Nova approach)
const alpha = float(1).sub(t.mul(t));
```

**Option 3: Bezier Curve in Shader**
```typescript
// Cubic bezier evaluation
const bezier = Fn((t, p0, p1, p2, p3) => {
  const t2 = t.mul(t);
  const t3 = t2.mul(t);
  const mt = float(1).sub(t);
  const mt2 = mt.mul(mt);
  const mt3 = mt2.mul(mt);

  return p0.mul(mt3)
    .add(p1.mul(mt2.mul(t).mul(3)))
    .add(p2.mul(mt.mul(t2).mul(3)))
    .add(p3.mul(t3));
});
```

**Standard Easing Functions in WGSL/TSL**
```typescript
// Ease In Quad
const easeInQuad = (t) => t.mul(t);

// Ease Out Quad
const easeOutQuad = (t) => t.mul(float(2).sub(t));

// Ease In Out Cubic
const easeInOutCubic = (t) => {
  return If(t.lessThan(0.5),
    () => t.mul(t).mul(t).mul(4),
    () => float(1).sub(float(-2).mul(t).add(2).pow(3).div(2))
  );
};
```

- Source: [Book of Shaders - Shaping Functions](https://thebookofshaders.com/05/)
- Source: [Bezier Easing Functions](https://greweb.me/2012/02/bezier-curve-based-easing-functions-from-concept-to-implementation)

---

### Finding 7: Curl Noise and Turbulence

**Curl Noise for Fluid-Like Motion**
Curl noise creates divergence-free motion (particles move like real fluid):
```
1. Generate 3D scalar noise field
2. Calculate gradient
3. Compute curl of gradient
4. Result: smooth, swirling motion without convergence
```

**WGSL/TSL Implementation**
```typescript
// Simplex noise (available in WGSL ports)
const noise3D = (p) => {
  // Simplex noise implementation
  // See: https://gist.github.com/munrocket/236ed5ba7e409b8bdf1ff6eca5dcdc39
};

// Curl noise
const curlNoise = Fn((position, time) => {
  const e = 0.0001;
  const dx = vec3(e, 0, 0);
  const dy = vec3(0, e, 0);
  const dz = vec3(0, 0, e);

  const p = position.add(time.mul(0.1)); // Animate

  // Partial derivatives
  const nx = noise3D(p.add(dy)).sub(noise3D(p.sub(dy)));
  const ny = noise3D(p.add(dz)).sub(noise3D(p.sub(dz)));
  const nz = noise3D(p.add(dx)).sub(noise3D(p.sub(dx)));

  // Curl
  return vec3(ny.sub(nz), nz.sub(nx), nx.sub(ny)).div(e.mul(2));
});
```

**FBM (Fractional Brownian Motion) for Turbulence**
Layer multiple octaves of noise:
```typescript
const fbm = Fn((p, octaves) => {
  let value = float(0);
  let amplitude = float(0.5);
  let frequency = float(1);

  for (let i = 0; i < octaves; i++) {
    value.addAssign(amplitude.mul(noise3D(p.mul(frequency))));
    frequency.mulAssign(2);
    amplitude.mulAssign(0.5);
  }

  return value;
});
```

- Source: [WGSL Noise Algorithms](https://gist.github.com/munrocket/236ed5ba7e409b8bdf1ff6eca5dcdc39)
- Source: [Curl Noise GitHub](https://github.com/kbladin/Curl_Noise)

---

### Finding 8: Double Buffering / Ping-Pong Patterns

**Current Nova Architecture**
Nova uses single buffers for read/write. This works for simple cases but can cause issues with complex particle interactions.

**When Ping-Pong is Needed**
- Particle-particle interactions (need stable read state)
- Multi-pass simulation (each pass reads previous results)
- Order-independent operations

**Implementation Pattern**
```typescript
class DoubleBuffer {
  private bufferA: StorageBufferAttribute;
  private bufferB: StorageBufferAttribute;
  private storageA: ReturnType<typeof storage>;
  private storageB: ReturnType<typeof storage>;
  private readIndex = 0;

  get read() { return this.readIndex === 0 ? this.storageA : this.storageB; }
  get write() { return this.readIndex === 0 ? this.storageB : this.storageA; }

  swap() { this.readIndex = 1 - this.readIndex; }
}
```

**Usage in Compute Shader**
```typescript
const updateCompute = Fn(() => {
  const readPos = positionRead.element(instanceIndex);
  const writePos = positionWrite.element(instanceIndex);

  // Read from stable buffer, write to other
  writePos.assign(readPos.add(velocity.mul(deltaTime)));
})();

// After compute:
positionBuffer.swap();
```

- Source: [Game Programming Patterns - Double Buffer](https://gameprogrammingpatterns.com/double-buffer.html)

---

## Codebase Analysis

### Current Nova Particles Strengths
1. **Storage Buffer Architecture**: Correct use of GPU storage buffers
2. **TSL Integration**: Proper use of `Fn()`, `storage()`, `instanceIndex`
3. **Emitter Variety**: Good selection of emitter shapes
4. **Force Definitions**: Well-structured force system (though CPU-only currently)

### Improvement Opportunities

| Area | Current State | Recommendation |
|------|---------------|----------------|
| Workgroup Size | Not specified | Add explicit `@workgroup_size(64)` |
| Particle Count | Fixed at maxParticles | Use atomic counter + indirect draw |
| Curve Evaluation | CPU-side AnimationCurve | Move to texture lookup in shader |
| Forces | CPU classes only | Implement in compute shader |
| Trails | Not implemented | Add ring buffer trail system |
| Collisions | Basic floor only | Add sphere/plane/spatial hash |
| Noise | Not implemented | Add curl/simplex noise |

---

## Recommendations

### Priority 1: Performance Critical
1. **Implement Indirect Draw Calls**
   - Add atomic live particle counter
   - Write draw parameters from compute shader
   - Use `drawIndirect()` instead of fixed instance count

2. **Add Workgroup Size Hints**
   ```typescript
   .compute(particleCount, { workgroupSize: [64, 1, 1] })
   ```

3. **GPU-Side Curve Evaluation**
   - Bake curves to 1D textures
   - Sample in compute shader

### Priority 2: Feature Additions
4. **Implement Force Fields in Compute**
   - Convert force classes to TSL functions
   - Support multiple forces per system

5. **Add Curl Noise Turbulence**
   - Port simplex noise to TSL
   - Implement curl for smoke/fluid effects

6. **Trail Renderer**
   - Ring buffer per particle
   - Configurable length and fade

### Priority 3: Advanced Features
7. **Spatial Hashing for Collisions**
   - Multi-pass compute pipeline
   - Support particle-particle interactions

8. **Sub-Emitters**
   - Spawn particles on death/collision
   - Cascade effects

---

## Sources

### WebGPU Best Practices
- [Toji.dev WebGPU Best Practices](https://toji.dev/webgpu-best-practices/)
- [WebGPU Fundamentals - Optimization](https://webgpufundamentals.org/webgpu/lessons/webgpu-optimization.html)
- [WebGPU Fundamentals - Compute Shaders](https://webgpufundamentals.org/webgpu/lessons/webgpu-compute-shaders.html)
- [WebGPU Indirect Draw Best Practices](https://toji.dev/webgpu-best-practices/indirect-draws.html)

### GPU Particle Systems
- [Building a Million-Particle System](https://www.gamedeveloper.com/programming/building-a-million-particle-system)
- [GPU Particles - Unity](https://github.com/Robert-K/gpu-particles)
- [GPUParticles with Indirect Draw](https://github.com/Brian-Jiang/GPUParticles)
- [Wicked Engine GPU Particles](https://wickedengine.net/2017/11/gpu-based-particle-simulation/)

### Three.js TSL
- [Three.js Shading Language Wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [Field Guide to TSL and WebGPU - Maxime Heckel](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/)
- [TSL: A Better Way to Write Shaders](https://threejsroadmap.com/blog/tsl-a-better-way-to-write-shaders-in-threejs)
- [Three.js WebGPU Migration Guide](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)

### Noise and Turbulence
- [WGSL Noise Algorithms](https://gist.github.com/munrocket/236ed5ba7e409b8bdf1ff6eca5dcdc39)
- [Curl Noise Implementation](https://github.com/kbladin/Curl_Noise)
- [Book of Shaders - Noise](https://thebookofshaders.com/11/)
- [Fast Divergence-Free Noise](https://atyuwen.github.io/posts/bitangent-noise/)

### Collision Detection
- [NVIDIA GPU Gems - Broad Phase Collision](https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-32-broad-phase-collision-detection-cuda)
- [Particle Collision on GPU Thesis](https://theses.fh-hagenberg.at/system/files/pdf/Pointner18.pdf)

### Animation and Easing
- [Book of Shaders - Shaping Functions](https://thebookofshaders.com/05/)
- [Bezier Curve Based Easing](https://greweb.me/2012/02/bezier-curve-based-easing-functions-from-concept-to-implementation)

---

## Open Questions

1. **Subgroup Operations**: WebGPU subgroup support is experimental (Chrome 131+). When stable, could provide 2x speedup for reductions. Monitor for production readiness.

2. **Multi-Draw Indirect**: Chrome 131 has experimental support. Would enable even more efficient batching of multiple particle systems.

3. **GPU Ray Tracing for Collisions**: New approaches like Mochi show 9x speedups. Worth investigating when WebGPU ray tracing matures.

4. **React Three Fiber Integration**: The roadmap mentions R3F integration. Consider how the API should adapt for declarative usage.
