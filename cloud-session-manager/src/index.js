import express from "express";
import pino from "pino";
import crypto from "crypto";
import { CONFIG } from "./config.js";
import { SessionPool } from "./session-pool.js";
import { createRoutes } from "./api/routes.js";

const logger = pino({
  name: "cloud-session-manager",
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
  // Stage 5: Redact sessionString and other secrets from ALL log output
  redact: {
    paths: [
      "sessionString",
      "_sessionString",
      "session_string",
      "phoneNumber",
      "password",
      "login_code",
      "phoneCodeHash",
      "_phoneCodeHash",
      "code",
      "ciphertext",
      "plaintext",
      "api_hash",
      "apiHash",
    ],
    censor: "***REDACTED***",
  },
});

// API secret middleware — all mutating endpoints require HMAC-signed requests
function apiSecretMiddleware(req, res, next) {
  // GET /health is public
  if (req.method === "GET" && req.path === "/health") {
    return next();
  }

  if (!CONFIG.apiSecret) {
    // No secret configured — allow all requests (dev mode)
    return next();
  }

  const authHeader = String(req.headers["x-api-signature"] || "").trim();
  if (!authHeader) {
    return res.status(401).json({ error: "missing_api_signature" });
  }

  const [timestamp, signature] = authHeader.split(":");
  if (!timestamp || !signature) {
    return res.status(401).json({ error: "invalid_api_signature_format" });
  }

  // Reject timestamps older than 5 minutes
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    return res.status(401).json({ error: "api_signature_expired" });
  }

  const payload = `${req.method}:${req.path}:${timestamp}`;
  const expected = crypto.createHmac("sha256", CONFIG.apiSecret).update(payload).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: "invalid_api_signature" });
  }

  next();
}

async function main() {
  const pool = new SessionPool({ logger });

  const app = express();
  app.use(express.json());
  app.use(apiSecretMiddleware);

  const routes = createRoutes(pool, logger);
  app.use(routes);

  const server = app.listen(CONFIG.apiPort, () => {
    logger.info({ port: CONFIG.apiPort, maxSessions: CONFIG.maxSessions }, "cloud-session-manager started");
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, "shutting down");
    server.close();
    await pool.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "startup failed");
  process.exit(1);
});
