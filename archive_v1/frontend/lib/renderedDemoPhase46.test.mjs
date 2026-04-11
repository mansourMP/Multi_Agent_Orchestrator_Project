import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const nextBin = path.join(frontendRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

function isoAt(offsetSeconds) {
  return new Date(Date.UTC(2026, 3, 11, 1, 0, offsetSeconds)).toISOString();
}

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function buildRunRecord({ resolved }) {
  const artifact = {
    id: 'artifact-phase46-summary',
    label: 'Research summary',
    kind: 'text',
    mime_type: 'text/markdown',
    preview_url: '/api/artifacts/content?id=artifact-phase46-summary',
    created_at: isoAt(4),
  };
  const childRun = {
    run_id: 'run-phase46-child-1',
    status: resolved ? 'completed' : 'waiting',
    agent_role: 'research',
    install_id: 'research-install-1',
    title: 'Research specialist',
    summary: resolved ? 'Research summary completed.' : 'Research summary ready for approval.',
  };
  return {
    run_id: 'run-phase46-1',
    status: resolved ? 'completed' : 'waiting',
    owner_user_id: 'trusted-local-desktop',
    workspace_id: 'default',
    tenant_id: 'default',
    thread_id: 'phase46-thread-1',
    session_id: 'phase46-session-1',
    agent_role: 'orchestrator',
    active_profile_provider: 'openai',
    active_profile_model: 'gpt-4o-mini',
    child_runs: [childRun],
    delegation_summary: {
      child_runs_total: 1,
      child_runs_completed: resolved ? 1 : 0,
      child_runs_waiting: resolved ? 0 : 1,
      status: resolved ? 'completed' : 'waiting',
    },
    artifacts: [artifact],
    pending_confirmation: resolved ? null : {
      approval_id: 'approval-phase46-1',
      run_id: 'run-phase46-1',
      prompt: 'Approve sending the specialist summary back to Sage.',
      labels: ['send_message'],
      capabilities: ['send_message'],
      actions: ['send_message'],
      target: 'summary delivery',
      reusable: false,
      consequence: 'The summary will be surfaced to the user.',
      status: 'waiting',
    },
    result: resolved ? 'Summary ready: AI agent orchestration uses a captain, delegated research, and an approval gate before delivery.' : '',
    final_output: resolved ? 'Summary ready: AI agent orchestration uses a captain, delegated research, and an approval gate before delivery.' : '',
    created_at: isoAt(1),
    updated_at: isoAt(resolved ? 8 : 5),
  };
}

function buildApprovals({ resolved }) {
  if (resolved) {
    return { items: [], pending: [], count: 0, total: 0 };
  }
  const item = {
    approval_id: 'approval-phase46-1',
    run_id: 'run-phase46-1',
    prompt: 'Approve sending the specialist summary back to Sage.',
    labels: ['send_message'],
    capabilities: ['send_message'],
    actions: ['send_message'],
    target: 'summary delivery',
    scope: 'once',
    reusable: false,
    consequence: 'The summary will be surfaced to the user.',
    status: 'waiting',
    requested_at: isoAt(5),
    owner_user_id: 'trusted-local-desktop',
    actor: 'research-specialist',
    agent_role: 'research',
  };
  return {
    items: [item],
    pending: [item],
    count: 1,
    total: 1,
  };
}

function buildTimeline({ resolved }) {
  const items = [
    {
      id: 'evt-artifact-created',
      event_class: 'artifact',
      action: 'artifact_created',
      detail_level: 'summary',
      tenant_id: 'default',
      workspace_id: 'default',
      run_id: 'run-phase46-1',
      actor_type: 'agent',
      actor_id: 'research-specialist',
      install_id: 'research-install-1',
      status: 'completed',
      label: 'Research summary',
      created_at: isoAt(4),
      ts: isoAt(4),
    },
    {
      id: 'evt-approval-requested',
      event_class: 'approval',
      action: 'approval_requested',
      detail_level: 'summary',
      tenant_id: 'default',
      workspace_id: 'default',
      run_id: 'run-phase46-1',
      actor_type: 'agent',
      actor_id: 'sage',
      install_id: 'sage-install-1',
      status: resolved ? 'completed' : 'waiting',
      label: 'Approval requested',
      created_at: isoAt(5),
      ts: isoAt(5),
    },
  ];
  if (resolved) {
    items.unshift(
      {
        id: 'evt-run-completed',
        event_class: 'run',
        action: 'run_completed',
        detail_level: 'summary',
        tenant_id: 'default',
        workspace_id: 'default',
        run_id: 'run-phase46-1',
        actor_type: 'agent',
        actor_id: 'sage',
        install_id: 'sage-install-1',
        status: 'completed',
        label: 'Run completed',
        created_at: isoAt(8),
        ts: isoAt(8),
      },
      {
        id: 'evt-approval-approved',
        event_class: 'approval',
        action: 'approval_approved',
        detail_level: 'summary',
        tenant_id: 'default',
        workspace_id: 'default',
        run_id: 'run-phase46-1',
        actor_type: 'user',
        actor_id: 'trusted-local-desktop',
        install_id: 'sage-install-1',
        status: 'completed',
        label: 'Approval approved',
        created_at: isoAt(7),
        ts: isoAt(7),
      },
    );
  }
  return {
    items,
    count: items.length,
    summary: {
      approvals_waiting: resolved ? 0 : 1,
      runs_completed: resolved ? 1 : 0,
      artifacts_created: 1,
    },
  };
}

async function startMockRuntimeServer() {
  const port = await getFreePort();
  const state = { approvalResolved: false, turnCount: 0 };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const routeKey = `${req.method || 'GET'} ${url.pathname}`;

    if (routeKey === 'GET /health') {
      return jsonResponse(res, 200, { ok: true });
    }

    if (routeKey === 'GET /agent-registry/chat-context') {
      return jsonResponse(res, 200, {
        thread_id: 'phase46-thread-1',
        master_install: {
          id: 'sage-install-1',
          label: 'Sage',
          runtime_profile_id: 'profile-openai-1',
        },
      });
    }

    if (routeKey === 'POST /turn') {
      state.turnCount += 1;
      const body = await readJsonBody(req);
      assert.equal(body.workspace_id, 'default');
      assert.equal(body.channel, 'web');
      assert.match(String(body.message || ''), /Research AI agent orchestration/i);
      return jsonResponse(res, 200, {
        ok: true,
        status: 'starting',
        reply: '',
        run_id: 'run-phase46-1',
        thread_id: String(body.thread_id || 'phase46-thread-1'),
        session_id: String(body.session_id || 'phase46-session-1'),
        artifacts: [],
        approvals: [],
        interventions: [],
        metadata: {
          kind: 'durable_run',
          engine: 'orion',
          route: {
            requested: 'auto',
            selected: 'cloud',
            reason: 'Surface smoke selected cloud for the deterministic golden-path proof.',
          },
        },
      });
    }

    if (routeKey === 'GET /runs') {
      return jsonResponse(res, 200, {
        items: [buildRunRecord({ resolved: state.approvalResolved })],
        count: 1,
        total: 1,
        limit: 50,
        offset: 0,
      });
    }

    if (req.method === 'GET' && url.pathname === '/runs/run-phase46-1') {
      return jsonResponse(res, 200, buildRunRecord({ resolved: state.approvalResolved }));
    }

    if (routeKey === 'GET /activity/timeline') {
      return jsonResponse(res, 200, buildTimeline({ resolved: state.approvalResolved }));
    }

    if (routeKey === 'GET /approvals') {
      return jsonResponse(res, 200, buildApprovals({ resolved: state.approvalResolved }));
    }

    if (routeKey === 'POST /approvals/approval-phase46-1/resolve') {
      const body = await readJsonBody(req);
      assert.equal(body.approval_id, 'approval-phase46-1');
      assert.equal(body.resolution, 'approved');
      state.approvalResolved = true;
      return jsonResponse(res, 200, {
        ok: true,
        approval_id: 'approval-phase46-1',
        resolution: 'approved',
        run_id: 'run-phase46-1',
      });
    }

    return jsonResponse(res, 404, { detail: `Unhandled mock runtime route: ${routeKey}` });
  });

  server.listen(port, '127.0.0.1');
  await once(server, 'listening');

  return {
    url: `http://127.0.0.1:${port}`,
    state,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function waitForHttpOk(url, { attempts = 80, delayMs = 250 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return;
      lastError = new Error(`Unexpected status ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function startNextServer(runtimeUrl) {
  const port = await getFreePort();
  const env = {
    ...process.env,
    EMPYRALIS_TAURI_DESKTOP: '1',
    ORION_API_URL: runtimeUrl,
    NEXT_PUBLIC_ORION_API_URL: runtimeUrl,
    NEXT_PUBLIC_API_URL: runtimeUrl,
    ORION_CONTROL_PLANE_BACKEND_URL: runtimeUrl,
    ORION_API_KEY: 'phase46-test-key',
    FRONTEND_ORIGINS: `http://127.0.0.1:${port}`,
  };
  const child = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: frontendRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  const capture = (chunk) => {
    logs += chunk.toString('utf8');
    if (logs.length > 20_000) {
      logs = logs.slice(-20_000);
    }
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  const exitPromise = once(child, 'exit').then(([code, signal]) => {
    throw new Error(`Next server exited before readiness (code=${code}, signal=${signal}).\n${logs}`);
  });

  await Promise.race([
    waitForHttpOk(`http://127.0.0.1:${port}/`),
    exitPromise,
  ]);

  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await Promise.race([
        once(child, 'exit'),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
      if (child.exitCode === null) {
        child.kill('SIGKILL');
        await once(child, 'exit');
      }
    },
  };
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Origin: new URL(url).origin,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `Expected OK response from ${url}, got ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

test('rendered web shell stays aligned with the golden-path BFF contracts', async (t) => {
  await access(path.join(frontendRoot, '.next', 'BUILD_ID'));

  const runtime = await startMockRuntimeServer();
  t.after(async () => {
    await runtime.close();
  });

  const web = await startNextServer(runtime.url);
  t.after(async () => {
    await web.stop();
  });

  const sessionPayload = await fetchJson(`${web.url}/api/control-plane/session`);
  assert.equal(sessionPayload.ok, true);
  assert.equal(sessionPayload.auth_type, 'trusted_local');
  assert.equal(sessionPayload.role, 'owner');

  const html = await fetch(`${web.url}/`, { headers: { Origin: web.url } }).then((res) => res.text());
  assert.match(html, /Empyralis - Outcome Autopilot for Business/);
  assert.match(html, />Sage</);

  const turnPayload = await fetchJson(`${web.url}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspace_id: 'default',
      thread_id: 'phase46-thread-1',
      session_id: 'phase46-session-1',
      channel: 'web',
      actor: { type: 'user', id: 'phase46-user' },
      message: 'Research AI agent orchestration and draft a summary.',
      execution_mode: 'durable',
      response_mode: 'artifact',
      context_hints: {
        agent_role: 'orchestrator',
        metadata: {
          master_agent_install_id: 'sage-install-1',
          runtime_profile_id: 'profile-openai-1',
        },
      },
    }),
  });
  assert.equal(turnPayload.status, 'starting');
  assert.equal(turnPayload.run_id, 'run-phase46-1');
  assert.equal(runtime.state.turnCount, 1);

  const runsPayload = await fetchJson(`${web.url}/api/runs?workspace_id=default`);
  assert.equal(runsPayload.items.length, 1);
  assert.equal(runsPayload.items[0].run_id, 'run-phase46-1');
  assert.equal(runsPayload.items[0].status, 'waiting');

  const waitingRun = await fetchJson(`${web.url}/api/runs/run-phase46-1`);
  assert.equal(waitingRun.status, 'waiting');
  assert.equal(waitingRun.child_runs.length, 1);
  assert.equal(waitingRun.child_runs[0].agent_role, 'research');
  assert.equal(waitingRun.artifacts.length, 1);
  assert.equal(waitingRun.pending_confirmation.approval_id, 'approval-phase46-1');

  const pendingTimeline = await fetchJson(`${web.url}/api/activity/timeline?workspace_id=default&run_id=run-phase46-1`);
  assert.equal(pendingTimeline.items.some((item) => item.action === 'artifact_created' && item.install_id === 'research-install-1'), true);
  assert.equal(pendingTimeline.items.some((item) => item.action === 'approval_requested'), true);

  const approvalsPayload = await fetchJson(`${web.url}/api/approvals?workspace_id=default`);
  assert.equal(approvalsPayload.items.length, 1);
  assert.equal(approvalsPayload.items[0].approval_id, 'approval-phase46-1');

  const resolutionPayload = await fetchJson(`${web.url}/api/approvals/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      runId: 'run-phase46-1',
      approvalId: 'approval-phase46-1',
      decision: 'Proceed',
      note: 'Looks good.',
    }),
  });
  assert.equal(resolutionPayload.ok, true);
  assert.equal(resolutionPayload.resolution, 'approved');

  const approvalsAfter = await fetchJson(`${web.url}/api/approvals?workspace_id=default`);
  assert.equal(approvalsAfter.items.length, 0);

  const completedRun = await fetchJson(`${web.url}/api/runs/run-phase46-1`);
  assert.equal(completedRun.status, 'completed');
  assert.match(completedRun.result, /Summary ready:/);
  assert.equal(completedRun.artifacts.length, 1);

  const completedTimeline = await fetchJson(`${web.url}/api/activity/timeline?workspace_id=default&run_id=run-phase46-1`);
  assert.equal(completedTimeline.items.some((item) => item.action === 'approval_approved'), true);
  assert.equal(completedTimeline.items.some((item) => item.action === 'run_completed'), true);
});
