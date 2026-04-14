function createMapStorage(seedEntries = []) {
  const store = new Map(seedEntries);

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    keys() {
      return Array.from(store.keys());
    },
    snapshot() {
      return {
        cachedKeyCount: store.size,
      };
    },
  };
}

async function resolveAsyncStorageBackend() {
  try {
    const module = await import('@react-native-async-storage/async-storage');
    const backend = module.default ?? module;
    if (!backend || typeof backend.getItem !== 'function') {
      return null;
    }

    return {
      getItem(key) {
        return backend.getItem(key);
      },
      setItem(key, value) {
        return backend.setItem(key, value);
      },
      removeItem(key) {
        return backend.removeItem(key);
      },
    };
  } catch {
    return null;
  }
}

function parseKeyIndex(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function createCachedKeyValueStorage({
  kind,
  namespace,
  resolveBackend,
}) {
  const backing = createMapStorage();
  const indexKey = `${namespace}:index`;
  let backendPromise = null;
  let readyPromise = null;
  let didHydrate = false;
  let writeQueue = Promise.resolve();

  async function getBackend() {
    if (!backendPromise) {
      backendPromise = Promise.resolve(resolveBackend()).catch(() => null);
    }
    return backendPromise;
  }

  async function persistIndex(backend) {
    const keys = backing.keys();
    if (keys.length === 0) {
      await backend.removeItem(indexKey);
      return;
    }

    await backend.setItem(indexKey, JSON.stringify(keys));
  }

  function enqueueWrite(task) {
    writeQueue = writeQueue
      .then(async () => {
        const backend = await getBackend();
        if (!backend) {
          return;
        }
        await task(backend);
      })
      .catch(() => {
        // Ignore persistence backend failures. The in-memory cache remains authoritative for this process.
      });
    return writeQueue;
  }

  return {
    kind,
    async ready() {
      if (readyPromise) {
        return readyPromise;
      }

      readyPromise = (async () => {
        const backend = await getBackend();
        if (!backend) {
          didHydrate = true;
          return;
        }

        const keys = parseKeyIndex(await backend.getItem(indexKey));
        for (const key of keys) {
          const value = await backend.getItem(key);
          if (typeof value === 'string') {
            backing.setItem(key, value);
          }
        }
        didHydrate = true;
      })();

      return readyPromise;
    },
    getItem(key) {
      return backing.getItem(key);
    },
    setItem(key, value) {
      backing.setItem(key, value);
      void enqueueWrite(async (backend) => {
        await backend.setItem(key, String(value));
        await persistIndex(backend);
      });
    },
    removeItem(key) {
      backing.removeItem(key);
      void enqueueWrite(async (backend) => {
        await backend.removeItem(key);
        await persistIndex(backend);
      });
    },
    clear() {
      const keys = backing.keys();
      backing.clear();
      void enqueueWrite(async (backend) => {
        for (const key of keys) {
          await backend.removeItem(key);
        }
        await backend.removeItem(indexKey);
      });
    },
    snapshot() {
      return {
        kind,
        namespace,
        hydrated: didHydrate,
        cachedKeyCount: backing.keys().length,
      };
    },
  };
}

export function createMemoryKeyValueStorage(seed = {}) {
  const entries = Object.entries(seed).filter(([, value]) => value != null);
  const backing = createMapStorage(entries);

  return {
    kind: 'memory',
    async ready() {
      return undefined;
    },
    getItem(key) {
      return backing.getItem(key);
    },
    setItem(key, value) {
      backing.setItem(key, value);
    },
    removeItem(key) {
      backing.removeItem(key);
    },
    clear() {
      backing.clear();
    },
    snapshot() {
      return {
        kind: 'memory',
        hydrated: true,
        ...backing.snapshot(),
      };
    },
  };
}

export function createPersistentKeyValueStorage({
  namespace = 'empyralis.mobile.v2.persist',
} = {}) {
  return createCachedKeyValueStorage({
    kind: 'persistent',
    namespace,
    resolveBackend: resolveAsyncStorageBackend,
  });
}
