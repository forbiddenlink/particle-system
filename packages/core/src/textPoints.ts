/** A 3D point in the particle world. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface SampleOptions {
  /** Sample every `step` pixels (>=1). Higher = fewer points. Default 1. */
  step?: number;
  /** World size the image is mapped across, centered on the origin. Default 10. */
  spread?: number;
  /** Minimum alpha (0-255) for a pixel to count as opaque. Default 128. */
  threshold?: number;
}

/**
 * Sample the opaque pixels of an RGBA image into a centered 3D point cloud.
 * Intended to turn rendered text or an image into particle target positions.
 *
 * Pixel (0,0) is the top-left; the y axis is flipped so the cloud is upright
 * in a Y-up world. Points are centered on the origin and scaled to `spread`.
 *
 * @param data    RGBA bytes, length width*height*4 (e.g. from getImageData).
 * @param width   Image width in pixels.
 * @param height  Image height in pixels.
 * @param options step / spread / threshold.
 * @returns  One point per opaque, sampled pixel.
 */
export function sampleOpaquePoints(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: SampleOptions = {},
): Point3[] {
  const step = Math.max(1, Math.floor(options.step ?? 1));
  const spread = options.spread ?? 10;
  const threshold = options.threshold ?? 128;

  const points: Point3[] = [];
  const aspect = height === 0 ? 1 : width / height;

  for (let py = 0; py < height; py += step) {
    for (let px = 0; px < width; px += step) {
      const alpha = data[(py * width + px) * 4 + 3];
      if (alpha < threshold) continue;
      // Normalize to [-0.5, 0.5], flip y, scale by spread (x widened by aspect).
      const nx = px / width - 0.5;
      const ny = py / height - 0.5;
      points.push({
        x: nx * spread * aspect,
        y: -ny * spread,
        z: 0,
      });
    }
  }
  return points;
}
