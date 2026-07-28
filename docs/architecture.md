# Architecture

> Snapshot as of 2026-07-28. Diagrams describe `@nova-particles/core` and the web demo.

Nova Particles keeps particle state in GPU storage buffers (Structure of Arrays) and
updates it with WebGPU compute shaders (TSL). The renderer reads those same buffers
directly, so per-frame simulation never round-trips through the CPU.

## GPU simulation pipeline

The per-frame data flow, from configuration to pixels:

```mermaid
flowchart LR
    Config["ParticleSystemConfig<br/>(emitter, forces, curves)"]
    Emit["Emitters<br/>Point / Sphere / Box<br/>Cone / Circle"]

    subgraph GPU["GPU (WebGPU)"]
        Buffers["Storage Buffers (SoA)<br/>position · velocity · life<br/>color · size"]
        Compute["Compute Shaders (TSL)<br/>integrate forces<br/>advance life · spawn"]
        Render["Vertex Fetch + Render<br/>instanced draw<br/>additive blend · trails"]
    end

    Post["Post-processing<br/>BloomPass"]
    Screen(["Canvas"])

    Config --> Emit --> Buffers
    Buffers --> Compute
    Compute -->|write back| Buffers
    Buffers -->|read, no CPU copy| Render
    Render --> Post --> Screen
```

Key point: `Compute` reads and writes `Buffers`, and `Render` reads the same `Buffers`.
No CPU-to-GPU transfer per frame — that is what allows 1M+ particles at 60fps.

## Core module map

How `@nova-particles/core` modules relate (`ParticleSystem` is the hub):

```mermaid
flowchart TD
    PS["ParticleSystem.ts<br/>(orchestrator)"]

    Buf["buffers.ts<br/>SoA storage buffers"]
    CS["compute-shaders.ts<br/>createTrailCompute + physics"]
    Forces["forces.ts<br/>Gravity · Wind · Drag<br/>Vortex · Turbulence · CurlNoise<br/>PointAttractor"]
    Curves["curves.ts<br/>AnimationCurve · ColorGradient"]
    Uni["uniforms.ts<br/>CURVE_SAMPLES + uniforms"]
    Types["types.ts<br/>config + state types"]

    Emitters["emitters.ts<br/>createEmitter + shapes"]
    Tex["textures/<br/>TextureGenerator · Atlas"]
    Postp["post-processing/<br/>BloomPass"]

    PS --> Buf
    PS --> CS
    PS --> Forces
    PS --> Curves
    PS --> Uni
    PS --> Types
    Emitters -.seeds.-> PS
    Tex -.sprites.-> PS
    Postp -.consumes render.-> PS

    Index["index.ts (public API)"]
    Index -.re-exports.-> PS
    Index -.re-exports.-> Emitters
    Index -.re-exports.-> Forces
    Index -.re-exports.-> Curves
    Index -.re-exports.-> Tex
```

Solid arrows = direct import/use by `ParticleSystem`. Dashed = sibling modules wired in
by the consumer (the web demo) or re-exported through `index.ts`.
