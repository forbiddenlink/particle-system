// @ts-ignore - TSL types are incomplete
import {
  Fn,
  storage,
  instanceIndex,
  uniform,
  vec4,
  float,
  int,
  If,
  Loop,
  mix,
} from 'three/tsl';

/**
 * Storage nodes required for trail compute shader
 */
export interface TrailComputeStorageNodes {
  position: ReturnType<typeof storage>;
  color: ReturnType<typeof storage>;
  life: ReturnType<typeof storage>;
  trail: ReturnType<typeof storage>;
  trailIndex: ReturnType<typeof storage>;
  trailVertex: ReturnType<typeof storage>;
  trailColorVertex: ReturnType<typeof storage>;
}

/**
 * Configuration for trail compute shader
 */
export interface TrailComputeConfig {
  maxParticles: number;
  trailLength: number;
  fadeAlpha: boolean;
}

/**
 * Create trail compute shader that updates trail ring buffer and flattens to line segments
 *
 * @param storageNodes - TSL storage nodes for particle and trail data
 * @param config - Trail configuration
 * @returns Compute shader ready to be executed
 */
export function createTrailCompute(
  storageNodes: TrailComputeStorageNodes,
  config: TrailComputeConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const { maxParticles, trailLength, fadeAlpha } = config;
  const {
    position: positionStorage,
    color: colorStorage,
    life: lifeStorage,
    trail: trailStorage,
    trailIndex: trailIndexStorage,
    trailVertex: trailVertexStorage,
    trailColorVertex: trailColorVertexStorage,
  } = storageNodes;

  const trailLengthUniform = uniform(trailLength);
  const fadeAlphaUniform = uniform(fadeAlpha ? 1 : 0);

  // @ts-expect-error - TSL compute shaders don't return values
  return (Fn(() => {
    const i = instanceIndex;

    // Get current trail write index for this particle
    const trailIdx = trailIndexStorage.element(i);

    // Get particle state
    const pos = positionStorage.element(i);
    const color = colorStorage.element(i);
    const life = lifeStorage.element(i);
    const currentLife = life.x;

    // Only update trails for alive particles
    If(currentLife.greaterThan(0), () => {
      // Calculate base index in trail buffer for this particle
      const particleTrailBase = i.mul(trailLengthUniform);

      // Write current position to ring buffer at current index (pos is already vec4 from positionStorage)
      const writeIdx = particleTrailBase.add(trailIdx);
      trailStorage.element(writeIdx).assign(pos);

      // Increment trail index (wrap around)
      const newTrailIdx = trailIdx.add(int(1)).modInt(trailLengthUniform);
      trailIndexStorage.element(i).assign(newTrailIdx);

      // Flatten trail to line segment vertices
      // Each particle has (trailLength - 1) segments = 2 * (trailLength - 1) vertices
      const segmentsPerParticle = trailLengthUniform.sub(int(1));
      const verticesPerParticle = segmentsPerParticle.mul(int(2));
      const vertexBase = i.mul(verticesPerParticle);

      // Loop through segments
      // For each segment j: vertex[2j] = trail[(newTrailIdx + j) % trailLength]
      //                     vertex[2j+1] = trail[(newTrailIdx + j + 1) % trailLength]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Loop({ start: int(0), end: segmentsPerParticle, type: 'int', condition: '<' }, ({ i: j }: { i: any }) => {
        // Read positions from ring buffer in order (oldest first)
        const idx0 = particleTrailBase.add(newTrailIdx.add(j).modInt(trailLengthUniform));
        const idx1 = particleTrailBase.add(newTrailIdx.add(j).add(int(1)).modInt(trailLengthUniform));

        const pos0 = trailStorage.element(idx0);
        const pos1 = trailStorage.element(idx1);

        // Write to vertex buffer
        const vIdx0 = vertexBase.add(j.mul(int(2)));
        const vIdx1 = vIdx0.add(int(1));

        trailVertexStorage.element(vIdx0).assign(pos0);
        trailVertexStorage.element(vIdx1).assign(pos1);

        // Calculate alpha fade (oldest = 0, newest = 1)
        const segmentAge = float(j).div(float(segmentsPerParticle));
        const alpha0 = mix(float(1), segmentAge, fadeAlphaUniform);
        const alpha1 = mix(float(1), segmentAge.add(float(1).div(float(segmentsPerParticle))), fadeAlphaUniform);

        // Write colors with faded alpha
        const color0 = vec4(color.x, color.y, color.z, color.w.mul(alpha0));
        const color1 = vec4(color.x, color.y, color.z, color.w.mul(alpha1));

        trailColorVertexStorage.element(vIdx0).assign(color0);
        trailColorVertexStorage.element(vIdx1).assign(color1);
      });
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })() as any).compute(maxParticles, [64]);
}
