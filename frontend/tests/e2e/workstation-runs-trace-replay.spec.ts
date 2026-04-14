// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

function buildReplayPayload(traceId) {
  return {
    trace: {
      id: traceId,
      workspace_id: 'ws-1',
      tenant_id: 'tenant-ws-1',
      root_agent_id: 'sage',
      surface: 'web',
      runtime_target: 'cloud',
      provider: 'openai',
      model: 'gpt-5.4',
      started_at: '2026-04-13T12:00:05Z',
      finished_at: '2026-04-13T12:00:08Z',
      outcome: 'success',
    },
    events: [
      {
        id: 'evt-1',
        trace_id: traceId,
        seq: 1,
        ts: '2026-04-13T12:00:05Z',
        event_type: 'trace.routed',
        persisted: true,
        agent_id: 'sage',
        data: {
          runtime_target: 'cloud',
          provider: 'openai',
          model: 'gpt-5.4',
        },
      },
      {
        id: 'evt-2',
        trace_id: traceId,
        seq: 2,
        ts: '2026-04-13T12:00:05Z',
        event_type: 'plan.started',
        persisted: true,
        agent_id: 'sage',
        data: {
          title: 'Sage Plan',
          summary: 'Inspect the request, search the web, and answer.',
        },
      },
      {
        id: 'evt-3',
        trace_id: traceId,
        seq: 3,
        ts: '2026-04-13T12:00:06Z',
        event_type: 'plan.item.created',
        persisted: true,
        agent_id: 'sage',
        item_id: 'plan-item-1',
        data: {
          index: 1,
          title: 'Search for current sources',
          kind: 'tool',
          owner: 'sage',
          rationale_summary: 'Ground the replay in persisted evidence.',
        },
      },
      {
        id: 'evt-4',
        trace_id: traceId,
        seq: 4,
        ts: '2026-04-13T12:00:06Z',
        event_type: 'tool.started',
        persisted: true,
        agent_id: 'sage',
        item_id: 'plan-item-1',
        tool_call_id: 'tool-1',
        data: {
          tool_name: 'web.search',
          capability_id: 'web_search',
          connector_id: 'builtin',
          args_preview: {
            query: 'empyralist work trace replay',
          },
        },
      },
      {
        id: 'evt-5',
        trace_id: traceId,
        seq: 5,
        ts: '2026-04-13T12:00:07Z',
        event_type: 'search.query',
        persisted: true,
        agent_id: 'sage',
        tool_call_id: 'tool-1',
        data: {
          provider: 'web',
          query: 'empyralist work trace replay',
          filters: {},
        },
      },
      {
        id: 'evt-6',
        trace_id: traceId,
        seq: 6,
        ts: '2026-04-13T12:00:07Z',
        event_type: 'search.results',
        persisted: true,
        agent_id: 'sage',
        tool_call_id: 'tool-1',
        data: {
          results: [
            {
              title: 'Trace replay doc',
              url: 'https://example.com/trace-replay',
            },
          ],
        },
      },
      {
        id: 'evt-7',
        trace_id: traceId,
        seq: 7,
        ts: '2026-04-13T12:00:08Z',
        event_type: 'tool.result',
        persisted: true,
        agent_id: 'sage',
        tool_call_id: 'tool-1',
        data: {
          status: 'ok',
          summary: 'Collected one current reference.',
          artifact_ids: [],
        },
      },
      {
        id: 'evt-8',
        trace_id: traceId,
        seq: 8,
        ts: '2026-04-13T12:00:08Z',
        event_type: 'approval.requested',
        persisted: true,
        agent_id: 'sage',
        approval_id: 'approval-1',
        data: {
          title: 'Confirm send',
          description: 'Approval event from replay.',
        },
      },
      {
        id: 'evt-9',
        trace_id: traceId,
        seq: 9,
        ts: '2026-04-13T12:00:08Z',
        event_type: 'artifact.created',
        persisted: true,
        agent_id: 'sage',
        artifact_id: 'artifact-1',
        data: {
          kind: 'report',
          title: 'Trace report',
        },
      },
      {
        id: 'evt-10',
        trace_id: traceId,
        seq: 10,
        ts: '2026-04-13T12:00:08Z',
        event_type: 'trace.completed',
        persisted: true,
        agent_id: 'sage',
        data: {
          outcome: 'success',
          duration_ms: 3200,
        },
      },
    ],
  };
}

test.describe('workstation runs trace replay', () => {
  test('shows traces alongside runs and opens trace replay in the Work/runs surface', async ({ page }) => {
    await loginAsOwner(page);

    await page.route('**/api/runs?workspace_id=ws-1&limit=80', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              run_id: 'run-1',
              status: 'completed',
              created_at: '2026-04-13T12:00:00Z',
              result_summary: 'Background run complete.',
            },
          ],
        }),
      });
    });

    await page.route('**/api/agent-traces?workspace_id=ws-1&limit=80', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'trace-sage-1',
              root_agent_id: 'sage',
              surface: 'web',
              runtime_target: 'cloud',
              provider: 'openai',
              model: 'gpt-5.4',
              started_at: '2026-04-13T12:00:05Z',
              finished_at: '2026-04-13T12:00:08Z',
              outcome: 'success',
            },
          ],
        }),
      });
    });

    await page.route('**/api/agent-traces/trace-sage-1?workspace_id=ws-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildReplayPayload('trace-sage-1')),
      });
    });

    await page.goto('/w/ws-1/runs');

    const runsSurface = page.locator('[data-workstation-surface="runs"]');
    const traceRow = runsSurface.getByRole('button', { name: /trace-sage-1/i });
    const runRow = runsSurface.getByRole('button', { name: /run-1/i });

    await expect(runsSurface).toBeVisible();
    await expect(traceRow).toBeVisible();
    await expect(runRow).toBeVisible();

    await traceRow.click({ force: true });

    await expect(page.locator('[data-workstation-trace-detail="pane"]')).toBeVisible();
    await expect(page.locator('[data-sage-trace-view="true"]')).toBeVisible();
    await expect(page.locator('[data-sage-trace-summary="true"]')).toContainText('success');

    await page.getByRole('button', { name: /view full trace/i }).click();
    await expect(page.locator('[data-sage-trace-plan="true"]')).toContainText('Sage Plan');
    await expect(page.locator('[data-sage-trace-tool-card="tool-1"]')).toContainText('web.search');
    await expect(page.locator('[data-sage-trace-tool-card="tool-1"]')).toContainText('empyralist work trace replay');
    await expect(page.locator('[data-sage-trace-approval-card="approval-1"]')).toContainText('Confirm send');
    await expect(page.locator('[data-sage-trace-view="true"]')).toContainText('Trace report');
  });
});
