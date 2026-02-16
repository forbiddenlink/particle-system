import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ParticleSystem,
  AnimationCurve,
  ColorGradient,
} from "@nova-particles/core";
import "./style.css";

// DOM elements
const fpsEl = document.getElementById("fps")!;
const backendEl = document.getElementById("backend")!;
const particleCountEl = document.getElementById("particle-count")!;
const resetBtn = document.getElementById("reset-btn")!;
const particleSlider = document.getElementById(
  "particle-slider",
) as HTMLInputElement;
const particleSliderValue = document.getElementById("particle-slider-value")!;
const gravitySlider = document.getElementById(
  "gravity-slider",
) as HTMLInputElement;
const dragSlider = document.getElementById("drag-slider") as HTMLInputElement;
const windSlider = document.getElementById("wind-slider") as HTMLInputElement;
const vortexSlider = document.getElementById(
  "vortex-slider",
) as HTMLInputElement;
const trailsCheckbox = document.getElementById(
  "trails-checkbox",
) as HTMLInputElement;

// Preset buttons
const presetDefault = document.getElementById("preset-default")!;
const presetFire = document.getElementById("preset-fire")!;
const presetSmoke = document.getElementById("preset-smoke")!;
const presetMagic = document.getElementById("preset-magic")!;
const presetRainbow = document.getElementById("preset-rainbow")!;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);

// Camera
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 5, 15);

// Renderer - WebGPU with WebGL fallback
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 2, 0);

// Grid helper for reference
const gridHelper = new THREE.GridHelper(20, 20, 0x333366, 0x222244);
scene.add(gridHelper);

// Particle system
let particleSystem: ParticleSystem | null = null;
let currentParticleCount = 50000;
let trailsEnabled = false;

async function createParticleSystem(count: number): Promise<void> {
  // Dispose old system and clear reference immediately
  if (particleSystem) {
    const oldSystem = particleSystem;
    particleSystem = null; // Clear reference before disposal to prevent use-after-dispose
    scene.remove(oldSystem);
    oldSystem.dispose();
  }

  // Create new system
  particleSystem = new ParticleSystem({
    maxParticles: count,
    lifetime: { min: 2, max: 5 },
    startSpeed: { min: 2, max: 6 },
    startSize: { min: 0.08, max: 0.2 },
    startColor: new THREE.Color(0x8b5cf6),
    emissionRate: count / 4,
    emitter: {
      type: "sphere",
      radius: 1.5,
      radiusThickness: 1,
    },
    blendMode: "additive",
    gravity: new THREE.Vector3(0, parseFloat(gravitySlider.value), 0),
    trails: {
      enabled: trailsEnabled,
      length: 8,
      fadeAlpha: true,
    },
  });

  particleSystem.position.set(0, 0, 0);
  scene.add(particleSystem);

  // Initialize and start
  await particleSystem.init(renderer);
  particleSystem.play();

  // Update UI
  particleCountEl.textContent = count.toLocaleString();
  currentParticleCount = count;
}

// FPS tracking
let frameCount = 0;
let lastTime = performance.now();
let fps = 0;

function updateFPS(): void {
  frameCount++;
  const currentTime = performance.now();
  const elapsed = currentTime - lastTime;

  if (elapsed >= 1000) {
    fps = Math.round((frameCount * 1000) / elapsed);
    fpsEl.textContent = fps.toString();
    frameCount = 0;
    lastTime = currentTime;
  }
}

// Clock for delta time
const clock = new THREE.Clock();

// Animation loop - uses a flag to prevent overlapping GPU operations
let isAnimating = false;

function animate(): void {
  // Prevent overlapping frames when GPU operations take longer than frame time
  if (isAnimating) {
    requestAnimationFrame(animate);
    return;
  }

  const dt = clock.getDelta();

  // Update controls
  controls.update();

  // Update particle system
  if (particleSystem) {
    isAnimating = true;
    particleSystem
      .update(dt)
      .then(() => {
        // Render after GPU compute completes
        renderer.render(scene, camera);
        updateFPS();
        isAnimating = false;
        requestAnimationFrame(animate);
      })
      .catch((err: unknown) => {
        console.error("Particle update error:", err);
        isAnimating = false;
        requestAnimationFrame(animate);
      });
  } else {
    // No particle system, just render
    renderer.render(scene, camera);
    updateFPS();
    requestAnimationFrame(animate);
  }
}

// Event handlers
resetBtn.addEventListener("click", async () => {
  if (particleSystem) {
    await particleSystem.reset();
  }
});

particleSlider.addEventListener("input", () => {
  const value = parseInt(particleSlider.value);
  particleSliderValue.textContent = value.toLocaleString();
});

particleSlider.addEventListener("change", async () => {
  const value = parseInt(particleSlider.value);
  await createParticleSystem(value);
});

gravitySlider.addEventListener("input", () => {
  if (particleSystem) {
    particleSystem.setGravity(0, parseFloat(gravitySlider.value), 0);
  }
});

dragSlider.addEventListener("input", () => {
  if (particleSystem) {
    particleSystem.setDrag(parseFloat(dragSlider.value));
  }
});

windSlider.addEventListener("input", () => {
  if (particleSystem) {
    const windStrength = parseFloat(windSlider.value);
    particleSystem.setWind(windStrength, 0, 0);
  }
});

vortexSlider.addEventListener("input", () => {
  if (particleSystem) {
    const vortexStrength = parseFloat(vortexSlider.value);
    particleSystem.setVortex(0, 0, 0, 0, 1, 0, vortexStrength);
  }
});

trailsCheckbox.addEventListener("change", async () => {
  trailsEnabled = trailsCheckbox.checked;
  // Recreate particle system with trails enabled/disabled
  await createParticleSystem(currentParticleCount);
});

// Effect preset handlers
presetDefault.addEventListener("click", () => {
  if (particleSystem) {
    particleSystem.clearCurves();
    particleSystem.clearForces();
    particleSystem.setGravity(0, -10, 0);
  }
});

presetFire.addEventListener("click", () => {
  if (particleSystem) {
    // Fire effect: grow then shrink, fire colors
    particleSystem.setSizeOverLifetime(AnimationCurve.pulse());
    particleSystem.setColorOverLifetime(ColorGradient.fire());
    particleSystem.setGravity(0, 2, 0); // Fire rises
    particleSystem.setDrag(0.1);
  }
});

presetSmoke.addEventListener("click", () => {
  if (particleSystem) {
    // Smoke effect: grow over time, gray colors
    const growCurve = new AnimationCurve([
      { time: 0, value: 0.2 },
      { time: 0.5, value: 1 },
      { time: 1, value: 1.5 },
    ]);
    particleSystem.setSizeOverLifetime(growCurve);
    particleSystem.setColorOverLifetime(ColorGradient.smoke());
    particleSystem.setGravity(0, 1, 0); // Smoke rises slowly
    particleSystem.setDrag(0.3);
    particleSystem.setWind(2, 0, 0); // Drift with wind
  }
});

presetMagic.addEventListener("click", () => {
  if (particleSystem) {
    // Magic effect: sparkle, purple colors
    const sparkleCurve = new AnimationCurve([
      { time: 0, value: 0.5 },
      { time: 0.3, value: 1.2 },
      { time: 0.6, value: 0.8 },
      { time: 1, value: 0 },
    ]);
    particleSystem.setSizeOverLifetime(sparkleCurve);
    particleSystem.setColorOverLifetime(ColorGradient.magic());
    particleSystem.setGravity(0, -2, 0);
    particleSystem.setVortex(0, 0, 0, 0, 1, 0, 3);
  }
});

presetRainbow.addEventListener("click", () => {
  if (particleSystem) {
    // Rainbow effect: constant size, rainbow colors
    particleSystem.setSizeOverLifetime(AnimationCurve.constant(1));
    particleSystem.setColorOverLifetime(ColorGradient.rainbow());
    particleSystem.setGravity(0, -5, 0);
    particleSystem.setVortex(0, 2, 0, 0, 1, 0, 2);
  }
});

// Handle resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize
async function init(): Promise<void> {
  console.log("🌟 Nova Particles - Initializing...");

  // Initialize renderer
  await renderer.init();

  // Detect backend
  // @ts-ignore - backend property exists at runtime
  const backend = renderer.backend?.constructor?.name || "Unknown";
  backendEl.textContent = backend.includes("WebGPU")
    ? "WebGPU ✓"
    : "WebGL (fallback)";

  console.log(`Using backend: ${backend}`);

  // Create initial particle system
  await createParticleSystem(currentParticleCount);

  console.log("✅ Nova Particles initialized!");
  console.log(
    `Rendering ${currentParticleCount.toLocaleString()} particles with GPU compute shaders`,
  );

  // Start animation loop
  animate();
}

init().catch((error) => {
  console.error("Initialization failed:", error);
  // Show user-facing error for WebGPU failures
  const errorDiv = document.createElement("div");
  errorDiv.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.9); color: white; padding: 40px;
    border-radius: 12px; text-align: center; font-family: system-ui, sans-serif;
    max-width: 500px; z-index: 1000;
  `;
  errorDiv.innerHTML = `
    <h2 style="color: #ff6b6b; margin-bottom: 20px;">⚠️ Initialization Failed</h2>
    <p style="margin-bottom: 15px;">WebGPU may not be supported in your browser.</p>
    <p style="color: #888; font-size: 14px;">Please try Chrome 113+, Edge 113+, or Safari 26+ with WebGPU enabled.</p>
    <p style="color: #666; font-size: 12px; margin-top: 20px;">Error: ${error.message || error}</p>
  `;
  document.body.appendChild(errorDiv);
});
