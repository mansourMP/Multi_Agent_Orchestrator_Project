// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

test.describe('workstation chat live trace', () => {
  test('sync direct chat renders the live trace before the final answer completes', async ({ page }) => {
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      const encoder = new TextEncoder();
      const state = {
        threadTurns: [],
      };

      const jsonResponse = (payload) => new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });

      const sseBlocks = [
        'id: 1\nevent: trace\ndata: {"id":"evt-route","trace_id":"trace-direct-1","seq":1,"event_type":"trace.routed","persisted":true,"agent_id":"sage","data":{"runtime_target":"cloud","provider":"openai","model":"gpt-5.4"}}\n\n',
        'id: 2\nevent: trace\ndata: {"id":"evt-plan-start","trace_id":"trace-direct-1","seq":2,"event_type":"plan.started","persisted":true,"agent_id":"sage","data":{"title":"Sage Plan","summary":"Inspect the request, search for sources, and respond."}}\n\n',
        'id: 3\nevent: trace\ndata: {"id":"evt-plan-item","trace_id":"trace-direct-1","seq":3,"event_type":"plan.item.created","persisted":true,"agent_id":"sage","item_id":"plan-item-1","data":{"index":1,"title":"Search for current sources","kind":"tool","owner":"sage","rationale_summary":"Ground the answer in current references."}}\n\n',
        'id: 4\nevent: trace\ndata: {"id":"evt-tool-start","trace_id":"trace-direct-1","seq":4,"event_type":"tool.started","persisted":true,"agent_id":"sage","tool_call_id":"tool-1","item_id":"plan-item-1","data":{"tool_name":"web.search","capability_id":"web_search","connector_id":"builtin","args_preview":{"query":"empyralist live trace"}}}\n\n',
        'id: 5\nevent: chunk\ndata: {"delta":"Working through the current sources..."}\n\n',
        'id: 6\nevent: trace\ndata: {"id":"evt-tool-result","trace_id":"trace-direct-1","seq":5,"event_type":"tool.result","persisted":true,"agent_id":"sage","tool_call_id":"tool-1","data":{"status":"ok","summary":"Collected grounded references.","artifact_ids":[]}}\n\n',
        'id: 7\nevent: trace\ndata: {"id":"evt-complete","trace_id":"trace-direct-1","seq":6,"event_type":"trace.completed","persisted":true,"agent_id":"sage","data":{"outcome":"success","duration_ms":880}}\n\n',
        'id: 8\nevent: final\ndata: {"status":"completed","reply":"Final answer complete.","thread_id":"primary","session_id":"session-1","metadata":{}}\n\n',
      ];

      window.fetch = async (input, init) => {
        const request = input instanceof Request ? input : null;
        const url = typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : request
              ? request.url
              : String(input);
        const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();

        if (url.includes('/api/threads/') && method === 'GET') {
          return jsonResponse({
            id: 'primary',
            thread_id: 'primary',
            title: 'Chat',
            turns: state.threadTurns,
          });
        }

        if (url.includes('/api/runs') && method === 'GET') {
          return jsonResponse({ items: [] });
        }

        if (url.includes('/api/approvals') && method === 'GET') {
          return jsonResponse({ items: [] });
        }

        if (url.endsWith('/api/sessions') && method === 'POST') {
          return jsonResponse({
            session_id: 'session-1',
            workspace_id: 'ws-1',
            tenant_id: 'tenant-1',
            channel: 'web',
            actor: {
              type: 'user',
              id: 'owner-1',
            },
          });
        }

        if (url.endsWith('/api/turn') && method === 'POST') {
          state.threadTurns = [
            {
              id: 'turn-user-1',
              role: 'user',
              content: 'Trace this answer',
              status: 'completed',
              created_at: '2026-04-13T12:00:00Z',
              metadata: {},
            },
            {
              id: 'turn-assistant-1',
              role: 'assistant',
              content: 'Final answer complete.',
              status: 'completed',
              created_at: '2026-04-13T12:00:01Z',
              metadata: {
                trace_id: 'trace-direct-1',
              },
            },
          ];

          return new Response(new ReadableStream({
            start(controller) {
              let index = 0;
              const pump = () => {
                if (index >= sseBlocks.length) {
                  controller.close();
                  return;
                }
                controller.enqueue(encoder.encode(sseBlocks[index]));
                index += 1;
                window.setTimeout(pump, index === sseBlocks.length ? 260 : 80);
              };
              pump();
            },
          }), {
            status: 200,
            headers: {
              'content-type': 'text/event-stream',
              'cache-control': 'no-cache',
            },
          });
        }

        return originalFetch(input, init);
      };
    });

    await loginAsOwner(page);

    await page.getByPlaceholder('Ask the workspace to do real work.').fill('Trace this answer');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.locator('[data-chat-role="user"]').last()).toContainText('Trace this answer');
    await expect(page.locator('[data-sage-trace-view="true"]')).toBeVisible();
    await expect(page.locator('[data-sage-trace-plan="true"]')).toContainText('Sage Plan');
    await expect(page.locator('[data-chat-role="assistant"]').last()).toContainText('Working through the current sources...');
    await expect(page.locator('[data-chat-role="assistant"]').last()).not.toContainText('Final answer complete.');

    await expect(page.locator('[data-chat-role="assistant"]').last()).toContainText('Final answer complete.');
    await expect(page.locator('[data-sage-trace-summary="true"]')).toContainText('success');
    await expect(page.getByRole('button', { name: /view full trace/i })).toBeVisible();
  });
});
