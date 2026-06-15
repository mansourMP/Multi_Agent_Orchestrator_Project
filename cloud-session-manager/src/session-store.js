import Redis from "ioredis";
import { CONFIG } from "./config.js";
import { encrypt, decrypt } from "./kms.js";

/**
 * CloudSessionStore — encrypted session string storage in Redis.
 *
 * Key pattern: session:{sessionId}:auth
 * Value: KMS-encrypted session string (base64 blob, never plaintext in Redis)
 *
 * Every read/write/delete is audit-logged to a separate audit key:
 *   session:{sessionId}:audit  (Redis list, append-only)
 */

export class CloudSessionStore {
  /** @param {string} sessionId */
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.authKey = `session:${sessionId}:auth`;
    this.auditKey = `session:${sessionId}:audit`;
    this.redis = new Redis(CONFIG.sessionRedisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
  }

  async connect() {
    if (this.redis.status !== "ready" && this.redis.status !== "connecting") {
      await this.redis.connect();
    }
  }

  async disconnect() {
    if (this.redis.status !== "end") {
      await this.redis.quit().catch(() => {});
    }
  }

  /**
   * Save an encrypted session string to Redis.
   * Plaintext NEVER touches Redis — encrypted before write.
   */
  async saveSessionString(plaintext) {
    await this.connect();
    const ciphertext = await encrypt(plaintext);
    await this.redis.set(this.authKey, ciphertext);
    await this.redis.expire(this.authKey, 86400 * 30); // 30-day TTL
    await this._audit("save", { ciphertextLength: ciphertext.length });
  }

  /**
   * Load and decrypt a session string from Redis.
   * Returns plaintext (decrypted on read).
   */
  async loadSessionString() {
    await this.connect();
    const ciphertext = await this.redis.get(this.authKey);
    if (!ciphertext) return null;
    const plaintext = await decrypt(ciphertext);
    await this._audit("load", { ciphertextLength: String(ciphertext).length });
    return plaintext;
  }

  /**
   * Delete the encrypted session string from Redis.
   */
  async deleteSessionString() {
    await this.connect();
    const existed = await this.redis.del(this.authKey);
    await this._audit("delete", { existed: existed > 0 });
    return existed > 0;
  }

  /**
   * Check if a session string exists in Redis.
   */
  async hasSessionString() {
    await this.connect();
    return (await this.redis.exists(this.authKey)) > 0;
  }

  // ── Audit ────────────────────────────────────────────────────

  async _audit(operation, metadata = {}) {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      operation,
      sessionId: this.sessionId,
      ...metadata,
    });
    // Append to audit list, trim to last 1000 entries
    await this.redis.lpush(this.auditKey, entry);
    await this.redis.ltrim(this.auditKey, 0, 999);
    await this.redis.expire(this.auditKey, 86400 * 90); // 90-day TTL
  }

  /**
   * Read the audit log for this session.
   */
  async getAuditLog(limit = 50) {
    await this.connect();
    const entries = await this.redis.lrange(this.auditKey, 0, limit - 1);
    return entries.map(e => JSON.parse(e));
  }
}
