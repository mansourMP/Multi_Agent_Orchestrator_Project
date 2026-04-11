import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('customer preview BFF routes enforce workspace access before proxying', () => {
  const respondRoute = read('frontend/app/api/agents/customer-preview/respond/route.ts');
  const inventoryRoute = read('frontend/app/api/agents/customer-preview/inventory/route.ts');

  for (const source of [respondRoute, inventoryRoute]) {
    assert.match(source, /requireControlPlaneWorkspaceAccess/);
    assert.match(source, /workspaceIdFromPayload\(body\)/);
    assert.match(source, /runtimeJsonRequest/);
  }
});

test('agent detail view reloads server truth for install resolution and customer mode refresh', () => {
  const source = read('frontend/components/orion/agents/AgentDetailView.tsx');
  const matches = source.match(/fetchAgentInstall\(installId, activeWorkspaceId\)/g) || [];
  assert.ok(matches.length >= 2, 'expected initial resolution and customer mode refresh fetches');
  assert.match(source, /router\.replace\(`\/agents\/\$\{encodeURIComponent\(installId\)\}\?mode=owner`\)/);
});

test('agents workspace context stays server-backed for forge creation and owner saves', () => {
  const source = read('frontend/components/orion/agents/AgentsWorkspaceContext.tsx');

  assert.match(source, /fetchAgents\(activeWorkspaceId\)/);
  assert.match(source, /createSpecialistAgent\(/);
  assert.match(source, /saveSpecialistBible\(/);
  assert.match(source, /saveSpecialistSkillBindings\(/);
  assert.match(source, /saveSpecialistChannelBindings\(/);
  assert.match(source, /saveSpecialistConnectorBindings\(/);
  assert.match(source, /saveSpecialistRuntimeProfile\(/);
});

test('forge routes newly created specialists straight into owner mode', () => {
  const source = read('frontend/app/(shell)/agents/page.tsx');

  assert.match(source, /router\.push\(`\/agents\/\$\{encodeURIComponent\(draft\.id\)\}\?mode=owner`\)/);
  assert.match(source, /createDraftAgent\(/);
  assert.match(source, /createDraftAgentFromBlueprint\(/);
});
