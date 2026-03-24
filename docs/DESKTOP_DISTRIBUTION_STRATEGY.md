# Desktop Distribution Strategy

## Primary distribution path

Empyralis ships web-first.

- Primary: web application
- Installable shell: PWA
- Frozen fallback: Electron desktop wrapper for local bridge capabilities only

## Tauri criteria

Migrate to Tauri when:

- desktop is a core product surface
- local file access is needed at scale
- the Next.js SSR dependency is resolved
