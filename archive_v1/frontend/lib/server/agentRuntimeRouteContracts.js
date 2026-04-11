function encodeToken(value) {
  return encodeURIComponent(String(value || '').trim());
}

export function registryInstallsPath(workspaceId) {
  return `/agent-registry/installs?workspace_id=${encodeToken(workspaceId)}`;
}

export function registryInstallsCollectionPath() {
  return '/agent-registry/installs';
}

export function registryInstallDetailPath(installId, workspaceId) {
  return `/agent-registry/installs/${encodeToken(installId)}?workspace_id=${encodeToken(workspaceId)}`;
}

export function registryInstallUpdatePath(installId) {
  return `/agent-registry/installs/${encodeToken(installId)}`;
}

export function registrySpecialistsPath() {
  return '/agent-registry/specialists';
}

export function registrySpecialistDetailPath(installId) {
  return `/agent-registry/specialists/${encodeToken(installId)}`;
}

export function registrySpecialistBiblePath(installId) {
  return `${registrySpecialistDetailPath(installId)}/bible`;
}

export function registrySpecialistSkillsPath(installId) {
  return `${registrySpecialistDetailPath(installId)}/skills`;
}

export function registrySpecialistConnectorsPath(installId) {
  return `${registrySpecialistDetailPath(installId)}/connectors`;
}

export function registrySpecialistChannelsPath(installId) {
  return `${registrySpecialistDetailPath(installId)}/channels`;
}

export function registrySpecialistRuntimePath(installId) {
  return `${registrySpecialistDetailPath(installId)}/runtime`;
}

export function registryInboundChannelPath() {
  return '/agent-registry/channels/inbound';
}

export function registryCustomerPreviewRespondPath() {
  return '/agents/customer-preview/respond';
}

export function registryCustomerPreviewInventoryPath() {
  return '/agents/customer-preview/inventory';
}

export function parseJsonObjectBody(rawBody, invalidDetail) {
  if (!String(rawBody || '').trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error(String(invalidDetail || 'Invalid JSON payload.'));
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(String(invalidDetail || 'Invalid JSON payload.'));
  }
  return parsed;
}

export function workspaceIdFromPayload(payload) {
  return String(payload?.workspace_id || '').trim();
}
