/**
 * Procedural particle texture generator
 * Creates various particle shapes on-the-fly without external image files
 */

export type ParticleTextureType = 'soft-circle' | 'star' | 'spark' | 'smoke' | 'glow' | 'ring';

export class ParticleTextureGenerator {
  /**
   * Generate a soft circular particle (classic particle look)
   */
  static generateSoftCircle(size: number = 128): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;
    const radius = size / 2;

    // Radial gradient from white center to transparent edge
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return canvas;
  }

  /**
   * Generate a star/sparkle particle (for magical effects)
   */
  static generateStar(size: number = 128, points: number = 4): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;

    ctx.save();
    ctx.translate(center, center);

    // Draw multiple overlapping star shapes with glow
    for (let layer = 0; layer < 3; layer++) {
      const scale = 1 - layer * 0.2;
      const alpha = 1 - layer * 0.3;

      ctx.save();
      ctx.scale(scale, scale);

      // Create star path
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const angle = (Math.PI * i) / points;
        const radius = i % 2 === 0 ? center * 0.8 : center * 0.3;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Fill with gradient
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, center);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      gradient.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.6})`);
      gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
      
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();

    return canvas;
  }

  /**
   * Generate a sharp spark particle (for fire, electricity)
   */
  static generateSpark(size: number = 128): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;

    // Elongated diamond shape
    ctx.save();
    ctx.translate(center, center);

    const gradient = ctx.createLinearGradient(0, -center * 0.8, 0, center * 0.8);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.8, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.beginPath();
    ctx.moveTo(0, -center * 0.8);
    ctx.lineTo(center * 0.2, 0);
    ctx.lineTo(0, center * 0.8);
    ctx.lineTo(-center * 0.2, 0);
    ctx.closePath();

    ctx.fillStyle = gradient;
    ctx.fill();

    // Add glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();

    ctx.restore();

    return canvas;
  }

  /**
   * Generate a smoke wisp particle (for smoke, fog effects)
   */
  static generateSmoke(size: number = 128): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;

    // Create irregular smoke shape using multiple circles
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const offset = center * 0.3;
      const x = center + Math.cos(angle) * offset;
      const y = center + Math.sin(angle) * offset;
      const radius = center * (0.4 + Math.random() * 0.3);

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${0.15 + Math.random() * 0.1})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Add central glow
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center * 0.6);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return canvas;
  }

  /**
   * Generate a glowing orb particle (for magic, energy effects)
   */
  static generateGlow(size: number = 128): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;

    // Multiple layers of glow
    for (let layer = 0; layer < 5; layer++) {
      const radius = center * (1 - layer * 0.15);
      const alpha = 0.8 - layer * 0.15;

      const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      gradient.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.5})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas;
  }

  /**
   * Generate a ring particle (for shockwaves, portals)
   */
  static generateRing(size: number = 128): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;
    const outerRadius = center * 0.9;
    const innerRadius = center * 0.6;

    // Create ring using two circles
    const gradient = ctx.createRadialGradient(center, center, innerRadius, center, center, outerRadius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, center, outerRadius, 0, Math.PI * 2);
    ctx.arc(center, center, innerRadius, 0, Math.PI * 2, true);
    ctx.fill();

    return canvas;
  }

  /**
   * Generate all particle textures
   */
  static generateAll(size: number = 128): Map<ParticleTextureType, HTMLCanvasElement> {
    return new Map([
      ['soft-circle', this.generateSoftCircle(size)],
      ['star', this.generateStar(size)],
      ['spark', this.generateSpark(size)],
      ['smoke', this.generateSmoke(size)],
      ['glow', this.generateGlow(size)],
      ['ring', this.generateRing(size)],
    ]);
  }
}
