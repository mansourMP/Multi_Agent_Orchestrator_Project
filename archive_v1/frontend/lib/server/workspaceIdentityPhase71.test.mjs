import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = '/Users/mansur/Multi_Agent_Orchestrator_Project';

function readSource(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('control-plane session persists real current/default workspace identity', () => {
  const source = readSource('frontend/lib/server/controlPlaneSession.ts');
  assert.match(source, /currentWorkspaceId\?: string;/);
  assert.match(source, /defaultWorkspaceId\?: string;/);
  assert.match(source, /resolveSessionWorkspaceId/);
  assert.doesNotMatch(source, /if \(requestedWorkspaceId === 'default'\) return 'default';/);
});

test('platform shell prefers backend current\/default workspace ids over the literal default token', () => {
  const source = readSource('frontend/components/orion/PlatformShellContext.tsx');
  assert.match(source, /resolvePreferredWorkspaceId/);
  assert.match(source, /profilePayload\?\.current_workspace_id/);
  assert.match(source, /profilePayload\?\.default_workspace_id/);
});

test('settings page resolves workspace-scoped data from the authenticated account workspace', () => {
  const source = readSource('frontend/app/(shell)/settings/page.tsx');
  assert.match(source, /current_workspace_id/);
  assert.match(source, /default_workspace_id/);
  assert.match(source, /encodeURIComponent\(workspaceId\)/);
});
