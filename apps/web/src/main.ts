import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ParticleSystem,
  screenToWorldOnPlane,
  encodeState,
  decodeState,
  analyzeFrequencyBands,
  sampleOpaquePoints,
  type Point3,
} from "@nova-particles/core";
import { applyPreset } from "./presets/AdvancedPresets.js";
import { FailureStreak, FrameClock, describeBackend } from "./runtime.js";
import "./style.css";

// DOM elements
const fpsEl = document.getElementById("fps")!;
const backendEl = document.getElementById("backend")!;
const particleCountEl = document.getElementById("particle-count")!;
const activePresetNameEl = document.getElementById("active-preset-name")!;
const activePresetDescriptionEl = document.getElementById(
  "active-preset-description",
)!;
const motionNoteEl = document.getElementById("motion-note")!;
const resetBtn = document.getElementById("reset-btn")!;
const pauseBtn = document.getElementById("pause-btn")!;
const randomPresetBtn = document.getElementById("random-preset-btn")!;
const pointerForceBtn = document.getElementById(
  "pointer-force-btn",
) as HTMLButtonElement;
const shareBtn = document.getElementById("share-btn") as HTMLButtonElement;
const recordBtn = document.getElementById("record-btn") as HTMLButtonElement;
const audioBtn = document.getElementById("audio-btn") as HTMLButtonElement;
const morphBtn = document.getElementById("morph-btn") as HTMLButtonElement;
const morphTextInput = document.getElementById("morph-text") as HTMLInputElement;
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
const presetFireworks = document.getElementById("preset-fireworks")!;
const presetNebula = document.getElementById("preset-nebula")!;
const presetLightning = document.getElementById("preset-lightning")!;
const presetPortal = document.getElementById("preset-portal")!;
const presetFireflies = document.getElementById("preset-fireflies")!;
const presetSnowfall = document.getElementById("preset-snowfall")!;
const presetEnergy = document.getElementById("preset-energy")!;
const presetToxic = document.getElementById("preset-toxic")!;
const presetBlackHole = document.getElementById("preset-blackhole")!;
const presetAurora = document.getElementById("preset-aurora")!;
const presetSupernova = document.getElementById("preset-supernova")!;

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

// --- Failure state -----------------------------------------------------------
// Anything that leaves the canvas without a working simulation (init error,
// failed startup compute check, lost GPU device or context, repeated frame
// errors) ends here: stop the loop and say what happened instead of showing a
// blank or grid-only canvas. Idempotent: the first failure wins.
let hasFailed = false;

function failApp(reason: string): void {
  if (hasFailed) return;
  hasFailed = true;
  console.error("Nova Particles stopped:", reason);

  const panel = document.createElement("div");
  panel.className = "error-modal";
  panel.setAttribute("role", "alert");
  panel.tabIndex = -1;

  const heading = document.createElement("h2");
  heading.textContent = "The particle simulation can't run";

  const what = document.createElement("p");
  what.textContent =
    "The GPU simulation failed to start or stopped working, so there is nothing to show here.";

  const advice = document.createElement("p");
  advice.textContent =
    "Try a browser with WebGPU support, such as a recent version of Chrome or Edge.";

  const detail = document.createElement("p");
  detail.className = "error-detail";
  detail.textContent = `Details: ${reason}`;

  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "btn";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => location.reload());

  panel.append(heading, what, advice, detail, reload);
  document.body.appendChild(panel);
  reload.focus();
}

// Three.js reports WebGPU device loss and WebGL context loss through this hook.
renderer.onDeviceLost = (info: { api: string; message: string }) => {
  failApp(`${info.api} device lost: ${info.message}`);
};
// A shader program that fails to link (for example WebGL2 with too few transform
// feedback varyings) renders nothing and logs per frame. Treat it as fatal.
renderer.debug.onShaderError = (gl, program) => {
  const log = (gl as WebGL2RenderingContext).getProgramInfoLog(program as WebGLProgram) || "no log";
  failApp(`A GPU shader failed to link: ${log.trim().slice(0, 200)}`);
};
// Direct listener too, so a lost WebGL context is caught even if the hook changes.
renderer.domElement.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  failApp("WebGL context lost");
});

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
let currentParticleCount = parseInt(particleSlider.value, 10);
let trailsEnabled = false;
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
// Honor prefers-reduced-motion: start paused (a still frame) with Resume one click away.
let isPaused = reducedMotionQuery.matches;
let currentPresetButton: HTMLButtonElement | null = presetDefault as HTMLButtonElement;

interface PresetUIConfig {
  button: HTMLElement;
  presetName: string;
  displayName: string;
  description: string;
  /** Bright, rapid flashes: gated behind a one-time confirmation (WCAG 2.3.1). */
  flashing?: boolean;
  sliders: {
    gravity: number;
    drag: number;
    wind: number;
    vortex: number;
  };
}

const presetConfigs: PresetUIConfig[] = [
  {
    button: presetFireworks,
    presetName: "Fireworks",
    displayName: "Fireworks",
    description: "Fast explosive launch with warm ember fade.",
    flashing: true,
    sliders: { gravity: -15, drag: 0.05, wind: 0, vortex: 0 },
  },
  {
    button: presetNebula,
    presetName: "Nebula",
    displayName: "Nebula",
    description: "Slow cosmic drift with deep magenta-blue transitions.",
    sliders: { gravity: 0.5, drag: 0.8, wind: 0.5, vortex: 0 },
  },
  {
    button: presetLightning,
    presetName: "Lightning Storm",
    displayName: "Lightning",
    description: "High-energy electric arcs with aggressive swirl.",
    flashing: true,
    sliders: { gravity: 0, drag: 0.02, wind: 5, vortex: 8 },
  },
  {
    button: presetPortal,
    presetName: "Magic Portal",
    displayName: "Portal",
    description: "Converging ring pull with mystical color cycling.",
    sliders: { gravity: 0, drag: 0.1, wind: 0, vortex: 15 },
  },
  {
    button: presetFireflies,
    presetName: "Fireflies",
    displayName: "Fireflies",
    description: "Soft floating pulses for calm ambient motion.",
    sliders: { gravity: 0.2, drag: 0.5, wind: 0.5, vortex: 0 },
  },
  {
    button: presetSnowfall,
    presetName: "Snowfall",
    displayName: "Snowfall",
    description: "Gentle downward flakes with subtle horizontal drift.",
    sliders: { gravity: -1, drag: 0.9, wind: 1, vortex: 0 },
  },
  {
    button: presetEnergy,
    presetName: "Energy Burst",
    displayName: "Energy",
    description: "Compressed charge release with bright core flashes.",
    flashing: true,
    sliders: { gravity: 0, drag: 0.15, wind: 0, vortex: 0 },
  },
  {
    button: presetToxic,
    presetName: "Toxic Cloud",
    displayName: "Toxic",
    description: "Billowing green gas plume with thick lingering fade.",
    sliders: { gravity: 1.5, drag: 0.7, wind: 2, vortex: 0 },
  },
  {
    button: presetBlackHole,
    presetName: "Black Hole",
    displayName: "Black Hole",
    description: "Strong inward pull and rapid orbital event-horizon flow.",
    sliders: { gravity: 0, drag: 0.08, wind: 0, vortex: 20 },
  },
  {
    button: presetAurora,
    presetName: "Aurora Flow",
    displayName: "Aurora",
    description: "Layered ribbon-like lights moving in polar currents.",
    sliders: { gravity: 0.3, drag: 0.35, wind: 4, vortex: 3 },
  },
  {
    button: presetSupernova,
    presetName: "Supernova Ring",
    displayName: "Supernova",
    description: "Bright stellar blast ring with heated expansion.",
    flashing: true,
    sliders: { gravity: -4, drag: 0.03, wind: 0.5, vortex: 6 },
  },
];

particleSliderValue.textContent = currentParticleCount.toLocaleString();

// Slider progress fill handler
function updateSliderProgress(slider: HTMLInputElement): void {
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const value = parseFloat(slider.value);
  const progress = ((value - min) / (max - min)) * 100;
  slider.style.setProperty("--slider-progress", `${progress}%`);
}

// Initialize all slider progress fills
function initSliderProgress(): void {
  const sliders = [particleSlider, gravitySlider, dragSlider, windSlider, vortexSlider];
  sliders.forEach((slider) => {
    updateSliderProgress(slider);
    slider.addEventListener("input", () => updateSliderProgress(slider));
  });
}

initSliderProgress();

function setActivePresetInfo(name: string, description: string): void {
  activePresetNameEl.textContent = name;
  activePresetDescriptionEl.textContent = description;
}

function setActivePresetButton(button: HTMLElement | null): void {
  if (currentPresetButton) {
    currentPresetButton.classList.remove("preset-btn-active");
  }

  if (button && button instanceof HTMLButtonElement) {
    currentPresetButton = button;
    currentPresetButton.classList.add("preset-btn-active");
  } else {
    currentPresetButton = null;
  }
}

function applyDefaultPresetUI(): void {
  setActivePresetButton(presetDefault);
  setActivePresetInfo(
    "Default",
    "Balanced baseline behavior with no stylized force fields.",
  );
}

const PAUSED_WARMUP_STEPS = 30;
const PAUSED_WARMUP_DT = 1 / 20;

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
  if (isPaused) {
    // Advance a little first so the paused canvas shows a still frame, not nothing.
    for (let step = 0; step < PAUSED_WARMUP_STEPS; step++) {
      await particleSystem.update(PAUSED_WARMUP_DT);
    }
    particleSystem.stop();
  }

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

// Frame timing: deltas are clamped, and the gap while the tab is hidden is dropped.
const frameClock = new FrameClock();
const frameErrors = new FailureStreak();

// Animation loop - uses a flag to prevent overlapping GPU operations
let isAnimating = false;
let frameRequested = false;

// Single place that schedules a frame. A hidden tab or a failed app schedules nothing.
function requestFrame(): void {
  if (hasFailed || document.hidden || frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(animate);
}

function onFrameError(err: unknown): void {
  console.error("Frame error:", err);
  if (frameErrors.fail()) {
    const message = err instanceof Error ? err.message : String(err);
    failApp(`Rendering failed repeatedly: ${message}`);
  }
}

function animate(): void {
  frameRequested = false;
  if (hasFailed || document.hidden) return;

  // Prevent overlapping frames when GPU operations take longer than frame time
  if (isAnimating) {
    requestFrame();
    return;
  }

  const dt = frameClock.tick(performance.now());

  // Update controls
  controls.update();

  // Update particle system
  if (particleSystem) {
    applyAudioReactivity();
    isAnimating = true;
    particleSystem
      .update(dt)
      .then(() => {
        // Render after GPU compute completes
        renderer.render(scene, camera);
        updateFPS();
        frameErrors.ok();
      })
      .catch(onFrameError)
      .finally(() => {
        isAnimating = false;
        requestFrame();
      });
  } else {
    // No particle system, just render
    try {
      renderer.render(scene, camera);
      updateFPS();
      frameErrors.ok();
    } catch (err) {
      onFrameError(err);
    }
    requestFrame();
  }
}

// Stop simulating while the tab is hidden; resume with a clean first frame.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    frameClock.suspend();
    return;
  }
  frameCount = 0;
  lastTime = performance.now();
  requestFrame();
});

// Active preset state
let activePresetConfig: PresetUIConfig | null = null;
let isDefaultPresetActive = true;

function updateUISliders(gravity: number, drag: number, wind: number, vortex: number): void {
  gravitySlider.value = gravity.toString();
  dragSlider.value = drag.toString();
  windSlider.value = wind.toString();
  vortexSlider.value = vortex.toString();
  // Update slider progress fills
  updateSliderProgress(gravitySlider);
  updateSliderProgress(dragSlider);
  updateSliderProgress(windSlider);
  updateSliderProgress(vortexSlider);
}

function setPauseUI(): void {
  pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  pauseBtn.setAttribute("aria-pressed", isPaused ? "true" : "false");
  motionNoteEl.hidden = !(isPaused && reducedMotionQuery.matches);
}

// If the preference turns on mid-session, pause right away.
reducedMotionQuery.addEventListener("change", (event) => {
  if (event.matches && !isPaused) {
    pauseBtn.click();
  }
});

function applyCurrentForceControls(): void {
  if (!particleSystem) {
    return;
  }

  const gravity = parseFloat(gravitySlider.value);
  const drag = parseFloat(dragSlider.value);
  const wind = parseFloat(windSlider.value);
  const vortex = parseFloat(vortexSlider.value);

  particleSystem.setGravity(0, gravity, 0);
  particleSystem.setDrag(drag);
  particleSystem.setWind(wind, 0, 0);
  particleSystem.setVortex(0, 0, 0, 0, 1, 0, vortex);
}

function restoreBehaviorAfterRebuild(): void {
  if (!particleSystem) {
    return;
  }

  if (activePresetConfig) {
    particleSystem.clearCurves();
    particleSystem.clearForces();
    applyPreset(particleSystem, activePresetConfig.presetName);
  } else if (isDefaultPresetActive) {
    particleSystem.clearCurves();
    particleSystem.clearForces();
  }

  applyCurrentForceControls();
}

function markCustomPreset(): void {
  activePresetConfig = null;
  isDefaultPresetActive = false;
  setActivePresetButton(null);
  setActivePresetInfo(
    "Custom",
    "Manual tuning mode based on your live force and slider adjustments.",
  );
}

function applyPresetConfig(config: PresetUIConfig): void {
  if (!particleSystem) {
    return;
  }

  particleSystem.clearCurves();
  particleSystem.clearForces();
  const applied = applyPreset(particleSystem, config.presetName);

  if (!applied) {
    console.warn(`Preset "${config.presetName}" was not found`);
    return;
  }

  updateUISliders(
    config.sliders.gravity,
    config.sliders.drag,
    config.sliders.wind,
    config.sliders.vortex,
  );
  applyCurrentForceControls();

  activePresetConfig = config;
  isDefaultPresetActive = false;
  setActivePresetButton(config.button);
  setActivePresetInfo(config.displayName, config.description);
}

// --- Photosensitivity confirm -------------------------------------------------
// Presets with bright rapid flashes ask once per page load before they play.
let flashingAcknowledged = false;
let deferredFlashPreset: PresetUIConfig | null = null;
let flashDialogOpen = false;

function confirmFlashing(effectName: string): Promise<boolean> {
  return new Promise((resolve) => {
    flashDialogOpen = true;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const panel = document.createElement("div");
    panel.className = "error-modal notice-modal";
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "flash-title");
    panel.setAttribute("aria-describedby", "flash-text");

    const heading = document.createElement("h2");
    heading.id = "flash-title";
    heading.textContent = "Flashing lights";

    const text = document.createElement("p");
    text.id = "flash-text";
    text.textContent = `${effectName} has bright, fast flashes. It may affect people who are sensitive to flashing lights.`;

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "Cancel";

    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "btn";
    accept.textContent = "Show effect";

    actions.append(cancel, accept);
    panel.append(heading, text, actions);

    const close = (result: boolean): void => {
      panel.removeEventListener("keydown", onKeydown);
      panel.remove();
      flashDialogOpen = false;
      previouslyFocused?.focus();
      resolve(result);
    };

    function onKeydown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      } else if (event.key === "Tab") {
        // Keep focus inside the two buttons while the dialog is open.
        const target = event.shiftKey ? cancel : accept;
        const other = event.shiftKey ? accept : cancel;
        if (document.activeElement === target) {
          event.preventDefault();
          other.focus();
        }
      }
    }

    cancel.addEventListener("click", () => close(false));
    accept.addEventListener("click", () => close(true));
    panel.addEventListener("keydown", onKeydown);

    document.body.appendChild(panel);
    cancel.focus();
  });
}

async function requestPresetConfig(config: PresetUIConfig): Promise<void> {
  if (config.flashing && !flashingAcknowledged) {
    if (flashDialogOpen) return;
    const accepted = await confirmFlashing(config.displayName);
    if (!accepted) return;
    flashingAcknowledged = true;
  }
  applyPresetConfig(config);
  queueMicrotask(updatePermalink);
}

function applyDefaultPreset(): void {
  if (!particleSystem) {
    return;
  }

  particleSystem.clearCurves();
  particleSystem.clearForces();
  updateUISliders(-10, 0, 0, 0);
  applyCurrentForceControls();

  activePresetConfig = null;
  isDefaultPresetActive = true;
  applyDefaultPresetUI();
}

function applyRandomPreset(): void {
  if (!particleSystem || presetConfigs.length === 0) {
    return;
  }

  // Shuffle never springs a flashing preset on someone who has not opted in.
  const pool = presetConfigs.filter(
    (preset) => preset !== activePresetConfig && (flashingAcknowledged || !preset.flashing),
  );
  const candidates = pool.length > 0 ? pool : presetConfigs.filter((p) => !p.flashing);
  const randomPreset = candidates[Math.floor(Math.random() * candidates.length)];
  applyPresetConfig(randomPreset);
}

// Event handlers
resetBtn.addEventListener("click", async () => {
  if (particleSystem) {
    await particleSystem.reset();
  }

  particleSlider.value = "10000";
  particleSliderValue.textContent = "10,000";
  gravitySlider.value = "-10";
  dragSlider.value = "0";
  windSlider.value = "0";
  vortexSlider.value = "0";
  trailsCheckbox.checked = false;
  trailsEnabled = false;
  isPaused = reducedMotionQuery.matches;
  setPauseUI();

  // Update slider progress fills
  updateSliderProgress(particleSlider);
  updateSliderProgress(gravitySlider);
  updateSliderProgress(dragSlider);
  updateSliderProgress(windSlider);
  updateSliderProgress(vortexSlider);

  activePresetConfig = null;
  isDefaultPresetActive = true;
  applyDefaultPresetUI();

  currentParticleCount = 10000;
  await createParticleSystem(currentParticleCount);
  restoreBehaviorAfterRebuild();
});

pauseBtn.addEventListener("click", () => {
  if (!particleSystem) {
    return;
  }

  isPaused = !isPaused;
  if (isPaused) {
    particleSystem.stop();
  } else {
    particleSystem.play();
  }
  setPauseUI();
});

randomPresetBtn.addEventListener("click", () => {
  applyRandomPreset();
});

// --- Pointer force field ---------------------------------------------------
// The cursor becomes an interactive attractor/repeller. Reuses the particle
// system's live attractor uniforms (setAttractor), so no GPU change is needed:
// on each pointer move we unproject the cursor onto the z=0 plane and push
// that world point + a signed strength into the compute shader.
type PointerForceMode = "off" | "attract" | "repel";
const POINTER_FORCE_STRENGTH = 40;
const POINTER_FORCE_RADIUS = 8;
let pointerForceMode: PointerForceMode = "off";
const pointerWorld = new THREE.Vector3();

function pointerForceStrength(): number {
  if (pointerForceMode === "attract") return POINTER_FORCE_STRENGTH;
  if (pointerForceMode === "repel") return -POINTER_FORCE_STRENGTH;
  return 0;
}

function updatePointerForceUI(): void {
  const label =
    pointerForceMode === "off"
      ? "Pointer: Off"
      : pointerForceMode === "attract"
        ? "Pointer: Attract"
        : "Pointer: Repel";
  pointerForceBtn.textContent = label;
  pointerForceBtn.setAttribute(
    "aria-pressed",
    pointerForceMode === "off" ? "false" : "true",
  );
}

function applyPointerForceAt(clientX: number, clientY: number): void {
  if (!particleSystem || pointerForceMode === "off") {
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  };
  const hit = screenToWorldOnPlane(ndc, camera);
  if (!hit) {
    return;
  }
  pointerWorld.copy(hit);
  particleSystem.setAttractor(
    pointerWorld.x,
    pointerWorld.y,
    pointerWorld.z,
    pointerForceStrength(),
    POINTER_FORCE_RADIUS,
  );
}

renderer.domElement.addEventListener("pointermove", (event) => {
  applyPointerForceAt(event.clientX, event.clientY);
});

pointerForceBtn.addEventListener("click", () => {
  pointerForceMode =
    pointerForceMode === "off"
      ? "attract"
      : pointerForceMode === "attract"
        ? "repel"
        : "off";
  updatePointerForceUI();
  // When switching off, release the attractor so particles settle back.
  if (pointerForceMode === "off" && particleSystem) {
    particleSystem.setAttractor(
      pointerWorld.x,
      pointerWorld.y,
      pointerWorld.z,
      0,
      POINTER_FORCE_RADIUS,
    );
  }
});

particleSlider.addEventListener("input", () => {
  const value = parseInt(particleSlider.value, 10);
  particleSliderValue.textContent = value.toLocaleString();
});

particleSlider.addEventListener("change", async () => {
  const value = parseInt(particleSlider.value, 10);
  await createParticleSystem(value);
  restoreBehaviorAfterRebuild();
});

gravitySlider.addEventListener("input", () => {
  applyCurrentForceControls();
  markCustomPreset();
});

dragSlider.addEventListener("input", () => {
  applyCurrentForceControls();
  markCustomPreset();
});

windSlider.addEventListener("input", () => {
  applyCurrentForceControls();
  markCustomPreset();
});

vortexSlider.addEventListener("input", () => {
  applyCurrentForceControls();
  markCustomPreset();
});

trailsCheckbox.addEventListener("change", async () => {
  trailsEnabled = trailsCheckbox.checked;
  await createParticleSystem(currentParticleCount);
  restoreBehaviorAfterRebuild();
});

presetDefault.addEventListener("click", () => {
  applyDefaultPreset();
});

for (const config of presetConfigs) {
  config.button.addEventListener("click", () => {
    void requestPresetConfig(config);
  });
}

// Handle resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Read (and clear) the first pending WebGL error, or 0 when there is none or the
// backend is not WebGL.
function takeWebGLError(): number {
  const gl = (renderer as unknown as { backend?: { gl?: WebGL2RenderingContext } }).backend?.gl;
  return gl ? gl.getError() : 0;
}

// Initialize
async function init(): Promise<void> {
  console.log("🌟 Nova Particles - Initializing...");

  // Initialize renderer
  await renderer.init();

  // Detect backend with the flags Three sets on each backend class. The class
  // name is minified in production, so it cannot be used for this.
  const backend = describeBackend((renderer as unknown as { backend?: unknown }).backend);
  backendEl.textContent = backend.label;

  console.log(`Using backend: ${backend.label}`);

  // Debug step
  const { runDebugCompute } = await import('./debug-compute');
  const debugSuccess = await runDebugCompute(renderer);
  if (!debugSuccess) {
    failApp("The startup GPU compute check failed.");
    return;
  }

  takeWebGLError(); // clear anything left over from setup before measuring the real system

  // Restore shared state from the URL (sets count + controls) before building.
  const restoredFromUrl = applyShareStateFromUrl();

  // Create initial particle system
  await createParticleSystem(currentParticleCount);
  if (!restoredFromUrl) {
    applyDefaultPresetUI();
  }
  setPauseUI();
  restoreBehaviorAfterRebuild();

  // The WebGL2 fallback can accept the compute dispatch yet record nothing (too few
  // transform feedback varyings): it raises a GL error and the canvas stays empty.
  // Run one real step and treat a GL error as failure rather than showing no particles.
  if (backend.kind === "webgl") {
    await particleSystem?.update(1 / 60);
    const glError = takeWebGLError();
    if (glError !== 0) {
      failApp(`WebGL2 on this device cannot run the particle compute shaders (GL error ${glError}).`);
      return;
    }
  }

  console.log("✅ Nova Particles initialized!");
  console.log(
    `Rendering ${currentParticleCount.toLocaleString()} particles with GPU compute shaders`,
  );

  // Start animation loop
  requestFrame();

  if (deferredFlashPreset) {
    const pending = deferredFlashPreset;
    deferredFlashPreset = null;
    void requestPresetConfig(pending);
  }
}

// --- Shareable permalink presets ------------------------------------------
// The full control state is encoded into the ?p= query param so any tuning can
// be shared or bookmarked as a link, and restored on load.
interface ShareState {
  count: number;
  gravity: number;
  drag: number;
  wind: number;
  vortex: number;
  trails: boolean;
  preset: string | null; // preset name, "default", or null for custom
}

function readControlsState(): ShareState {
  return {
    count: parseInt(particleSlider.value, 10),
    gravity: parseFloat(gravitySlider.value),
    drag: parseFloat(dragSlider.value),
    wind: parseFloat(windSlider.value),
    vortex: parseFloat(vortexSlider.value),
    trails: trailsCheckbox.checked,
    preset: activePresetConfig
      ? activePresetConfig.presetName
      : isDefaultPresetActive
        ? "default"
        : null,
  };
}

function updatePermalink(): void {
  const encoded = encodeState(readControlsState());
  history.replaceState(null, "", `?p=${encoded}`);
}

function findPresetConfigByName(name: string): PresetUIConfig | undefined {
  return presetConfigs.find((c) => c.presetName === name);
}

// Read a shared state from the URL into the controls. Returns true if applied.
// Sets control values + currentParticleCount + preset selection, but does NOT
// rebuild the system (init() does that right after).
function applyShareStateFromUrl(): boolean {
  const encoded = new URLSearchParams(location.search).get("p");
  if (!encoded) return false;
  const state = decodeState<ShareState>(encoded);
  if (!state || typeof state.count !== "number") return false;

  particleSlider.value = String(state.count);
  particleSliderValue.textContent = state.count.toLocaleString();
  currentParticleCount = state.count;
  gravitySlider.value = String(state.gravity);
  dragSlider.value = String(state.drag);
  windSlider.value = String(state.wind);
  vortexSlider.value = String(state.vortex);
  trailsCheckbox.checked = state.trails;
  trailsEnabled = state.trails;

  let presetConfig = state.preset ? findPresetConfigByName(state.preset) : undefined;
  if (presetConfig?.flashing && !flashingAcknowledged) {
    // A shared link must not start a flashing effect unprompted: load the default
    // behavior now and ask once the app is up.
    deferredFlashPreset = presetConfig;
    presetConfig = undefined;
    activePresetConfig = null;
    isDefaultPresetActive = true;
    applyDefaultPresetUI();
    return true;
  }
  if (presetConfig) {
    activePresetConfig = presetConfig;
    isDefaultPresetActive = false;
    setActivePresetButton(presetConfig.button);
    setActivePresetInfo(presetConfig.presetName, presetConfig.presetName);
  } else if (state.preset === "default") {
    activePresetConfig = null;
    isDefaultPresetActive = true;
  } else {
    activePresetConfig = null;
    isDefaultPresetActive = false;
    setActivePresetButton(null);
  }
  return true;
}

// Keep the URL in sync whenever a state-affecting control changes.
for (const el of [
  particleSlider,
  gravitySlider,
  dragSlider,
  windSlider,
  vortexSlider,
]) {
  el.addEventListener("change", updatePermalink);
}
trailsCheckbox.addEventListener("change", updatePermalink);
for (const config of presetConfigs) {
  config.button.addEventListener("click", () => queueMicrotask(updatePermalink));
}
for (const btn of [resetBtn, randomPresetBtn]) {
  btn.addEventListener("click", () => queueMicrotask(updatePermalink));
}

shareBtn.addEventListener("click", async () => {
  updatePermalink();
  const original = shareBtn.textContent;
  try {
    await navigator.clipboard.writeText(location.href);
    shareBtn.textContent = "Link copied!";
  } catch {
    shareBtn.textContent = "Copy failed";
  }
  window.setTimeout(() => {
    shareBtn.textContent = original;
  }, 1500);
});

// --- Record canvas to WebM video ------------------------------------------
// Uses the browser-native MediaRecorder over the canvas capture stream, so
// there is no encoding dependency. Output is a downloadable .webm file.
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

function pickRecordingMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function setRecordingUI(recording: boolean): void {
  recordBtn.textContent = recording ? "● Stop" : "Record";
  recordBtn.setAttribute("aria-pressed", recording ? "true" : "false");
  recordBtn.classList.toggle("recording", recording);
}

function startRecording(): void {
  const canvas = renderer.domElement as HTMLCanvasElement;
  if (typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
    recordBtn.textContent = "Unsupported";
    recordBtn.disabled = true;
    return;
  }
  const stream = canvas.captureStream(60);
  const mimeType = pickRecordingMimeType();
  mediaRecorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined,
  );
  recordedChunks = [];
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    recordedChunks = [];
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nova-particles-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    link.click();
    URL.revokeObjectURL(url);
  };
  mediaRecorder.start();
  setRecordingUI(true);
}

function stopRecording(): void {
  mediaRecorder?.stop();
  mediaRecorder = null;
  setRecordingUI(false);
}

recordBtn.addEventListener("click", () => {
  if (mediaRecorder) {
    stopRecording();
  } else {
    startRecording();
  }
});

// --- Audio reactivity ------------------------------------------------------
// Reads the microphone via Web Audio, splits the spectrum into bass/mid/treble
// (analyzeFrequencyBands), and modulates forces each frame so particles pulse
// to sound. Bass drives an outward beat pulse; treble spins the vortex.
let audioContext: AudioContext | null = null;
let audioAnalyser: AnalyserNode | null = null;
let audioData: Uint8Array<ArrayBuffer> | null = null;
let audioStream: MediaStream | null = null;

function setAudioUI(on: boolean): void {
  audioBtn.textContent = on ? "Audio: On" : "Audio: Off";
  audioBtn.setAttribute("aria-pressed", on ? "true" : "false");
}

async function enableAudio(): Promise<void> {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    audioBtn.textContent = "Mic denied";
    return;
  }
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(audioStream);
  audioAnalyser = audioContext.createAnalyser();
  audioAnalyser.fftSize = 256;
  audioAnalyser.smoothingTimeConstant = 0.8;
  source.connect(audioAnalyser);
  audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
  setAudioUI(true);
}

function disableAudio(): void {
  audioStream?.getTracks().forEach((track) => track.stop());
  void audioContext?.close();
  audioContext = null;
  audioAnalyser = null;
  audioData = null;
  audioStream = null;
  setAudioUI(false);
  // Restore the user's manual force settings and release the beat pulse.
  applyCurrentForceControls();
  if (pointerForceMode === "off" && particleSystem) {
    particleSystem.setAttractor(0, 0, 0, 0, POINTER_FORCE_RADIUS);
  }
}

function applyAudioReactivity(): void {
  if (!particleSystem || !audioAnalyser || !audioData) return;
  audioAnalyser.getByteFrequencyData(audioData);
  const { bass, treble } = analyzeFrequencyBands(audioData);
  const baseVortex = parseFloat(vortexSlider.value);
  particleSystem.setVortex(0, 0, 0, 0, 1, 0, baseVortex + treble * 10);
  // Beat pulse: bass repels particles outward from the centre. Skipped while
  // the pointer force owns the attractor uniform.
  if (pointerForceMode === "off") {
    particleSystem.setAttractor(0, 0, 0, -bass * 60, 14);
  }
}

audioBtn.addEventListener("click", () => {
  if (audioContext) {
    disableAudio();
  } else {
    void enableAudio();
  }
});

// --- Text -> particles morph ----------------------------------------------
// Renders the text to an offscreen canvas, samples the opaque pixels into a 3D
// point cloud (sampleOpaquePoints), and pulls particles toward it via the
// system's morph targets. Clicking again releases them back to free motion.
let isMorphing = false;

function textToPoints(text: string): Point3[] {
  const width = 256;
  const height = 128;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.clearRect(0, 0, width, height); // transparent background
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 90px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
  const { data } = ctx.getImageData(0, 0, width, height);
  return sampleOpaquePoints(data, width, height, { step: 2, spread: 24 });
}

function setMorphUI(on: boolean): void {
  morphBtn.textContent = on ? "Release" : "Morph to text";
  morphBtn.setAttribute("aria-pressed", on ? "true" : "false");
}

morphBtn.addEventListener("click", () => {
  if (!particleSystem) return;
  if (isMorphing) {
    particleSystem.clearMorph();
    isMorphing = false;
    setMorphUI(false);
    return;
  }
  const points = textToPoints(morphTextInput.value.trim() || "NOVA");
  if (points.length === 0) return;
  particleSystem.setMorphTargets(points, 5);
  isMorphing = true;
  setMorphUI(true);
});

init().catch((error: unknown) => {
  console.error("Initialization failed:", error);
  failApp(error instanceof Error ? error.message : String(error));
});
