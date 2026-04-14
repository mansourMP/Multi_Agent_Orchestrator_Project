async function resolveSecureStoreBackend() {
  try {
    const module = await import('expo-secure-store');
    if (!module || typeof module.getItemAsync !== 'function') {
      return null;
    }

    return {
      getItem(key) {
        return module.getItemAsync(key);
      },
      setItem(key, value) {
        return module.setItemAsync(key, value);
      },
      removeItem(key) {
        return module.deleteItemAsync(key);
      },
    };
  } catch {
    return null;
  }
}

function parseRecord(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function createSecureKeyValueStorage({
  namespace = 'empyralis.mobile.v2.secure',
} = {}) {
  const cache = new Map();
  let backendPromise = null;
  let readyPromise = null;
  let didHydrate = false;
  let writeQueue = Promise.resolve();

  async function getBackend() {
    if (!backendPromise) {
      backendPromise = Promise.resolve(resolveSecureStoreBackend()).catch(() => null);
    }
    return backendPromise;
  }

  function schedulePersist() {
    writeQueue = writeQueue
      .then(async () => {
        const backend = await getBackend();
        if (!backend) {
          return;
        }

        if (cache.size === 0) {
          await backend.removeItem(namespace);
          return;
        }

        await backend.setItem(
          namespace,
          JSON.stringify(Object.fromEntries(cache.entries())),
        );
      })
      .catch(() => {
        // Ignore secure-store persistence failures. Cached state remains valid for this process.
      });

    return writeQueue;
  }

  return {
    kind: 'secure',
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

        const record = parseRecord(await backend.getItem(namespace));
        for (const [key, value] of Object.entries(record)) {
          if (typeof value === 'string') {
            cache.set(key, value);
          }
        }
        didHydrate = true;
      })();

      return readyPromise;
    },
    getItem(key) {
      return cache.has(key) ? cache.get(key) : null;
    },
    setItem(key, value) {
      cache.set(key, String(value));
      void schedulePersist();
    },
    removeItem(key) {
      cache.delete(key);
      void schedulePersist();
    },
    clear() {
      cache.clear();
      void schedulePersist();
    },
    snapshot() {
      return {
        kind: 'secure',
        namespace,
        hydrated: didHydrate,
        cachedKeyCount: cache.size,
      };
    },
  };
}
