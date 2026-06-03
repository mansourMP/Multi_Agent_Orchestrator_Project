'use client';

export type WorkstationChatThreadSelectedEventDetail = {
  workspaceId: string;
  threadId: string;
};

const WORKSTATION_CHAT_THREAD_SELECTED_EVENT = 'workstation:chat-thread-selected';
const WORKSTATION_CHAT_NEW_THREAD_EVENT = 'workstation:chat-new-thread';

export function subscribeWorkstationChatThreadSelected(
  listener: (detail: WorkstationChatThreadSelectedEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<WorkstationChatThreadSelectedEventDetail>).detail;
    if (detail) {
      listener(detail);
    }
  };

  window.addEventListener(WORKSTATION_CHAT_THREAD_SELECTED_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(WORKSTATION_CHAT_THREAD_SELECTED_EVENT, handler as EventListener);
  };
}

export function emitWorkstationChatThreadSelected(
  detail: WorkstationChatThreadSelectedEventDetail,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<WorkstationChatThreadSelectedEventDetail>(
      WORKSTATION_CHAT_THREAD_SELECTED_EVENT,
      { detail },
    ),
  );
}

export function subscribeWorkstationChatNewThreadRequested(
  listener: (detail: { workspaceId: string }) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ workspaceId: string }>).detail;
    if (detail) {
      listener(detail);
    }
  };

  window.addEventListener(WORKSTATION_CHAT_NEW_THREAD_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(WORKSTATION_CHAT_NEW_THREAD_EVENT, handler as EventListener);
  };
}

export function emitWorkstationChatNewThreadRequested(detail: { workspaceId: string }): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<{ workspaceId: string }>(
      WORKSTATION_CHAT_NEW_THREAD_EVENT,
      { detail },
    ),
  );
}
