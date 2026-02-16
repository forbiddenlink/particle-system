import * as THREE from 'three/webgpu';
import { texture, uniform, vec2, vec4, uv, Fn, float } from 'three/tsl';

/**
 * Bloom post-processing effect using Three.js TSL
 * 
 * Implements a multi-pass bloom:
 * 1. Bright pass - extract pixels above threshold
 * 2. Gaussian blur - blur the bright pixels
 * 3. Composite - add blurred result back to original
 */
export class BloomPass {
  private renderer: THREE.WebGPURenderer;
  private width: number;
  private height: number;

  // Render targets
  private brightTarget: THREE.RenderTarget;
  private blurTarget1: THREE.RenderTarget;
  private blurTarget2: THREE.RenderTarget;

  // Parameters
  public intensity = uniform(1.0);
  public threshold = uniform(0.8);
  public smoothWidth = uniform(0.1);
  public radius = uniform(1.0);

  constructor(renderer: THREE.WebGPURenderer, width: number, height: number) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;

    // Create render targets for bloom passes
    const rtOptions: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType, // Use half float for HDR
    };

    this.brightTarget = new THREE.RenderTarget(width / 2, height / 2, rtOptions);
    this.blurTarget1 = new THREE.RenderTarget(width / 4, height / 4, rtOptions);
    this.blurTarget2 = new THREE.RenderTarget(width / 4, height / 4, rtOptions);
  }

  /**
   * Apply bloom effect to input texture
   */
  render(inputTexture: THREE.Texture, outputTarget?: THREE.RenderTarget): THREE.Texture {
    // Pass 1: Extract bright pixels
    const brightPass = this.createBrightPass(inputTexture);
    this.renderer.setRenderTarget(this.brightTarget);
    this.renderer.render(brightPass, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));

    // Pass 2: Blur horizontally
    const blurH = this.createBlurPass(this.brightTarget.texture, true);
    this.renderer.setRenderTarget(this.blurTarget1);
    this.renderer.render(blurH, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));

    // Pass 3: Blur vertically
    const blurV = this.createBlurPass(this.blurTarget1.texture, false);
    this.renderer.setRenderTarget(this.blurTarget2);
    this.renderer.render(blurV, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));

    // Pass 4: Composite
    const composite = this.createCompositePass(inputTexture, this.blurTarget2.texture);
    this.renderer.setRenderTarget(outputTarget || null);
    this.renderer.render(composite, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));

    return outputTarget ? outputTarget.texture : this.blurTarget2.texture;
  }

  /**
   * Bright pass - extract pixels above threshold
   */
  private createBrightPass(inputTexture: THREE.Texture): THREE.Scene {
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicNodeMaterial()
    );

    const uvNode = uv();

    // Bright pass shader using TSL
    const brightPassShader = Fn(() => {
      const color = texture(inputTexture, uvNode);
      const luminance = color.r.mul(0.299).add(color.g.mul(0.587)).add(color.b.mul(0.114));
      
      // Smooth threshold using smoothstep
      const low = this.threshold.sub(this.smoothWidth);
      const high = this.threshold.add(this.smoothWidth);
      const factor = luminance.sub(low).div(high.sub(low)).clamp(0, 1);
      
      return vec4(color.rgb.mul(factor), color.a);
    });

    quad.material.colorNode = brightPassShader();
    scene.add(quad);
    return scene;
  }

  /**
   * Gaussian blur pass
   */
  private createBlurPass(inputTexture: THREE.Texture, horizontal: boolean): THREE.Scene {
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicNodeMaterial()
    );

    const texelSize = vec2(1.0 / this.width, 1.0 / this.height);
    const uvNode = uv();

    // 9-tap Gaussian blur
    const weights = [0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216];
    
    const blurShader = Fn(() => {
      const direction = horizontal 
        ? vec2(texelSize.x.mul(this.radius), float(0))
        : vec2(float(0), texelSize.y.mul(this.radius));

      let result = texture(inputTexture, uvNode).mul(weights[0]);

      for (let i = 1; i < 5; i++) {
        const offset = direction.mul(float(i));
        result = result.add(texture(inputTexture, uvNode.add(offset)).mul(weights[i]));
        result = result.add(texture(inputTexture, uvNode.sub(offset)).mul(weights[i]));
      }

      return vec4(result.rgb, float(1));
    });

    quad.material.colorNode = blurShader();
    scene.add(quad);
    return scene;
  }

  /**
   * Composite pass - add bloom to original
   */
  private createCompositePass(originalTexture: THREE.Texture, bloomTexture: THREE.Texture): THREE.Scene {
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicNodeMaterial()
    );

    const uvNode = uv();

    const compositeShader = Fn(() => {
      const original = texture(originalTexture, uvNode);
      const bloom = texture(bloomTexture, uvNode);
      
      // Add bloom with intensity
      const result = original.rgb.add(bloom.rgb.mul(this.intensity));
      
      return vec4(result, original.a);
    });

    quad.material.colorNode = compositeShader();
    scene.add(quad);
    return scene;
  }

  /**
   * Resize render targets
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    this.brightTarget.setSize(width / 2, height / 2);
    this.blurTarget1.setSize(width / 4, height / 4);
    this.blurTarget2.setSize(width / 4, height / 4);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.brightTarget.dispose();
    this.blurTarget1.dispose();
    this.blurTarget2.dispose();
  }
}
