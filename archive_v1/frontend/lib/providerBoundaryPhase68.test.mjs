import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(
  new URL('../app/api/control-plane/providers/runtime-availability/route.ts', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL('../components/orion/connections/AiAccountsPanel.tsx', import.meta.url),
  'utf8',
);
const mobileSettingsSource = readFileSync(
  new URL('../../mobile/src/screens/SettingsScreen.tsx', import.meta.url),
  'utf8',
);

test('runtime availability projection includes provider boundary fields', () => {
  assert.match(routeSource, /connection_kind/);
  assert.match(routeSource, /connection_scope/);
  assert.match(routeSource, /connection_label/);
  assert.match(routeSource, /identity_boundary_note/);
  assert.match(routeSource, /This machine only/);
  assert.match(routeSource, /Runtime environment/);
  assert.match(routeSource, /Workspace provider/);
});

test('provider panel distinguishes platform identity from provider capability', () => {
  assert.match(panelSource, /AI providers/);
  assert.match(panelSource, /machine-local AI capabilities/);
  assert.match(panelSource, /Empyralis account stays separate from provider sign-in/);
  assert.match(panelSource, /This machine only/);
  assert.match(panelSource, /Workspace provider/);
  assert.match(panelSource, /Manage capability/);
});

test('mobile settings copy preserves account vs provider vs machine boundary', () => {
  assert.match(mobileSettingsSource, /Empyralis account signs in this device/);
  assert.match(mobileSettingsSource, /Workspace providers stay separate from product identity/);
  assert.match(mobileSettingsSource, /machine-local subscriptions stay on the paired machine/);
});
