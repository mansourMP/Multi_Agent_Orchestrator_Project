import type {
  GatewayRequestEnvelope,
  GatewayToolInterruptPayload,
  GatewayToolInvokePayload,
} from "../protocol/types";
import { GatewayBrowserRuntime } from "../browser/runtime";
import { PersonalChannelRuntimeRegistry } from "../channels/personal-runtime";
import { GatewaySupervisorClient } from "./client";

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function requireToken(value: unknown, label: string): string {
  const token = String(value ?? "").trim();
  if (!token) {
    throw new Error(`${label} is required.`);
  }
  return token;
}

export class GatewayCapabilityRouter {
  constructor(
    private readonly supervisorClient: GatewaySupervisorClient,
    private readonly browserRuntime?: GatewayBrowserRuntime,
    private readonly personalChannelRuntimes = new PersonalChannelRuntimeRegistry(),
  ) {}

  supportedCapabilities(): string[] {
    return [
      ...this.supervisorClient.supportedCapabilities(),
      ...(this.browserRuntime?.requestedCapabilities() ?? []),
      ...this.personalChannelRuntimes.requestedCapabilities(),
    ];
  }

  async handleToolInvoke(
    frame: GatewayRequestEnvelope<GatewayToolInvokePayload>,
  ): Promise<Record<string, unknown>> {
    const payload = requireObject(frame.payload, "tool.invoke payload must be an object.");
    const capabilityId = requireToken(payload.capability_id, "capability_id");
    const runId = requireToken(payload.run_id, "run_id");
    const traceId = requireToken(payload.trace_id, "trace_id");
    const workspaceId = requireToken(payload.workspace_id, "workspace_id");
    const argumentsPayload = requireObject(payload.arguments ?? {}, "arguments must be an object.");
    if (this.browserRuntime?.supportsCapability(capabilityId)) {
      const result = await this.browserRuntime.handleCapabilityInvoke(
        frame as unknown as GatewayRequestEnvelope<GatewayToolInvokePayload>,
      );
      return {
        request_id: frame.id,
        capability_id: capabilityId,
        run_id: runId,
        result,
      };
    }
    const personalRuntime = this.personalChannelRuntimes.runtimeForCapability(capabilityId);
    if (personalRuntime) {
      const result = await personalRuntime.handleCapabilityInvoke(
        frame as unknown as GatewayRequestEnvelope<GatewayToolInvokePayload>,
      );
      return {
        request_id: frame.id,
        capability_id: capabilityId,
        run_id: runId,
        result,
      };
    }
    const result = await this.supervisorClient.execute({
      requestId: requireToken(frame.id, "request_id"),
      capabilityId,
      runId,
      traceId,
      workspaceId,
      arguments: argumentsPayload,
    });
    return {
      request_id: frame.id,
      capability_id: capabilityId,
      run_id: runId,
      result,
    };
  }

  async handleToolInterrupt(
    frame: GatewayRequestEnvelope<GatewayToolInterruptPayload>,
  ): Promise<Record<string, unknown>> {
    const payload = requireObject(frame.payload, "tool.interrupt payload must be an object.");
    const runId = requireToken(payload.run_id, "run_id");
    const traceId = requireToken(payload.trace_id, "trace_id");
    const workspaceId = requireToken(payload.workspace_id, "workspace_id");
    const interruptResult = await this.supervisorClient.interrupt({
      requestId: requireToken(frame.id, "request_id"),
      runId,
      targetRequestId: String(payload.target_request_id ?? "").trim() || undefined,
      traceId,
      workspaceId,
      reason: String(payload.reason ?? "").trim() || undefined,
    });
    return interruptResult;
  }
}
