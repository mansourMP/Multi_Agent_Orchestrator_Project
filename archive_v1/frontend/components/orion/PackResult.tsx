'use client';

import React from 'react';
import { UI, type PackResult as PackResultType } from '../../app/page.catalog';

interface PackResultProps {
  packResult: PackResultType;
  executionSummary: unknown;
  riskColor: string;
  trustMode: string;
  copyResultSummary: () => Promise<void>;
  exportRunJson: () => void;
  createFollowUpTask: () => void;
}

interface ExecutionSummary {
  risk_level?: string;
  estimated_time_saved_minutes?: number;
  trust_mode_applied?: string;
  approval_required?: boolean;
  approval_reason?: string;
  next_action?: string;
}

interface WeeklyContentItem {
  id: string;
  day: string;
  channel: string;
  format: string;
  headline: string;
  topic: string;
  cta: string;
}

interface CompetitorBriefItem {
  name: string;
  threat_level: string;
}

export const PackResult: React.FC<PackResultProps> = ({
  packResult,
  executionSummary,
  riskColor,
  trustMode,
  copyResultSummary,
  exportRunJson,
  createFollowUpTask,
}) => {
  const outputs = packResult.outputs as Record<string, unknown>;
  const contentPlan = Array.isArray(outputs.content_plan)
    ? (outputs.content_plan as WeeklyContentItem[])
    : [];
  const briefItems = Array.isArray(outputs.briefs)
    ? (outputs.briefs as CompetitorBriefItem[])
    : [];
  const spreadsheetPreview = Array.isArray(outputs.preview)
    ? (outputs.preview as Array<Record<string, unknown>>)
    : [];
  const spreadsheetColumns = Array.isArray(outputs.columns)
    ? (outputs.columns as string[])
    : [];
  const hasExecutionSummary = Boolean(executionSummary && typeof executionSummary === 'object');
  const summary = hasExecutionSummary ? (executionSummary as ExecutionSummary) : null;

  return (
    <div style={{ marginBottom: 10, borderTop: `1px solid ${UI.borderSoft}`, paddingTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: UI.textSoft, marginBottom: 6 }}>
        {packResult.pack_id === 'customer-ops-autopilot'
          ? 'Customer Ops'
          : packResult.pack_id === 'weekly-content-studio'
          ? 'Weekly Content'
          : packResult.pack_id === 'competitor-brief-digest'
          ? 'Competitor Brief'
          : packResult.pack_id === 'document-studio-v1'
          ? 'Document Studio'
          : 'Spreadsheet Ops'}
      </div>
      <div style={{ fontSize: 12, color: UI.textSoft, marginBottom: 8 }}>{packResult.summary}</div>
      {summary && (
        <div
          style={{
            marginBottom: 10,
            borderRadius: 0,
            borderTop: `1px solid ${UI.borderSoft}`,
            borderBottom: `1px solid ${UI.borderSoft}`,
            background: 'transparent',
            padding: '10px 0',
          }}
        >
          <div style={{ fontSize: 10, color: UI.textMuted, marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Execution
          </div>
          <div style={{ display: 'grid', gap: 4, marginBottom: 8, fontSize: 11 }}>
            <div style={{ color: UI.textSoft }}>
              <span style={{ color: UI.textMuted }}>Risk:</span>{' '}
              <span style={{ color: riskColor, fontWeight: 700 }}>{(summary.risk_level || 'low').toString().toUpperCase()}</span>
            </div>
            <div style={{ color: UI.textSoft }}>
              <span style={{ color: UI.textMuted }}>Time saved:</span> ~{summary.estimated_time_saved_minutes ?? 0} min
            </div>
            <div style={{ color: UI.textSoft }}>
              <span style={{ color: UI.textMuted }}>Trust:</span> {(summary.trust_mode_applied || trustMode).toString()}
            </div>
          </div>
          {summary.approval_required && (
            <div style={{ fontSize: 11, color: UI.warning, marginBottom: 6, borderLeft: `3px solid ${UI.warning}`, paddingLeft: 8 }}>
              Approval required: {summary.approval_reason || 'Pending approval.'}
            </div>
          )}
          {summary.next_action && (
            <div style={{ fontSize: 11, color: UI.textSoft }}>
              <span style={{ color: UI.textMuted }}>Next:</span> {summary.next_action}
            </div>
          )}
        </div>
      )}
      {packResult.pack_id === 'customer-ops-autopilot' && (
        <>
          <div style={{ fontSize: 11, color: UI.textMuted, marginBottom: 8 }}>
            Inbox {packResult.inputs.inbox_count} · Leads {packResult.inputs.lead_count} · Bookings {packResult.outputs.bookings.length} ·
            Urgent {packResult.outputs.urgent_count} · Sent {packResult.connector?.email_sent_count ?? 0} · Drafts {packResult.connector?.email_drafts_created ?? 0} · Calendar{' '}
            {packResult.connector?.calendar_events_created ?? 0}
          </div>
          {packResult.connector?.account_profile?.emailAddress && (
            <div style={{ fontSize: 11, color: UI.textSoft, marginBottom: 6 }}>
              Connector account: {packResult.connector.account_profile.emailAddress}
            </div>
          )}
          {(packResult.connector?.warnings || []).length > 0 && (
            <div style={{ fontSize: 11, color: UI.warning, marginBottom: 6 }}>
              Connector warnings: {(packResult.connector?.warnings || []).slice(0, 2).join(' | ')}
            </div>
          )}
        </>
      )}
      {packResult.pack_id === 'weekly-content-studio' && (
        <>
          <div style={{ fontSize: 11, color: UI.textMuted, marginBottom: 8 }}>
            Topics {packResult.inputs.topics_count} · Channels {packResult.inputs.channels_count} · Posts {contentPlan.length}
          </div>
          <div style={{ borderTop: `1px solid ${UI.borderSoft}`, borderBottom: `1px solid ${UI.borderSoft}`, marginBottom: 8 }}>
            {contentPlan.map((item) => (
              <div
                key={item.id}
                style={{
                  borderBottom: `1px solid ${UI.borderSoft}`,
                  padding: '8px 0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textSoft, fontWeight: 700 }}>
                    {item.day} · {item.channel}
                  </div>
                  <span style={{ fontSize: 10, color: UI.textMuted }}>{item.format}</span>
                </div>
                <div style={{ fontSize: 12, color: UI.textSoft, marginBottom: 4 }}>{item.headline}</div>
                <div style={{ fontSize: 11, color: UI.textMuted }}>
                  Topic: {item.topic} · CTA: {item.cta}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {packResult.pack_id === 'competitor-brief-digest' && (
        <>
          <div style={{ fontSize: 11, color: UI.textMuted, marginBottom: 8 }}>
            Competitors {packResult.inputs.competitors_count} · High threat {packResult.outputs.high_threat_count} · Objectives {packResult.inputs.objectives_count}
          </div>
          <div style={{ fontSize: 11, color: UI.textSoft, marginBottom: 6 }}>
            Top plays: {briefItems.slice(0, 2).map((item) => `${item.name} (${item.threat_level})`).join(' | ')}
          </div>
        </>
      )}
      {packResult.pack_id === 'spreadsheet-ops-v1' && (
        <>
          <div style={{ fontSize: 11, color: UI.textMuted, marginBottom: 8 }}>
            {(packResult.outputs.storage === 'onedrive' ? 'OneDrive' : 'Local')} · File {packResult.outputs.file_path} · Format {packResult.outputs.format.toUpperCase()} · Operation {packResult.outputs.operation} ·
            Read {packResult.outputs.rows_read} · Written {packResult.outputs.rows_written}
          </div>
          {spreadsheetColumns.length > 0 && (
            <div style={{ fontSize: 11, color: UI.textMuted, marginBottom: 6 }}>
              Columns: {spreadsheetColumns.join(' | ')}
            </div>
          )}
          {spreadsheetPreview.length > 0 && (
            <div style={{ borderTop: `1px solid ${UI.borderSoft}`, borderBottom: `1px solid ${UI.borderSoft}`, marginBottom: 8 }}>
              {spreadsheetPreview.slice(0, 5).map((row, idx) => (
                <div key={`sheet-row-${idx}`} style={{ borderBottom: `1px solid ${UI.borderSoft}`, padding: '8px 0' }}>
                  <div style={{ fontSize: 11, color: UI.textSoft }}>
                    {Object.entries(row)
                      .slice(0, 4)
                      .map(([key, value]) => `${key}: ${String(value ?? '')}`)
                      .join(' | ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {packResult.pack_id === 'document-studio-v1' && (
        <>
          <div style={{ fontSize: 11, color: UI.textMuted, marginBottom: 8 }}>
            {(packResult.outputs.storage === 'onedrive' ? 'OneDrive' : 'Local')} · File {packResult.outputs.file_path} · Format {packResult.outputs.format.toUpperCase()} · Operation {packResult.outputs.operation} ·
            Items {packResult.outputs.items_written}
          </div>
          <div style={{ fontSize: 11, color: UI.textSoft, marginBottom: 6 }}>
            Title: {packResult.outputs.title}
          </div>
          {(Array.isArray(packResult.outputs.preview) ? packResult.outputs.preview : []).length > 0 && (
            <div style={{ borderTop: `1px solid ${UI.borderSoft}`, borderBottom: `1px solid ${UI.borderSoft}`, marginBottom: 8 }}>
              {(Array.isArray(packResult.outputs.preview) ? packResult.outputs.preview : []).slice(0, 5).map((item, idx) => (
                <div key={`doc-preview-${idx}`} style={{ borderBottom: `1px solid ${UI.borderSoft}`, padding: '8px 0', fontSize: 11, color: UI.textSoft }}>
                  {String(item)}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <button
          onClick={copyResultSummary}
          className="orion-btn orion-btn-ghost"
          style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
        >
          Copy summary
        </button>
        <button
          onClick={exportRunJson}
          className="orion-btn orion-btn-ghost"
          style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
        >
          Export JSON
        </button>
        <button
          onClick={createFollowUpTask}
          className="orion-btn orion-btn-ghost"
          style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
        >
          Create follow-up
        </button>
      </div>
      <div style={{ fontSize: 11, color: UI.textMuted, marginBottom: 2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Next steps</div>
      <div style={{ fontSize: 11, color: UI.textSoft, wordBreak: 'break-word' }}>
        {(packResult.next_steps || []).join(' | ')}
      </div>
    </div>
  );
};
