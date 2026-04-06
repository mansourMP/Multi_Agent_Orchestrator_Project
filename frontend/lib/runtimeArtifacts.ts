import { apiClient } from '@/lib/api-client';

export function buildRuntimeArtifactEndpoint(path: string): string {
  return `/api/artifacts/content?path=${encodeURIComponent(String(path || "").trim())}`;
}

export async function fetchRuntimeArtifactBlob(path: string): Promise<Blob> {
  return apiClient.fetchArtifactContent(path);
}
