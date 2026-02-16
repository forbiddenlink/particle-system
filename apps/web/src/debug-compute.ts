import * as THREE from 'three/webgpu';
import { Fn, storage, instanceIndex, float } from 'three/tsl';

export async function runDebugCompute(renderer: THREE.WebGPURenderer) {
  console.log('🧪 Starting minimal compute shader test...');

  const count = 100;
  const buffer = new THREE.StorageBufferAttribute(new Float32Array(count), 1);
  const storageNode = storage(buffer, 'float', count);

  // Simple compute: assign index to buffer
  // @ts-expect-error - TSL compute shaders don't return values, but types require Node
  const computeNode = (Fn(() => {
    const i = instanceIndex;
    storageNode.element(i).assign(float(i));
  })() as any).compute(count);

  try {
    await renderer.computeAsync(computeNode);
    
    // Read back
    // Note: Reading back from storage buffer requires async read which might not be easily accessible 
    // without debug flag or specific methods, but if computeAsync throws, we know it failed.
    console.log('✅ Minimal compute shader executed without error.');
    return true;
  } catch (e) {
    console.error('❌ Minimal compute shader failed:', e);
    return false;
  }
}
