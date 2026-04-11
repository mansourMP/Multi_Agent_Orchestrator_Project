import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = '/Users/mansur/Multi_Agent_Orchestrator_Project';

function readSource(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('runtime-backed shell routes resolve runtime workspace IDs through the shared alias helper', () => {
  const sessionSource = readSource('frontend/lib/server/controlPlaneSession.ts');
  assert.match(sessionSource, /export async function resolveRuntimeWorkspaceId/);

  const routes = [
    'frontend/app/api/chat/master-context/route.ts',
    'frontend/app/api/activity/timeline/route.ts',
    'frontend/app/api/sessions/route.ts',
    'frontend/app/api/turn/route.ts',
    'frontend/app/api/control-plane/providers/runtime-availability/route.ts',
    'frontend/app/api/control-plane/providers/[providerId]/models/route.ts',
    'frontend/app/api/control-plane/providers/profiles/health/route.ts',
  ];

  for (const route of routes) {
    const source = readSource(route);
    assert.match(
      source,
      /resolveRuntimeWorkspaceId/,
      `${route} should use the shared runtime workspace alias helper`,
    );
  }
});
