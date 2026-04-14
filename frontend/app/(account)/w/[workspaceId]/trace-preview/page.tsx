'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { AppButton, AppNotice } from '@/lib/ui/primitives';
import { SageTraceView } from '@/lib/workspace/sage-trace-view';
import type {
  WorkstationAgentTraceEvent,
  WorkstationAgentTraceRecord,
} from '@/lib/workspace/workstation-client';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';

function buildInlineTrace(traceId: string, workspaceId: string, rootAgentId: string): WorkstationAgentTraceRecord {
  return {
    id: traceId,
    workspace_id: workspaceId,
    root_agent_id: rootAgentId,
    surface: 'web',
    runtime_target: 'cloud',
    provider: 'openai',
    model: 'gpt-5.4',
    outcome: 'success',
    started_at: '2026-04-13T12:00:00Z',
    finished_at: '2026-04-13T12:00:05Z',
  };
}

function buildInlineEvents(rootAgentId: string): WorkstationAgentTraceEvent[] {
  const base: WorkstationAgentTraceEvent[] = [
    {
      id: 'evt-route',
      trace_id: 'trace-inline',
      seq: 1,
      ts: '2026-04-13T12:00:00Z',
      event_type: 'trace.routed',
      persisted: true,
      agent_id: rootAgentId,
      data: {
        runtime_target: 'cloud',
        provider: 'openai',
        model: 'gpt-5.4',
      },
    },
    {
      id: 'evt-plan-start',
      trace_id: 'trace-inline',
      seq: 2,
      ts: '2026-04-13T12:00:01Z',
      event_type: 'plan.started',
      persisted: true,
      agent_id: rootAgentId,
      data: {
        title: 'Sage Plan',
        summary: 'Inspect the request, search the web, and answer with grounded sources.',
      },
    },
    {
      id: 'evt-plan-item',
      trace_id: 'trace-inline',
      seq: 3,
      ts: '2026-04-13T12:00:02Z',
      event_type: 'plan.item.created',
      persisted: true,
      agent_id: rootAgentId,
      item_id: 'plan-item-1',
      data: {
        index: 1,
        title: 'Search for supporting sources',
        kind: 'tool',
        owner: 'sage',
        rationale_summary: 'The answer needs current public references.',
      },
    },
    {
      id: 'evt-tool-start',
      trace_id: 'trace-inline',
      seq: 4,
      ts: '2026-04-13T12:00:03Z',
      event_type: 'tool.started',
      persisted: true,
      agent_id: rootAgentId,
      item_id: 'plan-item-1',
      tool_call_id: 'tool-search-1',
      data: {
        tool_name: 'web.search',
        capability_id: 'web_search',
        connector_id: 'builtin',
        args_preview: {
          query: 'empyralist agent transparency',
        },
      },
    },
    {
      id: 'evt-query',
      trace_id: 'trace-inline',
      seq: 5,
      ts: '2026-04-13T12:00:03Z',
      event_type: 'search.query',
      persisted: true,
      agent_id: rootAgentId,
      tool_call_id: 'tool-search-1',
      data: {
        provider: 'web',
        query: 'empyralist agent transparency',
        filters: {},
      },
    },
    {
      id: 'evt-results',
      trace_id: 'trace-inline',
      seq: 6,
      ts: '2026-04-13T12:00:04Z',
      event_type: 'search.results',
      persisted: true,
      agent_id: rootAgentId,
      tool_call_id: 'tool-search-1',
      data: {
        results: [
          {
            title: 'Empyralist transparency design',
            url: 'https://example.com/transparency',
          },
        ],
      },
    },
    {
      id: 'evt-tool-result',
      trace_id: 'trace-inline',
      seq: 7,
      ts: '2026-04-13T12:00:04Z',
      event_type: 'tool.result',
      persisted: true,
      agent_id: rootAgentId,
      tool_call_id: 'tool-search-1',
      data: {
        status: 'ok',
        summary: 'Found current references for the answer.',
        artifact_ids: [],
      },
    },
    {
      id: 'evt-complete',
      trace_id: 'trace-inline',
      seq: 8,
      ts: '2026-04-13T12:00:05Z',
      event_type: 'trace.completed',
      persisted: true,
      agent_id: rootAgentId,
      data: {
        outcome: 'success',
        duration_ms: 5100,
      },
    },
  ];

  if (rootAgentId === 'sage') {
    base.splice(6, 0, {
      id: 'evt-browser-shot',
      trace_id: 'trace-inline',
      seq: 6,
      ts: '2026-04-13T12:00:04Z',
      event_type: 'browser.screenshot',
      persisted: true,
      agent_id: rootAgentId,
      tool_call_id: 'tool-search-1',
      artifact_id: 'artifact-inline-shot',
      data: {
        caption: 'Search results screenshot',
        width: 1280,
        height: 720,
      },
    });
  }

  return base.map((event, index) => ({ ...event, seq: index + 1 }));
}

export default function WorkspaceTracePreviewPage() {
  const searchParams = useSearchParams();
  const { bootstrap } = useWorkspaceBoundary();
  const traceId = searchParams.get('traceId') || 'trace-inline';
  const mode = searchParams.get('mode') === 'live' ? 'live' : 'replay';
  const seed = searchParams.get('seed') === 'inline';
  const rootAgentId = searchParams.get('root') || 'sage';
  const [additiveEvents, setAdditiveEvents] = useState<WorkstationAgentTraceEvent[]>([]);

  const initialTrace = useMemo<WorkstationAgentTraceRecord | null>(
    () => (seed ? buildInlineTrace(traceId, bootstrap.workspace.id, rootAgentId) : null),
    [bootstrap.workspace.id, rootAgentId, seed, traceId],
  );

  const initialEvents = useMemo<WorkstationAgentTraceEvent[] | null>(
    () => (seed ? buildInlineEvents(rootAgentId) : null),
    [rootAgentId, seed],
  );

  return (
    <main
      data-workstation-surface="trace-preview"
      style={{
        minHeight: '100%',
        display: 'grid',
        gap: '1rem',
        padding: '1rem 1.1rem 1.15rem',
      }}
    >
      <section
        style={{
          display: 'grid',
          gap: '0.45rem',
        }}
      >
        <span
          style={{
            color: 'var(--app-text-tertiary)',
            fontSize: '0.72rem',
            fontWeight: 650,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Trace Preview
        </span>
        <h1
          style={{
            margin: 0,
            color: 'var(--app-text-primary)',
            fontSize: '1.18rem',
            fontWeight: 680,
            letterSpacing: '-0.02em',
          }}
        >
          Sage Trace View Harness
        </h1>
        <AppNotice>
          This route is an internal harness for the reusable trace component. It is intentionally not registered in workstation navigation.
        </AppNotice>
      </section>

      <section style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
        <AppButton
          type="button"
          tone="secondary"
          onClick={() => {
            setAdditiveEvents((current) => [
              ...current,
              {
                id: `evt-reasoning-${current.length + 1}`,
                trace_id: traceId,
                seq: 100 + current.length,
                event_type: 'reasoning.summary.delta',
                persisted: false,
                agent_id: rootAgentId,
                item_id: 'plan-item-1',
                data: {
                  delta: 'Cross-checking the latest source before answering.',
                },
              },
            ]);
          }}
        >
          Inject reasoning delta
        </AppButton>
      </section>

      <SageTraceView
        traceId={traceId}
        mode={mode}
        initialTrace={initialTrace}
        initialEvents={initialEvents}
        additiveEvents={additiveEvents}
      />
    </main>
  );
}
