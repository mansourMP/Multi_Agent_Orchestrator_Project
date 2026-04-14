// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

function buildTrace(traceId: string, rootAgentId = 'sage', overrides = {}) {
  return {
    id: traceId,
    workspace_id: 'ws-1',
    tenant_id: 'tenant-1',
    root_agent_id: rootAgentId,
    surface: 'web',
    runtime_target: 'cloud',
    provider: 'openai',
    model: 'gpt-5.4',
    started_at: '2026-04-13T12:00:00Z',
    finished_at: '2026-04-13T12:00:05Z',
    outcome: 'success',
    ...overrides,
  };
}

function buildEvent(seq, eventType, data = {}, overrides = {}) {
  return {
    id: `evt-${seq}`,
    trace_id: 'trace-1',
    seq,
    ts: `2026-04-13T12:00:0${Math.min(seq, 9)}Z`,
    event_type: eventType,
    persisted: true,
    agent_id: overrides.agent_id ?? 'sage',
    data,
    ...overrides,
  };
}

function replayPayload(rootAgentId = 'sage') {
  return {
    trace: buildTrace('trace-sage', rootAgentId),
    events: [
      buildEvent(1, 'trace.routed', {
        runtime_target: 'cloud',
        provider: 'openai',
        model: 'gpt-5.4',
      }, { agent_id: rootAgentId }),
      buildEvent(2, 'plan.started', {
        title: 'Sage Plan',
        summary: 'Inspect the request, search, and answer.',
      }, { agent_id: rootAgentId }),
      buildEvent(3, 'plan.item.created', {
        index: 1,
        title: 'Search for current sources',
        kind: 'tool',
        owner: 'sage',
        rationale_summary: 'Fresh sources are required for this answer.',
      }, { agent_id: rootAgentId, item_id: 'plan-item-1' }),
      buildEvent(4, 'reasoning.summary.delta', {
        delta: 'Cross-checking the latest source before answering.',
      }, { agent_id: rootAgentId, item_id: 'plan-item-1', persisted: false }),
      buildEvent(5, 'tool.started', {
        tool_name: 'web.search',
        capability_id: 'web_search',
        connector_id: 'builtin',
        args_preview: {
          query: 'empyralist trace ui',
        },
      }, { agent_id: rootAgentId, tool_call_id: 'tool-1', item_id: 'plan-item-1' }),
      buildEvent(6, 'search.query', {
        provider: 'web',
        query: 'empyralist trace ui',
        filters: {},
      }, { agent_id: rootAgentId, tool_call_id: 'tool-1' }),
      buildEvent(7, 'search.results', {
        results: [
          {
            title: 'Trace UX notes',
            url: 'https://example.com/trace-ux',
          },
          {
            title: 'Execution transparency',
            url: 'https://example.com/execution-transparency',
          },
        ],
      }, { agent_id: rootAgentId, tool_call_id: 'tool-1' }),
      buildEvent(8, 'browser.action', {
        action: 'open',
        target_summary: 'Search results page',
        url: 'https://example.com/trace-ux',
      }, { agent_id: rootAgentId, tool_call_id: 'tool-1' }),
      buildEvent(9, 'browser.screenshot', {
        caption: 'Search results screenshot',
        width: 1280,
        height: 720,
      }, { agent_id: rootAgentId, tool_call_id: 'tool-1', artifact_id: 'artifact-shot-1' }),
      buildEvent(10, 'tool.result', {
        status: 'ok',
        summary: 'Collected two current references.',
        artifact_ids: ['artifact-report-1'],
      }, { agent_id: rootAgentId, tool_call_id: 'tool-1' }),
      buildEvent(11, 'delegation.started', {
        specialist_id: 'spec-1',
        specialist_name: 'Research Specialist',
        task_summary: 'Validate source quality.',
      }, { agent_id: rootAgentId, child_run_id: 'run-child-1', item_id: 'plan-item-1' }),
      buildEvent(12, 'delegation.finished', {
        status: 'ok',
        result_summary: 'Validation completed.',
      }, { agent_id: rootAgentId, child_run_id: 'run-child-1', item_id: 'plan-item-1' }),
      buildEvent(13, 'approval.requested', {
        title: 'Send external message',
        description: 'Confirm before posting the answer externally.',
      }, { agent_id: rootAgentId, approval_id: 'approval-1' }),
      buildEvent(14, 'artifact.created', {
        kind: 'report',
        title: 'Trace Report',
        mime_type: 'text/markdown',
      }, { agent_id: rootAgentId, artifact_id: 'artifact-report-1' }),
      buildEvent(15, 'trace.completed', {
        outcome: 'success',
        duration_ms: 5100,
      }, { agent_id: rootAgentId }),
    ],
  };
}

function sseBody(events) {
  return events
    .map((event) => `event: trace\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

test.describe('sage trace view', () => {
  test('replay mode renders the major trace sections and collapses to a summary strip after completion', async ({ page }) => {
    await loginAsOwner(page);

    await page.route('**/api/agent-traces/trace-sage?workspace_id=ws-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(replayPayload('sage')),
      });
    });

    await page.goto('/w/ws-1/trace-preview?mode=replay&traceId=trace-sage');

    await expect(page.locator('[data-sage-trace-view="true"]')).toBeVisible();
    await expect(page.locator('[data-sage-trace-summary="true"]')).toContainText('success');
    await expect(page.getByRole('button', { name: /view full trace/i })).toBeVisible();

    await page.getByRole('button', { name: /view full trace/i }).click();
    await expect(page.locator('[data-sage-trace-routed="true"]')).toContainText('cloud');
    await expect(page.locator('[data-sage-trace-plan="true"]')).toContainText('Sage Plan');
    await expect(page.locator('[data-sage-trace-tool-card="tool-1"]')).toContainText('web.search');
    await expect(page.locator('[data-sage-trace-tool-card="tool-1"]')).toContainText('Searching:');
    await expect(page.locator('[data-sage-trace-tool-card="tool-1"]')).toContainText('Search results screenshot');
    await expect(page.locator('[data-sage-trace-delegation-card="run-child-1"]')).toContainText('Research Specialist');
    await expect(page.locator('[data-sage-trace-approval-card="approval-1"]')).toContainText('Send external message');
    await expect(page.locator('[data-sage-trace-view="true"]')).toContainText('Trace Report');
  });

  test('live mode consumes the durable trace SSE stream', async ({ page }) => {
    await loginAsOwner(page);

    await page.route('**/api/agent-traces/trace-live/stream?workspace_id=ws-1', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
        body: sseBody([
          buildEvent(1, 'trace.routed', {
            runtime_target: 'cloud',
            provider: 'openai',
            model: 'gpt-5.4',
          }),
          buildEvent(2, 'plan.started', {
            title: 'Sage Plan',
            summary: 'Search and answer.',
          }),
          buildEvent(3, 'plan.item.created', {
            index: 1,
            title: 'Search for current sources',
            kind: 'tool',
            owner: 'sage',
          }, { item_id: 'plan-item-1' }),
          buildEvent(4, 'tool.started', {
            tool_name: 'web.search',
            capability_id: 'web_search',
            connector_id: 'builtin',
            args_preview: {
              query: 'empyralist trace ui',
            },
          }, { tool_call_id: 'tool-live-1', item_id: 'plan-item-1' }),
          buildEvent(5, 'search.query', {
            provider: 'web',
            query: 'empyralist trace ui',
            filters: {},
          }, { tool_call_id: 'tool-live-1' }),
          buildEvent(6, 'search.results', {
            results: [{ title: 'Trace UX notes', url: 'https://example.com/trace-ux' }],
          }, { tool_call_id: 'tool-live-1' }),
          buildEvent(7, 'tool.result', {
            status: 'ok',
            summary: 'Collected one current reference.',
            artifact_ids: [],
          }, { tool_call_id: 'tool-live-1' }),
          buildEvent(8, 'trace.completed', {
            outcome: 'success',
            duration_ms: 3400,
          }),
        ]),
      });
    });

    await page.goto('/w/ws-1/trace-preview?mode=live&traceId=trace-live');

    await expect(page.locator('[data-sage-trace-view="true"]')).toBeVisible();
    await expect(page.locator('[data-sage-trace-summary="true"]')).toContainText('success');
    await page.getByRole('button', { name: /view full trace/i }).click();
    await expect(page.locator('[data-sage-trace-plan="true"]')).toContainText('Sage Plan');
    await expect(page.locator('[data-sage-trace-tool-card="tool-live-1"]')).toContainText('web.search');
    await expect(page.locator('[data-sage-trace-tool-card="tool-live-1"]')).toContainText('empyralist trace ui');
  });

  test('additive parent-fed events render in replay mode for later chat integration', async ({ page }) => {
    await loginAsOwner(page);

    await page.goto('/w/ws-1/trace-preview?mode=replay&traceId=trace-inline&seed=inline');

    await page.getByRole('button', { name: /inject reasoning delta/i }).click();
    await page.getByRole('button', { name: /view full trace/i }).click();

    await expect(page.locator('[data-sage-trace-reasoning="plan-item-1"]')).toContainText('Why this step');
  });

  test('non-sage traces suppress browser and screenshot rendering', async ({ page }) => {
    await loginAsOwner(page);

    await page.route('**/api/agent-traces/trace-specialist?workspace_id=ws-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(replayPayload('specialist:research-1')),
      });
    });

    await page.goto('/w/ws-1/trace-preview?mode=replay&traceId=trace-specialist');

    await page.getByRole('button', { name: /view full trace/i }).click();

    await expect(page.locator('[data-sage-trace-tool-card="tool-1"]')).toBeVisible();
    await expect(page.locator('[data-sage-trace-delegation-card="run-child-1"]')).toBeVisible();
    await expect(page.getByText('Search results screenshot')).toHaveCount(0);
    await expect(page.getByText('Search results page')).toHaveCount(0);
  });
});
