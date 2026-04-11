import { resolveProductRoute } from '@/lib/productArchitecture';

export type ShellRouteMeta = {
  id: string;
  title: string;
  breadcrumb: string;
  slotLabel: string;
};

export function resolveShellRouteMeta(pathname: string): ShellRouteMeta {
  const route = resolveProductRoute(pathname);
  return {
    id: route.section.id,
    title: route.title,
    breadcrumb: route.section.label,
    slotLabel: route.section.summary,
  };
}
