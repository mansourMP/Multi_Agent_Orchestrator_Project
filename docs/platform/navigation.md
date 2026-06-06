# Platform Navigation

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: route manifest and frontend shell

## Current Route Roots

Workspace pages are under `frontend/app/(account)/w/[workspaceId]/`.
Observed route files include:

- `sage/page.tsx`
- `studio/page.tsx`
- `hardware/page.tsx`
- `channels/page.tsx`
- `applications/page.tsx`
- `marketplace/page.tsx`
- `integrations/page.tsx`
- `memory/page.tsx`
- `settings/page.tsx`
- `activity/page.tsx`
- `approvals/page.tsx`
- `gateway/page.tsx`
- `gateway-activity/page.tsx`
- `gateway-approvals/page.tsx`
- `studio-integrations/page.tsx`
- `chat/page.tsx`
- `tasks/page.tsx`
- `artifacts/page.tsx`

Frontend shell and surface ownership lives mostly in:

- `frontend/lib/workspace/workspace-shell.ts`
- `frontend/lib/workspace/workstation-shell-frame.tsx`
- `frontend/lib/workspace/WorkspaceSurfacePage.tsx`
- `frontend/lib/workspace/workstation-*.tsx`
- `frontend/lib/discovery/discovery-pane.tsx`
- `frontend/lib/marketplace/marketplace-pane.tsx`

Migration debt: user-facing labels still need one canonical manifest pass.
Earlier UI screenshots showed stale language such as `Agent Computer: Auto`.
