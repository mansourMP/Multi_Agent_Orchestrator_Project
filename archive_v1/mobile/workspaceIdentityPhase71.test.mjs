import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = '/Users/mansur/Multi_Agent_Orchestrator_Project';

function readSource(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('mobile session model stores explicit current/default workspace ids', () => {
  const source = readSource('mobile/src/lib/types.ts');
  assert.match(source, /currentWorkspaceId\?: string;/);
  assert.match(source, /defaultWorkspaceId\?: string;/);
});

test('mobile session normalization resolves the preferred real workspace id from account payloads', () => {
  const source = readSource('mobile/src/lib/session.ts');
  assert.match(source, /export function resolvePreferredWorkspaceId/);
  assert.match(source, /currentWorkspaceId/);
  assert.match(source, /defaultWorkspaceId/);
});

test('mobile account sign-in and refresh flows honor backend workspace identity fields', () => {
  const sessionScreenSource = readSource('mobile/app/session.tsx');
  const sessionContextSource = readSource('mobile/src/lib/session-context.tsx');
  const apiSource = readSource('mobile/src/lib/api.ts');
  assert.match(sessionScreenSource, /payload\.current_workspace_id/);
  assert.match(sessionContextSource, /payload\.current_workspace_id/);
  assert.match(apiSource, /current_workspace_id/);
  assert.match(apiSource, /default_workspace_id/);
});
