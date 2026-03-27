import { lookup } from 'dns/promises';
import { isIP } from 'net';

function allowPrivateHttpHosts(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.ORION_ALLOW_PRIVATE_HTTP_HOSTS || '').trim().toLowerCase());
}

function ipv4BlockReason(address: string): string | null {
  const parts = String(address || '').split('.').map((item) => Number(item));
  if (parts.length !== 4 || parts.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return null;
  const [a, b] = parts;
  if (a === 127) return 'loopback';
  if (a === 10) return 'private';
  if (a === 0) return 'unspecified';
  if (a === 169 && b === 254) return 'link-local';
  if (a === 192 && b === 168) return 'private';
  if (a === 172 && b >= 16 && b <= 31) return 'private';
  if (a === 100 && b >= 64 && b <= 127) return 'carrier-grade';
  if (a >= 224) return 'reserved';
  return null;
}

function ipv6BlockReason(address: string): string | null {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized.includes(':')) return null;
  if (normalized === '::1') return 'loopback';
  if (normalized === '::') return 'unspecified';
  if (normalized.startsWith('fe80:')) return 'link-local';
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return 'private';
  if (normalized.startsWith('::ffff:127.')) return 'loopback';
  if (normalized.startsWith('::ffff:10.')) return 'private';
  if (normalized.startsWith('::ffff:192.168.')) return 'private';
  if (/^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return 'private';
  return null;
}

function ipBlockReason(address: string): string | null {
  const family = isIP(String(address || '').trim());
  if (!family) return null;
  return family === 4 ? ipv4BlockReason(address) : ipv6BlockReason(address);
}

export function obviousPrivateUrlReason(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(String(url || '').trim());
  } catch {
    return 'invalid_url';
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'unsupported_scheme';
  }
  const hostname = String(parsed.hostname || '').trim().toLowerCase();
  if (!hostname) return 'missing_host';
  if (hostname === 'localhost' || hostname === 'localhost.localdomain') return 'loopback_host';
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return 'private_host';
  return ipBlockReason(hostname);
}

export async function assertSafeOutboundUrl(url: string, options: { allowPrivateHost?: boolean } = {}): Promise<void> {
  if (options.allowPrivateHost || allowPrivateHttpHosts()) {
    return;
  }
  const obviousReason = obviousPrivateUrlReason(url);
  if (obviousReason) {
    throw new Error(`Outbound HTTP URL is not allowed: ${obviousReason}.`);
  }
  const parsed = new URL(String(url || '').trim());
  try {
    const addresses = await lookup(parsed.hostname, { all: true });
    for (const item of addresses) {
      const reason = ipBlockReason(item.address);
      if (reason) {
        throw new Error(`Outbound HTTP URL resolves to a disallowed ${reason} address.`);
      }
    }
  } catch (error) {
    const code = String((error as NodeJS.ErrnoException | undefined)?.code || '').trim();
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return;
    }
    throw error;
  }
}
