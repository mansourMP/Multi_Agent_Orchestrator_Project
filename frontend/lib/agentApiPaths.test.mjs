import test from 'node:test';
import assert from 'node:assert/strict';

import {
  agentBiblePath,
  agentChannelsPath,
  agentConnectorsPath,
  agentDetailPath,
  agentManifestPath,
  agentRuntimePath,
  agentsCollectionPath,
  agentsListPath,
  agentSkillsPath,
  customerPreviewInventoryPath,
  customerPreviewRespondPath,
  inboundChannelPath,
  installedAgentRunPath,
} from './agentApiPaths.js';

test('agent BFF collection and detail paths stay stable', () => {
  assert.equal(agentsCollectionPath(), '/api/agents');
  assert.equal(agentsListPath('workspace-1'), '/api/agents?workspace_id=workspace-1');
  assert.equal(agentDetailPath('install-1', 'workspace-1'), '/api/agents/install-1?workspace_id=workspace-1');
});

test('agent BFF mutation paths cover specialist lifecycle saves', () => {
  assert.equal(agentManifestPath('install-1'), '/api/agents/install-1/manifest');
  assert.equal(agentBiblePath('install-1'), '/api/agents/install-1/bible');
  assert.equal(agentSkillsPath('install-1'), '/api/agents/install-1/skills');
  assert.equal(agentConnectorsPath('install-1'), '/api/agents/install-1/connectors');
  assert.equal(agentChannelsPath('install-1'), '/api/agents/install-1/channels');
  assert.equal(agentRuntimePath('install-1'), '/api/agents/install-1/runtime');
  assert.equal(installedAgentRunPath('install-1'), '/api/agents/install-1/run');
});

test('agent BFF preview and ingress paths stay on the agent surface', () => {
  assert.equal(customerPreviewRespondPath(), '/api/agents/customer-preview/respond');
  assert.equal(customerPreviewInventoryPath(), '/api/agents/customer-preview/inventory');
  assert.equal(inboundChannelPath(), '/api/agents/channels/inbound');
});
