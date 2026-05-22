// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

function installTransparencyTurnStub(page) {
  return page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const state = {
      persistedTurns: [] as Array<Record<string, unknown>>,
      providerProfiles: [
        {
          id: 'profile-deepseek',
          provider: 'deepseek',
          model: 'deepseek-chat',
          enabled: true,
          priority: 0,
          metadata: {
            chat_model_selection: 'explicit',
          },
        },
      ] as Array<Record<string, unknown>>,
    };

    const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
      status,
      headers: {
        'content-type': 'application/json',
      },
    });

    const eventStreamResponse = (events: Array<{ delay: number; event: string; payload: Record<string, unknown> }>) => new Response(
      new ReadableStream({
        start(controller) {
          let index = 0;
          const pump = () => {
            if (index >= events.length) {
              controller.close();
              return;
            }
            const next = events[index];
            index += 1;
            setTimeout(() => {
              controller.enqueue(
                encoder.encode(`event: ${next.event}\ndata: ${JSON.stringify(next.payload)}\n\n`),
              );
              pump();
            }, next.delay);
          };
          pump();
        },
      }),
      {
        headers: {
          'content-type': 'text/event-stream',
        },
      },
    );

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.includes('/api/providers/catalog')) {
        return jsonResponse({
          providers: [
            {
              id: 'deepseek',
              label: 'DeepSeek',
              kind: 'provider',
              usable: true,
              active: true,
              state: 'configured',
              credential_plane: 'platform_runtime',
              platform_runtime_allowed: true,
              default_model: 'deepseek-chat',
              provider_scopes: ['sage_personal'],
              models: [
                {
                  id: 'deepseek-chat',
                  label: 'DeepSeek Chat',
                  provider: 'deepseek',
                  supports_reasoning: true,
                  reasoning_levels: ['low', 'medium', 'high'],
                },
              ],
            },
          ],
        });
      }

      if (url.includes('/api/providers/profiles')) {
        if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
          const payload = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
          const profileId = String(payload?.id ?? payload?.provider ?? `profile-${Date.now()}`);
          const nextProfile = {
            id: profileId,
            provider: payload?.provider ?? 'deepseek',
            model: payload?.model ?? 'deepseek-chat',
            enabled: payload?.enabled !== false,
            priority: Number(payload?.priority ?? 0),
            metadata: payload?.metadata ?? {},
          };
          state.providerProfiles = state.providerProfiles.filter((profile) => String(profile.id ?? '') !== profileId);
          state.providerProfiles.push(nextProfile);
          return jsonResponse(nextProfile);
        }
        return jsonResponse({
          items: state.providerProfiles,
        });
      }

      if (url.includes('/api/sage-profile?workspace_id=ws-1')) {
        return jsonResponse({
          profile: {
            user_name: 'Owner',
            identity_summary: 'Runs the workspace.',
            communication_style: 'Direct',
            recurring_responsibility: 'Keep operations moving.',
            standing_rules: [],
          },
          bootstrap: {
            complete: true,
            answered_count: 5,
            total_count: 5,
            progress_label: '5/5',
            current_question: null,
          },
        });
      }

      if (url.includes('/api/workspaces/ws-1/sage/tool-policy')) {
        return jsonResponse({
          items: [],
          summary: {
            enabled_count: 2,
          },
        });
      }

      if (url.includes('/api/connectors/vault')) {
        return jsonResponse({ items: [] });
      }

      if (url.includes('/api/sessions')) {
        return jsonResponse({
          session_id: 'session-transparency',
          tenant_id: 't-1',
          workspace_id: 'ws-1',
          thread_id: 'primary',
        });
      }

      if (url.includes('/api/threads/primary/turns')) {
        const payload = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
        state.persistedTurns.splice(0, state.persistedTurns.length, {
          id: 'turn-user-1',
          role: 'user',
          status: 'completed',
          content: payload?.content ?? '',
          created_at: new Date().toISOString(),
          metadata: {
            request_id: payload?.client_request_id ?? 'req-1',
            client_request_id: payload?.client_request_id ?? 'req-1',
          },
        });
        return jsonResponse({
          id: 'primary',
          thread_id: 'primary',
          title: 'Primary thread',
          turns: state.persistedTurns,
        });
      }

      if (url.includes('/api/threads/primary')) {
        return jsonResponse({
          id: 'primary',
          thread_id: 'primary',
          title: 'Primary thread',
          turns: state.persistedTurns,
        });
      }

      if (url.includes('/api/runs')) {
        return jsonResponse({ items: [] });
      }

      if (url.includes('/api/approvals')) {
        return jsonResponse({ items: [] });
      }

      if (url.includes('/api/sage-memory')) {
        return jsonResponse({ items: [], categories: [], summary: {} });
      }

      if (url.includes('/activity/timeline')) {
        return jsonResponse({ items: [] });
      }

      if (url.includes('/api/events/inbox/stream') || (url.includes('/api/notifications') && url.includes('stream=true'))) {
        return new Response('event: ping\ndata: {}\n\n', {
          headers: {
            'content-type': 'text/event-stream',
          },
        });
      }

      if (url.includes('/api/notifications')) {
        return jsonResponse({ items: [] });
      }

      if (url.includes('/api/turn')) {
        const reply = 'I reviewed the workspace activity and I am ready to continue.';
        return eventStreamResponse([
          {
            delay: 30,
            event: 'trace',
            payload: {
              trace_id: 'trace-live-1',
              event_type: 'reasoning.summary.delta',
              data: {
                delta: 'Inspect workspace state and decide next step',
              },
            },
          },
          {
            delay: 40,
            event: 'trace',
            payload: {
              trace_id: 'trace-live-1',
              event_type: 'search.query',
              tool_call_id: 'search-1',
              data: {
                query: 'gateway reconnect behavior',
              },
            },
          },
          {
            delay: 40,
            event: 'trace',
            payload: {
              trace_id: 'trace-live-1',
              event_type: 'tool.started',
              tool_call_id: 'shell-1',
              data: {
                tool_name: 'shell__exec',
                input: {
                  command: 'tmux ls',
                },
              },
            },
          },
          {
            delay: 40,
            event: 'trace',
            payload: {
              trace_id: 'trace-live-1',
              event_type: 'tool.started',
              tool_call_id: 'file-1',
              data: {
                tool_name: 'file__read',
                input: {
                  path: 'docs/super-app-foundation.md',
                },
              },
            },
          },
          {
            delay: 40,
            event: 'trace',
            payload: {
              trace_id: 'trace-live-1',
              event_type: 'browser.action',
              item_id: 'browser-1',
              data: {
                action: 'navigate',
                status: 'done',
                summary: '{"activity_event_id":"evt-123","status":"ok"}',
              },
            },
          },
          {
            delay: 40,
            event: 'trace',
            payload: {
              trace_id: 'trace-live-1',
              event_type: 'telegram.message.sent',
              item_id: 'telegram-1',
              data: {
                status: 'done',
                summary: 'Prepared the Telegram follow-up.',
              },
            },
          },
          {
            delay: 40,
            event: 'trace',
            payload: {
              trace_id: 'trace-live-1',
              event_type: 'whatsapp.message.sent',
              item_id: 'whatsapp-1',
              data: {
                status: 'done',
                summary: 'Queued the WhatsApp reply for review.',
              },
            },
          },
          {
            delay: 40,
            event: 'trace',
            payload: {
              trace_id: 'trace-live-1',
              event_type: 'screenshot.captured',
              item_id: 'screenshot-1',
              data: {
                status: 'done',
                summary: 'Captured the settings panel.',
              },
            },
          },
          {
            delay: 40,
            event: 'trace',
            payload: {
              trace_id: 'trace-live-1',
              event_type: 'approval.requested',
              item_id: 'approval-1',
              data: {
                approval_id: 'approval-1',
                prompt: 'Send the Telegram message?',
              },
            },
          },
          {
            delay: 40,
            event: 'trace',
            payload: {
              trace_id: 'trace-live-1',
              event_type: 'trace.completed',
              item_id: 'done-1',
              data: {
                summary: '{"trace_id":"trace-live-1","status":"done"}',
              },
            },
          },
          {
            delay: 1500,
            event: 'final',
            payload: {
              status: 'completed',
              reply,
              thread_id: 'primary',
              session_id: 'session-transparency',
              metadata: {
                trace_id: 'trace-live-1',
                effective_provider: 'deepseek',
                effective_model: 'deepseek-chat',
              },
            },
          },
        ]);
      }

      return originalFetch(input, init);
    };
  });
}

test.describe('chat transparency timeline', () => {
  test('renders calm activity rows without leaking hidden reasoning or debug blobs', async ({ page }) => {
    await installTransparencyTurnStub(page);
    await loginAsOwner(page);
    await page.goto('/w/ws-1/sage');

    await expect(page.locator('[data-workstation-chat-composer="root"]')).toBeVisible();
    await expect(page.locator('.app-chat-composer__provider-pill')).toContainText('Light');
    await expect(page.locator('.app-chat-composer__provider-pill')).toContainText('Empyralis credits');
    const composer = page.locator('[data-workstation-chat-composer="root"] textarea');
    await composer.fill('show me what you are doing');
    await composer.press('Enter');

    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="search"]')).toContainText('Searching web');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="shell"]')).toContainText('Running shell');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="file"]')).toContainText('Reading file');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="browser_action"]')).toContainText('Used browser');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="sending_telegram"]')).toContainText('Sending Telegram');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="sending_whatsapp"]')).toContainText('Sending WhatsApp');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="artifact"]')).toContainText('Captured screenshot');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="approval"]')).toContainText('Approval needed');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="done"]')).toContainText('Done');

    await expect(page.getByText(/inspect workspace state and decide next step/i)).toHaveCount(0);
    await expect(page.getByText(/activity_event_id/i)).toHaveCount(0);
    await expect(page.getByText(/trace-live-1/i)).toHaveCount(0);
    await expect(page.locator('[data-chat-role="assistant"]').filter({ hasText: 'Searching web' })).toHaveCount(0);
    await expect(page.locator('[data-chat-role="assistant"]').filter({ hasText: 'Running shell' })).toHaveCount(0);

    await expect(page.locator('[data-chat-role="assistant"]').filter({ hasText: /I reviewed the workspace activity/i })).toBeVisible();
  });
});
