import { PublicWorkstationPreview } from '@/app/preview/PublicWorkstationPreview';

function normalizeSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      params.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry);
      }
    }
  }

  return params.toString();
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const surface = Array.isArray(resolvedSearchParams.surface)
    ? resolvedSearchParams.surface[0]
    : resolvedSearchParams.surface;

  return (
    <PublicWorkstationPreview
      initialSurface={surface ?? null}
      initialQueryString={normalizeSearchParams(resolvedSearchParams)}
    />
  );
}
