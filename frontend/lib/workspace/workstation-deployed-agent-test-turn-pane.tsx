"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { joinClassNames } from "@/lib/ui/primitives";

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

type ChatTurn = {
  id: string;
  role: "user" | "agent";
  content: string;
  tone?: "normal" | "loading" | "error";
  result?: TestTurnResult | null;
};

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
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }
    thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const handleRun = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || loading) return;
    const turnId = `${Date.now()}`;
    const responseTurnId = `${turnId}-agent`;
    setLoading(true);
    setMessage("");
    setTurns((current) => [
      ...current,
      { id: `${turnId}-user`, role: "user", content: trimmedMessage },
      { id: responseTurnId, role: "agent", content: "Thinking...", tone: "loading" },
    ]);
    try {
      const res = await client.testTurnDeployedAgent({
        deployedAgentId,
        body: {
          workspace_id: workspaceId,
          message: trimmedMessage,
          channel,
          runtime_mode: runtimeMode,
        },
      });
      if (!res) {
        throw new Error("Test turn returned an empty response");
      }
      const result = res as unknown as TestTurnResult;
      setTurns((current) => current.map((turn) => (
        turn.id === responseTurnId
          ? { ...turn, content: result.reply || "No reply returned.", tone: "normal", result }
          : turn
      )));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Test turn failed";
      setTurns((current) => current.map((turn) => (
        turn.id === responseTurnId
          ? { ...turn, content: errorMessage, tone: "error" }
          : turn
      )));
    } finally {
      setLoading(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void handleRun();
  };

  return (
    <div className="deployed-agent-chat">
      <div ref={threadRef} className="deployed-agent-chat__thread" aria-live="polite">
        {turns.length === 0 ? (
          <div className="deployed-agent-chat__empty">
            <strong>Start testing this agent</strong>
            <span>Ask it the same way a customer would. Nothing here is sent to a live channel.</span>
          </div>
        ) : null}

        {turns.map((turn) => (
          <article
            key={turn.id}
            className={joinClassNames(
              "deployed-agent-chat__message",
              turn.role === "user" ? "deployed-agent-chat__message--user" : "deployed-agent-chat__message--agent",
              turn.tone === "error" && "deployed-agent-chat__message--error",
              turn.tone === "loading" && "deployed-agent-chat__message--loading",
            )}
          >
            <div className="deployed-agent-chat__bubble">
              {turn.tone === "loading" ? <Loader2 className="deployed-agent-chat__loader" aria-hidden="true" /> : null}
              <p>{turn.content}</p>
            </div>
            {turn.result ? <RunMeta result={turn.result} /> : null}
          </article>
        ))}
      </div>

      <div className="deployed-agent-chat__composer">
        <textarea
          className="deployed-agent-chat__input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Message this agent..."
          rows={2}
        />
        <div className="deployed-agent-chat__toolbar" aria-label="Private test controls">
          <div className="deployed-agent-chat__controls">
            <label className="deployed-agent-chat__select-shell">
              <span>Channel</span>
              <select aria-label="Test channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value} disabled={Boolean(c.disabled)}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="deployed-agent-chat__select-shell">
              <span>Agent type</span>
              <select aria-label="Agent type" value={runtimeMode} onChange={(e) => setRuntimeMode(e.target.value)}>
                {RUNTIME_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="deployed-agent-chat__send"
            type="button"
            onClick={handleRun}
            disabled={loading || !message.trim()}
            aria-label={loading ? "Sending private test message" : "Send private test message"}
          >
            {loading ? <Loader2 aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function RunMeta({ result }: { result: TestTurnResult }) {
  const toolsUsed = Array.isArray(result.tools_used) ? result.tools_used : [];
  const traceId = typeof result.trace_id === "string" ? result.trace_id : "";
  const memoryApplied = result.memory_context && Object.keys(result.memory_context).length > 0;

  return (
    <div className="deployed-agent-chat__meta" aria-label="Private test result">
      <span>{result.approval_required ? "Needs approval" : "No approval needed"}</span>
      <span>{toolsUsed.length > 0 ? `${toolsUsed.length} tool${toolsUsed.length === 1 ? "" : "s"} used` : "No tools used"}</span>
      <span>{memoryApplied ? "Memory checked" : "Memory off for test"}</span>
      {traceId ? <span title={traceId}>Trace {traceId.slice(0, 8)}</span> : null}
    </div>
  );
}
