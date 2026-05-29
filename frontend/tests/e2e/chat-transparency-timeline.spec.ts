// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

function installTransparencyTurnStub(page, initialSavedState = null) {
  return page.addInitScript((seedState) => {
    const originalFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const storageKey = 'empyralis-transparency-turn-stub';
    const savedState = (() => {
      if (seedState && typeof seedState === 'object') {
        return seedState;
      }
      try {
        return JSON.parse(sessionStorage.getItem(storageKey) || '{}') || {};
      } catch {
        return {};
      }
    })();
    const state = {
      persistedTurns: Array.isArray(savedState.persistedTurns)
        ? savedState.persistedTurns as Array<Record<string, unknown>>
        : [] as Array<Record<string, unknown>>,
      pendingTranscriptEvents: [] as Array<Record<string, unknown>>,
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

    const persistState = () => {
      sessionStorage.setItem(storageKey, JSON.stringify({
        persistedTurns: state.persistedTurns,
      }));
    };

    const isTranscriptEvent = (event: string, payload: Record<string, unknown>) => {
      if (event !== 'trace' && event !== 'step') {
        return false;
      }
      const eventType = String(payload.event_type ?? '').toLowerCase();
      return eventType !== 'reasoning.summary.delta' && eventType !== 'assistant.message.delta';
    };

    const sanitizeTranscriptPayload = (payload: Record<string, unknown>) => {
      const nextPayload = { ...payload };
      delete nextPayload.trace_id;
      const data = nextPayload.data && typeof nextPayload.data === 'object' && !Array.isArray(nextPayload.data)
        ? { ...(nextPayload.data as Record<string, unknown>) }
        : {};
      for (const key of ['args', 'args_preview', 'arguments', 'input', 'output', 'parameters', 'prompt', 'raw_output', 'result', 'text']) {
        delete data[key];
      }
      const summary = String(data.summary ?? '').trim();
      if (summary.startsWith('{') || summary.startsWith('[') || /activity_event_id|trace_id|raw_/i.test(summary)) {
        delete data.summary;
      }
      nextPayload.data = data;
      return nextPayload;
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
              if (isTranscriptEvent(next.event, next.payload)) {
                state.pendingTranscriptEvents.push({
                  event: next.event,
                  payload: sanitizeTranscriptPayload(next.payload),
                });
              }
              if (next.event === 'final') {
                state.persistedTurns.push({
                  id: 'turn-assistant-1',
                  role: 'assistant',
                  status: 'completed',
                  content: String(next.payload.reply ?? ''),
                  created_at: new Date().toISOString(),
                  metadata: {
                    request_id: 'req-1',
                    trace_id: 'trace-live-1',
                    transcript_events: state.pendingTranscriptEvents,
                  },
                });
                persistState();
              }
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
        persistState();
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

      if (url.includes('/api/agent-traces/trace-legacy-1')) {
        return jsonResponse({
          trace: {
            id: 'trace-legacy-1',
            workspace_id: 'ws-1',
            thread_id: 'primary',
            outcome: 'success',
          },
          events: [
            {
              id: 'legacy-event-1',
              trace_id: 'trace-legacy-1',
              seq: 1,
              ts: '2026-05-23T10:00:00Z',
              event_type: 'search.query',
              tool_call_id: 'legacy-search',
              data: {
                query: 'legacy trace replay',
                raw_output: 'hidden raw output',
              },
            },
            {
              id: 'legacy-event-2',
              trace_id: 'trace-legacy-1',
              seq: 2,
              ts: '2026-05-23T10:00:01Z',
              event_type: 'tool.result',
              tool_call_id: 'legacy-shell',
              data: {
                tool_name: 'shell__exec',
                input: {
                  command: 'rm -rf hidden-raw-command',
                },
                status: 'done',
                summary: 'Legacy command completed.',
              },
            },
            {
              id: 'legacy-event-3',
              trace_id: 'trace-legacy-1',
              seq: 3,
              ts: '2026-05-23T10:00:02Z',
              event_type: 'screenshot.captured',
              item_id: 'legacy-shot',
              data: {
                artifact_id: 'legacy-artifact-1',
                status: 'done',
                summary: 'Legacy screenshot captured.',
              },
            },
          ],
        });
      }

      if (url.includes('/api/turn')) {
        const reply = 'I reviewed the workspace activity and I am ready to continue.';
        state.pendingTranscriptEvents = [];
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
                artifact_id: 'artifact-screenshot-1',
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
              event_type: 'approval.resolved',
              approval_id: 'approval-1',
              data: {
                decision: 'approved',
                actor: 'owner',
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
  }, initialSavedState);
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
    await composer.fill('/');
    await expect(page.locator('.app-chat-composer__command-list')).toBeVisible();
    await expect(page.getByText('/proof')).toHaveCount(0);
    await expect(page.getByRole('option', { name: /show proof/i })).toHaveCount(0);
    await composer.fill('show me what you are doing');
    await composer.press('Enter');

    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="search"]')).toContainText('Searching web');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="shell"]')).toContainText('Running shell');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="file"]')).toContainText('Reading file');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="browser_action"]')).toContainText('Used browser');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="sending_telegram"]')).toContainText('Sending Telegram');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="sending_whatsapp"]')).toContainText('Sending WhatsApp');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="artifact"]')).toContainText('Captured screenshot');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="artifact"]').getByRole('link', { name: 'Open' })).toHaveAttribute('href', /artifact-screenshot-1/);
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="approval"]')).toContainText('Approval approved');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="done"]')).toContainText('Done');

    await expect(page.getByText(/inspect workspace state and decide next step/i)).toHaveCount(0);
    await expect(page.getByText(/activity_event_id/i)).toHaveCount(0);
    await expect(page.getByText(/trace-live-1/i)).toHaveCount(0);
    await expect(page.locator('[data-chat-role="assistant"]').filter({ hasText: 'Searching web' })).toHaveCount(0);
    await expect(page.locator('[data-chat-role="assistant"]').filter({ hasText: 'Running shell' })).toHaveCount(0);

    await expect(page.locator('[data-chat-role="assistant"]').filter({ hasText: /I reviewed the workspace activity/i })).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-workstation-chat-composer="root"]')).toBeVisible();
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="search"]')).toContainText('Searching web');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="shell"]')).toContainText('Running shell');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="file"]')).toContainText('Reading file');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="browser_action"]')).toContainText('Used browser');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="artifact"]')).toContainText('Captured screenshot');
    await expect(page.locator('[data-chat-role="assistant"]').filter({ hasText: /I reviewed the workspace activity/i })).toBeVisible();
  });

  test('does not render persisted thinking rows in historical transcript', async ({ page }) => {
    await installTransparencyTurnStub(page, {
      persistedTurns: [
        {
          id: 'turn-user-thinking',
          role: 'user',
          status: 'completed',
          content: 'run safety plan check',
          created_at: '2026-05-23T12:00:00Z',
          metadata: {},
        },
        {
          id: 'turn-assistant-thinking-row',
          role: 'assistant',
          status: 'completed',
          content: 'planning the response',
          created_at: '2026-05-23T12:00:01Z',
          metadata: {
            display_kind: 'thinking_row',
            thinking_text: 'I need to evaluate options first.',
          },
        },
        {
          id: 'turn-assistant-thinking-final',
          role: 'assistant',
          status: 'completed',
          content: 'Safety plan check complete.',
          created_at: '2026-05-23T12:00:02Z',
          metadata: {
            request_id: 'req-thinking-final',
            trace_id: 'trace-thinking-final',
            transcript_events: [
              {
                event: 'trace',
                schema_version: 1,
                payload: {
                  event_type: 'tool.started',
                  tool_call_id: 'tool-thinking-1',
                  data: {
                    tool_name: 'security__scan',
                  },
                },
              },
            ],
          },
        },
      ],
    });
    await loginAsOwner(page);
    await page.goto('/w/ws-1/sage');

    await expect(page.locator('article.app-chat-message[data-chat-role="assistant"]').filter({ hasText: 'Safety plan check complete.' })).toBeVisible();
    await expect(page.getByText(/planning the response/i)).toHaveCount(0);
    await expect(page.locator('.app-chat-thinking-row')).toHaveCount(0);
    await expect(page.getByText(/thought through response/i)).toHaveCount(0);

    await page.reload();

    await expect(page.locator('article.app-chat-message[data-chat-role="assistant"]').filter({ hasText: 'Safety plan check complete.' })).toBeVisible();
    await expect(page.getByText(/planning the response/i)).toHaveCount(0);
    await expect(page.locator('.app-chat-thinking-row')).toHaveCount(0);
    await expect(page.getByText(/thought through response/i)).toHaveCount(0);
  });

  test('replays older trace IDs inline without exposing raw trace data', async ({ page }) => {
    await installTransparencyTurnStub(page, {
      persistedTurns: [
        {
          id: 'turn-user-legacy',
          role: 'user',
          status: 'completed',
          content: 'show legacy work',
          created_at: '2026-05-23T10:00:00Z',
          metadata: {},
        },
        {
          id: 'turn-assistant-legacy',
          role: 'assistant',
          status: 'completed',
          content: 'Legacy answer is ready.',
          created_at: '2026-05-23T10:00:03Z',
          metadata: {
            trace_id: 'trace-legacy-1',
          },
        },
      ],
    });
    await loginAsOwner(page);
    await page.goto('/w/ws-1/sage');

    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="search"]')).toContainText('legacy trace replay');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="shell"]')).toContainText('Ran command');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="artifact"]')).toContainText('Captured screenshot');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="artifact"]').getByRole('link', { name: 'Open' })).toHaveAttribute('href', /legacy-artifact-1/);
    await expect(page.locator('[data-chat-role="assistant"]').filter({ hasText: 'Legacy answer is ready.' })).toBeVisible();
    await expect(page.getByText(/trace-legacy-1/i)).toHaveCount(0);
    await expect(page.getByText(/hidden raw output/i)).toHaveCount(0);
    await expect(page.getByText(/rm -rf hidden-raw-command/i)).toHaveCount(0);
  });

  test('replays persisted hardware completion artifacts inside the chat transcript', async ({ page }) => {
    await installTransparencyTurnStub(page, {
      persistedTurns: [
        {
          id: 'turn-user-hardware',
          role: 'user',
          status: 'completed',
          content: 'run the self-hosted check',
          created_at: '2026-05-23T11:00:00Z',
          metadata: {},
        },
        {
          id: 'turn-assistant-hardware',
          role: 'assistant',
          status: 'completed',
          content: 'The hardware check completed.',
          created_at: '2026-05-23T11:00:03Z',
          metadata: {
            request_id: 'req-hardware-1',
            trace_id: 'trace-hardware-1',
            transcript_events: [
              {
                event: 'trace',
                schema_version: 1,
                payload: {
                  event_type: 'delegation.started',
                  item_id: 'delegation-hardware-1',
                  data: {
                    specialist_id: 'specialist-secret',
                    specialist_name: 'Research Specialist',
                    task_summary: 'Check the hardware result.',
                    provider: 'deepseek',
                    prompt: 'hidden child prompt',
                  },
                },
              },
              {
                event: 'trace',
                schema_version: 1,
                payload: {
                  event_type: 'delegation.finished',
                  item_id: 'delegation-hardware-1',
                  data: {
                    status: 'completed',
                    result_summary: 'Research Specialist checked the result.',
                    model_id: 'deepseek-v4-pro',
                    trace_id: 'trace-child-secret',
                  },
                },
              },
              {
                event: 'trace',
                schema_version: 1,
                payload: {
                  event_type: 'approval.resolved',
                  approval_id: 'approval-hardware-1',
                  data: {
                    approval_id: 'approval-hardware-1',
                    decision: 'approved',
                    actor: 'owner',
                  },
                },
              },
              {
                event: 'trace',
                schema_version: 1,
                payload: {
                  event_type: 'artifact.created',
                  artifact_id: 'artifact-hardware-1',
                  data: {
                    kind: 'hardware_action',
                    title: 'Self-hosted output bundle',
                    artifact_id: 'artifact-hardware-1',
                    mime_type: 'application/json',
                  },
                },
              },
              {
                event: 'trace',
                schema_version: 1,
                payload: {
                  event_type: 'file.read',
                  item_id: 'file-hardware-1',
                  data: {
                    status: 'completed',
                    path: 'reports/current-status.md',
                    result: 'raw file body should stay hidden',
                  },
                },
              },
              {
                event: 'trace',
                schema_version: 1,
                payload: {
                  event_type: 'gateway.offline',
                  item_id: 'gateway-offline-1',
                  data: {
                    runtime_target: 'user_device_gateway',
                    state: 'offline',
                    summary: 'Gateway is unavailable.',
                    raw_output: 'hidden gateway detail',
                  },
                },
              },
              {
                event: 'trace',
                schema_version: 1,
                payload: {
                  event_type: 'assistant.message.delta',
                  data: {
                    text: 'hidden assistant delta',
                  },
                },
              },
              {
                event: 'trace',
                schema_version: 1,
                payload: {
                  event_type: 'tool.result',
                  tool_call_id: 'req-hardware-1',
                  data: {
                    status: 'completed',
                    summary: 'Self-hosted command completed.',
                    tool_name: 'shell.execute',
                    capability_id: 'shell.execute',
                    runtime_target: 'self_hosted_node',
                    runtime_access_mode: 'full_access',
                    runtime_session_id: 'hrs-hardware-1',
                    request_id: 'req-hardware-1',
                  },
                },
              },
            ],
          },
        },
      ],
    });
    await loginAsOwner(page);
    await page.goto('/w/ws-1/sage');

    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="approval"]')).toContainText('Approval approved');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="artifact"]')).toContainText('Created artifact');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="artifact"]').getByRole('link', { name: 'Open' })).toHaveAttribute('href', /artifact-hardware-1/);
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="delegated_to_research_specialist"]')).toContainText('Delegated to Research Specialist');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="specialist_finished"]')).toContainText('Specialist finished');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="specialist_finished"]')).toContainText('Research Specialist checked the result.');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="file"]')).toContainText('Read file');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="file"]')).toContainText('reports/current-status.md');
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="gateway_offline"]')).toContainText(/Gateway offline/i);
    await expect(page.locator('[data-chat-role="system"][data-chat-activity-kind="shell"]')).toContainText('Ran command');
    await expect(page.locator('[data-chat-role="assistant"]').filter({ hasText: 'The hardware check completed.' })).toBeVisible();
    await expect(page.getByText(/trace-hardware-1/i)).toHaveCount(0);
    await expect(page.getByText(/hrs-hardware-1/i)).toHaveCount(0);
    await expect(page.getByText(/raw file body should stay hidden/i)).toHaveCount(0);
    await expect(page.getByText(/hidden gateway detail/i)).toHaveCount(0);
    await expect(page.getByText(/hidden assistant delta/i)).toHaveCount(0);
    await expect(page.getByText(/specialist-secret/i)).toHaveCount(0);
    await expect(page.getByText(/hidden child prompt/i)).toHaveCount(0);
    await expect(page.getByText(/deepseek-v4-pro/i)).toHaveCount(0);
    await expect(page.getByText(/trace-child-secret/i)).toHaveCount(0);
  });
});
