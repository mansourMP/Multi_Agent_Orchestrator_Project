import crypto from "crypto";

export interface GatewaySupervisorExecuteSignatureInput {
  requestId: string;
  capabilityId: string;
  runId: string;
  workspaceId: string;
  nonce: string;
  expiresAt: string;
}

export interface GatewaySupervisorInterruptSignatureInput {
  requestId: string;
  runId: string;
  targetRequestId?: string;
  workspaceId: string;
  nonce: string;
  expiresAt: string;
}

function sign(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function signSupervisorExecuteRequest(
  secret: string,
  input: GatewaySupervisorExecuteSignatureInput,
): string {
  return sign(
    secret,
    `execute:${input.requestId}:${input.capabilityId}:${input.runId}:${input.workspaceId}:${input.nonce}:${input.expiresAt}`,
  );
}

export function signSupervisorInterruptRequest(
  secret: string,
  input: GatewaySupervisorInterruptSignatureInput,
): string {
  return sign(
    secret,
    `interrupt:${input.requestId}:${input.runId}:${String(input.targetRequestId ?? "").trim()}:${input.workspaceId}:${input.nonce}:${input.expiresAt}`,
  );
}
