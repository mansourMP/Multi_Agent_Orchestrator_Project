import { createMemoryKeyValueStorage } from '../storage/memory-key-value-storage.js';

function normalizeCacheKey(prefix, key) {
  return `${prefix}:query:${key}`;
}

function normalizeStorageKey(prefix, key) {
  return `${prefix}:persist:${key}`;
}

function resolveFetchImpl(fetchImpl) {
  if (typeof fetchImpl === 'function') {
    return fetchImpl;
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error('A fetch implementation is required for mobile workspace services.');
}

function resolveApiBaseUrl(apiBaseUrl) {
  if (typeof apiBaseUrl !== 'string' || !apiBaseUrl.trim()) {
    throw new Error('Mobile workspace services require a public apiBaseUrl.');
  }
  return apiBaseUrl.replace(/\/+$/, '');
}

function resolveStorage(storage) {
  if (
    storage
    && typeof storage.getItem === 'function'
    && typeof storage.setItem === 'function'
    && typeof storage.removeItem === 'function'
  ) {
    return storage;
  }

  return createMemoryKeyValueStorage();
}

export class WorkspaceDisposableRegistry {
  constructor() {
    this.disposers = new Set();
    this.objectUrls = new Set();
    this.intervals = new Set();
    this.timeouts = new Set();
    this.workers = new Set();
    this.sockets = new Set();
    this.eventSources = new Set();
    this.abortControllers = new Set();
  }

  add(disposer) {
    this.disposers.add(disposer);
    return () => {
      this.disposers.delete(disposer);
    };
  }

  trackObjectUrl(url) {
    this.objectUrls.add(url);
    return url;
  }

  trackInterval(id) {
    this.intervals.add(id);
    return id;
  }

  trackTimeout(id) {
    this.timeouts.add(id);
    return id;
  }

  trackWorker(worker) {
    this.workers.add(worker);
    return worker;
  }

  trackSocket(socket) {
    this.sockets.add(socket);
    return socket;
  }

  trackEventSource(source) {
    this.eventSources.add(source);
    return source;
  }

  trackAbortController(controller) {
    this.abortControllers.add(controller);
    return controller;
  }

  snapshot() {
    return {
      disposerCount: this.disposers.size,
      objectUrlCount: this.objectUrls.size,
      intervalCount: this.intervals.size,
      timeoutCount: this.timeouts.size,
      workerCount: this.workers.size,
      socketCount: this.sockets.size,
      eventSourceCount: this.eventSources.size,
      abortControllerCount: this.abortControllers.size,
    };
  }

  dispose() {
    for (const disposer of Array.from(this.disposers)) {
      try {
        disposer();
      } catch {
        // Ignore teardown failures during boundary disposal.
      }
    }
    this.disposers.clear();

    for (const controller of Array.from(this.abortControllers)) {
      controller.abort();
    }
    this.abortControllers.clear();

    for (const interval of Array.from(this.intervals)) {
      clearInterval(interval);
    }
    this.intervals.clear();

    for (const timeout of Array.from(this.timeouts)) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();

    for (const source of Array.from(this.eventSources)) {
      source?.close?.();
    }
    this.eventSources.clear();

    for (const socket of Array.from(this.sockets)) {
      socket?.close?.();
    }
    this.sockets.clear();

    for (const worker of Array.from(this.workers)) {
      worker?.terminate?.();
    }
    this.workers.clear();

    for (const url of Array.from(this.objectUrls)) {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    }
    this.objectUrls.clear();
  }
}

export class WorkspacePersistenceNamespace {
  constructor(prefix, storage) {
    this.prefix = prefix;
    this.storage = storage;
    this.indexKey = `${prefix}:persist-index`;
  }

  keyFor(key) {
    return normalizeStorageKey(this.prefix, key);
  }

  readIndex() {
    const rawValue = this.storage.getItem(this.indexKey);
    if (!rawValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
    } catch {
      this.storage.removeItem(this.indexKey);
      return [];
    }
  }

  writeIndex(entries) {
    this.storage.setItem(this.indexKey, JSON.stringify(Array.from(new Set(entries))));
  }

  getJson(key) {
    const rawValue = this.storage.getItem(this.keyFor(key));
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue);
    } catch {
      this.storage.removeItem(this.keyFor(key));
      return null;
    }
  }

  setJson(key, value) {
    const storageKey = this.keyFor(key);
    this.storage.setItem(storageKey, JSON.stringify(value));
    this.writeIndex([...this.readIndex(), storageKey]);
  }

  remove(key) {
    const storageKey = this.keyFor(key);
    this.storage.removeItem(storageKey);
    this.writeIndex(this.readIndex().filter((entry) => entry !== storageKey));
  }

  clear() {
    for (const storageKey of this.readIndex()) {
      this.storage.removeItem(storageKey);
    }
    this.storage.removeItem(this.indexKey);
  }

  snapshot() {
    return {
      prefix: this.prefix,
      trackedKeyCount: this.readIndex().length,
    };
  }
}

export class WorkspaceTransportAdapter {
  constructor({ apiBaseUrl, workspaceId, accessToken, disposableRegistry, fetchImpl }) {
    this.apiBaseUrl = resolveApiBaseUrl(apiBaseUrl);
    this.workspaceId = workspaceId;
    this.accessToken = accessToken;
    this.disposableRegistry = disposableRegistry;
    this.fetchImpl = resolveFetchImpl(fetchImpl);
    this.inFlightControllers = new Map();
  }

  async request(path, init = {}) {
    const controller = this.disposableRegistry.trackAbortController(new AbortController());
    const requestId = `${Date.now()}:${Math.random().toString(16).slice(2)}`;
    this.inFlightControllers.set(requestId, controller);

    const url = /^https?:\/\//.test(path)
      ? path
      : `${this.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = new Headers(init.headers ?? {});
    headers.set('x-empyralis-workspace-id', this.workspaceId);
    if (typeof this.accessToken === 'string' && this.accessToken.trim()) {
      headers.set('authorization', `Bearer ${this.accessToken}`);
    }

    try {
      return await this.fetchImpl(url, {
        ...init,
        headers,
        signal: init.signal ?? controller.signal,
      });
    } finally {
      this.inFlightControllers.delete(requestId);
    }
  }

  async requestJson(path, init = {}) {
    const response = await this.request(path, init);
    if (!response.ok) {
      throw new Error(`Workspace transport request failed with status ${response.status}.`);
    }
    return response.json();
  }

  snapshot() {
    return {
      apiBaseUrl: this.apiBaseUrl,
      connectionMode: 'platform_first',
      inFlightRequestCount: this.inFlightControllers.size,
    };
  }

  dispose() {
    for (const controller of this.inFlightControllers.values()) {
      controller.abort();
    }
    this.inFlightControllers.clear();
  }
}

export class WorkspaceQueryClient {
  constructor(prefix, disposableRegistry) {
    this.prefix = prefix;
    this.disposableRegistry = disposableRegistry;
    this.cache = new Map();
    this.inFlight = new Map();
  }

  peek(key) {
    return this.cache.get(normalizeCacheKey(this.prefix, key)) ?? null;
  }

  set(key, value) {
    this.cache.set(normalizeCacheKey(this.prefix, key), value);
    return value;
  }

  async fetch(key, executor) {
    const scopedKey = normalizeCacheKey(this.prefix, key);
    if (this.cache.has(scopedKey)) {
      return this.cache.get(scopedKey);
    }

    const controller = this.disposableRegistry.trackAbortController(new AbortController());
    this.inFlight.set(scopedKey, controller);
    try {
      const value = await executor({ signal: controller.signal, cacheKey: scopedKey });
      this.cache.set(scopedKey, value);
      return value;
    } finally {
      this.inFlight.delete(scopedKey);
    }
  }

  clear() {
    this.cache.clear();
    for (const controller of this.inFlight.values()) {
      controller.abort();
    }
    this.inFlight.clear();
  }

  snapshot() {
    return {
      prefix: this.prefix,
      cacheKeyCount: this.cache.size,
      inFlightRequestCount: this.inFlight.size,
    };
  }
}

export class WorkspaceRealtimeAdapter {
  constructor(disposableRegistry) {
    this.disposableRegistry = disposableRegistry;
    this.pollers = new Map();
  }

  startPoller(id, callback, intervalMs) {
    this.stopPoller(id);
    const timer = this.disposableRegistry.trackInterval(setInterval(callback, intervalMs));
    this.pollers.set(id, timer);
    return timer;
  }

  stopPoller(id) {
    const timer = this.pollers.get(id);
    if (timer) {
      clearInterval(timer);
      this.pollers.delete(id);
    }
  }

  snapshot() {
    return {
      pollerCount: this.pollers.size,
    };
  }

  dispose() {
    for (const timer of this.pollers.values()) {
      clearInterval(timer);
    }
    this.pollers.clear();
  }
}

export function createWorkspaceStoreFactory() {
  return {
    createStore(initialState = {}) {
      let state = initialState;
      const listeners = new Set();

      return {
        getState() {
          return state;
        },
        setState(nextState) {
          state = typeof nextState === 'function' ? nextState(state) : nextState;
          for (const listener of listeners) {
            listener(state);
          }
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        destroy() {
          listeners.clear();
        },
      };
    },
  };
}

export function createWorkspaceServiceBundle({
  accountId,
  workspaceId,
  apiBaseUrl,
  accessToken = null,
  storage = createMemoryKeyValueStorage(),
  fetchImpl,
} = {}) {
  if (typeof accountId !== 'string' || !accountId.trim()) {
    throw new Error('Workspace service bundle requires accountId.');
  }
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
    throw new Error('Workspace service bundle requires workspaceId.');
  }

  const resolvedStorage = resolveStorage(storage);
  const prefix = `empyralis.mobile.v2:${accountId}:${workspaceId}`;
  const disposableRegistry = new WorkspaceDisposableRegistry();
  const persistence = new WorkspacePersistenceNamespace(prefix, resolvedStorage);
  const transport = new WorkspaceTransportAdapter({
    apiBaseUrl,
    workspaceId,
    accessToken,
    disposableRegistry,
    fetchImpl,
  });
  const queryClient = new WorkspaceQueryClient(prefix, disposableRegistry);
  const realtime = new WorkspaceRealtimeAdapter(disposableRegistry);
  const storeFactory = createWorkspaceStoreFactory();

  return {
    prefix,
    queryClient,
    transport,
    realtime,
    persistence,
    storage: resolvedStorage,
    disposableRegistry,
    storeFactory,
    snapshot() {
      return {
        prefix,
        query: queryClient.snapshot(),
        transport: transport.snapshot(),
        realtime: realtime.snapshot(),
        persistence: persistence.snapshot(),
        storage: resolvedStorage.snapshot?.() ?? null,
        disposableRegistry: disposableRegistry.snapshot(),
      };
    },
    dispose() {
      queryClient.clear();
      realtime.dispose();
      transport.dispose();
      disposableRegistry.dispose();
    },
  };
}
