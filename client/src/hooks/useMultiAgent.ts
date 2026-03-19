import { useState, useCallback } from "react";
import { trpc } from "../lib/trpc";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  avatarUrl?: string | null;
}

interface UseMultiAgentOptions {
  sessionId: string;
  defaultAgentId?: string;
}

export function useMultiAgent({
  sessionId,
  defaultAgentId = "agent_general",
}: UseMultiAgentOptions) {
  const [activeAgentId, setActiveAgentId] = useState<string>(defaultAgentId);
  const [isSwitching, setIsSwitching] = useState(false);

  const {
    data: agentList,
    isLoading: agentsLoading,
    error: agentsError,
  } = trpc.agents.listAgents.useQuery();

  const { data: serverActiveAgent, refetch: refetchActiveAgent } =
    trpc.agents.getActiveAgent.useQuery(
      { sessionId },
      { enabled: !!sessionId }
    );

  // Sync active agent from server
  if (serverActiveAgent && serverActiveAgent.agentId !== activeAgentId) {
    setActiveAgentId(serverActiveAgent.agentId);
  }

  const { data: agentHistory, refetch: refetchHistory } =
    trpc.agents.getAgentHistory.useQuery(
      { sessionId },
      { enabled: !!sessionId }
    );

  const switchAgentMutation = trpc.agents.switchAgent.useMutation();
  const initAgentMutation = trpc.agents.initAgentForSession.useMutation();
  const incrementMutation = trpc.agents.incrementMessageCount.useMutation();

  const switchAgent = useCallback(
    async (newAgentId: string) => {
      if (newAgentId === activeAgentId || isSwitching) return;
      setIsSwitching(true);
      try {
        await switchAgentMutation.mutateAsync({ sessionId, newAgentId });
        setActiveAgentId(newAgentId);
        await refetchActiveAgent();
        await refetchHistory();
      } finally {
        setIsSwitching(false);
      }
    },
    [
      sessionId,
      activeAgentId,
      isSwitching,
      switchAgentMutation,
      refetchActiveAgent,
      refetchHistory,
    ]
  );

  const initAgent = useCallback(
    async (agentId?: string) => {
      await initAgentMutation.mutateAsync({
        sessionId,
        agentId: agentId ?? defaultAgentId,
      });
      setActiveAgentId(agentId ?? defaultAgentId);
    },
    [sessionId, defaultAgentId, initAgentMutation]
  );

  const onMessageSent = useCallback(async () => {
    await incrementMutation.mutateAsync({ sessionId });
  }, [sessionId, incrementMutation]);

  const activeAgent: Agent | undefined = agentList?.find(
    (a: Agent) => a.id === activeAgentId
  );

  const getAgentById = useCallback(
    (agentId: string): Agent | undefined =>
      agentList?.find((a: Agent) => a.id === agentId),
    [agentList]
  );

  return {
    activeAgentId,
    activeAgent,
    agents: agentList ?? [],
    agentHistory: agentHistory ?? [],
    isLoading: agentsLoading,
    isSwitching,
    error: agentsError,
    switchAgent,
    initAgent,
    onMessageSent,
    getAgentById,
  };
}
