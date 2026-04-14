// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

function buildAgent(overrides = {}) {
  return {
    id: 'dagent-seed',
    owner_workspace_id: 'ws-1',
    backing_install_id: 'ainstall-seed',
    name: 'Store Assistant',
    avatar: 'https://example.com/avatar.png',
    persona: 'Retail support specialist',
    system_prompt: 'Use the catalog and return policy.',
    deployment_state: 'draft',
    channels: {
      telegram: {
        enabled: true,
        endpoint_key: 'store-bot',
      },
    },
    knowledge_sources: [{ id: 'kb-1', uri: 'kb://catalog', label: 'kb://catalog' }],
    runtime_target: 'cloud',
    billing_plan: 'free',
    provider: 'openai',
    model: 'gpt-4o',
    metadata: {
      provider: 'openai',
      model: 'gpt-4o',
      memory_enabled: false,
      monthly_cost_cap_usd: 25,
      current_budget_cycle: {
        usage_month: '2026-04-01',
        current_burn_usd: 8,
        percent_used: 32,
        last_threshold_reached: 'none',
      },
    },
    created_at: '2026-04-13T10:00:00Z',
    updated_at: '2026-04-13T10:00:00Z',
    ...overrides,
  };
}

function buildProviderCatalog() {
  return {
    workspace_id: 'ws-1',
    summary: { provider_total: 4 },
    providers: [
      {
        id: 'openai',
        label: 'OpenAI',
        state: 'active',
        default_model: 'gpt-4o',
        privacy_posture: 'Managed API with vendor-hosted processing.',
        jurisdiction: 'United States',
        residency: 'Provider-managed cloud regions.',
        capability_labels: ['Tools', 'Fast', 'Hosted API'],
        models: [
          {
            id: 'gpt-4o',
            label: 'GPT-4o',
            context_window_tokens: 128000,
            input_cost_per_1k_usd: 0.005,
            output_cost_per_1k_usd: 0.015,
            capability_labels: ['Balanced', 'Tools', 'Multimodal'],
          },
          {
            id: 'gpt-4o-mini',
            label: 'GPT-4o Mini',
            context_window_tokens: 128000,
            input_cost_per_1k_usd: 0.00015,
            output_cost_per_1k_usd: 0.0006,
            capability_labels: ['Low cost', 'Fast', 'Tools'],
          },
        ],
      },
      {
        id: 'anthropic',
        label: 'Anthropic',
        state: 'active',
        default_model: 'claude-3-5-sonnet-20241022',
        privacy_posture: 'Managed API or local Claude subscription transport.',
        jurisdiction: 'United States',
        residency: 'Provider-managed cloud regions or local CLI session.',
        capability_labels: ['Reasoning', 'Long context', 'Tools'],
        models: [
          {
            id: 'claude-3-5-sonnet-20241022',
            label: 'Claude 3.5 Sonnet',
            context_window_tokens: 200000,
            input_cost_per_1k_usd: 0.003,
            output_cost_per_1k_usd: 0.015,
            capability_labels: ['Reasoning', 'Long context', 'Tools'],
          },
        ],
      },
      {
        id: 'deepseek',
        label: 'DeepSeek',
        state: 'configured',
        default_model: 'deepseek-chat',
        privacy_posture: 'Managed third-party API.',
        jurisdiction: 'Third-party hosted service',
        residency: 'Provider-managed cloud regions.',
        capability_labels: ['Reasoning', 'Cost-efficient', 'Hosted API'],
        models: [
          {
            id: 'deepseek-chat',
            label: 'DeepSeek Chat',
            context_window_tokens: 128000,
            input_cost_per_1k_usd: 0,
            output_cost_per_1k_usd: 0,
            capability_labels: ['Low cost', 'Fast', 'Hosted API'],
          },
          {
            id: 'deepseek-reasoner',
            label: 'DeepSeek Reasoner',
            context_window_tokens: 128000,
            input_cost_per_1k_usd: 0,
            output_cost_per_1k_usd: 0,
            capability_labels: ['Reasoning', 'Low cost', 'Hosted API'],
          },
        ],
      },
      {
        id: 'ollama',
        label: 'Ollama',
        state: 'configured',
        default_model: 'llama3.2',
        privacy_posture: 'Local or self-hosted inference on your own machine.',
        jurisdiction: 'Self-hosted / operator-controlled',
        residency: 'Local machine or self-hosted runtime.',
        capability_labels: ['Local', 'Self-hosted', 'Offline-capable'],
        models: [
          {
            id: 'llama3.2',
            label: 'Llama 3.2',
            context_window_tokens: 128000,
            input_cost_per_1k_usd: 0,
            output_cost_per_1k_usd: 0,
            capability_labels: ['Local', 'Self-hosted', 'Offline-capable'],
          },
        ],
      },
    ],
  };
}

function buildConversationRecord(overrides = {}) {
  return {
    session_id: 'sess-1',
    channel: 'telegram',
    last_message: 'Can I return this order?',
    last_message_at: '2026-04-13T12:05:00Z',
    customer: {
      id: 'customer-1',
      label: 'Customer One',
      type: 'customer',
    },
    latest_run_id: 'run-1',
    escalation_state: 'approval_requested',
    outcome: 'completed',
    ...overrides,
  };
}

function buildConversationList(agentId: string, items = [buildConversationRecord({ session_id: `sess-${agentId}` })]) {
  return {
    deployed_agent_id: agentId,
    items,
    offset: 0,
    limit: 50,
    has_more: false,
  };
}

function buildConversationDetail(agentId: string, sessionId = `sess-${agentId}`, overrides = {}) {
  return {
    deployed_agent_id: agentId,
    session_id: sessionId,
    channel: 'telegram',
    thread_id: 'thread-1',
    run_ids: ['run-1'],
    messages: [
      {
        id: 'msg-1',
        kind: 'message',
        direction: 'inbound',
        text: 'Can I return this order?',
        ts: '2026-04-13T12:00:00Z',
      },
      {
        id: 'msg-2',
        kind: 'message',
        direction: 'outbound',
        text: 'Let me check the return policy.',
        ts: '2026-04-13T12:00:05Z',
      },
    ],
    tool_calls: [
      {
        id: 'tool-1',
        kind: 'tool_call',
        tool_name: 'telegram_bot.send_message',
        summary: 'Connector action completed: telegram_bot.send_message.',
        ts: '2026-04-13T12:00:05Z',
      },
    ],
    approval_events: [
      {
        id: 'approval-1',
        kind: 'approval',
        summary: 'Approval requested for return exception.',
        ts: '2026-04-13T12:00:07Z',
      },
    ],
    escalation_events: [
      {
        id: 'escalation-1',
        kind: 'escalation',
        summary: 'Escalation triggered for manual review.',
        ts: '2026-04-13T12:00:08Z',
      },
    ],
    entries: [
      {
        id: 'msg-1',
        kind: 'message',
        direction: 'inbound',
        text: 'Can I return this order?',
        ts: '2026-04-13T12:00:00Z',
      },
      {
        id: 'msg-2',
        kind: 'message',
        direction: 'outbound',
        text: 'Let me check the return policy.',
        ts: '2026-04-13T12:00:05Z',
      },
      {
        id: 'tool-1',
        kind: 'tool_call',
        tool_name: 'telegram_bot.send_message',
        summary: 'Connector action completed: telegram_bot.send_message.',
        ts: '2026-04-13T12:00:05Z',
      },
      {
        id: 'approval-1',
        kind: 'approval',
        summary: 'Approval requested for return exception.',
        ts: '2026-04-13T12:00:07Z',
      },
      {
        id: 'escalation-1',
        kind: 'escalation',
        summary: 'Escalation triggered for manual review.',
        ts: '2026-04-13T12:00:08Z',
      },
    ],
    outcome: 'completed',
    customer: {
      id: 'customer-1',
      label: 'Customer One',
      type: 'customer',
    },
    ...overrides,
  };
}

function buildAnalytics(agentId: string, overrides = {}) {
  return {
    deployed_agent_id: agentId,
    active_users_last_30d: 12,
    message_volume: {
      day: 3,
      week: 18,
      month: 58,
      latest_message_at: '2026-04-13T12:05:00Z',
    },
    escalation: {
      total_sessions: 3,
      escalated_sessions: 1,
      rate: 0.3333,
      rate_percent: 33.33,
    },
    outcomes: {
      counts: {
        completed: 2,
        open: 1,
      },
      top_outcome: 'completed',
    },
    cost_burn: {
      usage_month: '2026-04-01',
      current_burn_usd: 8,
      cap_usd: 25,
      percent_used: 32,
      last_threshold_reached: 'none',
    },
    ...overrides,
  };
}

test.describe('deployed agents surface', () => {
  test('route registers in workstation navigation', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/w/ws-1/chat');

    await expect(page.getByRole('link', { name: /deployed agents/i })).toBeVisible();
    await page.getByRole('link', { name: /deployed agents/i }).click();
    await expect(page).toHaveURL(/\/w\/ws-1\/deployed-agents$/);
    await expect(page.locator('[data-workstation-surface="deployed-agents"]')).toBeVisible();
  });

  test('wizard, deploy, pause, inbox, and transcript flow render through the deployed-agent APIs', async ({ page }) => {
    await loginAsOwner(page);
    const agents = [buildAgent()];
    const providerCatalog = buildProviderCatalog();
    const seedConversations = [
      buildConversationRecord({
        session_id: `sess-${agents[0].id}-telegram-open`,
        channel: 'telegram',
        last_message: 'Can I return this order?',
        last_message_at: '2026-04-13T12:05:00Z',
        customer: {
          id: 'customer-1',
          label: 'Customer One',
          type: 'customer',
        },
        latest_run_id: 'run-1',
        escalation_state: 'approval_requested',
        outcome: 'open',
      }),
      buildConversationRecord({
        session_id: `sess-${agents[0].id}-whatsapp-open`,
        channel: 'whatsapp',
        last_message: 'I need a human for shipping support.',
        last_message_at: '2026-04-13T12:09:00Z',
        customer: {
          id: 'customer-2',
          label: 'Customer Two',
          type: 'customer',
        },
        latest_run_id: 'run-2',
        escalation_state: 'escalated',
        outcome: 'open',
      }),
      buildConversationRecord({
        session_id: `sess-${agents[0].id}-telegram-complete`,
        channel: 'telegram',
        last_message: 'Thanks, that solved it.',
        last_message_at: '2026-04-13T11:55:00Z',
        customer: {
          id: 'customer-3',
          label: 'Customer Three',
          type: 'customer',
        },
        latest_run_id: 'run-3',
        escalation_state: 'clear',
        outcome: 'completed',
      }),
    ];
    const analyticsByAgent = new Map([
      [
        agents[0].id,
        buildAnalytics(agents[0].id, {
          escalation: {
            total_sessions: 3,
            escalated_sessions: 2,
            rate: 0.6667,
            rate_percent: 66.67,
          },
          outcomes: {
            counts: {
              open: 2,
              completed: 1,
            },
            top_outcome: 'open',
          },
        }),
      ],
    ]);
    const conversationsByAgent = new Map([[agents[0].id, buildConversationList(agents[0].id, seedConversations)]]);
    const transcriptsByAgent = new Map([
      [
        `${agents[0].id}:sess-${agents[0].id}-telegram-open`,
        buildConversationDetail(agents[0].id, `sess-${agents[0].id}-telegram-open`, {
          outcome: 'open',
          customer: {
            id: 'customer-1',
            label: 'Customer One',
            type: 'customer',
          },
        }),
      ],
      [
        `${agents[0].id}:sess-${agents[0].id}-whatsapp-open`,
        buildConversationDetail(agents[0].id, `sess-${agents[0].id}-whatsapp-open`, {
          channel: 'whatsapp',
          run_ids: ['run-2'],
          customer: {
            id: 'customer-2',
            label: 'Customer Two',
            type: 'customer',
          },
          messages: [
            {
              id: 'msg-3',
              kind: 'message',
              direction: 'inbound',
              text: 'I need a human for shipping support.',
              ts: '2026-04-13T12:08:00Z',
            },
            {
              id: 'msg-4',
              kind: 'message',
              direction: 'outbound',
              text: 'Escalating this to human support now.',
              ts: '2026-04-13T12:08:05Z',
            },
          ],
          tool_calls: [
            {
              id: 'tool-2',
              kind: 'tool_call',
              tool_name: 'whatsapp.send_message',
              summary: 'Connector action completed: whatsapp.send_message.',
              ts: '2026-04-13T12:08:05Z',
            },
          ],
          approval_events: [],
          escalation_events: [
            {
              id: 'escalation-2',
              kind: 'escalation',
              summary: 'Escalated to human shipping support.',
              ts: '2026-04-13T12:08:06Z',
            },
          ],
          entries: [
            {
              id: 'msg-3',
              kind: 'message',
              direction: 'inbound',
              text: 'I need a human for shipping support.',
              ts: '2026-04-13T12:08:00Z',
            },
            {
              id: 'msg-4',
              kind: 'message',
              direction: 'outbound',
              text: 'Escalating this to human support now.',
              ts: '2026-04-13T12:08:05Z',
            },
            {
              id: 'tool-2',
              kind: 'tool_call',
              tool_name: 'whatsapp.send_message',
              summary: 'Connector action completed: whatsapp.send_message.',
              ts: '2026-04-13T12:08:05Z',
            },
            {
              id: 'escalation-2',
              kind: 'escalation',
              summary: 'Escalated to human shipping support.',
              ts: '2026-04-13T12:08:06Z',
            },
          ],
          outcome: 'open',
        }),
      ],
      [
        `${agents[0].id}:sess-${agents[0].id}-telegram-complete`,
        buildConversationDetail(agents[0].id, `sess-${agents[0].id}-telegram-complete`, {
          run_ids: ['run-3'],
          customer: {
            id: 'customer-3',
            label: 'Customer Three',
            type: 'customer',
          },
          messages: [
            {
              id: 'msg-5',
              kind: 'message',
              direction: 'inbound',
              text: 'Thanks, that solved it.',
              ts: '2026-04-13T11:54:00Z',
            },
            {
              id: 'msg-6',
              kind: 'message',
              direction: 'outbound',
              text: 'Glad that resolved the issue.',
              ts: '2026-04-13T11:54:03Z',
            },
          ],
          tool_calls: [],
          approval_events: [],
          escalation_events: [],
          entries: [
            {
              id: 'msg-5',
              kind: 'message',
              direction: 'inbound',
              text: 'Thanks, that solved it.',
              ts: '2026-04-13T11:54:00Z',
            },
            {
              id: 'msg-6',
              kind: 'message',
              direction: 'outbound',
              text: 'Glad that resolved the issue.',
              ts: '2026-04-13T11:54:03Z',
            },
          ],
          outcome: 'completed',
        }),
      ],
    ]);

    await page.route('**/providers/catalog**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(providerCatalog),
      });
    });

    await page.route('**/api/deployed-agents**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method().toUpperCase();
      const segments = path.split('/').filter(Boolean);

      if (segments.length === 2 && segments[0] === 'api' && segments[1] === 'deployed-agents' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: agents }),
        });
        return;
      }

      if (segments.length === 3 && segments[0] === 'api' && segments[1] === 'deployed-agents' && segments[2] === 'analytics' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: Array.from(analyticsByAgent.values()) }),
        });
        return;
      }

      if (segments.length === 2 && segments[0] === 'api' && segments[1] === 'deployed-agents' && method === 'POST') {
        const body = request.postDataJSON();
        const created = buildAgent({
          id: 'dagent-new',
          backing_install_id: 'ainstall-new',
          name: body.name,
          avatar: body.avatar,
          persona: body.persona,
          system_prompt: body.system_prompt,
          channels: body.channels,
          knowledge_sources: body.knowledge_sources,
          runtime_target: body.runtime_target,
          billing_plan: body.billing_plan,
          provider: body.provider ?? 'openai',
          model: body.model ?? 'gpt-4o',
          metadata: body.metadata ?? {},
          deployment_state: 'draft',
          updated_at: '2026-04-13T12:00:00Z',
        });
        created.metadata = {
          ...(created.metadata ?? {}),
          provider: created.provider,
          model: created.model,
        };
        agents.unshift(created);
        analyticsByAgent.set(
          created.id,
          buildAnalytics(created.id, {
            active_users_last_30d: 0,
            message_volume: {
              day: 0,
              week: 0,
              month: 0,
              latest_message_at: null,
            },
            escalation: {
              total_sessions: 0,
              escalated_sessions: 0,
              rate: 0,
              rate_percent: 0,
            },
            outcomes: {
              counts: {},
              top_outcome: 'open',
            },
            cost_burn: {
              usage_month: '2026-04-01',
              current_burn_usd: 0,
              cap_usd: body.metadata?.monthly_cost_cap_usd ?? null,
              percent_used: 0,
              last_threshold_reached: 'none',
            },
          }),
        );
        conversationsByAgent.set(created.id, buildConversationList(created.id));
        transcriptsByAgent.set(`${created.id}:sess-${created.id}`, buildConversationDetail(created.id));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
        return;
      }

      if (segments.length >= 3 && segments[0] === 'api' && segments[1] === 'deployed-agents') {
        const deployedAgentId = segments[2];
        const agentIndex = agents.findIndex((item) => item.id === deployedAgentId);
        const agent = agentIndex >= 0 ? agents[agentIndex] : null;

        if (!agent) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Not found.' }),
          });
          return;
        }

        if (segments.length === 3 && method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(agent),
          });
          return;
        }

        if (segments.length === 4 && segments[3] === 'analytics' && method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(analyticsByAgent.get(deployedAgentId) ?? buildAnalytics(deployedAgentId)),
          });
          return;
        }

        if (segments.length === 3 && method === 'PATCH') {
          const body = request.postDataJSON();
          const updated = {
            ...agent,
            ...body,
            system_prompt: body.system_prompt ?? agent.system_prompt,
            knowledge_sources: body.knowledge_sources ?? agent.knowledge_sources,
            deployment_state: body.deployment_state ?? agent.deployment_state,
            provider: body.provider ?? agent.provider,
            model: body.model ?? agent.model,
            metadata: {
              ...(agent.metadata ?? {}),
              ...(body.metadata ?? {}),
              provider: body.provider ?? agent.provider,
              model: body.model ?? agent.model,
            },
            updated_at: '2026-04-13T12:02:00Z',
          };
          agents[agentIndex] = updated;
          analyticsByAgent.set(
            deployedAgentId,
            buildAnalytics(deployedAgentId, {
              cost_burn: {
                ...(analyticsByAgent.get(deployedAgentId)?.cost_burn ?? {}),
                cap_usd: body.metadata?.monthly_cost_cap_usd ?? analyticsByAgent.get(deployedAgentId)?.cost_burn?.cap_usd ?? 25,
              },
            }),
          );
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(updated),
          });
          return;
        }

        if (segments.length === 4 && segments[3] === 'deploy' && method === 'POST') {
          const updated = {
            ...agent,
            deployment_state: 'live',
            updated_at: '2026-04-13T12:03:00Z',
          };
          agents[agentIndex] = updated;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(updated),
          });
          return;
        }

        if (segments.length === 4 && segments[3] === 'pause' && method === 'POST') {
          const updated = {
            ...agent,
            deployment_state: 'paused',
            updated_at: '2026-04-13T12:04:00Z',
          };
          agents[agentIndex] = updated;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(updated),
          });
          return;
        }

        if (segments.length === 4 && segments[3] === 'conversations' && method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(conversationsByAgent.get(deployedAgentId) ?? buildConversationList(deployedAgentId)),
          });
          return;
        }

        if (segments.length === 5 && segments[3] === 'conversations' && method === 'GET') {
          const sessionId = segments[4];
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              transcriptsByAgent.get(`${deployedAgentId}:${sessionId}`) ?? buildConversationDetail(deployedAgentId),
            ),
          });
          return;
        }

        if (segments.length === 6 && segments[3] === 'external-users' && segments[5] === 'delete' && method === 'POST') {
          const externalUserId = segments[4];
          const existing = conversationsByAgent.get(deployedAgentId) ?? buildConversationList(deployedAgentId);
          const nextItems = (existing.items ?? []).filter((item) => item.customer?.id !== externalUserId);
          conversationsByAgent.set(deployedAgentId, {
            ...existing,
            items: nextItems,
          });
          for (const key of Array.from(transcriptsByAgent.keys())) {
            if (!key.startsWith(`${deployedAgentId}:`)) {
              continue;
            }
            const transcript = transcriptsByAgent.get(key);
            if (transcript?.customer?.id === externalUserId) {
              transcriptsByAgent.delete(key);
            }
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              deployed_agent_id: deployedAgentId,
              channel: 'telegram',
              external_user_id: externalUserId,
              deleted_counts: {
                deleted_channel_event_count: 4,
                deleted_memory_count: 1,
                deleted_daily_usage_count: 2,
                deleted_acquisition_touch_count: 1,
              },
              request: { id: 'privreq_1', status: 'completed' },
              audit: { id: 'privaudit_1' },
            }),
          });
          return;
        }
      }

      await route.fallback();
    });

    await page.goto('/w/ws-1/deployed-agents');

    const surface = page.locator('[data-workstation-surface="deployed-agents"]');
    await expect(surface).toBeVisible();
    await expect(surface).toContainText(/workspace deployments/i);
    await expect(surface).toContainText(/store assistant/i);
    await expect(surface).toContainText(/12 active · 58 msgs \/ 30d/i);
    await expect(surface).toContainText(/3 conversations/i);
    await expect(surface).toContainText(/2 unresolved/i);
    await expect(surface).toContainText(/openai · gpt-4o/i);
    await expect(surface).toContainText(/\$25\.00/);
    await expect(surface).toContainText(/\$8\.00/);
    await expect(page.locator('[data-deployed-agent-analytics="detail"]')).toContainText(/active users \(30d\)/i);
    await expect(page.locator('[data-deployed-agent-analytics="detail"]')).toContainText(/66\.7%/i);
    await expect(page.locator('[data-deployed-agent-analytics="detail"]')).toContainText(/open 2 · completed 1/i);
    await expect(page.locator('[data-deployed-agent-conversations="list"]')).toContainText(/customer one/i);
    await expect(page.locator('[data-deployed-agent-conversations="list"]')).toContainText(/customer two/i);
    await expect(page.locator('[data-deployed-agent-conversations="list"]')).toContainText(/customer three/i);
    await expect(page.locator('[data-deployed-agent-transcript="detail"]')).toContainText(/telegram_bot\.send_message/i);
    await expect(page.locator('[data-deployed-agent-transcript="detail"]')).toContainText(/approval requested/i);
    await expect(page.locator('[data-deployed-agent-transcript="detail"]')).toContainText(/escalation triggered/i);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /delete customer data/i }).click();
    await expect(surface).toContainText(/deleted stored data for customer one/i);
    await expect(page.locator('[data-deployed-agent-conversations="list"]')).not.toContainText(/customer one/i);
    await page.getByLabel(/channel filter/i).selectOption('whatsapp');
    await expect(surface).toContainText(/showing 1 of 2 customer sessions/i);
    await expect(page.locator('[data-deployed-agent-conversations="list"]')).toContainText(/customer two/i);
    await expect(page.locator('[data-deployed-agent-conversations="list"]')).not.toContainText(/customer one/i);
    await page.getByLabel(/escalation filter/i).selectOption('escalated');
    await page.getByLabel(/outcome filter/i).selectOption('open');
    await expect(page.locator('[data-deployed-agent-transcript="detail"]')).toContainText(/whatsapp\.send_message/i);
    await expect(page.locator('[data-deployed-agent-transcript="detail"]')).toContainText(/human shipping support/i);
    await page.getByRole('button', { name: /clear filters/i }).click();
    await expect(surface).toContainText(/showing 2 of 2 customer sessions/i);
    await expect(page.locator('[data-deployed-agent-conversations="list"]')).not.toContainText(/customer one/i);

    await page.getByRole('button', { name: /create deployed agent/i }).click();
    await expect(page.locator('[data-deployed-agent-wizard="root"]')).toBeVisible();
    await page.getByLabel(/agent name/i).fill('Returns Concierge');
    await page.getByLabel(/avatar url/i).fill('https://example.com/returns.png');
    await page.getByLabel(/persona/i).fill('Returns-focused retail specialist');
    await page.getByLabel(/system prompt/i).fill('Use return policy and order lookups before escalating.');
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByLabel(/knowledge references/i).fill('kb://returns\nkb://orders');
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByLabel(/telegram state/i).selectOption('enabled');
    await page.getByLabel(/telegram endpoint key/i).fill('returns-bot');
    await page.getByRole('button', { name: /continue/i }).click();
    await page.locator('[data-deployed-agent-provider-select="true"]').selectOption('deepseek');
    await page.locator('[data-deployed-agent-model-select="true"]').selectOption('deepseek-reasoner');
    await expect(page.locator('[data-deployed-agent-wizard="root"]')).toContainText(/managed third-party api/i);
    await expect(page.locator('[data-deployed-agent-wizard="root"]')).toContainText(/reasoning, low cost, hosted api/i);
    await page.getByLabel(/runtime target/i).selectOption('cloud');
    await page.getByLabel(/billing plan/i).selectOption('free');
    await page.getByLabel(/persistent memory/i).selectOption('enabled');
    await page.getByLabel(/daily message limit/i).fill('25');
    await page.getByLabel(/monthly cost cap \(usd\)/i).fill('25');
    await page.getByLabel(/upgrade cta label/i).fill('Continue on Empyralist');
    await page.getByLabel(/upgrade cta url/i).fill('https://app.empyralist.com/signup');
    await page.getByRole('button', { name: /create draft deployment/i }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /create draft deployment/i }).click();

    await expect(surface).toContainText(/created draft deployment returns concierge/i);
    await expect(surface).toContainText(/returns concierge/i);
    await expect(surface).toContainText(/deepseek · deepseek reasoner/i);
    await expect(surface).toContainText(/persistent memory/i);
    await expect(surface).toContainText(/enabled/i);
    await expect(page.locator('[data-deployed-agent-conversations="list"]')).toContainText(/customer one/i);

    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.locator('[data-deployed-agent-provider-select="true"]')).toHaveValue('deepseek');
    await expect(page.locator('[data-deployed-agent-model-select="true"]')).toHaveValue('deepseek-reasoner');
    await expect(page.getByLabel(/persistent memory/i)).toHaveValue('enabled');
    await expect(page.getByLabel(/daily message limit/i)).toHaveValue('25');
    await expect(page.getByLabel(/monthly cost cap \(usd\)/i)).toHaveValue('25');
    await expect(page.getByLabel(/upgrade cta label/i)).toHaveValue('Continue on Empyralist');
    await expect(page.getByLabel(/upgrade cta url/i)).toHaveValue('https://app.empyralist.com/signup');
    await page.locator('[data-deployed-agent-provider-select="true"]').selectOption('anthropic');
    await page.locator('[data-deployed-agent-model-select="true"]').selectOption('claude-3-5-sonnet-20241022');
    await page.getByLabel(/persistent memory/i).selectOption('disabled');
    await page.getByLabel(/daily message limit/i).fill('30');
    await page.getByLabel(/monthly cost cap \(usd\)/i).fill('30');
    await page.getByLabel(/upgrade cta label/i).fill('Unlock more messages');
    await page.getByLabel(/upgrade cta url/i).fill('https://app.empyralist.com/upgrade');
    await page.getByRole('button', { name: /save changes/i }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(surface).toContainText(/updated returns concierge configuration/i);
    await expect(surface).toContainText(/anthropic · claude 3\.5 sonnet/i);
    await expect(surface).toContainText(/persistent memory/i);
    await expect(surface).toContainText(/disabled/i);

    await page.getByRole('button', { name: /^deploy$/i }).click();
    await expect(surface).toContainText(/is now live/i);
    await page.getByRole('button', { name: /^pause$/i }).click();
    await expect(surface).toContainText(/is paused/i);
  });
});
