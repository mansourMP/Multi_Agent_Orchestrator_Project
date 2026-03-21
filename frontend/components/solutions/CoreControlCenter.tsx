'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Bell, Boxes, LayoutDashboard, Loader2, Puzzle, Sparkles, Workflow } from 'lucide-react';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { createWorkflow, fetchWorkflows } from '@/lib/api';
import {
  type InstalledSolution,
  type RecentRunItem,
  fetchRecentRuns,
  fetchSkillsState,
  fetchSolutionsState,
  fetchWeeklySchedules,
  formatRelativeTime,
} from '@/lib/solutions';

type SkillCard = {
  id: string;
  name: string;
  enabled: boolean;
};

type FirstRunWorkflowDraft = {
  name: string;
  description: string;
  definition: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
    meta: Record<string, unknown>;
  };
};

const FIRST_RUN_EXAMPLES = [
  'Alert me when someone enters my shop',
  'Summarize my emails every morning',
  'Monitor my camera and notify me on WhatsApp',
  'Follow up with leads automatically',
] as const;

function slugifyLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'step';
}

function buildFirstRunWorkflowDraft(request: string): FirstRunWorkflowDraft {
  const prompt = request.trim();
  const normalized = prompt.toLowerCase();
  const triggerType = /every|daily|morning|night|hour|schedule/.test(normalized)
    ? 'schedule'
    : /when|lead|leads|someone enters|incoming|new /.test(normalized)
      ? 'webhook'
      : 'manual';

  let name = 'Custom Automation';
  let description = prompt;
  let agentLabel = 'AI Agent';
  let agentPrompt = prompt;
  let agentDescription = 'Automation planner';
  let actionType: 'send_whatsapp' | 'send_telegram' | 'send_wechat' | 'send_email' | 'write_file' = 'write_file';
  let actionLabel = 'Complete workflow';
  let automationMode: 'reusable' | 'scheduled' | 'triggered' = triggerType === 'schedule' ? 'scheduled' : triggerType === 'webhook' ? 'triggered' : 'reusable';

  if (normalized.includes('shop')) {
    name = 'Shop Entry Alerts';
    description = 'Watch for new arrivals and notify the owner immediately.';
    agentLabel = 'Entry Monitor';
    agentPrompt = 'Watch for someone entering the shop, confirm it is a real entry event, and prepare a short alert.';
    agentDescription = 'Detects new arrivals';
    actionType = 'send_whatsapp';
    actionLabel = 'Send WhatsApp alert';
  } else if (normalized.includes('email')) {
    name = 'Morning Email Summary';
    description = 'Summarize the inbox every morning and deliver the digest.';
    agentLabel = 'Inbox Summarizer';
    agentPrompt = 'Read the latest emails, group them by priority, and prepare a short morning summary with recommended actions.';
    agentDescription = 'Summarizes new inbox activity';
    actionType = 'send_email';
    actionLabel = 'Send email summary';
  } else if (normalized.includes('camera') || normalized.includes('whatsapp')) {
    name = 'Camera Monitor Alerts';
    description = 'Review camera updates and send a WhatsApp notification when something needs attention.';
    agentLabel = 'Camera Monitor';
    agentPrompt = 'Monitor camera updates, detect noteworthy activity, and prepare a concise operational alert.';
    agentDescription = 'Monitors live camera activity';
    actionType = 'send_whatsapp';
    actionLabel = 'Send WhatsApp alert';
    automationMode = 'scheduled';
  } else if (normalized.includes('lead')) {
    name = 'Lead Follow-up';
    description = 'Watch for new leads and send fast follow-up messages automatically.';
    agentLabel = 'Lead Assistant';
    agentPrompt = 'Review new lead details, draft a personalized follow-up, and push the next step toward a booked conversation.';
    agentDescription = 'Moves warm leads forward';
    actionType = 'send_email';
    actionLabel = 'Send lead follow-up';
    automationMode = 'triggered';
  }

  const triggerId = `trigger-${slugifyLabel(name)}`;
  const agentId = `agent-${slugifyLabel(agentLabel)}`;
  const actionId = `action-${slugifyLabel(actionLabel)}`;

  return {
    name,
    description,
    definition: {
      nodes: [
        {
          id: triggerId,
          type: 'trigger',
          position: { x: 265, y: 50 },
          data: { label: 'Start Trigger', triggerType },
        },
        {
          id: agentId,
          type: 'agent',
          position: { x: 265, y: 220 },
          data: {
            label: agentLabel,
            modelId: normalized.includes('camera') ? 'gpt-4o' : 'gpt-4.1',
            prompt: agentPrompt,
            tools: normalized.includes('camera') ? ['vision-monitor', 'whatsapp'] : normalized.includes('email') ? ['inbox', 'email'] : [],
            provider: 'openai',
            role: 'Worker',
            duty: agentPrompt,
            status: 'ready',
            description: agentDescription,
          },
        },
        {
          id: actionId,
          type: 'action',
          position: { x: 265, y: 390 },
          data: {
            label: actionLabel,
            actionType,
          },
        },
      ],
      edges: [
        { id: `${triggerId}-${agentId}`, source: triggerId, target: agentId },
        { id: `${agentId}-${actionId}`, source: agentId, target: actionId },
      ],
      meta: {
        mode: 'visual_builder',
        automationMode,
        onboarding_request: prompt,
      },
    },
  };
}

export function CoreControlCenter() {
  const router = useRouter();
  const [solutions, setSolutions] = useState<InstalledSolution[]>([]);
  const [skills, setSkills] = useState<SkillCard[]>([]);
  const [workflows, setWorkflows] = useState<Array<Record<string, unknown>>>([]);
  const [recentRuns, setRecentRuns] = useState<RecentRunItem[]>([]);
  const [mcpEndpoint, setMcpEndpoint] = useState<string | null>(null);
  const [workflowCount, setWorkflowCount] = useState<number | null>(null);
  const [firstRunPrompt, setFirstRunPrompt] = useState('');
  const [isBuildingAutomation, setIsBuildingAutomation] = useState(false);
  const [buildingStep, setBuildingStep] = useState('Building your automation...');
  const [onboardingError, setOnboardingError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const humanizeAgentName = (value: string | null | undefined): string => {
    const token = String(value || '').trim().toLowerCase();
    if (!token || token === 'orchestrator') return 'Assistant';
    return token
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const summarizeRun = (run: RecentRunItem): string => {
    const summary = String(run.result_summary || '').trim();
    if (summary) return summary;
    const goal = String(run.user_goal || '').trim();
    if (goal) return goal;
    return 'No summary available yet.';
  };

  const statusTone = (status: string | null | undefined): 'green' | 'yellow' | 'red' | 'grey' => {
    const token = String(status || '').trim().toLowerCase();
    if (token === 'completed' || token === 'success') return 'green';
    if (token === 'running' || token === 'queued' || token === 'claimed' || token === 'waiting_for_input') return 'yellow';
    if (token === 'failed' || token === 'error' || token === 'cancelled' || token === 'aborted') return 'red';
    return 'grey';
  };

  const statusLabel = (status: string | null | undefined): string => {
    const token = String(status || '').trim().toLowerCase();
    if (!token) return 'Unknown';
    return token
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [solutionsState, skillsState, weeklySchedules, runItems, workflowItems] = await Promise.all([
          fetchSolutionsState(),
          fetchSkillsState(),
          fetchWeeklySchedules(),
          fetchRecentRuns(5),
          fetchWorkflows().catch(() => null),
        ]);
        if (cancelled) return;
        setSolutions(Array.isArray(solutionsState.active) ? solutionsState.active : []);
        setMcpEndpoint(typeof solutionsState.mcp_endpoint === 'string' && solutionsState.mcp_endpoint.trim() ? solutionsState.mcp_endpoint.trim() : null);
        setSkills(Array.isArray(skillsState.installed) ? skillsState.installed.filter((item) => item.enabled) : []);
        setWorkflows(Array.isArray(weeklySchedules) ? weeklySchedules : []);
        setRecentRuns(Array.isArray(runItems) ? runItems.slice(0, 5) : []);
        const nextWorkflowItems = Array.isArray(workflowItems)
          ? workflowItems
          : Array.isArray((workflowItems as { items?: unknown[] } | null | undefined)?.items)
            ? ((workflowItems as { items: unknown[] }).items)
            : [];
        setWorkflowCount(workflowItems === null ? null : nextWorkflowItems.length);
      } catch (fetchError) {
        if (!cancelled) {
          setWorkflowCount(null);
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load control center.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const spaceCount = solutions.reduce((count, item) => count + Number(item.status?.spaces_monitored || 0), 0);
    const alertCount = solutions.reduce((count, item) => count + Number(item.status?.unresolved_alerts || 0), 0);
    const lastScanValues = solutions
      .map((item) => String(item.status?.last_scan_at || '').trim())
      .filter(Boolean)
      .sort()
      .reverse();
    return {
      spaces: spaceCount,
      alerts: alertCount,
      skills: skills.length,
      workflows: workflows.length,
      lastScan: lastScanValues[0] || null,
    };
  }, [skills.length, solutions, workflows.length]);

  const recentAlerts = useMemo(() => {
    return solutions
      .flatMap((solution) => {
        const items = Array.isArray(solution.status?.recent_alerts) ? solution.status?.recent_alerts : [];
        return items.map((alert) => ({
          ...alert,
          title: String(alert.title || '').trim() || solution.name,
          solutionName: solution.name,
        }));
      })
      .sort((left, right) => Date.parse(String(right.ts || '')) - Date.parse(String(left.ts || '')))
      .slice(0, 6);
  }, [solutions]);

  const shouldShowFirstRunOverlay = !loading && !error && workflowCount === 0;

  const launchFirstRunWorkflow = async (request: string) => {
    const prompt = request.trim();
    if (!prompt || isBuildingAutomation) return;
    setFirstRunPrompt(prompt);
    setIsBuildingAutomation(true);
    setBuildingStep('Building your automation...');
    setOnboardingError('');
    const analyzingTimer = window.setTimeout(() => setBuildingStep('Analyzing your request...'), 240);
    const creatingTimer = window.setTimeout(() => setBuildingStep('Creating the workflow canvas...'), 680);
    try {
      const draft = buildFirstRunWorkflowDraft(prompt);
      const [created] = await Promise.all([
        createWorkflow(draft.name, draft.description, 'default', draft.definition),
        new Promise((resolve) => window.setTimeout(resolve, 950)),
      ]);
      const workflowId = String((created as { id?: string })?.id || '').trim();
      if (!workflowId) throw new Error('Workflow creation did not return an id.');
      router.push(`/workflows/${encodeURIComponent(workflowId)}?onboarding=activate-whatsapp`);
    } catch (createError) {
      setOnboardingError(createError instanceof Error ? createError.message : 'Failed to build automation.');
      setIsBuildingAutomation(false);
      setBuildingStep('Building your automation...');
    } finally {
      window.clearTimeout(analyzingTimer);
      window.clearTimeout(creatingTimer);
    }
  };

  if (shouldShowFirstRunOverlay) {
    return (
      <div className="orion-page-shell narrow orion-animate-in" style={{ minHeight: 'calc(100vh - 120px)', justifyContent: 'center' }}>
        <section className="orion-first-run-shell">
          <div className="orion-first-run-eyebrow">New automation</div>
          <h1 className="orion-first-run-title">What do you want to automate?</h1>
          <p className="orion-first-run-copy">
            Describe the outcome once. {`Empyralist`} will assemble the workflow and open it on canvas.
          </p>

          <form
            className="orion-first-run-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void launchFirstRunWorkflow(firstRunPrompt);
            }}
          >
            <textarea
              value={firstRunPrompt}
              onChange={(event) => setFirstRunPrompt(event.target.value)}
              className="orion-first-run-input"
              rows={3}
              placeholder="What do you want to automate?"
              disabled={isBuildingAutomation}
            />
            <div className="orion-first-run-actions">
              <button
                type="submit"
                className="orion-btn orion-btn-primary"
                disabled={isBuildingAutomation || !firstRunPrompt.trim()}
              >
                {isBuildingAutomation ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                {isBuildingAutomation ? 'Building your automation...' : 'Build automation'}
              </button>
            </div>
          </form>

          <div className="orion-first-run-chip-row">
            {FIRST_RUN_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="orion-first-run-chip"
                onClick={() => {
                  setFirstRunPrompt(example);
                  void launchFirstRunWorkflow(example);
                }}
                disabled={isBuildingAutomation}
              >
                {example}
              </button>
            ))}
          </div>

          {isBuildingAutomation ? (
            <div className="orion-first-run-status">
              <div className="orion-first-run-status-title">{buildingStep}</div>
              <div className="orion-first-run-status-copy">
                Agent is mapping your request into a trigger, an AI step, and an action.
              </div>
            </div>
          ) : null}

          {onboardingError ? (
            <div className="orion-first-run-status">
              <div className="orion-first-run-status-title" style={{ color: 'var(--status-red)' }}>Could not build automation</div>
              <div className="orion-first-run-status-copy">{onboardingError}</div>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<LayoutDashboard size={18} />}
        title="Dashboard"
        subtitle="Your AI agents, running workflows, and installed solutions — all in one place."
        meta={
          <>
            <span>{solutions.length} active solution{solutions.length === 1 ? '' : 's'}</span>
            <span>{skills.length} active skill{skills.length === 1 ? '' : 's'}</span>
            {mcpEndpoint ? <span className="orion-chip" data-status-tone="green">MCP Ready</span> : null}
          </>
        }
      />

      <MetricStrip
        items={[
          { label: 'Active solutions', value: String(solutions.length) },
          { label: 'Active skills', value: String(skills.length) },
          { label: 'Running workflows', value: String(workflows.length) },
          { label: 'Unresolved alerts', value: String(summary.alerts) },
        ]}
      />

      {loading ? (
        <section className="orion-panel muted">
          <div className="orion-stagger-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="orion-panel orion-skeleton-card">
                <SkeletonBlock className="orion-skeleton-image" />
                <SkeletonBlock className="orion-skeleton-line medium" />
                <SkeletonBlock className="orion-skeleton-line" />
                <SkeletonBlock className="orion-skeleton-line short" />
              </div>
            ))}
          </div>
        </section>
      ) : error ? (
        <section className="orion-panel muted" style={{ minHeight: 220, display: 'grid', gap: 8, placeItems: 'center' }}>
          <div className="orion-panel-title">Control center is unavailable</div>
          <div className="orion-panel-copy">{error}</div>
        </section>
      ) : (
        <>
          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Recent activity</div>
                <div className="orion-panel-copy">The latest agent work completed or still in progress.</div>
              </div>
            </div>
            {recentRuns.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No recent activity</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {recentRuns.map((run) => (
                  <div key={run.run_id} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title">{humanizeAgentName(run.agent_role)}</div>
                      <div className="orion-list-row-subtitle">{summarizeRun(run)}</div>
                    </div>
                    <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
                      <span className="orion-chip" data-status-tone={statusTone(run.status)}>
                        {statusLabel(run.status)}
                      </span>
                      <span className="orion-panel-copy" style={{ margin: 0 }}>
                        {formatRelativeTime(run.updated_at || run.created_at || null)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Active solutions</div>
                <div className="orion-panel-copy">
                  Installed vertical packages running on top of the core platform.
                </div>
              </div>
            </div>
            {solutions.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">Add your first solution to get started</div>
                <div style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link href="/setup" className="orion-btn orion-btn-primary">
                    Open Setup
                  </Link>
                </div>
              </div>
            ) : (
              <div className="orion-stagger-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {solutions.map((solution) => (
                  <Link
                    key={solution.id}
                    href={solution.primary_route || solution.route_base || '/'}
                    className="orion-panel orion-surface-lift"
                    style={{ display: 'grid', gap: 10, textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div className="orion-panel-title" style={{ margin: 0 }}>{solution.name}</div>
                        <div className="orion-panel-copy" style={{ margin: 0 }}>{solution.description || 'Installed solution package'}</div>
                      </div>
                      <span className="orion-chip" data-status-tone={solution.enabled ? 'green' : 'grey'}>
                        {solution.enabled ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <span className="orion-chip"><Boxes size={12} /> {solution.status?.spaces_monitored || 0} spaces</span>
                      <span className="orion-chip" data-status-tone={Number(solution.status?.unresolved_alerts || 0) > 0 ? 'red' : 'grey'}>
                        <Bell size={12} /> {solution.status?.unresolved_alerts || 0} alerts
                      </span>
                    </div>
                    <div className="orion-panel-copy" style={{ margin: 0 }}>
                      {solution.status?.summary || 'No live summary available.'}
                    </div>
                    <div className="orion-panel-copy" style={{ margin: 0 }}>
                      Last scan {formatRelativeTime(solution.status?.last_scan_at || null)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Active skills</div>
                <div className="orion-panel-copy">Reusable capabilities currently enabled in this deployment.</div>
              </div>
            </div>
            {skills.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No skills active</div>
              </div>
            ) : (
              <div className="orion-stagger-grid" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {skills.map((skill) => (
                  <div key={skill.id} className="orion-list-row" style={{ minHeight: 76 }}>
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <Puzzle size={14} />
                        {skill.name}
                      </div>
                      <div className="orion-list-row-subtitle">{skill.id}</div>
                    </div>
                    <span className="orion-chip" data-status-tone="green">Active</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Running workflows</div>
                <div className="orion-panel-copy">Scheduled systems currently configured in the runtime.</div>
              </div>
            </div>
            {workflows.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No automations running</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {workflows.slice(0, 8).map((workflow, index) => (
                  <div key={String(workflow.id || index)} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <Workflow size={14} />
                        {String(workflow.name || workflow.id || 'Workflow')}
                      </div>
                      <div className="orion-list-row-subtitle">
                        {String(workflow.schedule_label || workflow.timezone || workflow.day || 'Scheduled')}
                      </div>
                    </div>
                    <span className="orion-chip" data-status-tone="grey">{String(workflow.status || 'Active')}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Recent alerts</div>
                <div className="orion-panel-copy">Latest unresolved solution alerts exposed to the control center.</div>
              </div>
            </div>
            {recentAlerts.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">All clear</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {recentAlerts.map((alert) => (
                  <div key={alert.id} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title">{alert.title}</div>
                      <div className="orion-list-row-subtitle">{alert.message}</div>
                    </div>
                    <span className="orion-chip" data-status-tone="red" title={alert.ts}>{formatRelativeTime(alert.ts)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
