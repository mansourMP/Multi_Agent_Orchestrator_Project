import pino from "pino";

import { GatewayStateDb } from "../../state/db";
import type {
  GatewayChannelInboundPayload,
  GatewayChannelOutboundPayload,
  GatewayRequestEnvelope,
  GatewayScope,
  GatewayToolInvokePayload,
} from "../../protocol/types";
import { buildTelegramConnectedState, buildTelegramPreflightState, loadTelegramLoginConfig, type TelegramLinkedAccount, type TelegramLoginConfig } from "./login";
import { mapTelegramInboundMessage, mapTelegramOutboundResult, type TelegramInboundMessage } from "./message-mapper";
import { TelegramOutboundStore, TelegramTypingKeepalive, type TelegramChatAction } from "./outbound";
import {
  DEFAULT_TELEGRAM_RECONNECT_POLICY,
  computeTelegramReconnectDelay,
  resolveTelegramReconnectState,
} from "./reconnect";
import {
  TELEGRAM_PERSONAL_CHANNEL_KEY,
  TELEGRAM_PERSONAL_PROVIDER,
  TelegramSessionStore,
} from "./session-store";
import { PersonalChannelConfigStore } from "../personal-config-store";

type DynamicImport = <T>(specifier: string) => Promise<T>;
const dynamicImport = new Function("specifier", "return import(specifier)") as DynamicImport;

export interface TelegramGatewayPublisher {
  publishEvent: (type: "channel.inbound", payload: GatewayChannelInboundPayload) => Promise<void>;
  publishStateUpdate: (payload: Record<string, unknown>) => Promise<void>;
}

export interface TelegramAdapterClient {
  setMessageHandler: (handler: (message: TelegramInboundMessage) => void | Promise<void>) => void;
  sendMessage: (
    remoteJid: string,
    text: string,
    replyToExternalMessageId?: string,
  ) => Promise<Record<string, unknown> | undefined>;
  sendChatAction?: (remoteJid: string, action: TelegramChatAction) => Promise<void> | void;
  disconnect?: () => Promise<void> | void;
  exportSessionString?: () => Promise<string> | string;
}

export interface TelegramRuntimeAdapter {
  connect: (
    config: TelegramLoginConfig & { sessionString?: string },
  ) => Promise<{ client: TelegramAdapterClient; account?: TelegramLinkedAccount }>;
}

export interface TelegramRuntimeDependencies {
  publisher?: TelegramGatewayPublisher;
  adapter?: TelegramRuntimeAdapter;
}

interface TelegramDraftState {
  remoteJid: string;
  idempotencyKey: string;
  replyToExternalMessageId?: string;
  text: string;
  sequence: number;
}

type ChannelOutboundOperation = NonNullable<GatewayChannelOutboundPayload["operation"]>;

function normalizeChannelOutboundOperation(operation: unknown): ChannelOutboundOperation {
  const value = String(operation || "").trim();
  if (value === "draft_start" || value === "draft_delta" || value === "draft_final") {
    return value;
  }
  return "send_final";
}

export class TelegramPersonalRuntime {
  private readonly configStore: PersonalChannelConfigStore;
  private readonly sessionStore: TelegramSessionStore;
  private readonly outboundStore: TelegramOutboundStore;
  private readonly logger = pino({ level: "silent" });
  private publisher?: TelegramGatewayPublisher;
  private adapter?: TelegramRuntimeAdapter;
  private client: TelegramAdapterClient | null = null;
  private started = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectAttempts = 0;
  private readonly drafts = new Map<string, TelegramDraftState>();

  constructor(
    private readonly db: GatewayStateDb,
    dependencies: TelegramRuntimeDependencies = {},
  ) {
    this.configStore = new PersonalChannelConfigStore(db);
    this.sessionStore = new TelegramSessionStore(db);
    this.outboundStore = new TelegramOutboundStore(db);
    this.publisher = dependencies.publisher;
    this.adapter = dependencies.adapter;
  }

  requestedCapabilities(): string[] {
    return [
      "channel.telegram.personal",
      "channel.telegram.personal.inbound",
      "channel.telegram.personal.outbound",
      "channel.telegram.personal.configure",
    ];
  }

  supportsCapability(capabilityId: string): boolean {
    return String(capabilityId || "").trim() === "channel.telegram.personal.configure";
  }

  async handleCapabilityInvoke(
    frame: GatewayRequestEnvelope<GatewayToolInvokePayload>,
  ): Promise<Record<string, unknown>> {
    const payload = frame.payload;
    const capabilityId = String(payload.capability_id || "").trim();
    if (capabilityId !== "channel.telegram.personal.configure") {
      throw new Error(`Unsupported Telegram personal capability: ${capabilityId || "unknown"}`);
    }
    const argumentsPayload =
      payload.arguments && typeof payload.arguments === "object" && !Array.isArray(payload.arguments)
        ? (payload.arguments as Record<string, unknown>)
        : {};
    return this.handleConfigure(argumentsPayload);
  }

  supportsChannel(channelKey: string): boolean {
    return String(channelKey || "").trim() === TELEGRAM_PERSONAL_CHANNEL_KEY;
  }

  setPublisher(publisher: TelegramGatewayPublisher): void {
    this.publisher = publisher;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    await this.connectClient();
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await Promise.resolve(this.client?.disconnect?.());
    this.client = null;
  }

  async handleGatewayConnected(_scope: GatewayScope): Promise<void> {
    await this.flushState();
  }

  async handleGatewayDisconnected(_reason: string): Promise<void> {
    return;
  }

  async handleChannelOutbound(
    frame: GatewayRequestEnvelope<GatewayChannelOutboundPayload>,
  ): Promise<Record<string, unknown>> {
    const payload = frame.payload;
    if (!this.supportsChannel(String(payload.channel_key || ""))) {
      throw new Error(`Unsupported personal channel key: ${payload.channel_key}`);
    }
    if (!this.client) {
      throw new Error("Telegram personal runtime is not connected.");
    }
    const operation = normalizeChannelOutboundOperation(payload.operation);
    if (operation !== "send_final") {
      return this.handleDraftOutbound(frame, operation);
    }
    return this.sendFinalOutbound(payload);
  }

  private async handleDraftOutbound(
    frame: GatewayRequestEnvelope<GatewayChannelOutboundPayload>,
    operation: Exclude<ChannelOutboundOperation, "send_final">,
  ): Promise<Record<string, unknown>> {
    const payload = frame.payload;
    const draftId = String(payload.draft_id || payload.idempotency_key || "").trim();
    const remoteJid = String(payload.remote_jid || "").trim();
    const idempotencyKey = String(payload.idempotency_key || "").trim();
    const sequence = Number.isFinite(Number(payload.sequence)) ? Number(payload.sequence) : 0;
    if (!draftId || !remoteJid || !idempotencyKey) {
      throw new Error("channel.outbound draft operation requires draft_id, idempotency_key, and remote_jid.");
    }
    const previous = this.drafts.get(draftId);
    if (previous && sequence < previous.sequence) {
      return {
        channel_key: TELEGRAM_PERSONAL_CHANNEL_KEY,
        provider: TELEGRAM_PERSONAL_PROVIDER,
        idempotency_key: idempotencyKey,
        draft_id: draftId,
        operation,
        delivered: false,
        stale: true,
      };
    }
    const nextText =
      operation === "draft_delta"
        ? `${previous?.text ?? ""}${String(payload.delta || "")}`
        : String(payload.text || previous?.text || payload.delta || "");
    const draft: TelegramDraftState = {
      remoteJid,
      idempotencyKey,
      replyToExternalMessageId: String(payload.reply_to_external_message_id || previous?.replyToExternalMessageId || "").trim() || undefined,
      text: nextText,
      sequence,
    };
    this.drafts.set(draftId, draft);
    if (operation !== "draft_final") {
      return {
        channel_key: TELEGRAM_PERSONAL_CHANNEL_KEY,
        provider: TELEGRAM_PERSONAL_PROVIDER,
        idempotency_key: idempotencyKey,
        draft_id: draftId,
        operation,
        delivered: false,
        text: draft.text,
      };
    }
    try {
      return await this.sendFinalOutbound({
        ...payload,
        idempotency_key: idempotencyKey,
        remote_jid: remoteJid,
        text: draft.text,
        reply_to_external_message_id: draft.replyToExternalMessageId,
        operation: "send_final",
      });
    } finally {
      this.drafts.delete(draftId);
    }
  }

  private async sendFinalOutbound(payload: GatewayChannelOutboundPayload): Promise<Record<string, unknown>> {
    const client = this.client;
    if (!client) {
      throw new Error("Telegram personal runtime is not connected.");
    }
    const idempotencyKey = String(payload.idempotency_key || "").trim();
    const remoteJid = String(payload.remote_jid || "").trim();
    const text = String(payload.text || "").trim();
    if (!idempotencyKey || !remoteJid || !text) {
      throw new Error("channel.outbound requires idempotency_key, remote_jid, and text.");
    }
    const existing = await this.outboundStore.beginSend(idempotencyKey, {
      remoteJid,
      text,
      replyToExternalMessageId: String(payload.reply_to_external_message_id || "").trim() || undefined,
    });
    if (existing.status === "delivered") {
      return {
        channel_key: TELEGRAM_PERSONAL_CHANNEL_KEY,
        provider: TELEGRAM_PERSONAL_PROVIDER,
        idempotency_key: existing.idempotencyKey,
        external_message_id: existing.externalMessageId,
        remote_jid: existing.remoteJid,
        text: existing.text,
        delivered: true,
      };
    }
    await this.outboundStore.markAttemptStarted(idempotencyKey);
    const typing = new TelegramTypingKeepalive(
      client.sendChatAction
        ? (action) => client.sendChatAction?.(remoteJid, action)
        : undefined,
    );
    await typing.start();
    try {
      const response = await client.sendMessage(
        remoteJid,
        text,
        String(payload.reply_to_external_message_id || "").trim() || undefined,
      );
      const mapped = mapTelegramOutboundResult(
        {
          idempotencyKey,
          remoteJid,
          text,
          replyToExternalMessageId: String(payload.reply_to_external_message_id || "").trim() || undefined,
        },
        response,
      );
      await this.outboundStore.markDelivered(
        idempotencyKey,
        String(mapped.external_message_id || "").trim() || undefined,
      );
      return mapped;
    } finally {
      await typing.stop();
    }
  }

  private async connectClient(): Promise<void> {
    if (this.connectPromise) {
      return this.connectPromise;
    }
    const task = this.connectClientInternal().finally(() => {
      if (this.connectPromise === task) {
        this.connectPromise = null;
      }
    });
    this.connectPromise = task;
    return task;
  }

  private async connectClientInternal(): Promise<void> {
    await this.sessionStore.ensureRuntimeDir();
    const loginConfig = loadTelegramLoginConfig();
    const persistedConfig = await this.configStore.loadTelegramConfig();
    const persistedSession = await this.sessionStore.loadSessionString();
    const resolvedConfig: TelegramLoginConfig & { sessionString?: string } = {
      ...loginConfig,
      apiId: persistedConfig.apiId ?? loginConfig.apiId,
      apiHash: persistedConfig.apiHash ?? loginConfig.apiHash,
      phoneNumber: persistedConfig.phoneNumber ?? loginConfig.phoneNumber,
      loginCode: persistedConfig.loginCode ?? loginConfig.loginCode,
      password: persistedConfig.password ?? loginConfig.password,
      sessionString: persistedSession || loginConfig.sessionString,
    };
    const preflight = buildTelegramPreflightState(resolvedConfig);
    if (preflight) {
      await this.sessionStore.save(preflight);
      await this.flushState();
      return;
    }

    await this.sessionStore.save({
      status: "connecting",
      loginHint: undefined,
      retryable: true,
    });
    await this.flushState();

    try {
      const adapter = await this.getAdapter();
      const { client, account } = await adapter.connect(resolvedConfig);
      this.client = client;
      this.client.setMessageHandler((message) => {
        void this.handleInboundMessage(message);
      });
      const exportedSession = await Promise.resolve(this.client.exportSessionString?.());
      if (exportedSession) {
        await this.sessionStore.saveSessionString(exportedSession);
      }
      this.reconnectAttempts = 0;
      await this.configStore.clearTelegramSecrets();
      await this.sessionStore.save(buildTelegramConnectedState(account || {}));
      await this.flushState();
    } catch (error) {
      const reconnectState = resolveTelegramReconnectState(error);
      if (!reconnectState.shouldReconnect) {
        await this.sessionStore.clearSessionString();
      }
      await this.sessionStore.save({
        status: reconnectState.status,
        loginHint: reconnectState.loginHint,
        retryable: reconnectState.shouldReconnect,
        lastDisconnectReason: reconnectState.reason,
        lastDisconnectCode: reconnectState.statusCode,
      });
      await this.flushState();
      if (reconnectState.shouldReconnect && this.started) {
        this.scheduleReconnect();
      }
    }
  }

  private async handleInboundMessage(message: TelegramInboundMessage): Promise<void> {
    const mapped = mapTelegramInboundMessage(message);
    if (!mapped || mapped.message.from_me) {
      return;
    }
    await this.publishInbound(mapped);
  }

  private async publishInbound(payload: GatewayChannelInboundPayload): Promise<void> {
    try {
      await this.publisher?.publishEvent("channel.inbound", payload);
    } catch {
      // Durable replay is handled by the shared gateway journal/outbox path.
    }
  }

  private async flushState(): Promise<void> {
    if (!this.publisher) {
      return;
    }
    const snapshot = await this.sessionStore.load();
    try {
      await this.publisher.publishStateUpdate(
        this.sessionStore.toGatewayStatePayload(snapshot),
      );
    } catch {
      return;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    const attempt = this.reconnectAttempts;
    if (attempt >= DEFAULT_TELEGRAM_RECONNECT_POLICY.maxAttempts) {
      void this.sessionStore.save({
        status: "disconnected",
        retryable: false,
        lastDisconnectReason: "telegram_reconnect_attempts_exhausted",
      }).then(() => this.flushState());
      return;
    }
    const delayMs = computeTelegramReconnectDelay(attempt);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectClient();
    }, delayMs);
  }

  private async getAdapter(): Promise<TelegramRuntimeAdapter> {
    if (this.adapter) {
      return this.adapter;
    }
    const telegram = await dynamicImport<Record<string, unknown>>("telegram");
    const sessions = await dynamicImport<Record<string, unknown>>("telegram/sessions");
    const TelegramClient = telegram.TelegramClient as new (...args: unknown[]) => any;
    const NewMessage = telegram.NewMessage as new (...args: unknown[]) => any;
    const StringSession = sessions.StringSession as new (value: string) => any;
    if (!TelegramClient || !StringSession) {
      throw new Error("telegram_package_missing");
    }

    this.adapter = {
      connect: async (config) => {
        const sessionString = String(config.sessionString || "").trim();
        const apiId = Number(config.apiId);
        const apiHash = String(config.apiHash || "").trim();
        const client = new TelegramClient(
          new StringSession(sessionString),
          apiId,
          apiHash,
          { connectionRetries: 5, baseLogger: this.logger },
        );
        const phoneNumber = String(config.phoneNumber || "").trim();
        const loginCode = String(config.loginCode || "").trim();
        const password = String(config.password || "").trim();
        await client.start({
          phoneNumber: async () => {
            if (!phoneNumber) {
              throw new Error("phone_number_required");
            }
            return phoneNumber;
          },
          phoneCode: async () => {
            if (!loginCode) {
              throw new Error("login_code_required");
            }
            return loginCode;
          },
          password: async () => {
            if (!password) {
              throw new Error("password_required");
            }
            return password;
          },
          onError: (error: unknown) => {
            throw error;
          },
        });

        let messageHandler: (message: TelegramInboundMessage) => void | Promise<void> = () => undefined;
        client.addEventHandler(
          async (event: any) => {
            const rawMessage = event?.message;
            const text = String(rawMessage?.message ?? "").trim();
            const externalMessageId = String(rawMessage?.id ?? "").trim();
            if (!text || !externalMessageId) {
              return;
            }
            const chat = typeof event?.getChat === "function" ? await event.getChat() : undefined;
            const sender = typeof event?.getSender === "function" ? await event.getSender() : undefined;
            const remoteJid = String(
              chat?.username
              ?? chat?.id
              ?? rawMessage?.peerId?.channelId
              ?? rawMessage?.peerId?.chatId
              ?? rawMessage?.peerId?.userId
              ?? "",
            ).trim();
            if (!remoteJid) {
              return;
            }
            const senderJid = String(sender?.username ?? sender?.id ?? remoteJid).trim() || undefined;
            const pushName = (
              [sender?.firstName, sender?.lastName].filter(Boolean).join(" ").trim()
              || String(sender?.username ?? chat?.title ?? "").trim()
              || undefined
            );
            await messageHandler({
              externalMessageId,
              remoteJid,
              senderJid,
              pushName,
              text,
              receivedAt: new Date(
                Number(rawMessage?.date ?? Math.floor(Date.now() / 1000)) * 1000,
              ).toISOString(),
              fromMe: Boolean(rawMessage?.out),
            });
          },
          NewMessage ? new NewMessage({ incoming: true }) : undefined,
        );
        const me = await client.getMe();
        const account: TelegramLinkedAccount = {
          userId: String(me?.id ?? "").trim() || undefined,
          username: String(me?.username ?? "").trim() || undefined,
          phone: String(me?.phone ?? "").trim() || undefined,
          name: (
            [me?.firstName, me?.lastName].filter(Boolean).join(" ").trim()
            || String(me?.username ?? "").trim()
            || undefined
          ),
        };
        return {
          account,
          client: {
            setMessageHandler: (handler) => {
              messageHandler = handler;
            },
            sendMessage: async (remoteJid, text, replyToExternalMessageId) => {
              const sendArgs: Record<string, unknown> = { message: text };
              const numericReplyTo = Number.parseInt(String(replyToExternalMessageId || "").trim(), 10);
              if (replyToExternalMessageId) {
                sendArgs.replyTo = Number.isFinite(numericReplyTo) ? numericReplyTo : replyToExternalMessageId;
              }
              const sent = await client.sendMessage(remoteJid, sendArgs);
              return {
                externalMessageId: String(sent?.id ?? "").trim() || undefined,
                remoteJid: String(sent?.chatId ?? remoteJid).trim() || remoteJid,
              };
            },
            sendChatAction: async (remoteJid, action) => {
              const sendChatAction = (client as { sendChatAction?: (...args: unknown[]) => Promise<unknown> | unknown })
                .sendChatAction;
              if (typeof sendChatAction === "function") {
                await Promise.resolve(sendChatAction.call(client, remoteJid, action));
                return;
              }
              const Api = (telegram as { Api?: Record<string, any> }).Api;
              if (action !== "typing") {
                return;
              }
              const actionClass = Api?.SendMessageTypingAction;
              const requestClass = Api?.messages?.SetTyping;
              if (!actionClass || !requestClass || typeof client.invoke !== "function") {
                return;
              }
              await client.invoke(
                new requestClass({
                  peer: remoteJid,
                  action: new actionClass({}),
                }),
              );
            },
            disconnect: () => client.disconnect(),
            exportSessionString: () => client.session?.save?.(),
          },
        };
      },
    };
    return this.adapter;
  }

  private async handleConfigure(argumentsPayload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const patch: {
      apiId?: number;
      apiHash?: string;
      phoneNumber?: string;
      loginCode?: string;
      password?: string;
    } = {};
    if ("api_id" in argumentsPayload) {
      const raw = String(argumentsPayload.api_id ?? "").trim();
      if (!raw) {
        throw new Error("api_id is required when provided.");
      }
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("api_id must be a positive integer.");
      }
      patch.apiId = parsed;
    }
    if ("api_hash" in argumentsPayload) {
      const token = String(argumentsPayload.api_hash ?? "").trim();
      if (!token) {
        throw new Error("api_hash is required when provided.");
      }
      patch.apiHash = token;
    }
    if ("phone_number" in argumentsPayload) {
      const token = String(argumentsPayload.phone_number ?? "").trim();
      if (!token) {
        throw new Error("phone_number is required when provided.");
      }
      patch.phoneNumber = token;
    }
    if ("login_code" in argumentsPayload) {
      const token = String(argumentsPayload.login_code ?? "").trim();
      if (!token) {
        throw new Error("login_code is required when provided.");
      }
      patch.loginCode = token;
    }
    if ("password" in argumentsPayload) {
      const token = String(argumentsPayload.password ?? "").trim();
      if (!token) {
        throw new Error("password is required when provided.");
      }
      patch.password = token;
    }
    if (Object.keys(patch).length === 0) {
      throw new Error("At least one Telegram personal setup field is required.");
    }

    const storedConfig = await this.configStore.patchTelegramConfig(patch);
    let reconnectRequested = false;
    const currentState = await this.sessionStore.load();
    if (this.started && currentState.status !== "connected") {
      reconnectRequested = true;
      await this.reconnectForConfigUpdate();
    } else {
      await this.flushState();
    }
    const nextState = await this.sessionStore.load();
    return {
      status: "updated",
      reconnect_requested: reconnectRequested,
      config: {
        has_api_id: Boolean(storedConfig.apiId),
        has_api_hash: Boolean(storedConfig.apiHash),
        has_phone_number: Boolean(storedConfig.phoneNumber),
      },
      state: {
        status: nextState.status,
        login_hint: nextState.loginHint,
      },
    };
  }

  private async reconnectForConfigUpdate(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    await Promise.resolve(this.client?.disconnect?.());
    this.client = null;
    await this.connectClient();
  }
}
