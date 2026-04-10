type PairingPacketV2 = {
  version: 2;
  runtimeUrl: string;
  workspaceId: string;
  platformUrl?: string;
  generatedAt: string;
  expiresAt: string;
  pairingId: string;
  label?: string;
};

const PAIRING_PREFIX_V1 = "EMP1";
const PAIRING_PREFIX_V2 = "EMP2";
const BASE64_URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const DEFAULT_PAIRING_TTL_MS = 15 * 60 * 1000;

function normalizeUrl(value: string | undefined) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function utf8Encode(input: string) {
  return new TextEncoder().encode(input);
}

function utf8Decode(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

function base64UrlEncode(bytes: Uint8Array) {
  let output = "";
  let index = 0;

  while (index < bytes.length) {
    const a = bytes[index++] ?? 0;
    const bIndex = index;
    const b = bytes[index++] ?? 0;
    const cIndex = index;
    const c = bytes[index++] ?? 0;
    const hasB = bIndex < bytes.length + 1;
    const hasC = cIndex < bytes.length + 1;

    output += BASE64_URL_ALPHABET[a >> 2];
    output += BASE64_URL_ALPHABET[((a & 0x03) << 4) | (b >> 4)];
    if (hasB) {
      output += BASE64_URL_ALPHABET[((b & 0x0f) << 2) | (c >> 6)];
    }
    if (hasC) {
      output += BASE64_URL_ALPHABET[c & 0x3f];
    }
  }

  const remainder = bytes.length % 3;
  if (remainder === 1) return output.slice(0, -2);
  if (remainder === 2) return output.slice(0, -1);
  return output;
}

function base64UrlDecode(input: string) {
  const clean = String(input || "").trim().replace(/=/g, "");
  if (!clean) return new Uint8Array();
  let bits = 0;
  let bitLength = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const value = BASE64_URL_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error("Pairing code contains invalid characters.");
    }
    bits = (bits << 6) | value;
    bitLength += 6;
    if (bitLength >= 8) {
      bitLength -= 8;
      bytes.push((bits >> bitLength) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function createPairingId() {
  return `pair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildPacket(payload: {
  runtimeUrl: string;
  workspaceId: string;
  platformUrl?: string;
  label?: string;
  ttlMs?: number;
}): PairingPacketV2 {
  const runtimeUrl = normalizeUrl(payload.runtimeUrl);
  const workspaceId = String(payload.workspaceId || "").trim();
  const platformUrl = normalizeUrl(payload.platformUrl);
  if (!runtimeUrl) throw new Error("Runtime URL is required to build a pairing packet.");
  if (!workspaceId) throw new Error("Workspace ID is required to build a pairing packet.");
  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + Math.max(60_000, Number(payload.ttlMs || DEFAULT_PAIRING_TTL_MS)));
  return {
    version: 2,
    runtimeUrl,
    workspaceId,
    platformUrl: platformUrl || undefined,
    generatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    pairingId: createPairingId(),
    label: String(payload.label || "").trim() || undefined,
  };
}

function parsePairingPacket(packet: unknown) {
  const record = packet && typeof packet === "object" ? (packet as Record<string, unknown>) : {};
  const version = Number(record.version || 1);
  const runtimeUrl = normalizeUrl(typeof record.runtimeUrl === "string" ? record.runtimeUrl : "");
  const workspaceId = String(record.workspaceId || "").trim();
  const platformUrl = normalizeUrl(typeof record.platformUrl === "string" ? record.platformUrl : "");
  if (version !== 1 && version !== 2) throw new Error("Unsupported pairing packet version.");
  if (!runtimeUrl) throw new Error("Pairing packet is missing the runtime URL.");
  if (!workspaceId) throw new Error("Pairing packet is missing the workspace ID.");
  const pairingId = String(record.pairingId || "").trim() || undefined;
  const label = String(record.label || "").trim() || undefined;
  const rawExpiresAt = typeof record.expiresAt === "string" ? record.expiresAt.trim() : "";
  const expiresAt = rawExpiresAt
    ? (() => {
        const parsed = Date.parse(rawExpiresAt);
        if (Number.isNaN(parsed)) {
          throw new Error("Pairing packet is missing a valid expiry.");
        }
        return new Date(parsed).toISOString();
      })()
    : undefined;
  if (version === 2) {
    if (!pairingId) throw new Error("Pairing packet is missing the pairing ID.");
    if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
      throw new Error("Pairing packet is missing a valid expiry.");
    }
    if (Date.parse(expiresAt) < Date.now()) {
      throw new Error("Pairing packet has expired.");
    }
  }
  return {
    version,
    runtimeUrl,
    workspaceId,
    platformUrl: platformUrl || undefined,
    pairingId,
    expiresAt,
    label,
  };
}

export function encodePairingCode(payload: {
  runtimeUrl: string;
  workspaceId: string;
  platformUrl?: string;
  label?: string;
  ttlMs?: number;
}) {
  const packet = buildPacket(payload);
  return `${PAIRING_PREFIX_V2}.${base64UrlEncode(utf8Encode(JSON.stringify(packet)))}`;
}

export function buildPairingDeepLink(payload: {
  runtimeUrl: string;
  workspaceId: string;
  platformUrl?: string;
  label?: string;
  ttlMs?: number;
}) {
  return `empyralis://session?pairing=${encodeURIComponent(encodePairingCode(payload))}`;
}

export function formatPairingFallbackCode(input: string) {
  const token = String(input || "").trim();
  const [prefix, encoded] = token.split(".", 2);
  if (!prefix || !encoded) return token;
  const grouped = encoded.match(/.{1,8}/g)?.join("-") || encoded;
  return `${prefix}.${grouped}`;
}

export function decodePairingInput(input: string) {
  const token = String(input || "").trim();
  if (!token) throw new Error("Pairing code is required.");
  const normalizedToken = token.replace(/[\s-]+/g, "");

  if (token.startsWith("empyralis://")) {
    const url = new URL(token);
    const pairing = url.searchParams.get("pairing");
    if (pairing) return decodePairingInput(pairing);
    return parsePairingPacket({
      runtimeUrl: url.searchParams.get("runtimeUrl"),
      workspaceId: url.searchParams.get("workspaceId"),
      platformUrl: url.searchParams.get("platformUrl"),
      version: 1,
    });
  }

  if (normalizedToken.startsWith(`${PAIRING_PREFIX_V2}.`)) {
    const encoded = normalizedToken.slice(PAIRING_PREFIX_V2.length + 1);
    return parsePairingPacket(JSON.parse(utf8Decode(base64UrlDecode(encoded))));
  }

  if (normalizedToken.startsWith(`${PAIRING_PREFIX_V1}.`)) {
    const encoded = normalizedToken.slice(PAIRING_PREFIX_V1.length + 1);
    return parsePairingPacket(JSON.parse(utf8Decode(base64UrlDecode(encoded))));
  }

  if (token.includes("runtimeUrl=") && token.includes("workspaceId=")) {
    const params = new URLSearchParams(token);
    return parsePairingPacket({
      runtimeUrl: params.get("runtimeUrl"),
      workspaceId: params.get("workspaceId"),
      platformUrl: params.get("platformUrl"),
      version: 1,
    });
  }

  throw new Error("Unrecognized pairing code.");
}
