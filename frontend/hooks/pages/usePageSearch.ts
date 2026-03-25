'use client';

import { useMemo, useState } from 'react';

type UsePageSearchOptions<T> = {
  items: T[];
  matcher: (item: T, normalizedQuery: string) => boolean;
};

export function usePageSearch<T>({ items, matcher }: UsePageSearchOptions<T>) {
  const [query, setQuery] = useState('');

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => matcher(item, normalizedQuery));
  }, [items, matcher, query]);

  return {
    query,
    setQuery,
    clearQuery: () => setQuery(''),
    hasQuery: query.trim().length > 0,
    filteredItems,
  };
}
