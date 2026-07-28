import { Camera, Plane, Raycaster, Vector2, Vector3 } from 'three';

const raycaster = new Raycaster();
const ndcVec = new Vector2();
const defaultPlane = new Plane(new Vector3(0, 0, 1), 0);

/**
 * Project a normalized-device-coordinate pointer position onto a world plane.
 *
 * @param ndc  Pointer position in NDC space, each axis in [-1, 1]
 *             (x: -1 left to +1 right, y: -1 bottom to +1 top).
 * @param camera  The camera the pointer is viewed through.
 * @param plane  World plane to intersect. Defaults to the z=0 plane.
 * @returns  The world-space intersection point, or null if the ray is
 *           parallel to the plane (no intersection).
 */
export function screenToWorldOnPlane(
  ndc: { x: number; y: number },
  camera: Camera,
  plane: Plane = defaultPlane,
): Vector3 | null {
  ndcVec.set(ndc.x, ndc.y);
  raycaster.setFromCamera(ndcVec, camera);
  const target = new Vector3();
  const hit = raycaster.ray.intersectPlane(plane, target);
  return hit ? target : null;
}
