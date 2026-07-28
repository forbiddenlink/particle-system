import { describe, it, expect } from 'vitest';
import { PerspectiveCamera, Plane, Vector3 } from 'three';
import { screenToWorldOnPlane } from './pointer.js';

function cameraLookingAtOrigin(): PerspectiveCamera {
  const cam = new PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

describe('screenToWorldOnPlane', () => {
  it('maps screen center to the origin on the z=0 plane', () => {
    const cam = cameraLookingAtOrigin();
    const hit = screenToWorldOnPlane({ x: 0, y: 0 }, cam);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(0, 5);
    expect(hit!.y).toBeCloseTo(0, 5);
    expect(hit!.z).toBeCloseTo(0, 5);
  });

  it('preserves screen orientation: right->+x, up->+y', () => {
    const cam = cameraLookingAtOrigin();
    const hit = screenToWorldOnPlane({ x: 0.5, y: 0.5 }, cam);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeGreaterThan(0);
    expect(hit!.y).toBeGreaterThan(0);
  });

  it('returns null when the ray is parallel to the plane', () => {
    const cam = cameraLookingAtOrigin(); // looks along -z
    const parallelPlane = new Plane(new Vector3(1, 0, 0), -5); // x=5 plane, parallel to the -z ray and not through the camera
    const hit = screenToWorldOnPlane({ x: 0, y: 0 }, cam, parallelPlane);
    expect(hit).toBeNull();
  });
});
