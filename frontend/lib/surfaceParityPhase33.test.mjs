import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('master chat context and activity timeline stay available to the desktop shell', () => {
  const apiSource = read('frontend/lib/api.ts');
  const timelineRoute = read('frontend/app/api/activity/timeline/route.ts');
  const shellSource = read('frontend/app/(shell)/page.tsx');

  assert.match(apiSource, /runtime_attachments/);
  assert.match(apiSource, /recent_activity/);
  assert.match(apiSource, /unified_memory/);
  assert.match(apiSource, /fetchActivityTimeline/);
  assert.match(timelineRoute, /requireControlPlaneWorkspaceAccess/);
  assert.match(timelineRoute, /runtimeJsonRequest\(`\/activity\/timeline\?/);
  assert.match(shellSource, /Runtime topology/);
  assert.match(shellSource, /Memory & privacy/);
  assert.match(shellSource, /Activity timeline/);
  assert.match(shellSource, /router\.push\('\/machines'\)/);
  assert.match(shellSource, /router\.push\('\/settings'\)/);
  assert.match(shellSource, /router\.push\('\/runs'\)/);
});

test('mobile home and status use shared captain context for continuity and safe summaries', () => {
  const mobileData = read('mobile/src/lib/mobile-data.ts');
  const homeSource = read('mobile/src/screens/HomeScreen.tsx');
  const statusSource = read('mobile/app/status.tsx');

  assert.match(mobileData, /runtimeAttachments/);
  assert.match(mobileData, /recentActivity/);
  assert.match(mobileData, /unifiedMemory/);
  assert.match(mobileData, /scheduler/);
  assert.match(homeSource, /useMobileChatContext/);
  assert.match(homeSource, /SectionTitle title="Continuity"/);
  assert.match(homeSource, /SectionTitle title="Recent Captain Activity"/);
  assert.match(homeSource, /Execution capability follows runtime/);
  assert.match(statusSource, /useMobileChatContext/);
  assert.match(statusSource, /title="Runtime Topology"/);
  assert.match(statusSource, /title="Memory Boundary"/);
});
