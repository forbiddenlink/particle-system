import * as THREE from 'three';
import { ParticleTextureGenerator, type ParticleTextureType } from './ParticleTextureGenerator.js';

/**
 * Texture atlas for particle system
 * Packs multiple particle textures into a single texture for efficient rendering
 */
export class ParticleTextureAtlas {
  public texture: THREE.CanvasTexture;
  public uvOffsets: Map<ParticleTextureType, { u: number; v: number; width: number; height: number }>;
  
  private readonly canvas: HTMLCanvasElement;
  private readonly textureSize: number;
  private readonly tileSize: number;
  private readonly tilesPerRow: number;

  constructor(textureSize: number = 512, tileSize: number = 128) {
    this.textureSize = textureSize;
    this.tileSize = tileSize;
    this.tilesPerRow = Math.floor(textureSize / tileSize);
    
    this.canvas = document.createElement('canvas');
    this.canvas.width = textureSize;
    this.canvas.height = textureSize;
    
    this.uvOffsets = new Map();
    
    // Generate and pack all textures
    this.generateAtlas();
    
    // Create Three.js texture from canvas
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.needsUpdate = true;
  }

  /**
   * Generate the texture atlas by packing all particle textures
   */
  private generateAtlas(): void {
    const ctx = this.canvas.getContext('2d')!;
    const textures = ParticleTextureGenerator.generateAll(this.tileSize);
    
    let index = 0;
    textures.forEach((canvas, type) => {
      const row = Math.floor(index / this.tilesPerRow);
      const col = index % this.tilesPerRow;
      
      const x = col * this.tileSize;
      const y = row * this.tileSize;
      
      // Draw texture to atlas
      ctx.drawImage(canvas, x, y, this.tileSize, this.tileSize);
      
      // Store UV coordinates (normalized 0-1)
      this.uvOffsets.set(type, {
        u: x / this.textureSize,
        v: y / this.textureSize,
        width: this.tileSize / this.textureSize,
        height: this.tileSize / this.textureSize,
      });
      
      index++;
    });
  }

  /**
   * Get UV offset for a specific texture type
   */
  getUVOffset(type: ParticleTextureType): { u: number; v: number; width: number; height: number } {
    const offset = this.uvOffsets.get(type);
    if (!offset) {
      throw new Error(`Texture type "${type}" not found in atlas`);
    }
    return offset;
  }

  /**
   * Get texture index for a specific type (for use in shaders)
   */
  getTextureIndex(type: ParticleTextureType): number {
    const types: ParticleTextureType[] = ['soft-circle', 'star', 'spark', 'smoke', 'glow', 'ring'];
    return types.indexOf(type);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.texture.dispose();
  }
}
