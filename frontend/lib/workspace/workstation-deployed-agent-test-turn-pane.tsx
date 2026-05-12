"use client";

import { useState } from "react";
import { AgentTransparencyTimeline } from "@/lib/workspace/transparency-timeline";

const CHANNELS: ReadonlyArray<{ value: string; label: string; disabled?: boolean }> = [
  { value: "test", label: "Test (No customer send)" },
  { value: "telegram", label: "Telegram Bot (Simulated test only)" },
  { value: "whatsapp", label: "WhatsApp Business (Roadmap)", disabled: true },
  { value: "web_widget", label: "Web Chat (Roadmap)", disabled: true },
] as const;

const RUNTIME_MODES = [
  { value: "text_agent", label: "Text Agent" },
  { value: "cloud_computer_agent", label: "Cloud Computer Agent" },
  { value: "my_computer_agent", label: "My Computer Agent" },
  { value: "self_hosted_agent", label: "Self-Hosted Agent" },
] as const;

interface TestTurnResult {
  reply: string;
  policy_decisions: Array<Record<string, unknown>>;
  tools_considered: Array<Record<string, unknown>>;
  tools_used: string[];
  memory_context: Record<string, unknown>;
  approval_required: boolean;
  audit_events: Array<Record<string, unknown>>;
  trace_id: string;
  transparency_events?: Array<Record<string, unknown>>;
}

export function DeployedAgentTestTurnPane({
  deployedAgentId,
  workspaceId,
  client,
}: {
  deployedAgentId: string;
  workspaceId: string;
  client: { testTurnDeployedAgent: (params: { deployedAgentId: string; body: Record<string, unknown> }) => Promise<Record<string, unknown> | null> };
}) {
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<string>("test");
  const [runtimeMode, setRuntimeMode] = useState<string>("text_agent");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestTurnResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await client.testTurnDeployedAgent({
        deployedAgentId,
        body: {
          workspace_id: workspaceId,
          message: message.trim(),
          channel,
          runtime_mode: runtimeMode,
        },
      });
      if (!res) {
        throw new Error("Test turn returned an empty response");
      }
      setResult(res as unknown as TestTurnResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Test turn failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Test Playground</h3>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Enter a test message..."
        rows={3}
        style={{ width: "100%", padding: 8, fontSize: 13, borderRadius: 6, border: "1px solid var(--border)", marginBottom: 8 }}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} style={selectStyle}>
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value} disabled={Boolean(c.disabled)}>{c.label}</option>
          ))}
        </select>
        <select value={runtimeMode} onChange={(e) => setRuntimeMode(e.target.value)} style={selectStyle}>
          {RUNTIME_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <button
        onClick={handleRun}
        disabled={loading || !message.trim()}
        style={{
          padding: "6px 16px", fontSize: 13, borderRadius: 6,
          background: loading ? "var(--muted)" : "var(--primary)",
          color: "#fff", border: "none", cursor: loading ? "default" : "pointer",
          marginBottom: 12,
        }}
      >
        {loading ? "Running..." : "Run Test Turn"}
      </button>

      {error && (
        <div style={{ padding: 8, background: "#fff0f0", borderRadius: 6, marginBottom: 8, fontSize: 12, color: "#c00" }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ fontSize: 12 }}>
          <Section label="Reply" content={result.reply} />
          <Section label="Trace ID" content={result.trace_id} />
          <Section label="Approval Required" content={result.approval_required ? "Yes" : "No"} />
          {result.tools_considered.length > 0 && (
            <Section label="Tools Considered">
              <pre style={preStyle}>{JSON.stringify(result.tools_considered, null, 2)}</pre>
            </Section>
          )}
          {result.tools_used.length > 0 && (
            <Section label="Tools Used" content={result.tools_used.join(", ")} />
          )}
          {result.policy_decisions.length > 0 && (
            <Section label="Policy Decisions">
              <pre style={preStyle}>{JSON.stringify(result.policy_decisions, null, 2)}</pre>
            </Section>
          )}
          <Section label="Memory Context">
            <pre style={preStyle}>{JSON.stringify(result.memory_context, null, 2)}</pre>
          </Section>
          {result.audit_events.length > 0 && (
            <Section label="Audit Events">
              <pre style={preStyle}>{JSON.stringify(result.audit_events, null, 2)}</pre>
            </Section>
          )}
          {result.transparency_events && result.transparency_events.length > 0 && (
            <Section label="Activity Timeline">
              <AgentTransparencyTimeline
                events={result.transparency_events as Array<{
                  event_id?: string; trace_id?: string; event_type: string;
                  title: string; summary?: string; status?: string;
                  timestamp?: string; tool_name?: string; channel?: string;
                }>}
                expanded={true}
              />
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, content, children }: { label: string; content?: string; children?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <strong style={{ color: "var(--muted-foreground)" }}>{label}:</strong>{" "}
      {content !== undefined ? <span>{content}</span> : children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "4px 8px", fontSize: 12, borderRadius: 4,
  border: "1px solid var(--border)", background: "var(--background)",
};

const preStyle: React.CSSProperties = {
  margin: 0, padding: "4px 8px", background: "var(--muted)", borderRadius: 4,
  fontSize: 11, overflow: "auto", maxHeight: 120,
};
