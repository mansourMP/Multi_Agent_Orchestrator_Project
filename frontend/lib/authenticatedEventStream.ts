export const AUTH_STREAM_CONNECTING = 0;
export const AUTH_STREAM_OPEN = 1;
export const AUTH_STREAM_CLOSED = 2;

export type AuthenticatedStreamEvent = {
  event: string;
  data: string;
  id?: string;
};

export type AuthenticatedEventStreamConnection = {
  close: () => void;
  readonly readyState: number;
};

type OpenAuthenticatedEventStreamOptions = {
  url: string;
  apiKey?: string | null;
  headers?: HeadersInit;
  onOpen?: () => void;
  onEvent?: (event: AuthenticatedStreamEvent) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
};

function toErrorMessage(text: string, fallback: string): string {
  const normalized = String(text || "").trim();
  if (!normalized) return fallback;
  try {
    const parsed = JSON.parse(normalized) as { detail?: unknown; message?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail.trim();
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
  } catch {
    // Ignore JSON parsing failures and use the raw text.
  }
  return normalized;
}

export function openAuthenticatedEventStream(
  options: OpenAuthenticatedEventStreamOptions,
): AuthenticatedEventStreamConnection {
  const controller = new AbortController();
  let readyState = AUTH_STREAM_CONNECTING;
  let closed = false;

  const finalize = (nextState = AUTH_STREAM_CLOSED) => {
    if (closed) return;
    closed = true;
    readyState = nextState;
    options.onClose?.();
  };

  const dispatchEvent = (
    currentEvent: { event: string; data: string[]; id?: string | undefined },
  ) => {
    if (currentEvent.data.length === 0) return;
    options.onEvent?.({
      event: currentEvent.event || "message",
      data: currentEvent.data.join("\n"),
      id: currentEvent.id,
    });
  };

  void (async () => {
    try {
      const headers = new Headers(options.headers || {});
      headers.set("Accept", "text/event-stream");
      if (options.apiKey && !headers.has("X-API-Key")) {
        headers.set("X-API-Key", options.apiKey);
      }
      const response = await fetch(options.url, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(toErrorMessage(raw, `Stream request failed (${response.status})`));
      }
      if (!response.body) {
        throw new Error("Stream response body is not available.");
      }
      readyState = AUTH_STREAM_OPEN;
      options.onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent: { event: string; data: string[]; id?: string } = { event: "message", data: [] };

      const processBuffer = (flush = false) => {
        while (true) {
          const newlineIndex = buffer.indexOf("\n");
          if (newlineIndex === -1) break;
          const rawLine = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
          if (!line) {
            dispatchEvent(currentEvent);
            currentEvent = { event: "message", data: [] };
            continue;
          }
          if (line.startsWith(":")) continue;
          const separatorIndex = line.indexOf(":");
          const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
          const value = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1).replace(/^\s/, "");
          if (field === "event") currentEvent.event = value || "message";
          else if (field === "data") currentEvent.data.push(value);
          else if (field === "id") currentEvent.id = value;
        }
        if (flush && buffer.trim()) {
          const tail = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
          if (tail) {
            const separatorIndex = tail.indexOf(":");
            const field = separatorIndex === -1 ? tail : tail.slice(0, separatorIndex);
            const value = separatorIndex === -1 ? "" : tail.slice(separatorIndex + 1).replace(/^\s/, "");
            if (field === "event") currentEvent.event = value || "message";
            else if (field === "data") currentEvent.data.push(value);
            else if (field === "id") currentEvent.id = value;
          }
          buffer = "";
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        processBuffer(false);
      }
      buffer += decoder.decode();
      processBuffer(true);
      dispatchEvent(currentEvent);
      finalize();
    } catch (error) {
      if (controller.signal.aborted) {
        finalize();
        return;
      }
      readyState = AUTH_STREAM_CLOSED;
      options.onError?.(error instanceof Error ? error : new Error("Stream connection failed."));
      finalize();
    }
  })();

  return {
    close() {
      if (closed) return;
      controller.abort();
      finalize();
    },
    get readyState() {
      return readyState;
    },
  };
}
