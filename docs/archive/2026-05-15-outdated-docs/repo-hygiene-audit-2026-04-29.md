# Repo Hygiene Audit - 2026-04-29

This audit records active code boundaries, dead-code cleanup already performed, and remaining cleanup work. It is intentionally practical: do not use it as a design wishlist.

## Active Source Boundaries

Active launch path:

- `server_modules/`
- `frontend/app`
- `frontend/lib`
- `shared/`
- `mobile/app`
- `mobile/src`
- `empyralis-gateway/`
- `empyralis-supervisor/`
- `src-tauri/`

Historical or generated/off-path:

- `/backend` is legacy Nest and not the active runtime.
- `_archive/` is historical.
- `graphify-out/` is generated analysis output.
- `.orion-stack/`, `.orion-artifacts/`, `.orion-object-store/`, `.pytest_cache/`, `.next/`, `dist/`, `target/`, and `node_modules/` are runtime/build/dependency state.
- `.gemini/` and `GEMINI.md` are local agent artifacts, not product source.

## Dead Code Removed In This Pass

Static import analysis showed these frontend workspace modules had no active product imports. They were removed:

- `chat-inline-state-card.tsx`
- `sage-trace-view.tsx`
- `stage-detail-layout.tsx`
- `workspace-channel-operations-console.tsx`
- `workstation-run-detail.tsx`
- `workstation-sage-providers-pane.tsx`
- `workstation-timeline-projector.ts`

Stale E2E coverage removed or trimmed:

- `frontend/tests/e2e/sage-trace-view.spec.ts`
- `frontend/tests/e2e/workstation-chat-live-trace.spec.ts`
- `frontend/tests/e2e/workstation-runs-trace-replay.spec.ts`
- removed the run-detail deep-link assertion from `frontend/tests/e2e/approval-resolution-golden-path.spec.ts`

## Remaining Cleanup Candidates

These are not safe to delete blindly. They need one focused pass each:

- `frontend/app/(account)/w/[workspaceId]/trace-preview/page.tsx`: currently returns `notFound()`. Keep only if a hidden dev harness is still desired; otherwise remove route.
- Legacy route pages such as `workstation`, `applications`, `agents`, `deployed-agents`, and `admin/*`: still exist as compatibility routes. Consolidate only after route-manifest redirects are tested.
- `mobile/app/(tabs)` versus the canonical 5-destination IA: active today, but still not the final information architecture.
- E2E suite: after deleting stale trace specs, run Playwright separately and rewrite only tests for active surfaces.
- `docs/packets/*`: historical audit packets still reference old paths. Treat as history; do not bulk-edit unless archiving policy requires it.

## Current Quality Risks

- Docs had drifted from mounted mobile reality. This pass corrected `docs/decisions/architectural-decisions.md`, `docs/platform/frontend-map.md`, and `shared/nav-manifest.js` for the active `(tabs)` shell.
- The repo still contains many runtime/generated folders in the working directory. Do not stage them.
- Chat still needs live browser proof after each streaming/lifecycle change. Static tests and E2E are necessary but not enough for public demo confidence.
- Provider/gateway parity is architecturally wired locally, but public-demo readiness still depends on production provider credential save, Render credential vault health, and live gateway pairing.
- `frontend/test-results/.last-run.json` is local Playwright state. Do not stage it into a release commit.
- `mobile/app/(tabs)/_layout.tsx`, `mobile/package-lock.json`, `.gemini/`, `GEMINI.md`, and `graphify-out/` were already dirty/local and were not part of this web RC cleanup.

## Verification Snapshot

Latest local verification after cleanup:

- Frontend TypeScript: passed.
- Frontend production build: passed.
- Python compile for `server_modules` and `scripts`: passed.
- Targeted backend tests: `98 passed`.
- Targeted E2E batch: `10 passed`.

## Rule For Future Cleanup

Delete only when all three are true:

1. Static import/reference search shows no active product usage.
2. The route or module is not the source of a backend/API contract.
3. TypeScript/build/backend targeted tests still pass after deletion.
