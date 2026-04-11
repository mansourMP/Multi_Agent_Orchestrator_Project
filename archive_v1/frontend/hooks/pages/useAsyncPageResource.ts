'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type UseAsyncPageResourceOptions<T> = {
  initialData: T;
  load: () => Promise<T>;
  formatError?: (error: unknown) => string;
  enabled?: boolean;
  hasInitialData?: boolean;
};

export function useAsyncPageResource<T>({
  initialData,
  load,
  formatError,
  enabled = true,
  hasInitialData = false,
}: UseAsyncPageResourceOptions<T>) {
  const loadRef = useRef(load);
  const formatErrorRef = useRef(formatError);
  const initialDataRef = useRef(initialData);
  const hasInitialDataRef = useRef(hasInitialData);
  const [data, setData] = useState<T>(() => initialData);
  const [loading, setLoading] = useState(enabled && !hasInitialData);
  const [error, setError] = useState('');

  useEffect(() => {
    loadRef.current = load;
    formatErrorRef.current = formatError;
    initialDataRef.current = initialData;
    hasInitialDataRef.current = hasInitialData;
  }, [formatError, hasInitialData, initialData, load]);

  const refresh = useCallback(async () => {
    if (!enabled) return initialDataRef.current;

    try {
      setLoading(true);
      setError('');
      const nextData = await loadRef.current();
      setData(nextData);
      return nextData;
    } catch (loadError) {
      setData(initialDataRef.current);
      setError(
        formatErrorRef.current
          ? formatErrorRef.current(loadError)
          : loadError instanceof Error
            ? loadError.message
            : 'Something went wrong.',
      );
      throw loadError;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    const run = async () => {
      try {
        if (!hasInitialDataRef.current) setLoading(true);
        setError('');
        const nextData = await loadRef.current();
        if (!alive) return;
        setData(nextData);
      } catch (loadError) {
        if (!alive) return;
        setData(initialDataRef.current);
        setError(
          formatErrorRef.current
            ? formatErrorRef.current(loadError)
            : loadError instanceof Error
              ? loadError.message
              : 'Something went wrong.',
        );
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [enabled]);

  return {
    data,
    setData,
    loading,
    error,
    setError,
    refresh,
  };
}
