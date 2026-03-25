'use client';

import { useCallback, useEffect, useState } from 'react';

type UseAsyncPageResourceOptions<T> = {
  initialData: T;
  load: () => Promise<T>;
  formatError?: (error: unknown) => string;
  enabled?: boolean;
};

export function useAsyncPageResource<T>({
  initialData,
  load,
  formatError,
  enabled = true,
}: UseAsyncPageResourceOptions<T>) {
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!enabled) return initialData;

    try {
      setLoading(true);
      setError('');
      const nextData = await load();
      setData(nextData);
      return nextData;
    } catch (loadError) {
      setData(initialData);
      setError(formatError ? formatError(loadError) : loadError instanceof Error ? loadError.message : 'Something went wrong.');
      throw loadError;
    } finally {
      setLoading(false);
    }
  }, [enabled, formatError, initialData, load]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    const run = async () => {
      try {
        setLoading(true);
        setError('');
        const nextData = await load();
        if (!alive) return;
        setData(nextData);
      } catch (loadError) {
        if (!alive) return;
        setData(initialData);
        setError(formatError ? formatError(loadError) : loadError instanceof Error ? loadError.message : 'Something went wrong.');
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [enabled, formatError, initialData, load]);

  return {
    data,
    setData,
    loading,
    error,
    setError,
    refresh,
  };
}
