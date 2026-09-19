# Nova Particles (particle-system)

GPU particle system engine: Three.js + WebGPU compute shaders (via TSL, Three.js Shading
Language). Simulates up to 1M+ particles at 60fps entirely on the GPU (no per-frame CPU-GPU
data transfer). Site: novaparticles.com.

A monorepo with two workspace packages, managed via pnpm:
- `packages/core` (`@nova-particles/core`) - the published engine library
- `apps/web` (`@nova-particles/web`) - the interactive demo/editor app

## Stack

- Three.js ^0.185 (WebGPU renderer), TypeScript 6.0.3, Vite (build tool for both packages)
- Workspaces managed via pnpm (`pnpm@10.34.5`, `pnpm-lock.yaml`); Node >=18
- Biome for lint/format
- Vitest for tests (`packages/core` only; has `test`, `test:watch`, `test:coverage`)
- `apps/web` adds `posthog-js` for analytics

`@nova-particles/core` ships as an ESM-only, side-effect-free package (`three` is a peer dep,
`>=0.170.0`).

## Commands (run from repo root)

- `pnpm dev` - `pnpm --filter @nova-particles/web dev` (Vite dev server)
- `pnpm build` - `pnpm -r build` (builds core then web)
- `pnpm test` - `pnpm --filter @nova-particles/core test` (vitest)
- `pnpm preview` - `pnpm --filter @nova-particles/web preview`
- `pnpm lint` / `pnpm typecheck` / `pnpm clean` - run across all workspaces (`pnpm -r`)
- `pnpm biome:check` / `pnpm biome:fix` / `pnpm biome:format`

Inside `packages/core`: `pnpm build` (`vite build`), `pnpm dev` (`vite build --watch`),
`pnpm test:coverage` (`vitest run --coverage`).

## Architecture

Particle state lives in GPU storage buffers, Structure-of-Arrays layout (position, velocity,
life, color, size). Compute shaders update state every frame; the renderer reads the same
buffers directly to draw instances, with no CPU round-trip. Full pipeline and module-dependency
diagrams: `docs/architecture.md`.

`packages/core/src/` key files: `ParticleSystem.ts` (orchestrator), `buffers.ts` (SoA storage),
`compute-shaders.ts` (TSL compute), `forces.ts` (Gravity, Wind, Drag, Vortex, Turbulence,
CurlNoise, PointAttractor), `emitters.ts` (Point/Sphere/Box/Cone/Circle), `curves.ts`
(AnimationCurve, ColorGradient), `textures/` (texture atlas/generator), `post-processing/`
(BloomPass), `index.ts` (public API surface).

`apps/web/src/` - `main.ts` (demo entry), `presets/AdvancedPresets.ts` (Fireworks, Nebula,
Lightning, Portal, Fireflies, Snowfall, Energy, Toxic, Black Hole, Aurora, Supernova),
`debug-compute.ts`.

## Env vars

- `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` - PostHog analytics in `apps/web` (read via
  `import.meta.env`)

## Testing

Tests live next to source as `*.test.ts` in `packages/core/src/` (ParticleSystem, audio,
curves, emitters, forces, pointer, serialize, textPoints). No tests in `apps/web`.

## Deploy

Vercel (`.vercel/project.json` present; project name `particle-system`).

## Requirements

Browser needs WebGPU support: Chrome 113+, Edge 113+, or Safari 18+.
