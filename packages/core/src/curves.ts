/**
 * Keyframe for animation curves
 */
export interface Keyframe {
  time: number;  // 0-1 normalized
  value: number;
}

/**
 * Color keyframe for gradients
 */
export interface ColorKeyframe {
  time: number;  // 0-1 normalized
  color: { r: number; g: number; b: number };
  alpha?: number;
}

/**
 * Animation curve using cubic bezier interpolation
 */
export class AnimationCurve {
  private keyframes: Keyframe[];
  
  constructor(keyframes: Keyframe[] = [{ time: 0, value: 1 }, { time: 1, value: 0 }]) {
    this.keyframes = keyframes.sort((a, b) => a.time - b.time);
  }
  
  /**
   * Evaluate the curve at a given time (0-1)
   */
  evaluate(t: number): number {
    if (this.keyframes.length === 0) return 0;
    if (this.keyframes.length === 1) return this.keyframes[0].value;
    
    t = Math.max(0, Math.min(1, t));
    
    // Find surrounding keyframes
    let i = 0;
    while (i < this.keyframes.length - 1 && this.keyframes[i + 1].time <= t) {
      i++;
    }
    
    if (i >= this.keyframes.length - 1) {
      return this.keyframes[this.keyframes.length - 1].value;
    }
    
    const k0 = this.keyframes[i];
    const k1 = this.keyframes[i + 1];
    
    // Linear interpolation between keyframes
    const localT = (t - k0.time) / (k1.time - k0.time);
    return k0.value + (k1.value - k0.value) * this.smoothstep(localT);
  }
  
  private smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }
  
  /**
   * Create common curve presets
   */
  static linear(): AnimationCurve {
    return new AnimationCurve([
      { time: 0, value: 1 },
      { time: 1, value: 0 },
    ]);
  }
  
  static easeIn(): AnimationCurve {
    return new AnimationCurve([
      { time: 0, value: 1 },
      { time: 0.5, value: 0.75 },
      { time: 1, value: 0 },
    ]);
  }
  
  static easeOut(): AnimationCurve {
    return new AnimationCurve([
      { time: 0, value: 1 },
      { time: 0.5, value: 0.25 },
      { time: 1, value: 0 },
    ]);
  }
  
  static pulse(): AnimationCurve {
    return new AnimationCurve([
      { time: 0, value: 0 },
      { time: 0.2, value: 1 },
      { time: 0.8, value: 1 },
      { time: 1, value: 0 },
    ]);
  }
  
  static constant(value: number = 1): AnimationCurve {
    return new AnimationCurve([
      { time: 0, value },
      { time: 1, value },
    ]);
  }
}

/**
 * Color gradient for particle color over lifetime
 */
export class ColorGradient {
  private keyframes: ColorKeyframe[];
  
  constructor(keyframes: ColorKeyframe[]) {
    this.keyframes = keyframes.sort((a, b) => a.time - b.time);
  }
  
  /**
   * Evaluate the gradient at a given time (0-1)
   */
  evaluate(t: number): { r: number; g: number; b: number; a: number } {
    if (this.keyframes.length === 0) {
      return { r: 1, g: 1, b: 1, a: 1 };
    }
    if (this.keyframes.length === 1) {
      const k = this.keyframes[0];
      return { r: k.color.r, g: k.color.g, b: k.color.b, a: k.alpha ?? 1 };
    }
    
    t = Math.max(0, Math.min(1, t));
    
    // Find surrounding keyframes
    let i = 0;
    while (i < this.keyframes.length - 1 && this.keyframes[i + 1].time <= t) {
      i++;
    }
    
    if (i >= this.keyframes.length - 1) {
      const k = this.keyframes[this.keyframes.length - 1];
      return { r: k.color.r, g: k.color.g, b: k.color.b, a: k.alpha ?? 1 };
    }
    
    const k0 = this.keyframes[i];
    const k1 = this.keyframes[i + 1];
    
    const localT = (t - k0.time) / (k1.time - k0.time);
    
    return {
      r: k0.color.r + (k1.color.r - k0.color.r) * localT,
      g: k0.color.g + (k1.color.g - k0.color.g) * localT,
      b: k0.color.b + (k1.color.b - k0.color.b) * localT,
      a: (k0.alpha ?? 1) + ((k1.alpha ?? 1) - (k0.alpha ?? 1)) * localT,
    };
  }
  
  /**
   * Get keyframes as flat array for GPU upload [r,g,b,a, r,g,b,a, ...]
   */
  toArray(): Float32Array {
    const data = new Float32Array(this.keyframes.length * 5); // time, r, g, b, a
    this.keyframes.forEach((k, i) => {
      data[i * 5] = k.time;
      data[i * 5 + 1] = k.color.r;
      data[i * 5 + 2] = k.color.g;
      data[i * 5 + 3] = k.color.b;
      data[i * 5 + 4] = k.alpha ?? 1;
    });
    return data;
  }
  
  /**
   * Create common gradient presets
   */
  static fire(): ColorGradient {
    return new ColorGradient([
      { time: 0, color: { r: 1, g: 1, b: 0.8 }, alpha: 1 },
      { time: 0.2, color: { r: 1, g: 0.8, b: 0.2 }, alpha: 1 },
      { time: 0.5, color: { r: 1, g: 0.3, b: 0.1 }, alpha: 0.8 },
      { time: 0.8, color: { r: 0.5, g: 0.1, b: 0.1 }, alpha: 0.4 },
      { time: 1, color: { r: 0.2, g: 0.05, b: 0.05 }, alpha: 0 },
    ]);
  }
  
  static smoke(): ColorGradient {
    return new ColorGradient([
      { time: 0, color: { r: 0.3, g: 0.3, b: 0.3 }, alpha: 0.8 },
      { time: 0.3, color: { r: 0.4, g: 0.4, b: 0.4 }, alpha: 0.6 },
      { time: 0.7, color: { r: 0.5, g: 0.5, b: 0.5 }, alpha: 0.3 },
      { time: 1, color: { r: 0.6, g: 0.6, b: 0.6 }, alpha: 0 },
    ]);
  }
  
  static magic(): ColorGradient {
    return new ColorGradient([
      { time: 0, color: { r: 1, g: 1, b: 1 }, alpha: 1 },
      { time: 0.2, color: { r: 0.8, g: 0.5, b: 1 }, alpha: 1 },
      { time: 0.5, color: { r: 0.5, g: 0.2, b: 1 }, alpha: 0.8 },
      { time: 0.8, color: { r: 0.3, g: 0.1, b: 0.8 }, alpha: 0.4 },
      { time: 1, color: { r: 0.1, g: 0, b: 0.5 }, alpha: 0 },
    ]);
  }
  
  static rainbow(): ColorGradient {
    return new ColorGradient([
      { time: 0, color: { r: 1, g: 0, b: 0 }, alpha: 1 },
      { time: 0.17, color: { r: 1, g: 0.5, b: 0 }, alpha: 1 },
      { time: 0.33, color: { r: 1, g: 1, b: 0 }, alpha: 1 },
      { time: 0.5, color: { r: 0, g: 1, b: 0 }, alpha: 1 },
      { time: 0.67, color: { r: 0, g: 0.5, b: 1 }, alpha: 1 },
      { time: 0.83, color: { r: 0.5, g: 0, b: 1 }, alpha: 1 },
      { time: 1, color: { r: 1, g: 0, b: 0.5 }, alpha: 0 },
    ]);
  }
  
  static electric(): ColorGradient {
    return new ColorGradient([
      { time: 0, color: { r: 1, g: 1, b: 1 }, alpha: 1 },
      { time: 0.1, color: { r: 0.5, g: 0.8, b: 1 }, alpha: 1 },
      { time: 0.3, color: { r: 0.2, g: 0.5, b: 1 }, alpha: 0.9 },
      { time: 0.6, color: { r: 0.1, g: 0.3, b: 0.9 }, alpha: 0.6 },
      { time: 1, color: { r: 0, g: 0.1, b: 0.5 }, alpha: 0 },
    ]);
  }
}
