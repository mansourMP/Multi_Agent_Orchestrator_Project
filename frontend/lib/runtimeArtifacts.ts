export function buildRuntimeArtifactEndpoint(apiBase: string, path: string): string {
  return `${apiBase}/artifacts/file?path=${encodeURIComponent(String(path || "").trim())}`;
}

export async function fetchRuntimeArtifactBlob(
  apiBase: string,
  path: string,
  apiKey: string,
): Promise<Blob> {
  const headers = new Headers();
  const normalizedKey = String(apiKey || "").trim();
  if (normalizedKey) headers.set("X-API-Key", normalizedKey);
  const response = await fetch(buildRuntimeArtifactEndpoint(apiBase, path), {
    method: "GET",
    headers,
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
