'use client';

import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
} from 'react';

import type { WorkspaceBootstrapPayload } from '@/lib/workspace/workspace-bootstrap';

type QueryExecutor<T> = (context: { signal: AbortSignal; cacheKey: string }) => Promise<T>;
type StoreListener<T> = (state: T) => void;
type DisposeFn = () => void;

function normalizeCacheKey(prefix: string, key: string): string {
  return `${prefix}:query:${key}`;
}

function normalizeStorageKey(prefix: string, key: string): string {
  return `${prefix}:persist:${key}`;
}

function resolveApiBaseUrl(): string {
  const envBase =
    process.env.NEXT_PUBLIC_API_URL
    ?? process.env.NEXT_PUBLIC_ORION_API_URL
    ?? '';

  if (envBase.trim()) {
    return envBase.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/+$/, '');
  }

  return '';
}

class WorkspaceDisposableRegistry {
  private readonly disposers = new Set<DisposeFn>();
  private readonly objectUrls = new Set<string>();
  private readonly intervals = new Set<number>();
  private readonly timeouts = new Set<number>();
  private readonly workers = new Set<Worker>();
  private readonly sockets = new Set<WebSocket>();
  private readonly eventSources = new Set<EventSource>();
  private readonly abortControllers = new Set<AbortController>();

  add(disposer: DisposeFn): DisposeFn {
    this.disposers.add(disposer);
    return () => {
      this.disposers.delete(disposer);
    };
  }

  trackObjectUrl(url: string): string {
    this.objectUrls.add(url);
    return url;
  }

  trackInterval(id: number): number {
    this.intervals.add(id);
    return id;
  }

  trackTimeout(id: number): number {
    this.timeouts.add(id);
    return id;
  }

  trackWorker<T extends Worker>(worker: T): T {
    this.workers.add(worker);
    return worker;
  }

  trackSocket<T extends WebSocket>(socket: T): T {
    this.sockets.add(socket);
    return socket;
  }

  trackEventSource<T extends EventSource>(source: T): T {
    this.eventSources.add(source);
    return source;
  }

  trackAbortController(controller: AbortController): AbortController {
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

  dispose(): void {
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
      window.clearInterval(interval);
    }
    this.intervals.clear();

    for (const timeout of Array.from(this.timeouts)) {
      window.clearTimeout(timeout);
    }
    this.timeouts.clear();

    for (const source of Array.from(this.eventSources)) {
      source.close();
    }
    this.eventSources.clear();

    for (const socket of Array.from(this.sockets)) {
      try {
        socket.close();
      } catch {
        // Ignore socket close errors during boundary disposal.
      }
    }
    this.sockets.clear();

    for (const worker of Array.from(this.workers)) {
      worker.terminate();
    }
    this.workers.clear();

    for (const url of Array.from(this.objectUrls)) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
  }
}

class WorkspacePersistenceNamespace {
  private readonly indexKey: string;

  constructor(private readonly prefix: string) {
    this.indexKey = `${prefix}:persist-index`;
  }

  keyFor(key: string): string {
    return normalizeStorageKey(this.prefix, key);
  }

  private canUseStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  private readIndex(): string[] {
    if (!this.canUseStorage()) {
      return [];
    }

    const rawValue = window.localStorage.getItem(this.indexKey);
    if (!rawValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
    } catch {
      window.localStorage.removeItem(this.indexKey);
      return [];
    }
  }

  private writeIndex(entries: string[]): void {
    if (!this.canUseStorage()) {
      return;
    }

    window.localStorage.setItem(this.indexKey, JSON.stringify(Array.from(new Set(entries))));
  }

  getJson<T>(key: string): T | null {
    if (!this.canUseStorage()) {
      return null;
    }

    const storageKey = this.keyFor(key);
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue) as T;
    } catch {
      window.localStorage.removeItem(storageKey);
      return null;
    }
  }

  setJson(key: string, value: unknown): void {
    if (!this.canUseStorage()) {
      return;
    }

    const storageKey = this.keyFor(key);
    window.localStorage.setItem(storageKey, JSON.stringify(value));
    this.writeIndex([...this.readIndex(), storageKey]);
  }

  remove(key: string): void {
    if (!this.canUseStorage()) {
      return;
    }

    const storageKey = this.keyFor(key);
    window.localStorage.removeItem(storageKey);
    this.writeIndex(this.readIndex().filter((entry) => entry !== storageKey));
  }

  clear(): void {
    if (!this.canUseStorage()) {
      return;
    }

    for (const storageKey of this.readIndex()) {
      window.localStorage.removeItem(storageKey);
    }
    window.localStorage.removeItem(this.indexKey);
  }

  snapshot() {
    return {
      prefix: this.prefix,
      trackedKeyCount: this.readIndex().length,
    };
  }
}

class WorkspaceTransportAdapter {
  private readonly inFlightControllers = new Map<string, AbortController>();

  constructor(
    private readonly apiBaseUrl: string,
    private readonly workspaceId: string,
    private readonly disposableRegistry: WorkspaceDisposableRegistry,
  ) {}

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = this.disposableRegistry.trackAbortController(new AbortController());
    const requestId = `${Date.now()}:${Math.random().toString(16).slice(2)}`;
    this.inFlightControllers.set(requestId, controller);

    const url = /^https?:\/\//.test(path) ? path : `${this.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = new Headers(init.headers ?? {});
    headers.set('x-empyralis-workspace-id', this.workspaceId);

    try {
      return await fetch(url, {
        ...init,
        headers,
        signal: init.signal ?? controller.signal,
      });
    } finally {
      this.inFlightControllers.delete(requestId);
    }
  }

  async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init);
    if (!response.ok) {
      throw new Error(`Workspace transport request failed with status ${response.status}.`);
    }
    return (await response.json()) as T;
  }

  snapshot() {
    return {
      apiBaseUrl: this.apiBaseUrl,
      inFlightRequestCount: this.inFlightControllers.size,
    };
  }

  dispose(): void {
    for (const controller of this.inFlightControllers.values()) {
      controller.abort();
    }
    this.inFlightControllers.clear();
  }
}

class WorkspaceQueryClient {
  private readonly cache = new Map<string, unknown>();
  private readonly inFlight = new Map<string, AbortController>();

  constructor(
    private readonly prefix: string,
    private readonly disposableRegistry: WorkspaceDisposableRegistry,
  ) {}

  peek<T>(key: string): T | null {
    const scopedKey = normalizeCacheKey(this.prefix, key);
    return (this.cache.get(scopedKey) as T | undefined) ?? null;
  }

  set<T>(key: string, value: T): T {
    const scopedKey = normalizeCacheKey(this.prefix, key);
    this.cache.set(scopedKey, value);
    return value;
  }

  async run<T>(key: string, executor: QueryExecutor<T>): Promise<T> {
    const scopedKey = normalizeCacheKey(this.prefix, key);
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

  invalidate(key?: string): void {
    if (!key) {
      this.cache.clear();
      return;
    }

    this.cache.delete(normalizeCacheKey(this.prefix, key));
  }

  snapshot() {
    return {
      cacheEntryCount: this.cache.size,
      inFlightCount: this.inFlight.size,
    };
  }

  dispose(): void {
    for (const controller of this.inFlight.values()) {
      controller.abort();
    }
    this.inFlight.clear();
    this.cache.clear();
  }
}

class WorkspaceRealtimeAdapter {
  private readonly pollingHandles = new Set<number>();

  constructor(private readonly disposableRegistry: WorkspaceDisposableRegistry) {}

  registerPoller(callback: () => void, intervalMs: number): DisposeFn {
    const handle = this.disposableRegistry.trackInterval(window.setInterval(callback, intervalMs));
    this.pollingHandles.add(handle);
    return () => {
      window.clearInterval(handle);
      this.pollingHandles.delete(handle);
    };
  }

  trackSocket<T extends WebSocket>(socket: T): T {
    return this.disposableRegistry.trackSocket(socket);
  }

  trackEventSource<T extends EventSource>(source: T): T {
    return this.disposableRegistry.trackEventSource(source);
  }

  snapshot() {
    return {
      pollerCount: this.pollingHandles.size,
    };
  }

  dispose(): void {
    for (const handle of Array.from(this.pollingHandles)) {
      window.clearInterval(handle);
    }
    this.pollingHandles.clear();
  }
}

type WorkspaceStore<T> = {
  getState: () => T;
  setState: (nextState: T) => void;
  subscribe: (listener: StoreListener<T>) => DisposeFn;
};

class WorkspaceStoreFactory {
  private readonly stores = new Map<string, WorkspaceStore<unknown>>();
  private readonly storeListeners = new Map<string, Set<StoreListener<unknown>>>();

  createStore<T>(name: string, initialState: T): WorkspaceStore<T> {
    const existing = this.stores.get(name) as WorkspaceStore<T> | undefined;
    if (existing) {
      return existing;
    }

    let currentState = initialState;
    const listeners = new Set<StoreListener<unknown>>();
    this.storeListeners.set(name, listeners);

    const store: WorkspaceStore<T> = {
      getState: () => currentState,
      setState: (nextState) => {
        currentState = nextState;
        for (const listener of listeners) {
          (listener as StoreListener<T>)(currentState);
        }
      },
      subscribe: (listener) => {
        listeners.add(listener as StoreListener<unknown>);
        return () => {
          listeners.delete(listener as StoreListener<unknown>);
        };
      },
    };

    this.stores.set(name, store as WorkspaceStore<unknown>);
    return store;
  }

  snapshot() {
    return {
      storeCount: this.stores.size,
      listenerCount: Array.from(this.storeListeners.values()).reduce(
        (total, listeners) => total + listeners.size,
        0,
      ),
    };
  }

  dispose(): void {
    this.storeListeners.clear();
    this.stores.clear();
  }
}

export type WorkspaceServices = {
  scopeKey: string;
  queryClient: WorkspaceQueryClient;
  transport: WorkspaceTransportAdapter;
  realtime: WorkspaceRealtimeAdapter;
  persistence: WorkspacePersistenceNamespace;
  disposables: WorkspaceDisposableRegistry;
  stores: WorkspaceStoreFactory;
  snapshot: () => {
    scopeKey: string;
    persistence: ReturnType<WorkspacePersistenceNamespace['snapshot']>;
    queryClient: ReturnType<WorkspaceQueryClient['snapshot']>;
    transport: ReturnType<WorkspaceTransportAdapter['snapshot']>;
    realtime: ReturnType<WorkspaceRealtimeAdapter['snapshot']>;
    disposables: ReturnType<WorkspaceDisposableRegistry['snapshot']>;
    stores: ReturnType<WorkspaceStoreFactory['snapshot']>;
  };
  dispose: () => void;
};

const WorkspaceServicesContext = createContext<WorkspaceServices | null>(null);

function createWorkspaceServices(
  boundaryKey: string,
  bootstrap: WorkspaceBootstrapPayload,
): WorkspaceServices {
  const scopeKey = `${bootstrap.account.id}:${bootstrap.workspace.id}:${boundaryKey}`;
  const persistencePrefix = `empyralis.workspace.v2:${bootstrap.account.id}:${bootstrap.workspace.id}`;
  const disposables = new WorkspaceDisposableRegistry();
  const persistence = new WorkspacePersistenceNamespace(persistencePrefix);
  const transport = new WorkspaceTransportAdapter(
    resolveApiBaseUrl(),
    bootstrap.workspace.id,
    disposables,
  );
  const queryClient = new WorkspaceQueryClient(
    `${bootstrap.account.id}:${bootstrap.workspace.id}`,
    disposables,
  );
  const realtime = new WorkspaceRealtimeAdapter(disposables);
  const stores = new WorkspaceStoreFactory();

  return {
    scopeKey,
    queryClient,
    transport,
    realtime,
    persistence,
    disposables,
    stores,
    snapshot: () => ({
      scopeKey,
      persistence: persistence.snapshot(),
      queryClient: queryClient.snapshot(),
      transport: transport.snapshot(),
      realtime: realtime.snapshot(),
      disposables: disposables.snapshot(),
      stores: stores.snapshot(),
    }),
    dispose: () => {
      queryClient.dispose();
      transport.dispose();
      realtime.dispose();
      stores.dispose();
      disposables.dispose();
    },
  };
}

export function WorkspaceServicesProvider({
  boundaryKey,
  bootstrap,
  children,
}: PropsWithChildren<{
  boundaryKey: string;
  bootstrap: WorkspaceBootstrapPayload;
}>) {
  const services = useMemo(
    () => createWorkspaceServices(boundaryKey, bootstrap),
    [boundaryKey, bootstrap],
  );

  useEffect(() => () => {
    services.dispose();
  }, [services]);

  return (
    <WorkspaceServicesContext.Provider value={services}>
      {children}
    </WorkspaceServicesContext.Provider>
  );
}

export function useWorkspaceServices(): WorkspaceServices {
  const value = useContext(WorkspaceServicesContext);
  if (!value) {
    throw new Error('useWorkspaceServices must be used inside WorkspaceServicesProvider.');
  }
  return value;
}
