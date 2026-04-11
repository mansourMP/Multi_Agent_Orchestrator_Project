import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseJsonObjectBody,
  registryCustomerPreviewInventoryPath,
  registryCustomerPreviewRespondPath,
  registryInboundChannelPath,
  registryInstallDetailPath,
  registryInstallsCollectionPath,
  registryInstallsPath,
  registrySpecialistBiblePath,
  registrySpecialistChannelsPath,
  registrySpecialistConnectorsPath,
  registrySpecialistDetailPath,
  registrySpecialistRuntimePath,
  registrySpecialistsPath,
  registrySpecialistSkillsPath,
  workspaceIdFromPayload,
} from './agentRuntimeRouteContracts.js';

test('runtime route contracts keep agent registry paths stable', () => {
  assert.equal(registryInstallsCollectionPath(), '/agent-registry/installs');
  assert.equal(registryInstallsPath('workspace-1'), '/agent-registry/installs?workspace_id=workspace-1');
  assert.equal(registryInstallDetailPath('install-1', 'workspace-1'), '/agent-registry/installs/install-1?workspace_id=workspace-1');
  assert.equal(registrySpecialistsPath(), '/agent-registry/specialists');
  assert.equal(registrySpecialistDetailPath('install-1'), '/agent-registry/specialists/install-1');
  assert.equal(registrySpecialistBiblePath('install-1'), '/agent-registry/specialists/install-1/bible');
  assert.equal(registrySpecialistSkillsPath('install-1'), '/agent-registry/specialists/install-1/skills');
  assert.equal(registrySpecialistConnectorsPath('install-1'), '/agent-registry/specialists/install-1/connectors');
  assert.equal(registrySpecialistChannelsPath('install-1'), '/agent-registry/specialists/install-1/channels');
  assert.equal(registrySpecialistRuntimePath('install-1'), '/agent-registry/specialists/install-1/runtime');
  assert.equal(registryInboundChannelPath(), '/agent-registry/channels/inbound');
  assert.equal(registryCustomerPreviewRespondPath(), '/agents/customer-preview/respond');
  assert.equal(registryCustomerPreviewInventoryPath(), '/agents/customer-preview/inventory');
});

test('preview payload parsing rejects invalid json and extracts workspace scope', () => {
  assert.deepEqual(parseJsonObjectBody('', 'bad payload'), {});
  assert.deepEqual(parseJsonObjectBody('{"workspace_id":"workspace-1"}', 'bad payload'), { workspace_id: 'workspace-1' });
  assert.equal(workspaceIdFromPayload({ workspace_id: 'workspace-1' }), 'workspace-1');
  assert.throws(() => parseJsonObjectBody('{oops}', 'bad payload'), /bad payload/);
  assert.throws(() => parseJsonObjectBody('[]', 'bad payload'), /bad payload/);
});
