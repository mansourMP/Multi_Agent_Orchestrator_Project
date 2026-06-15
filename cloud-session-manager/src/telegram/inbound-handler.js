import { CONFIG } from "../config.js";
import { buildSignedInbound } from "./hmac.js";

/**
 * InboundHandler subscribes to NewMessage events on a GramJS client
 * and forwards normalized messages to the Empyralis backend.
 */
export class InboundHandler {
  constructor({ sessionId, workspaceId, linkedUserId, logger }) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId || "default";
    this.linkedUserId = linkedUserId;
    this.logger = logger;
    this.messageCount = 0;
  }

  /**
   * Handle a normalized inbound message from GramJS.
   * The normalized format has { channel_key, provider, message: { text, from_me, ... } }.
   */
  async handleMessage(normalized) {
    try {
      // Unwrap from normalized format
      const msg = normalized?.message || normalized || {};
      const text = String(msg.text || "").trim();
      if (!text) return { skipped: true, reason: "empty_text" };

      // Skip our own messages to avoid echo loops
      const fromMe = Boolean(msg.from_me ?? normalized?.fromMe ?? false);
      if (fromMe) {
        this.logger?.info?.({ text: text.slice(0, 40) }, "skipping own message (fromMe)");
        return { skipped: true, reason: "from_me" };
      }

      this.messageCount++;

      const messageId = String(msg.external_message_id || msg.externalMessageId || `${Date.now()}-${this.messageCount}`).trim();
      const senderId = String(msg.sender_jid || msg.senderJid || msg.remote_jid || msg.remoteJid || "").trim();
      const senderName = String(msg.push_name || msg.pushName || "").trim();
      const receivedAt = String(msg.received_at || msg.receivedAt || new Date().toISOString()).trim();

      const body = buildSignedInbound({
        sessionId: this.sessionId,
        messageId,
        channelKey: "telegram_personal",
        senderId,
        senderName,
        text,
        timestamp: receivedAt,
      });

      const backendUrl = `${CONFIG.backendUrl}/api/personal-channels/cloud/inbound`;
      this.logger?.info?.(
        { messageId, text: text.slice(0, 60) },
        "forwarding inbound message to backend"
      );

      const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": body.signature,
          "X-Session-Id": this.sessionId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        this.logger?.warn?.(
          { status: response.status, body: responseBody },
          "backend rejected inbound message"
        );
        return { forwarded: false, status: response.status, error: responseBody };
      }

      this.logger?.info?.(
        { messageId, status: response.status, reply: String(responseBody?.reply_text || "").slice(0, 60) },
        "inbound message forwarded — reply received"
      );
      return { forwarded: true, status: response.status, body: responseBody };

    } catch (err) {
      this.logger?.error?.({ err: err?.message }, "failed to forward inbound message");
      return { forwarded: false, error: err?.message || "unknown_error" };
    }
  }
}
