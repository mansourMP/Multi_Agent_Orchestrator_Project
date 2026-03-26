import { AlertTriangle, Info } from 'lucide-react';
import type { WorkflowValidationIssue, WorkflowValidationSummary } from '@/lib/api';

type WorkflowValidationPanelProps = {
  validation?: WorkflowValidationSummary | null;
  nodeLabels?: Record<string, string>;
  className?: string;
};

function issueKey(issue: WorkflowValidationIssue): string {
  return [issue.level, issue.code, issue.nodeId || '', issue.message].join('::');
}

function dedupeIssues(issues: WorkflowValidationIssue[]): WorkflowValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = issueKey(issue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function WorkflowValidationPanel({
  validation,
  nodeLabels = {},
  className = '',
}: WorkflowValidationPanelProps) {
  if (!validation) return null;

  const publishErrors = dedupeIssues(validation.publishIssues.filter((issue) => issue.level === 'error'));
  const warnings = dedupeIssues([
    ...validation.draftIssues.filter((issue) => issue.level === 'warning'),
    ...validation.publishIssues.filter((issue) => issue.level === 'warning'),
  ]);

  if (publishErrors.length === 0 && warnings.length === 0) return null;

  const summaryParts: string[] = [];
  if (publishErrors.length > 0) summaryParts.push(`${publishErrors.length} blocker${publishErrors.length === 1 ? '' : 's'}`);
  if (warnings.length > 0) summaryParts.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);

  const resolvedClassName = ['workflow-validation-panel', className].filter(Boolean).join(' ');

  const renderIssue = (issue: WorkflowValidationIssue) => {
    const nodeToken = String(issue.nodeId || '').trim();
    const label = nodeToken ? (nodeLabels[nodeToken] || nodeToken) : '';
    return (
      <li key={issueKey(issue)} className="workflow-validation-panel-item">
        <span className={`workflow-validation-panel-badge is-${issue.level}`}>
          {issue.level === 'error' ? 'Blocker' : 'Warning'}
        </span>
        <span className="workflow-validation-panel-copy">{issue.message}</span>
        {label ? (
          <span className="workflow-validation-panel-node">
            Node: {label}
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <section className={resolvedClassName}>
      <div className="workflow-validation-panel-head">
        <div className="workflow-validation-panel-title">
          <AlertTriangle size={15} />
          Workflow checks
        </div>
        <div className="workflow-validation-panel-summary">{summaryParts.join(' · ')}</div>
      </div>
      {publishErrors.length > 0 ? (
        <div className="workflow-validation-panel-group">
          <div className="workflow-validation-panel-group-title">Fix before publish</div>
          <ul className="workflow-validation-panel-list">
            {publishErrors.map(renderIssue)}
          </ul>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="workflow-validation-panel-group">
          <div className="workflow-validation-panel-group-title is-warning">
            <Info size={14} />
            Warnings
          </div>
          <ul className="workflow-validation-panel-list">
            {warnings.map(renderIssue)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
