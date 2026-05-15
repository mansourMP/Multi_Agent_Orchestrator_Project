'use client';

import { DeployedAgentTestTurnPane } from '@/lib/workspace/workstation-deployed-agent-test-turn-pane';

export function AgentPlaygroundPanel({
  deployedAgentId,
  workspaceId,
  client,
  agentName,
  runtimeMode,
}: {
  deployedAgentId: string;
  workspaceId: string;
  client: { testTurnDeployedAgent: (params: { deployedAgentId: string; body: Record<string, unknown> }) => Promise<Record<string, unknown> | null> };
  agentName?: string | null;
  runtimeMode?: string;
}) {
  return (
    <div className="studio-agent-chat">
      <DeployedAgentTestTurnPane
        deployedAgentId={deployedAgentId}
        workspaceId={workspaceId}
        client={client}
        agentName={agentName}
        runtimeMode={runtimeMode}
      />
    </div>
  );
}
