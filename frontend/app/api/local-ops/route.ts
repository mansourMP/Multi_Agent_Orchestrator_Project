import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { BRAND } from '@/lib/brand';
import { API_BASE } from '@/lib/config';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);
const DEFAULT_OPS_DAEMON_URL = process.env.ORION_OPS_DAEMON_URL || API_BASE;
const OPS_DAEMON_TIMEOUT_MS = 25000;
const SENSITIVE_KEYS = new Set([
  'api_key',
  'access_token',
  'oauth_token',
  'auth_token',
  'bot_token',
  'token',
  'password',
  'secret',
]);

type LocalOpsAction =
  | 'start_services'
  | 'restart_services'
  | 'readiness'
  | 'release_status'
  | 'telegram_rebind'
  | 'ops_daemon_status'
  | 'ops_daemon_restart'
  | 'telegram_media_status';

type LocalOpsBody = {
  action?: LocalOpsAction;
  runtimeKey?: string;
  botToken?: string;
  chatId?: string;
  allowAnyChat?: boolean;
};

type DaemonUnavailable = {
  mode: 'unavailable';
  reason: string;
};

type DaemonResponse = {
  mode: 'ok' | 'error';
  status: number;
  payload: Record<string, unknown>;
};

function normalizeRuntimeKey(raw: string | undefined): string {
  const cleaned = String(raw || '').replace(/\s+/g, '');
  return cleaned;
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactSecrets(item);
    }
  }
  return out;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveProjectRoot(): Promise<string> {
  const cwd = process.cwd();
  const direct = path.join(cwd, 'scripts', 'start_orion_local_stack.sh');
  if (await fileExists(direct)) return cwd;

  const parent = path.resolve(cwd, '..');
  const parentDirect = path.join(parent, 'scripts', 'start_orion_local_stack.sh');
  if (await fileExists(parentDirect)) return parent;

  throw new Error('Could not resolve project root.');
}

async function readOpsDaemonKey(root: string): Promise<string | null> {
  const keyPath = path.join(root, '.orion-stack', 'ops_daemon_key');
  try {
    const raw = await fs.readFile(keyPath, 'utf8');
    const value = String(raw || '').trim();
    return value || null;
  } catch {
    return null;
  }
}

async function readRuntimeKey(root: string): Promise<string | null> {
  const keyPath = path.join(root, '.orion-stack', 'runtime_key');
  try {
    const raw = await fs.readFile(keyPath, 'utf8');
    const value = normalizeRuntimeKey(raw);
    return value || null;
  } catch {
    return null;
  }
}

async function startOpsDaemon(root: string, runtimeKey: string): Promise<void> {
  await execFileAsync('bash', ['scripts/start_orion_ops_daemon.sh'], {
    cwd: root,
    env: { ...process.env, RUNTIME_KEY: runtimeKey },
    maxBuffer: 1024 * 1024 * 2,
  });
}

async function stopOpsDaemon(root: string): Promise<void> {
  await execFileAsync('bash', ['scripts/stop_orion_ops_daemon.sh'], {
    cwd: root,
    env: process.env,
    maxBuffer: 1024 * 1024 * 2,
  });
}

function isPidAlive(pidRaw: string): boolean {
  const pid = Number(pidRaw);
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function getOpsDaemonStatus(root: string): Promise<Record<string, unknown>> {
  const pidPath = path.join(root, '.orion-stack', 'pids', 'ops-daemon.pid');
  let pid = '';
  try {
    pid = String(await fs.readFile(pidPath, 'utf8')).trim();
  } catch {
    pid = '';
  }

  const runningByPid = isPidAlive(pid);
  let health: unknown = null;
  let runningByHealth = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${DEFAULT_OPS_DAEMON_URL}/health`, { signal: controller.signal });
    const text = await res.text().catch(() => '');
    clearTimeout(timeout);
    health = parseOpsDaemonPayload(text);
    runningByHealth = res.ok && Boolean((health as Record<string, unknown>)?.ok);
  } catch {
    runningByHealth = false;
    health = null;
  }

  return {
    ok: true,
    action: 'ops_daemon_status',
    running: runningByPid || runningByHealth,
    pid: runningByPid ? pid : null,
    url: DEFAULT_OPS_DAEMON_URL,
    runtime_url:
      health && typeof health === 'object' && typeof (health as Record<string, unknown>).runtime_url === 'string'
        ? String((health as Record<string, unknown>).runtime_url)
        : null,
    watchdog:
      health && typeof health === 'object' && (health as Record<string, unknown>).watchdog && typeof (health as Record<string, unknown>).watchdog === 'object'
        ? ((health as Record<string, unknown>).watchdog as Record<string, unknown>)
        : null,
    health: redactSecrets(health),
  };
}

function resolveTelegramMediaDir(root: string): { configuredDir: string; resolvedDir: string } {
  const configuredDir = String(process.env.ORION_TELEGRAM_MEDIA_DIR || '.orion-media/telegram').trim() || '.orion-media/telegram';
  const resolvedDir = path.isAbsolute(configuredDir) ? configuredDir : path.join(root, configuredDir);
  return { configuredDir, resolvedDir };
}

async function getTelegramMediaStatus(root: string): Promise<Record<string, unknown>> {
  const { configuredDir, resolvedDir } = resolveTelegramMediaDir(root);
  const exists = await fileExists(resolvedDir);
  if (!exists) {
    return {
      ok: true,
      action: 'telegram_media_status',
      configured_dir: configuredDir,
      resolved_dir: resolvedDir,
      exists: false,
      files_total: 0,
      bytes_total: 0,
      truncated: false,
      recent_files: [],
    };
  }

  const maxFiles = 5000;
  const stack: string[] = [resolvedDir];
  let filesTotal = 0;
  let bytesTotal = 0;
  let truncated = false;
  const recent: Array<{ path: string; bytes: number; mtime: string }> = [];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
    try {
      entries = (await fs.readdir(current, { withFileTypes: true })) as Array<{
        name: string;
        isDirectory: () => boolean;
        isFile: () => boolean;
      }>;
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absPath);
        continue;
      }
      if (!entry.isFile()) continue;
      filesTotal += 1;
      if (filesTotal > maxFiles) {
        truncated = true;
        break;
      }
      let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
      try {
        stat = await fs.stat(absPath);
      } catch {
        stat = null;
      }
      const size = stat ? Number(stat.size || 0) : 0;
      bytesTotal += size;
      recent.push({
        path: path.relative(root, absPath),
        bytes: size,
        mtime: stat?.mtime ? stat.mtime.toISOString() : '',
      });
    }
    if (truncated) break;
  }

  recent.sort((a, b) => {
    const ta = a.mtime ? Date.parse(a.mtime) : 0;
    const tb = b.mtime ? Date.parse(b.mtime) : 0;
    return tb - ta;
  });

  return {
    ok: true,
    action: 'telegram_media_status',
    configured_dir: configuredDir,
    resolved_dir: resolvedDir,
    exists: true,
    files_total: filesTotal,
    bytes_total: bytesTotal,
    truncated,
    recent_files: recent.slice(0, 8),
  };
}

function parseOpsDaemonPayload(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    return { raw: parsed };
  } catch {
    return { raw: text };
  }
}

async function runViaOpsDaemon(
  root: string,
  body: LocalOpsBody,
  runtimeKey: string,
): Promise<DaemonResponse | DaemonUnavailable> {
  const runOnce = async (daemonKey: string): Promise<DaemonResponse | DaemonUnavailable> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPS_DAEMON_TIMEOUT_MS);
    try {
      const res = await fetch(`${DEFAULT_OPS_DAEMON_URL}/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${daemonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: body.action,
          runtimeKey,
          botToken: body.botToken,
          chatId: body.chatId,
          allowAnyChat: body.allowAnyChat,
        }),
        signal: controller.signal,
      });
      const text = await res.text().catch(() => '');
      const payload = parseOpsDaemonPayload(text);
      if (res.ok && payload.ok !== false) {
        return { mode: 'ok', status: res.status, payload };
      }
      return { mode: 'error', status: res.status, payload };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ops daemon request failed.';
      return { mode: 'unavailable', reason: message };
    } finally {
      clearTimeout(timeout);
    }
  };

  let daemonKey = await readOpsDaemonKey(root);
  if (!daemonKey) {
    try {
      await startOpsDaemon(root, runtimeKey);
      daemonKey = await readOpsDaemonKey(root);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start ops daemon.';
      return { mode: 'unavailable', reason: message };
    }
  }
  if (!daemonKey) {
    return { mode: 'unavailable', reason: 'Ops daemon key is unavailable.' };
  }

  const first = await runOnce(daemonKey);
  if (first.mode !== 'unavailable') return first;

  try {
    await startOpsDaemon(root, runtimeKey);
  } catch {
    return first;
  }
  daemonKey = await readOpsDaemonKey(root);
  if (!daemonKey) return first;
  return runOnce(daemonKey);
}

async function runScript(root: string, scriptPath: string, env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('bash', [scriptPath], {
    cwd: root,
    env,
    maxBuffer: 1024 * 1024 * 8,
  });
  return {
    stdout: String(stdout || ''),
    stderr: String(stderr || ''),
  };
}

async function killWorkerProcesses(root: string): Promise<void> {
  await execFileAsync('bash', ['-lc', `pkill -f "${root}/scripts/orion_local_worker.py" || true`], {
    cwd: root,
    env: process.env,
    maxBuffer: 1024 * 1024,
  }).catch(() => undefined);
  await execFileAsync('bash', ['-lc', `pkill -f "${root}/scripts/run_local_worker.sh" || true`], {
    cwd: root,
    env: process.env,
    maxBuffer: 1024 * 1024,
  }).catch(() => undefined);
}

async function runtimeRequest(
  runtimeKey: string,
  runtimePath: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const base = API_BASE;
  const res = await fetch(`${base}${runtimePath}`, {
    ...init,
    headers: {
      'X-API-Key': runtimeKey,
      ...(init?.headers || {}),
    },
  });
  const text = await res.text().catch(() => '');
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text;
  }
  return { ok: res.ok, status: res.status, payload };
}

function trimOutput(raw: string, maxChars = 4000): string {
  const s = String(raw || '');
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n...truncated...`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as LocalOpsBody;
    const action = body.action;
    const root = await resolveProjectRoot();
    const runtimeKey = normalizeRuntimeKey(body.runtimeKey) || (await readRuntimeKey(root)) || '';
    const env = { ...process.env, RUNTIME_KEY: runtimeKey };

    if (!action) {
      return Response.json({ ok: false, error: 'Missing action.' }, { status: 400 });
    }

    if (action === 'ops_daemon_status') {
      return Response.json(await getOpsDaemonStatus(root));
    }

    if (action === 'ops_daemon_restart') {
      await stopOpsDaemon(root).catch(() => undefined);
      await startOpsDaemon(root, runtimeKey);
      const statusPayload = await getOpsDaemonStatus(root);
      return Response.json({ ...statusPayload, action, restarted: true });
    }

    if (action === 'telegram_media_status') {
      return Response.json(await getTelegramMediaStatus(root));
    }

    const daemonResult = await runViaOpsDaemon(root, body, runtimeKey);
    if (daemonResult.mode === 'ok') {
      return Response.json({
        ...(redactSecrets(daemonResult.payload) as Record<string, unknown>),
        transport: 'ops_daemon',
      });
    }
    if (daemonResult.mode === 'error') {
      return Response.json(
        {
          ...(redactSecrets(daemonResult.payload) as Record<string, unknown>),
          transport: 'ops_daemon',
        },
        { status: daemonResult.status || 400 },
      );
    }
    const fallbackReason = daemonResult.mode === 'unavailable' ? daemonResult.reason : null;

    if (action === 'start_services') {
      await killWorkerProcesses(root);
      const { stdout, stderr } = await execFileAsync('bash', ['scripts/start_orion_local_stack.sh'], {
        cwd: root,
        env: { ...env, START_FRONTEND: '0' },
        maxBuffer: 1024 * 1024 * 8,
      });
      return Response.json({
        ok: true,
        action,
        transport: 'route_fallback',
        fallbackReason,
        stdout: trimOutput(String(redactSecrets(stdout) || '')),
        stderr: trimOutput(String(redactSecrets(stderr) || '')),
      });
    }

    if (action === 'restart_services') {
      await killWorkerProcesses(root);
      const start = await execFileAsync('bash', ['scripts/start_orion_local_stack.sh'], {
        cwd: root,
        env: { ...env, START_FRONTEND: '0' },
        maxBuffer: 1024 * 1024 * 8,
      });
      return Response.json({
        ok: true,
        action,
        transport: 'route_fallback',
        fallbackReason,
        stdout: trimOutput(String(redactSecrets(start.stdout) || '')),
        stderr: trimOutput(String(redactSecrets(start.stderr) || '')),
      });
    }

    if (action === 'readiness') {
      const { stdout, stderr } = await runScript(root, 'scripts/orion_environment_readiness.sh', env);
      return Response.json({
        ok: true,
        action,
        transport: 'route_fallback',
        fallbackReason,
        stdout: trimOutput(String(redactSecrets(stdout) || '')),
        stderr: trimOutput(String(redactSecrets(stderr) || '')),
      });
    }

    if (action === 'release_status') {
      const { stdout, stderr } = await runScript(root, 'scripts/orion_release_status.sh', env);
      return Response.json({
        ok: true,
        action,
        transport: 'route_fallback',
        fallbackReason,
        stdout: trimOutput(String(redactSecrets(stdout) || '')),
        stderr: trimOutput(String(redactSecrets(stderr) || '')),
      });
    }

    if (action === 'telegram_rebind') {
      const botToken = String(body.botToken || '').trim();
      const chatId = String(body.chatId || '').trim();
      const allowAnyChat = Boolean(body.allowAnyChat);

      if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(botToken)) {
        return Response.json({ ok: false, error: 'Invalid Telegram bot token format.' }, { status: 400 });
      }
      if (!chatId) {
        return Response.json({ ok: false, error: 'chat_id is required for web rebind.' }, { status: 400 });
      }

      const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const mePayload = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !mePayload?.ok) {
        return Response.json(
          { ok: false, error: 'Telegram getMe failed. Check bot token.', details: mePayload },
          { status: 400 },
        );
      }

      const createPayload = {
        label: 'Telegram Bot LIVE',
        connector: 'telegram_bot',
        workspace_id: 'default',
        credentials: {
          bot_token: botToken,
          chat_id: chatId,
        },
        metadata: allowAnyChat ? { allow_any_chat: true } : {},
      };

      const create = await runtimeRequest(runtimeKey, '/connectors/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });
      if (!create.ok) {
        return Response.json(
          { ok: false, error: 'Failed to save Telegram connector.', status: create.status, details: create.payload },
          { status: 400 },
        );
      }

      const probe = await runtimeRequest(runtimeKey, '/channels/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[${BRAND.company} probe] Web rebind complete. Reply here with: LIVE-OK`,
          workspace_id: 'default',
          chat_id: chatId,
        }),
      });

      const status = await runtimeRequest(runtimeKey, '/channels/telegram/autopilot/status');

      return Response.json({
        ok: true,
        action,
        transport: 'route_fallback',
        fallbackReason,
        bot: redactSecrets(mePayload?.result || null),
        connector: redactSecrets(create.payload),
        probe: redactSecrets(probe.payload),
        autopilot: redactSecrets(status.payload),
      });
    }

    return Response.json({ ok: false, error: `Unsupported action '${String(action)}'.` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local ops failed.';
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
