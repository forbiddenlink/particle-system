import type { ParticleSystem } from '@nova-particles/core';
import { AnimationCurve, ColorGradient } from '@nova-particles/core';

/**
 * Advanced particle effect presets showcasing the full capabilities
 * of the Nova Particles system
 */

export interface PresetConfig {
  name: string;
  description: string;
  apply: (system: ParticleSystem) => void;
}

export const advancedPresets: PresetConfig[] = [
  {
    name: 'Fireworks',
    description: 'Explosive burst with trails and gravity',
    apply: (system) => {
      // Upward explosion
      system.setGravity(0, -15, 0);
      system.setDrag(0.05);
      
      // Pulse size for explosion effect
      const explosionCurve = new AnimationCurve([
        { time: 0, value: 0.1 },
        { time: 0.1, value: 1.5 },
        { time: 0.3, value: 1.0 },
        { time: 1, value: 0 },
      ]);
      system.setSizeOverLifetime(explosionCurve);
      
      // Bright colors fading out
      const fireworkColors = new ColorGradient([
        { time: 0, color: { r: 1, g: 1, b: 0 } }, // Yellow
        { time: 0.3, color: { r: 1, g: 0.4, b: 0 } }, // Orange
        { time: 0.6, color: { r: 1, g: 0, b: 0.4 } }, // Pink
        { time: 1, color: { r: 0, g: 0, b: 0 }, alpha: 0 }, // Fade out
      ]);
      system.setColorOverLifetime(fireworkColors);
    },
  },

  {
    name: 'Nebula',
    description: 'Slow-moving cosmic clouds',
    apply: (system) => {
      // Very slow drift
      system.setGravity(0, 0.5, 0);
      system.setDrag(0.8);
      system.setWind(0.5, 0, 0.3);
      
      // Gentle size variation
      const nebulaCurve = new AnimationCurve([
        { time: 0, value: 0.5 },
        { time: 0.3, value: 1.2 },
        { time: 0.7, value: 0.9 },
        { time: 1, value: 0.3 },
      ]);
      system.setSizeOverLifetime(nebulaCurve);
      
      // Deep space colors
      const nebulaColors = new ColorGradient([
        { time: 0, color: { r: 0.27, g: 0, b: 1 } }, // Deep purple
        { time: 0.3, color: { r: 0, g: 0.53, b: 1 } }, // Blue
        { time: 0.6, color: { r: 1, g: 0, b: 0.53 } }, // Magenta
        { time: 1, color: { r: 0.13, g: 0, b: 0.27 } }, // Dark purple
      ]);
      system.setColorOverLifetime(nebulaColors);
    },
  },

  {
    name: 'Lightning Storm',
    description: 'Fast electric sparks',
    apply: (system) => {
      // Chaotic movement
      system.setGravity(0, 0, 0);
      system.setDrag(0.02);
      system.setWind(5, 0, 0);
      system.setVortex(0, 0, 0, 0, 1, 0, 8);
      
      // Sharp, quick flash
      const lightningCurve = new AnimationCurve([
        { time: 0, value: 1.5 },
        { time: 0.2, value: 1.2 },
        { time: 0.5, value: 0.5 },
        { time: 1, value: 0 },
      ]);
      system.setSizeOverLifetime(lightningCurve);
      
      // Electric blue/white
      const lightningColors = new ColorGradient([
        { time: 0, color: { r: 1, g: 1, b: 1 } }, // White
        { time: 0.3, color: { r: 0, g: 1, b: 1 } }, // Cyan
        { time: 0.7, color: { r: 0, g: 0.27, b: 1 } }, // Blue
        { time: 1, color: { r: 0, g: 0, b: 0.2 }, alpha: 0 }, // Dark blue
      ]);
      system.setColorOverLifetime(lightningColors);
    },
  },

  {
    name: 'Magic Portal',
    description: 'Swirling vortex of energy',
    apply: (system) => {
      // Strong vortex pull
      system.setGravity(0, 0, 0);
      system.setDrag(0.1);
      system.setVortex(0, 2, 0, 0, 1, 0, 15);
      system.setAttractor(0, 2, 0, 5, 8);
      
      // Growing then shrinking
      const portalCurve = new AnimationCurve([
        { time: 0, value: 0.2 },
        { time: 0.4, value: 1.3 },
        { time: 0.8, value: 0.8 },
        { time: 1, value: 0 },
      ]);
      system.setSizeOverLifetime(portalCurve);
      
      // Mystical purple/pink
      const portalColors = new ColorGradient([
        { time: 0, color: { r: 1, g: 0, b: 1 } }, // Magenta
        { time: 0.3, color: { r: 0.53, g: 0, b: 1 } }, // Purple
        { time: 0.6, color: { r: 0, g: 1, b: 1 } }, // Cyan
        { time: 1, color: { r: 0.27, g: 0, b: 0.53 }, alpha: 0 }, // Dark purple
      ]);
      system.setColorOverLifetime(portalColors);
    },
  },

  {
    name: 'Fireflies',
    description: 'Gentle pulsing lights',
    apply: (system) => {
      // Floating, wandering movement
      system.setGravity(0, 0.2, 0);
      system.setDrag(0.5);
      system.setWind(0.5, 0.2, 0.3);
      
      // Pulsing glow
      const fireflyCurve = new AnimationCurve([
        { time: 0, value: 0.3 },
        { time: 0.2, value: 1.0 },
        { time: 0.4, value: 0.4 },
        { time: 0.6, value: 1.2 },
        { time: 0.8, value: 0.5 },
        { time: 1, value: 0.1 },
      ]);
      system.setSizeOverLifetime(fireflyCurve);
      
      // Warm yellow/green glow
      const fireflyColors = new ColorGradient([
        { time: 0, color: { r: 1, g: 1, b: 0 } }, // Yellow
        { time: 0.5, color: { r: 0.53, g: 1, b: 0 } }, // Yellow-green
        { time: 1, color: { r: 0.27, g: 0.27, b: 0 } }, // Dark yellow
      ]);
      system.setColorOverLifetime(fireflyColors);
    },
  },

  {
    name: 'Snowfall',
    description: 'Gentle falling snow',
    apply: (system) => {
      // Slow downward drift
      system.setGravity(0, -1, 0);
      system.setDrag(0.9);
      system.setWind(1, 0, 0.5);
      
      // Constant size
      system.setSizeOverLifetime(AnimationCurve.constant(1));
      
      // Pure white
      const snowColors = new ColorGradient([
        { time: 0, color: { r: 1, g: 1, b: 1 } },
        { time: 1, color: { r: 0.8, g: 0.8, b: 0.8 } },
      ]);
      system.setColorOverLifetime(snowColors);
    },
  },

  {
    name: 'Energy Burst',
    description: 'Explosive energy release',
    apply: (system) => {
      // Radial explosion
      system.setGravity(0, 0, 0);
      system.setDrag(0.15);
      
      // Quick flash
      const burstCurve = new AnimationCurve([
        { time: 0, value: 0.5 },
        { time: 0.1, value: 2.0 },
        { time: 0.3, value: 1.0 },
        { time: 1, value: 0 },
      ]);
      system.setSizeOverLifetime(burstCurve);
      
      // Bright energy colors
      const burstColors = new ColorGradient([
        { time: 0, color: { r: 1, g: 1, b: 1 } }, // White
        { time: 0.2, color: { r: 0, g: 1, b: 1 } }, // Cyan
        { time: 0.5, color: { r: 0, g: 0.53, b: 1 } }, // Blue
        { time: 1, color: { r: 0, g: 0, b: 0.27 }, alpha: 0 }, // Dark blue
      ]);
      system.setColorOverLifetime(burstColors);
    },
  },

  {
    name: 'Toxic Cloud',
    description: 'Billowing poisonous gas',
    apply: (system) => {
      // Slow upward drift
      system.setGravity(0, 1.5, 0);
      system.setDrag(0.7);
      system.setWind(2, 0, 1);
      
      // Growing cloud
      const toxicCurve = new AnimationCurve([
        { time: 0, value: 0.3 },
        { time: 0.5, value: 1.5 },
        { time: 1, value: 2.0 },
      ]);
      system.setSizeOverLifetime(toxicCurve);
      
      // Sickly green
      const toxicColors = new ColorGradient([
        { time: 0, color: { r: 0.53, g: 1, b: 0 } }, // Bright green
        { time: 0.5, color: { r: 0.27, g: 0.67, b: 0 } }, // Green
        { time: 1, color: { r: 0.13, g: 0.27, b: 0 } }, // Dark green
      ]);
      system.setColorOverLifetime(toxicColors);
    },
  },

  {
    name: 'Black Hole',
    description: 'Dense inward pull with a fast event horizon swirl',
    apply: (system) => {
      system.setGravity(0, 0, 0);
      system.setDrag(0.08);
      system.setAttractor(0, 2, 0, 14, 12);
      system.setVortex(0, 2, 0, 0, 1, 0, 20);

      const blackHoleCurve = new AnimationCurve([
        { time: 0, value: 0.8 },
        { time: 0.4, value: 0.5 },
        { time: 0.8, value: 0.25 },
        { time: 1, value: 0 },
      ]);
      system.setSizeOverLifetime(blackHoleCurve);

      const blackHoleColors = new ColorGradient([
        { time: 0, color: { r: 0.7, g: 0.8, b: 1 } }, // pale blue
        { time: 0.35, color: { r: 0.45, g: 0.2, b: 1 } }, // violet
        { time: 0.7, color: { r: 0.1, g: 0.02, b: 0.2 } }, // deep purple
        { time: 1, color: { r: 0, g: 0, b: 0 }, alpha: 0 }, // black fade
      ]);
      system.setColorOverLifetime(blackHoleColors);
    },
  },

  {
    name: 'Aurora Flow',
    description: 'Ribbon-like polar lights drifting in layered currents',
    apply: (system) => {
      system.setGravity(0, 0.3, 0);
      system.setDrag(0.35);
      system.setWind(2.2, 0.1, 4.0);
      system.setVortex(0, 0, 0, 0, 1, 0, 3);

      const auroraCurve = new AnimationCurve([
        { time: 0, value: 0.35 },
        { time: 0.25, value: 1.1 },
        { time: 0.55, value: 0.95 },
        { time: 0.85, value: 0.6 },
        { time: 1, value: 0.2 },
      ]);
      system.setSizeOverLifetime(auroraCurve);

      const auroraColors = new ColorGradient([
        { time: 0, color: { r: 0.1, g: 1, b: 0.7 } }, // mint
        { time: 0.3, color: { r: 0.1, g: 0.9, b: 1 } }, // cyan
        { time: 0.65, color: { r: 0.5, g: 0.4, b: 1 } }, // violet
        { time: 1, color: { r: 0.05, g: 0.15, b: 0.12 }, alpha: 0.2 }, // dim fade
      ]);
      system.setColorOverLifetime(auroraColors);
    },
  },

  {
    name: 'Supernova Ring',
    description: 'Bright stellar blast with a heated expanding shell',
    apply: (system) => {
      system.setGravity(0, -4, 0);
      system.setDrag(0.03);
      system.setWind(0.5, 0.2, 0.5);
      system.setVortex(0, 0, 0, 0, 1, 0, 6);

      const supernovaCurve = new AnimationCurve([
        { time: 0, value: 0.15 },
        { time: 0.08, value: 2.2 },
        { time: 0.25, value: 1.4 },
        { time: 0.7, value: 0.6 },
        { time: 1, value: 0 },
      ]);
      system.setSizeOverLifetime(supernovaCurve);

      const supernovaColors = new ColorGradient([
        { time: 0, color: { r: 1, g: 1, b: 1 } }, // white core
        { time: 0.2, color: { r: 1, g: 0.85, b: 0.2 } }, // yellow
        { time: 0.45, color: { r: 1, g: 0.35, b: 0.05 } }, // orange
        { time: 0.75, color: { r: 0.75, g: 0.05, b: 0.05 } }, // red
        { time: 1, color: { r: 0.15, g: 0, b: 0 }, alpha: 0 }, // dark fade
      ]);
      system.setColorOverLifetime(supernovaColors);
    },
  },
];

/**
 * Apply a preset by name
 */
export function applyPreset(system: ParticleSystem, presetName: string): boolean {
  const preset = advancedPresets.find(p => p.name === presetName);
  if (preset) {
    preset.apply(system);
    return true;
  }
  return false;
}
