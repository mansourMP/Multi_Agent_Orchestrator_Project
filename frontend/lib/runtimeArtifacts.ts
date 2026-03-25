import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

export function buildRuntimeArtifactEndpoint(path: string): string {
  return `/api/artifacts/file?path=${encodeURIComponent(String(path || "").trim())}`;
}

export async function fetchRuntimeArtifactBlob(path: string): Promise<Blob> {
  await ensureControlPlaneSession();
  const response = await fetch(buildRuntimeArtifactEndpoint(path), {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let detail = raw.trim();
    try {
      const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown };
      if (typeof parsed.detail === "string" && parsed.detail.trim()) detail = parsed.detail.trim();
      else if (typeof parsed.message === "string" && parsed.message.trim()) detail = parsed.message.trim();
    } catch {
      // Ignore invalid JSON and use the raw response text.
    }
    throw new Error(detail || `Artifact request failed (${response.status})`);
  }
  return response.blob();
}
