'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';

type AuthenticatedImageProps = {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
};

export function AuthenticatedImage({ src, alt, className, style }: AuthenticatedImageProps) {
  const runtimeKey = useMemo(
    () => readRuntimeApiKeyFromStorage(''),
    [],
  );
  const [blobUrl, setBlobUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    const load = async () => {
      try {
        const res = await fetch(src, { headers: runtimeKey ? { 'X-API-Key': runtimeKey } : {} });
        if (!res.ok) {
          throw new Error('image fetch failed');
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setBlobUrl('');
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [runtimeKey, src]);

  if (!blobUrl) {
    return <div className={className} style={{ ...style, display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-element)' }}>No snapshot</div>;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={blobUrl} alt={alt} className={className} style={style} />;
}
