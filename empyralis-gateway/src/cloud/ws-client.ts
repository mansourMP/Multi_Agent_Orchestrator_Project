import crypto from "crypto";

import { GatewayConfig } from "../config";
import { GatewayCheckpoints } from "../state/checkpoints";
import { GatewayStateDb } from "../state/db";
import { GatewayJournal } from "../state/journal";
import { GatewayOutbox } from "../state/outbox";
import { GatewayDeviceIdentity } from "../pairing/device-identity";
import { GatewayTokenStore } from "../pairing/token-store";
import { encodeFrame, decodeFrame } from "../protocol/codec";
import type {
  GatewayChannelInboundPayload,
  GatewayChannelOutboundPayload,
  GatewayEventEnvelope,
  GatewayFrame,
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
import { ReconnectBackoff, sleep } from "./reconnect";
import { GatewayCapabilityRouter } from "../supervisor/capability-router";
import { WhatsAppPersonalRuntime } from "../channels/whatsapp/runtime";
import { TelegramPersonalRuntime } from "../channels/telegram/runtime";

interface PendingResponse {
  resolve: (frame: GatewayResponseEnvelope) => void;
  reject: (error: Error) => void;
}

export class GatewayWsClient {
  private socket: WebSocket | null = null;
  private readonly heartbeatLoop = new HeartbeatLoop();
  private readonly reconnect: ReconnectBackoff;
  private readonly pendingResponses = new Map<string, PendingResponse>();
  private activeScope: GatewayScope | null = null;

  constructor(
    private readonly config: GatewayConfig,
    private readonly db: GatewayStateDb,
    private readonly journal: GatewayJournal,
    private readonly outbox: GatewayOutbox,
    private readonly checkpoints: GatewayCheckpoints,
    private readonly tokenStore: GatewayTokenStore,
    private readonly capabilityRouter: GatewayCapabilityRouter,
    private readonly whatsappRuntime?: WhatsAppPersonalRuntime,
    private readonly telegramRuntime?: TelegramPersonalRuntime,
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
      throw new Error(`Gateway registration failed with status ${response.status}`);
    }
    const payload = (await response.json()) as GatewayRegistrationPayload;
    await this.db.writeJson("registration.json", payload.gateway);
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
    return payload;
  }

  async connect(identity: GatewayDeviceIdentity, runtimeMetadata: GatewayRuntimeMetadata): Promise<GatewaySessionPayload> {
    const session = await this.createSession(identity.gatewayId);
    this.socket = await this.openSocket(session.ws_url);
    this.socket.onmessage = (event) => {
      void this.handleIncomingFrame(typeof event.data === "string" ? event.data : String(event.data));
    };
    this.socket.onclose = () => {
      this.heartbeatLoop.stop();
      this.activeScope = null;
      this.socket = null;
      void this.handleSocketFailure("socket_closed");
      void this.whatsappRuntime?.handleGatewayDisconnected("socket_closed");
      void this.telegramRuntime?.handleGatewayDisconnected("socket_closed");
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
    );
    if (!connectResponse.ok) {
      throw new Error(connectResponse.error?.message || "Gateway connect request was rejected.");
    }
    this.activeScope = session.scope;
    this.heartbeatLoop.start(
      () => this.sendHeartbeat(session.scope, runtimeMetadata),
      session.heartbeat_interval_seconds * 1000,
    );
    await this.whatsappRuntime?.handleGatewayConnected(session.scope);
    await this.telegramRuntime?.handleGatewayConnected(session.scope);
    await this.checkpoints.markRecovered({
      sessionId: session.session_id,
      sessionExpiresAt: session.expires_at,
      healthState: "online",
      pendingOutboxCount: (await this.outbox.summarize()).pending,
    });
    this.reconnect.reset();
    return session;
  }

  async run(identity: GatewayDeviceIdentity, runtimeMetadata: GatewayRuntimeMetadata): Promise<void> {
    while (true) {
      try {
        await this.connect(identity, runtimeMetadata);
        await this.awaitSocketClose();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.journal.append("system", "gateway.reconnect.error", { message });
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
    );
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
      await this.sendRequest("gateway.disconnect", { reason }, scope);
    } finally {
      this.heartbeatLoop.stop();
      this.activeScope = null;
      this.socket.close();
      this.socket = null;
      await this.tokenStore.clearSession();
      await this.whatsappRuntime?.handleGatewayDisconnected(reason);
      await this.telegramRuntime?.handleGatewayDisconnected(reason);
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
        if (previousOnClose) {
          previousOnClose.call(socket, event);
        }
        resolve();
      };
    });
  }

  private async sendRequest(
    messageType: GatewayRequestEnvelope["type"],
    payload: Record<string, unknown>,
    scope: GatewayScope,
  ): Promise<GatewayResponseEnvelope> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Gateway socket is not connected.");
    }
    const requestId = crypto.randomUUID();
    const frame: GatewayRequestEnvelope = {
      kind: "request",
      id: requestId,
      type: messageType,
      ts: new Date().toISOString(),
      scope,
      payload,
    };
    await this.outbox.enqueue(requestId, messageType, payload, {
      replayable: !["gateway.connect", "gateway.disconnect", "gateway.heartbeat"].includes(messageType),
    });
    await this.journal.append("outbound", messageType, frame as unknown as Record<string, unknown>);
    const responsePromise = new Promise<GatewayResponseEnvelope>((resolve, reject) => {
      this.pendingResponses.set(requestId, { resolve, reject });
    });
    this.socket.send(encodeFrame(frame));
    return responsePromise;
  }

  private async handleSocketFailure(reason: string): Promise<void> {
    const pending = [...this.pendingResponses.entries()];
    this.pendingResponses.clear();
    for (const [requestId, entry] of pending) {
      entry.reject(new Error(`Gateway socket closed before response: ${reason}`));
      await this.outbox.markAttemptFailed(requestId, `Gateway socket closed before response: ${reason}`);
    }
    const summary = await this.outbox.summarize();
    await this.checkpoints.save({
      healthState: "degraded",
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
        let payload: Record<string, unknown> | undefined;
        if (this.whatsappRuntime?.supportsChannel(channelKey)) {
          payload = await this.whatsappRuntime.handleChannelOutbound(channelPayload);
        } else if (this.telegramRuntime?.supportsChannel(channelKey)) {
          payload = await this.telegramRuntime.handleChannelOutbound(channelPayload);
        } else {
          throw new Error(`Unsupported personal channel key: ${channelKey || "unknown"}`);
        }
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
