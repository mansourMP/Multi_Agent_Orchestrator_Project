import React, { useEffect, useMemo, useState } from 'react';

import { View } from 'react-native';

import { useMobileRuntimeState } from '../../src/lib/mobile-runtime.js';
import { AppBadge, AppCard, AppHeading, AppScreen, AppText } from '../../src/ui/primitives';
import { MobileChatComposer, MobileChatThread } from '../../src/ui/chat';
import {
  SurfaceErrorScreen,
  SurfaceLoadingScreen,
  SurfaceNoticeCard,
} from '../../src/ui/state-screens';

export default function ChatScreen() {
  const runtimeState = useMobileRuntimeState();
  const chatSurface = runtimeState.shellModel?.surfaces.chat ?? null;
  const approvalsSurface = runtimeState.shellModel?.surfaces.runsApprovals ?? null;
  const [threadResult, setThreadResult] = useState<any>(null);
  const [composerValue, setComposerValue] = useState('');
  const [sending, setSending] = useState(false);
  const [approvalDecisions, setApprovalDecisions] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!chatSurface) {
      return undefined;
    }

    void chatSurface.loadThread({ threadId: 'primary', refresh: true })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setThreadResult(result);
        setComposerValue(result.draft?.text ?? chatSurface.getDraft('primary')?.text ?? '');
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [chatSurface]);

  const thread = useMemo(() => {
    if (threadResult?.data) {
      return threadResult.data;
    }
    return chatSurface?.getThreadSnapshot('primary') ?? null;
  }, [chatSurface, threadResult]);

  if (!chatSurface) {
    return (
      <SurfaceErrorScreen
        title="Chat is not available"
        body="This workspace does not expose the mobile conversation surface."
      />
    );
  }

  if (!thread && !threadResult && !errorMessage) {
    return (
      <SurfaceLoadingScreen
        title="Loading conversation"
        body="Restoring the primary thread, draft state, and inline approval blockers."
      />
    );
  }

  if (!thread && errorMessage) {
    return (
      <SurfaceErrorScreen
        title="Conversation unavailable"
        body={errorMessage}
        actionLabel="Retry"
        onAction={() => {
          setErrorMessage(null);
          void chatSurface.loadThread({ threadId: 'primary', refresh: true }).then(setThreadResult);
        }}
      />
    );
  }

  const messages = Array.isArray(thread?.messages) ? thread.messages : [];

  return (
    <AppScreen scroll>
      <AppCard>
        <AppBadge tone="accent">Chat</AppBadge>
        <AppHeading>{thread?.title ?? 'Workspace thread'}</AppHeading>
        <AppText muted>
          Mobile keeps the working conversation inline with execution and approval state instead of sending you to separate web views.
        </AppText>
      </AppCard>

      {threadResult?.statusMessage ? (
        <SurfaceNoticeCard
          title={threadResult.status === 'degraded' ? 'Cached thread' : 'Thread update'}
          body={threadResult.statusMessage}
          tone={threadResult.status === 'degraded' ? 'warning' : 'accent'}
        />
      ) : null}

      <MobileChatThread
        messages={messages}
        approvalDecisions={approvalDecisions}
        onApprovalDecision={
          approvalsSurface
            ? async (approvalId, decision) => {
                const result = await approvalsSurface.respondToApproval({
                  approvalId,
                  decision,
                });
                setApprovalDecisions((current) => ({
                  ...current,
                  [approvalId]: decision,
                }));
                if (result?.statusMessage) {
                  setErrorMessage(result.statusMessage);
                }
              }
            : undefined
        }
      />

      <MobileChatComposer
        value={composerValue}
        onChangeText={(value) => {
          setComposerValue(value);
          chatSurface.setDraft('primary', value);
        }}
        disabled={sending}
        onSubmit={() => {
          if (!composerValue.trim()) {
            return;
          }

          setSending(true);
          setErrorMessage(null);
          void chatSurface.sendMessage({
            threadId: 'primary',
            text: composerValue.trim(),
          })
            .then((result) => {
              setThreadResult(result);
              if (result.status !== 'error') {
                setComposerValue('');
              }
              if (result.statusMessage) {
                setErrorMessage(result.statusMessage);
              }
            })
            .catch((error) => {
              setErrorMessage(error instanceof Error ? error.message : String(error));
            })
            .finally(() => {
              setSending(false);
            });
        }}
      />

      {errorMessage ? (
        <View>
          <AppText muted>{errorMessage}</AppText>
        </View>
      ) : null}
    </AppScreen>
  );
}
