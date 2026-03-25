# Desktop Distribution Strategy

## Primary distribution path

Empyralis ships web-first.

- Primary: web application
- Installable shell: PWA
- Frozen fallback: Electron desktop wrapper for local bridge capabilities only
- Product model: one web-first control plane with a separate execution runtime

## Tauri criteria

Migrate to Tauri when:

- desktop is a core product surface
- local file access is needed at scale
- the Next.js SSR dependency is resolved

Related reference:

- [docs/HEKOR_V1_ARCHITECTURE.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/HEKOR_V1_ARCHITECTURE.md)
