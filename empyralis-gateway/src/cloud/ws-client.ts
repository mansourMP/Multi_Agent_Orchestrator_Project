import crypto from "crypto";

import { GatewayConfig } from "../config";
import { GatewayCheckpoints } from "../state/checkpoints";
import { GatewayStateDb } from "../state/db";
import { GatewayJournal } from "../state/journal";
import { GatewayOutbox, GatewayOutboxItem } from "../state/outbox";
import {
  GatewayDeviceIdentity,
  persistDeviceIdentityScope,
} from "../pairing/device-identity";
import { GatewayTokenStore } from "../pairing/token-store";
import { encodeFrame, decodeFrame } from "../protocol/codec";
import type {
  GatewayChannelInboundPayload,
  GatewayChannelOutboundPayload,
  GatewayEventEnvelope,
  GatewayRegistrationPayload,
  GatewayRequestEnvelope,
  GatewayResponseEnvelope,
  GatewayScope,
  GatewaySessionPayload,
  GatewayToolInterruptPayload,
  GatewayToolInvokePayload,
} from "../protocol/types";
import { GatewayRuntimeMetadata } from "../runtime/runtime-metadata";
import { HeartbeatLoop } from "./heartbeat";
import { ReconnectBackoff, classifyReconnectError, sleep } from "./reconnect";
import { GatewayCapabilityRouter } from "../supervisor/capability-router";
import { PersonalChannelRuntimeRegistry } from "../channels/personal-runtime";

interface PendingResponse {
  messageType: GatewayRequestEnvelope["type"];
  replayable: boolean;
  timeoutHandle: NodeJS.Timeout;
  resolve: (frame: GatewayResponseEnvelope) => void;
  reject: (error: Error) => void;
}

interface RequestDispatchOptions {
  requestId?: string;
  replayable?: boolean;
  persistOutbox?: boolean;
  timeoutMs?: number;
}

export class GatewayWsClient {
  private socket: WebSocket | null = null;
  private readonly heartbeatLoop = new HeartbeatLoop();
  private readonly reconnect: ReconnectBackoff;
  private readonly pendingResponses = new Map<string, PendingResponse>();
  private activeScope: GatewayScope | null = null;
  private socketFailureReason: string | null = null;

  constructor(
    private readonly config: GatewayConfig,
    private readonly db: GatewayStateDb,
    private readonly journal: GatewayJournal,
    private readonly outbox: GatewayOutbox,
    private readonly checkpoints: GatewayCheckpoints,
    private readonly tokenStore: GatewayTokenStore,
    private readonly capabilityRouter: GatewayCapabilityRouter,
    private readonly personalChannelRuntimes = new PersonalChannelRuntimeRegistry(),
  ) {
    this.reconnect = new ReconnectBackoff({
      minDelayMs: this.config.reconnectMinDelayMs,
      maxDelayMs: this.config.reconnectMaxDelayMs,
    });
  }

  async registerFromPairing(
    pairingToken: string,
    identity: GatewayDeviceIdentity,
    runtimeMetadata: GatewayRuntimeMetadata,
  ): Promise<GatewayRegistrationPayload> {
    const response = await fetch(`${this.config.apiBaseUrl}/gateway/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairing_token: pairingToken,
        device_id: identity.deviceId,
        gateway_id: identity.gatewayId,
        display_name: this.config.displayName,
        platform: runtimeMetadata.platform,
        capabilities: runtimeMetadata.requestedCapabilities,
        metadata: runtimeMetadata.deviceMetadata,
      }),
    });
    if (!response.ok) {
      const rawBody = await response.text().catch(() => "");
      let detail = rawBody.trim();
      if (detail) {
        try {
          const parsed = JSON.parse(detail) as { detail?: unknown };
          detail = typeof parsed.detail === "string" ? parsed.detail : detail;
        } catch {
          // Keep the raw body when the runtime does not return JSON.
        }
      }
      throw new Error(
        `Gateway registration failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }
    const payload = (await response.json()) as GatewayRegistrationPayload;
    await this.db.writeJson("registration.json", payload.gateway);
    await persistDeviceIdentityScope(this.db, {
      gatewayId: String(payload.gateway.gateway_id || identity.gatewayId),
      deviceId: String(payload.gateway.device_id || identity.deviceId),
      tenantId: String(payload.scope.tenant_id || ""),
      workspaceId: String(payload.scope.workspace_id || ""),
      userId: String(payload.scope.user_id || ""),
    });
    await this.tokenStore.save({
      pairingToken: undefined,
      gatewayToken: payload.gateway_token,
    });
    return payload;
  }

  async createSession(gatewayId: string): Promise<GatewaySessionPayload> {
    const tokens = await this.tokenStore.load();
    if (!tokens.gatewayToken) {
      throw new Error("Gateway token is missing. Pairing/registration is required first.");
    }
    const response = await fetch(`${this.config.apiBaseUrl}/gateway/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gateway_id: gatewayId,
        gateway_token: tokens.gatewayToken,
      }),
    });
    if (!response.ok) {
      throw new Error(`Gateway session establishment failed with status ${response.status}`);
    }
    const payload = (await response.json()) as GatewaySessionPayload;
    await this.tokenStore.save({
      sessionId: payload.session_id,
      sessionToken: payload.session_token,
    });
    await this.checkpoints.save({
      sessionId: payload.session_id,
      sessionExpiresAt: payload.expires_at,
    });
    await persistDeviceIdentityScope(this.db, {
      gatewayId,
      tenantId: String(payload.scope.tenant_id || ""),
      workspaceId: String(payload.scope.workspace_id || ""),
      userId: String(payload.scope.user_id || ""),
    });
    return payload;
  }

  async connect(
    identity: GatewayDeviceIdentity,
    runtimeMetadata: GatewayRuntimeMetadata,
  ): Promise<GatewaySessionPayload> {
    const session = await this.createSession(identity.gatewayId);
    try {
      this.socket = await this.openSocket(session.ws_url);
      this.socket.onmessage = (event) => {
        void this.handleIncomingFrame(typeof event.data === "string" ? event.data : String(event.data));
      };
      this.socket.onclose = async (event) => {
        const reason =
          this.socketFailureReason ||
          String(event.reason || "").trim() ||
          `socket_closed:${Number(event.code || 1000)}`;
        this.socketFailureReason = null;
        this.heartbeatLoop.stop();
        this.activeScope = null;
        this.socket = null;
        await this.handleSocketFailure(reason);
        await this.personalChannelRuntimes.handleGatewayDisconnected(reason);
      };

      const connectResponse = await this.sendRequest(
        "gateway.connect",
        {
          gateway_version: runtimeMetadata.gatewayVersion,
          device_metadata: runtimeMetadata.deviceMetadata,
          requested_capabilities: runtimeMetadata.requestedCapabilities,
          journal_cursor: await this.journal.lastCursor(),
          checkpoint_cursor: (await this.checkpoints.load()).lastAck ?? 0,
        },
        session.scope,
        {
          replayable: false,
          persistOutbox: false,
          timeoutMs: this.requestTimeoutMsFor("gateway.connect", session.heartbeat_interval_seconds * 1000),
        },
      );
      if (!connectResponse.ok) {
        throw new Error(connectResponse.error?.message || "Gateway connect request was rejected.");
      }
      this.activeScope = session.scope;
      this.heartbeatLoop.start({
        intervalMs: session.heartbeat_interval_seconds * 1000,
        timeoutMs: this.requestTimeoutMsFor("gateway.heartbeat", session.heartbeat_interval_seconds * 1000),
        maxConsecutiveFailures: 2,
        sendHeartbeat: () => this.sendHeartbeat(session.scope, runtimeMetadata),
        onHeartbeatFailure: async (error, consecutiveFailures) => {
          await this.checkpoints.saveHealthState("degraded", {
            lastDisconnectReason: `heartbeat_failure:${error.message}`,
            lastOutboxError: error.message,
            pendingOutboxCount: (await this.outbox.summarize()).pending,
          });
          if (consecutiveFailures >= 2) {
            await this.terminateSocket(`heartbeat_failure:${error.message}`);
          }
        },
        onHeartbeatRecovered: async () => {
          await this.checkpoints.saveHealthState("online", {
            lastOutboxError: undefined,
          });
        },
      });
      await this.replayPendingOutbox(session.scope);
      await this.personalChannelRuntimes.handleGatewayConnected(session.scope);
      await this.checkpoints.markRecovered({
        sessionId: session.session_id,
        sessionExpiresAt: session.expires_at,
        healthState: "online",
        pendingOutboxCount: (await this.outbox.summarize()).pending,
      });
      this.reconnect.reset();
      return session;
    } catch (error) {
      this.heartbeatLoop.stop();
      this.activeScope = null;
      await this.tokenStore.clearSession();
      if (this.socket) {
        this.socketFailureReason = this.socketFailureReason || "connect_failed";
        try {
          this.socket.close();
        } catch {
          // ignore socket close failures during reconnect setup
        }
      }
      this.socket = null;
      throw error;
    }
  }

  async run(identity: GatewayDeviceIdentity, runtimeMetadata: GatewayRuntimeMetadata): Promise<void> {
    while (true) {
      try {
        await this.connect(identity, runtimeMetadata);
        await this.awaitSocketClose();
        await this.checkpoints.saveHealthState("reconnecting", {
          pendingOutboxCount: (await this.outbox.summarize()).pending,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const decision = classifyReconnectError(error);
        await this.journal.append("system", "gateway.reconnect.error", {
          message,
          retryable: decision.retryable,
          reason: decision.reason,
        });
        if (!decision.retryable) {
          throw error;
        }
        await this.checkpoints.saveHealthState("reconnecting", {
          lastDisconnectReason: message,
          pendingOutboxCount: (await this.outbox.summarize()).pending,
        });
      }
      const delayMs = this.reconnect.nextDelayMs();
      await sleep(delayMs);
    }
  }

  async sendHeartbeat(scope: GatewayScope, runtimeMetadata: GatewayRuntimeMetadata): Promise<void> {
    const checkpoints = await this.checkpoints.load();
    const outboxSummary = await this.outbox.summarize();
    await this.sendRequest(
      "gateway.heartbeat",
      {
        health_state: "online",
        journal_cursor: await this.journal.lastCursor(),
        checkpoint_cursor: checkpoints.lastAck ?? 0,
        queue_depth_summary: outboxSummary,
        capability_readiness: {
          requested: runtimeMetadata.requestedCapabilities,
        },
      },
      scope,
      {
        replayable: false,
        persistOutbox: false,
        timeoutMs: this.requestTimeoutMsFor("gateway.heartbeat", this.config.heartbeatIntervalMs),
      },
    );
    await this.checkpoints.saveHealthState("online", {
      lastOutboxError: undefined,
      pendingOutboxCount: outboxSummary.pending,
    });
  }

  async sendStateUpdate(scope: GatewayScope, payload: Record<string, unknown>): Promise<void> {
    await this.sendRequest("gateway.state.update", payload, scope);
  }

  async publishStateUpdate(payload: Record<string, unknown>): Promise<void> {
    if (!this.activeScope) {
      throw new Error("Gateway scope is not active.");
    }
    await this.sendStateUpdate(this.activeScope, payload);
  }

  async publishEvent(
    type: "channel.inbound",
    payload: GatewayChannelInboundPayload | Record<string, unknown>,
  ): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.activeScope) {
      throw new Error("Gateway socket is not connected.");
    }
    const checkpoints = await this.checkpoints.load();
    const nextSeq = Math.max(Number(checkpoints.lastClientSeq ?? 0), 0) + 1;
    const frame: GatewayEventEnvelope = {
      kind: "event",
      type,
      seq: nextSeq,
      ack: checkpoints.lastServerSeq ?? checkpoints.lastAck ?? 0,
      ts: new Date().toISOString(),
      scope: this.activeScope,
      payload: payload as Record<string, unknown>,
    };
    await this.journal.append("outbound", type, frame as unknown as Record<string, unknown>);
    await this.checkpoints.save({ lastClientSeq: nextSeq });
    this.socket.send(encodeFrame(frame));
  }

  async disconnect(scope: GatewayScope, reason = "shutdown"): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      await this.sendRequest("gateway.disconnect", { reason }, scope, {
        replayable: false,
        persistOutbox: false,
        timeoutMs: this.requestTimeoutMsFor("gateway.disconnect", this.config.heartbeatIntervalMs),
      });
    } finally {
      this.heartbeatLoop.stop();
      this.activeScope = null;
      this.socketFailureReason = reason;
      this.socket.close();
      this.socket = null;
      await this.tokenStore.clearSession();
      await this.personalChannelRuntimes.handleGatewayDisconnected(reason);
      await this.checkpoints.saveHealthState("offline", {
        lastDisconnectReason: reason,
        pendingOutboxCount: (await this.outbox.summarize()).pending,
        resumeReady: false,
      });
    }
  }

  private async openSocket(url: string): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.onopen = () => resolve(socket);
      socket.onerror = () => reject(new Error(`WebSocket connection failed for ${url}`));
    });
  }

  private async awaitSocketClose(): Promise<void> {
    if (!this.socket) {
      return;
    }
    await new Promise<void>((resolve) => {
      const socket = this.socket;
      if (!socket) {
        resolve();
        return;
      }
      const previousOnClose = socket.onclose;
      socket.onclose = (event) => {
        if (!previousOnClose) {
          resolve();
          return;
        }
        void Promise.resolve(previousOnClose.call(socket, event)).finally(resolve);
      };
    });
  }

  private async sendRequest(
    messageType: GatewayRequestEnvelope["type"],
    payload: Record<string, unknown>,
    scope: GatewayScope,
    options: RequestDispatchOptions = {},
  ): Promise<GatewayResponseEnvelope> {
    const replayable =
      options.replayable ??
      !["gateway.connect", "gateway.disconnect", "gateway.heartbeat"].includes(messageType);
    const persistOutbox = options.persistOutbox ?? replayable;
    const requestId = String(options.requestId || crypto.randomUUID()).trim();
    const frame: GatewayRequestEnvelope = {
      kind: "request",
      id: requestId,
      type: messageType,
      ts: new Date().toISOString(),
      scope,
      payload,
    };
    return this.dispatchRequestFrame(frame, {
      replayable,
      persistOutbox,
      timeoutMs: options.timeoutMs,
    });
  }

  private async dispatchRequestFrame(
    frame: GatewayRequestEnvelope,
    options: {
      replayable: boolean;
      persistOutbox: boolean;
      timeoutMs?: number;
    },
  ): Promise<GatewayResponseEnvelope> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Gateway socket is not connected.");
    }
    if (options.persistOutbox) {
      const current = await this.outbox.get(frame.id);
      if (current) {
        await this.outbox.markAttemptStarted(frame.id);
      } else {
        await this.outbox.enqueue(frame.id, frame.type, frame.payload, {
          replayable: options.replayable,
        });
      }
    }
    await this.journal.append("outbound", frame.type, frame as unknown as Record<string, unknown>);
    const responsePromise = this.trackPendingResponse(
      frame.id,
      frame.type,
      options.replayable,
      options.persistOutbox,
      options.timeoutMs,
    );
    try {
      this.socket.send(encodeFrame(frame));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.clearPendingResponse(frame.id, new Error(message));
      if (options.persistOutbox) {
        if (options.replayable) {
          await this.outbox.markForReplay(frame.id, message);
        } else {
          await this.outbox.markAttemptFailed(frame.id, message);
        }
      }
      throw error;
    }
    return responsePromise;
  }

  private trackPendingResponse(
    requestId: string,
    messageType: GatewayRequestEnvelope["type"],
    replayable: boolean,
    persistedOutbox: boolean,
    timeoutMs?: number,
  ): Promise<GatewayResponseEnvelope> {
    return new Promise<GatewayResponseEnvelope>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(requestId);
        const error = new Error(`Gateway request timed out: ${messageType}`);
        reject(error);
        void this.handleRequestTimeout(requestId, replayable, persistedOutbox, error);
      }, this.requestTimeoutMsFor(messageType, timeoutMs));
      timeout.unref?.();
      this.pendingResponses.set(requestId, {
        messageType,
        replayable,
        timeoutHandle: timeout,
        resolve,
        reject,
      });
    });
  }

  private clearPendingResponse(requestId: string, error: Error): void {
    const pending = this.pendingResponses.get(requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeoutHandle);
    this.pendingResponses.delete(requestId);
    pending.reject(error);
  }

  private async handleRequestTimeout(
    requestId: string,
    replayable: boolean,
    persistedOutbox: boolean,
    error: Error,
  ): Promise<void> {
    if (persistedOutbox) {
      if (replayable) {
        await this.outbox.markForReplay(requestId, error.message);
      } else {
        await this.outbox.markAttemptFailed(requestId, error.message);
      }
    }
    await this.checkpoints.saveHealthState("degraded", {
      lastDisconnectReason: `request_timeout:${requestId}`,
      lastOutboxError: error.message,
      pendingOutboxCount: (await this.outbox.summarize()).pending,
    });
    await this.terminateSocket(`request_timeout:${requestId}`);
  }

  private async terminateSocket(reason: string): Promise<void> {
    if (!this.socket) {
      return;
    }
    this.socketFailureReason = reason;
    try {
      this.socket.close();
    } catch {
      // ignore close races while the reconnect loop is already taking over
    }
  }

  private async replayPendingOutbox(scope: GatewayScope): Promise<void> {
    const replayableItems = await this.outbox.listReplayablePending();
    if (!replayableItems.length) {
      return;
    }
    await this.journal.append("system", "gateway.outbox.replay.start", {
      count: replayableItems.length,
    });
    for (const item of replayableItems) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        throw new Error("Gateway socket closed before pending outbox replay finished.");
      }
      await this.replayOutboxItem(item, scope);
    }
    await this.journal.append("system", "gateway.outbox.replay.complete", {
      count: replayableItems.length,
    });
  }

  private async replayOutboxItem(item: GatewayOutboxItem, scope: GatewayScope): Promise<void> {
    await this.outbox.markAttemptStarted(item.requestId);
    const frame: GatewayRequestEnvelope = {
      kind: "request",
      id: item.requestId,
      type: item.messageType as GatewayRequestEnvelope["type"],
      ts: new Date().toISOString(),
      scope,
      payload: dict(item.payload),
    };
    await this.dispatchRequestFrame(frame, {
      replayable: item.replayable,
      persistOutbox: true,
      timeoutMs: this.requestTimeoutMsFor(frame.type),
    });
  }

  private requestTimeoutMsFor(
    messageType: GatewayRequestEnvelope["type"],
    explicitTimeoutMs?: number,
  ): number {
    const minimum = Math.max(this.config.heartbeatIntervalMs, 10_000);
    if (Number.isFinite(explicitTimeoutMs) && Number(explicitTimeoutMs) > 0) {
      return Math.max(Number(explicitTimeoutMs), minimum);
    }
    if (messageType === "gateway.connect" || messageType === "gateway.disconnect") {
      return Math.max(minimum, 15_000);
    }
    if (messageType === "gateway.heartbeat") {
      return Math.max(minimum, 12_000);
    }
    return Math.max(minimum, 20_000);
  }

  private async handleSocketFailure(reason: string): Promise<void> {
    await this.tokenStore.clearSession();
    const pending = [...this.pendingResponses.entries()];
    this.pendingResponses.clear();
    for (const [requestId, entry] of pending) {
      clearTimeout(entry.timeoutHandle);
      entry.reject(new Error(`Gateway socket closed before response: ${reason}`));
      if (entry.replayable) {
        await this.outbox.markForReplay(requestId, `Gateway socket closed before response: ${reason}`);
      } else if (await this.outbox.get(requestId)) {
        await this.outbox.markAttemptFailed(requestId, `Gateway socket closed before response: ${reason}`);
      }
    }
    const summary = await this.outbox.summarize();
    await this.checkpoints.saveHealthState("offline", {
      lastDisconnectReason: reason,
      pendingOutboxCount: summary.pending + summary.failed,
      lastOutboxError: reason,
      resumeReady: false,
    });
  }

  private async handleIncomingFrame(raw: string): Promise<void> {
    const frame = decodeFrame(raw);
    if (frame.kind === "request") {
      await this.handleServerRequest(frame);
      return;
    }
    if (frame.kind === "response") {
      await this.journal.append("inbound", "response", frame as unknown as Record<string, unknown>);
      await this.outbox.acknowledge(frame.id);
      const pending = this.pendingResponses.get(frame.id);
      if (pending) {
        clearTimeout(pending.timeoutHandle);
        this.pendingResponses.delete(frame.id);
        pending.resolve(frame);
      }
      return;
    }
    if (frame.kind === "event") {
      await this.handleEvent(frame);
    }
  }

  private async handleServerRequest(frame: GatewayRequestEnvelope): Promise<void> {
    await this.journal.append("inbound", frame.type, frame as unknown as Record<string, unknown>);
    try {
      if (frame.type === "tool.invoke") {
        const payload = await this.capabilityRouter.handleToolInvoke(
          frame as unknown as GatewayRequestEnvelope<GatewayToolInvokePayload>,
        );
        await this.sendResponse(frame.id, true, payload);
        return;
      }
      if (frame.type === "tool.interrupt") {
        const payload = await this.capabilityRouter.handleToolInterrupt(
          frame as unknown as GatewayRequestEnvelope<GatewayToolInterruptPayload>,
        );
        await this.sendResponse(frame.id, true, payload);
        return;
      }
      if (frame.type === "channel.outbound") {
        const channelPayload = frame as unknown as GatewayRequestEnvelope<GatewayChannelOutboundPayload>;
        const channelKey = String(channelPayload.payload?.channel_key || "").trim();
        const runtime = this.personalChannelRuntimes.runtimeForChannel(channelKey);
        if (!runtime) {
          throw new Error(`Unsupported personal channel key: ${channelKey || "unknown"}`);
        }
        const payload = await runtime.handleChannelOutbound(channelPayload);
        await this.sendResponse(frame.id, true, payload ?? {});
        return;
      }
      await this.sendResponse(frame.id, false, undefined, {
        code: "unsupported_message_type",
        message: `Unsupported message type: ${frame.type}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.sendResponse(frame.id, false, undefined, {
        code: frame.type,
        message,
      });
    }
  }

  private async sendResponse(
    requestId: string,
    ok: boolean,
    payload?: Record<string, unknown>,
    error?: GatewayResponseEnvelope["error"],
  ): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Gateway socket is not connected.");
    }
    const frame: GatewayResponseEnvelope = {
      kind: "response",
      id: requestId,
      ok,
      ts: new Date().toISOString(),
    };
    if (ok) {
      frame.payload = payload ?? {};
    } else {
      frame.error = error ?? { message: "Unknown gateway request failure." };
    }
    await this.journal.append("outbound", "response", frame as unknown as Record<string, unknown>);
    this.socket.send(encodeFrame(frame));
  }

  private async handleEvent(frame: GatewayEventEnvelope): Promise<void> {
    await this.journal.append("inbound", frame.type, frame as unknown as Record<string, unknown>);
    await this.checkpoints.save({
      lastAck: frame.ack ?? frame.seq,
      lastServerSeq: frame.seq,
    });
    if (frame.type === "gateway.presence") {
      await this.db.writeJson("presence.json", frame.payload);
    }
    if (frame.type === "gateway.hello") {
      await this.db.writeJson("hello.json", frame.payload);
    }
  }
}

function dict(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...(value || {}) };
}
