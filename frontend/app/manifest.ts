import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.company} Platform`,
    short_name: BRAND.company,
    description: `${BRAND.assistant} helps teams build workflows, connect systems, inspect runs, and operate outcomes from one platform.`,
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f4f1',
    theme_color: '#0a0a0a',
    orientation: 'portrait-primary',
    categories: ['productivity', 'business', 'utilities'],
    icons: [
      {
        src: '/pwa-icon-192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/pwa-icon-512',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/pwa-icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
