---
date: 2026-02-10T14:11:50-05:00
session_name: general
researcher: Claude
git_commit: untracked
branch: main
repository: particle-system
topic: "Nova Particles GPU Particle System Improvements"
tags: [webgpu, three.js, particle-system, tsl, gpu-compute]
status: complete
last_updated: 2026-02-10
last_updated_by: Claude
type: implementation_strategy
root_span_id: ""
turn_span_id: ""
---

# Handoff: Nova Particles GPU Improvements

## Task(s)

### Completed
1. **Test Infrastructure Setup** - Added vitest with 79 tests covering curves, emitters, and forces
2. **Fixed Pre-existing TypeScript Errors** - Removed unused imports, fixed `.compute()` signature
3. **Force System GPU Integration** - Integrated drag, wind, point attractor, vortex forces into compute shader
4. **Size Over Lifetime** - GPU shader samples baked AnimationCurve via uniform arrays
5. **Color Over Lifetime** - GPU shader samples baked ColorGradient via uniform arrays
6. **Runtime API** - Added `setSizeOverLifetime()`, `setColorOverLifetime()`, `clearCurves()` methods
7. **Demo Presets** - Added Fire, Smoke, Magic, Rainbow effect preset buttons
8. **Particle Respawning** - Dead particles now respawn at emitter with fresh randomized properties

### Not Started (Future Work)
- Trail renderer
- Curl noise turbulence
- Collision detection
- Indirect draw calls with atomic counters

## Critical References
- `packages/core/src/ParticleSystem.ts` - Main GPU compute shader implementation
- `packages/core/src/curves.ts` - AnimationCurve and ColorGradient classes
- `apps/web/src/main.ts` - Demo with all force and curve controls

## Recent Changes

### Core Package (`packages/core/src/`)
- `ParticleSystem.ts:1-25` - Added imports for vec4, int, floor, uniformArray
- `ParticleSystem.ts:71-100` - Added force uniforms (drag, wind, attractor, vortex) and curve uniforms
- `ParticleSystem.ts:330-414` - Update compute shader with all forces
- `ParticleSystem.ts:414-460` - Respawn logic for dead particles
- `ParticleSystem.ts:530-610` - New API methods: setSizeOverLifetime, setColorOverLifetime, clearCurves
- `curves.ts:1` - Removed unused THREE import
- `forces.ts:1` - Removed unused THREE import
- `index.ts` - Exported forces, curves, and new types
- `types.ts:2,80-85` - Added AnyForce import and forces/drag config options

### Demo (`apps/web/`)
- `index.html:119-145` - Added preset buttons and new slider controls
- `src/main.ts:1-3` - Import AnimationCurve, ColorGradient
- `src/main.ts:160-240` - Preset button event handlers (fire, smoke, magic, rainbow)

### Test Files
- `curves.test.ts` - 23 tests for AnimationCurve and ColorGradient
- `emitters.test.ts` - 34 tests for all emitter types
- `forces.test.ts` - 22 tests for all force classes

## Learnings

### TSL (Three.js Shading Language) Patterns
- TSL doesn't have `Else` - use separate `If` blocks with opposite conditions
- `uniformArray()` requires regular JS arrays, not Float32Array
- Chain operations immutably: `vel.mul(x).add(y).add(z)` not reassignment
- Must use `.toInt()` for array indices: `floor(x).toInt()`
- `.compute(count, [64])` requires workgroup size parameter for @types/three

### Curve Baking Strategy
- Bake curves to 16-sample lookup tables (CURVE_SAMPLES constant)
- Sample via `floor(normalizedAge * 15).toInt()` as array index
- Color stored as RGBA interleaved: index * 4 + channel offset
- Use `mix()` with enable flag to toggle between default and curve behavior

### Particle Respawning
- Check `currentLife.lessThanEqual(0)` in separate If block
- Generate new seeds using `hash(i.add(uniforms.time.mul(1000).toInt()))` for variation
- Must reset: position, velocity, life, size, color

## Post-Mortem

### What Worked
- **TDD approach**: Writing tests first caught existing type issues before implementation
- **Uniform arrays for curves**: 16 samples provides good visual quality with minimal GPU overhead
- **Separate If blocks**: Clean pattern for if/else in TSL without `Else` export

### What Failed
- Tried: `let newVel = vel; newVel = newVel.add(x)` → Failed: TSL nodes aren't reassignable
- Tried: `Else` import from three/tsl → Failed: Not exported, use separate If instead
- Tried: `uniformArray(Float32Array)` → Failed: Needs regular array

### Key Decisions
- **16 curve samples**: Balance between quality and memory. Alternatives: 8 (too blocky), 32 (diminishing returns)
- **Mix with enable flag**: `mix(default, curve, enabled)` rather than conditional branching - simpler GPU code
- **Respawn in update shader**: Not separate pass - reduces GPU dispatches per frame

## Artifacts

### Source Files Modified
- `packages/core/src/ParticleSystem.ts` - Main implementation
- `packages/core/src/curves.ts` - Removed unused import
- `packages/core/src/forces.ts` - Removed unused import
- `packages/core/src/types.ts` - Added force config types
- `packages/core/src/index.ts` - Export new APIs
- `packages/core/vitest.config.ts` - Test configuration
- `packages/core/package.json` - Test scripts

### Test Files Created
- `packages/core/src/curves.test.ts`
- `packages/core/src/emitters.test.ts`
- `packages/core/src/forces.test.ts`

### Demo Files Modified
- `apps/web/index.html` - Preset buttons, styling
- `apps/web/src/main.ts` - Preset handlers

## Action Items & Next Steps

1. **Trail Renderer** - Store ring buffer of N previous positions per particle, render as line strip
2. **Curl Noise Turbulence** - Port simplex noise to TSL, compute curl for swirling motion
3. **Collision Detection** - Simple plane/sphere collisions via distance checks in compute shader
4. **Indirect Draw Calls** - Use atomic counters for live particle count, only render alive particles
5. **Editor Package** - `packages/editor/` is empty stub, needs node-based visual editor

## Other Notes

### Build Commands
```bash
cd packages/core
pnpm build        # Build library
pnpm test         # Run 79 tests
pnpm test:coverage # Coverage report
```

### Demo
```bash
cd apps/web
pnpm dev          # Start dev server
```

### Key Architecture
- GPU compute shaders via TSL (Three.js Shading Language)
- Storage buffers: position, velocity, color, life, size, rotation
- Two compute passes: init (once) and update (per frame)
- SpriteNodeMaterial with billboarding for rendering
- Designed for 1M+ particles at 60fps
