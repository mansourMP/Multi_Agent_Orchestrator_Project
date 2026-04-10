function encodeToken(value) {
  return encodeURIComponent(String(value || '').trim());
}

export function agentsCollectionPath() {
  return '/api/agents';
}

export function agentsListPath(workspaceId) {
  return `${agentsCollectionPath()}?workspace_id=${encodeToken(workspaceId)}`;
}

export function agentDetailPath(installId, workspaceId) {
  return `${agentsCollectionPath()}/${encodeToken(installId)}?workspace_id=${encodeToken(workspaceId)}`;
}

export function agentManifestPath(installId) {
  return `${agentsCollectionPath()}/${encodeToken(installId)}/manifest`;
}

export function agentBiblePath(installId) {
  return `${agentsCollectionPath()}/${encodeToken(installId)}/bible`;
}

export function agentSkillsPath(installId) {
  return `${agentsCollectionPath()}/${encodeToken(installId)}/skills`;
}

export function agentConnectorsPath(installId) {
  return `${agentsCollectionPath()}/${encodeToken(installId)}/connectors`;
}

export function agentChannelsPath(installId) {
  return `${agentsCollectionPath()}/${encodeToken(installId)}/channels`;
}

export function agentRuntimePath(installId) {
  return `${agentsCollectionPath()}/${encodeToken(installId)}/runtime`;
}

export function installedAgentRunPath(installId) {
  return `${agentsCollectionPath()}/${encodeToken(installId)}/run`;
}

export function customerPreviewRespondPath() {
  return '/api/agents/customer-preview/respond';
}

export function customerPreviewInventoryPath() {
  return '/api/agents/customer-preview/inventory';
}

export function inboundChannelPath() {
  return '/api/agents/channels/inbound';
}
