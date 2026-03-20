import { getCatalogApp } from "./appCatalog";
import type { AppRecord, AppRecordSource } from "./types";

function normalizeStatus(value: unknown): AppRecord["status"] {
  const next = String(value || "available").toLowerCase();
  if (next === "installed" || next === "pending") return next;
  return "available";
}

export function normalizeAppRecord(raw: any, source: AppRecordSource): AppRecord | null {
  if (!raw) return null;

  const id = String(raw.id ?? raw.app_id ?? "");
  if (!id) return null;

  return {
    id,
    name: String(raw.name ?? raw.title ?? "App"),
    description: raw.description ? String(raw.description) : undefined,
    icon: raw.icon ? String(raw.icon) : undefined,
    category: raw.category ? String(raw.category) : undefined,
    publisher: raw.publisher ? String(raw.publisher) : undefined,
    status: normalizeStatus(raw.status),
    version: raw.version ? String(raw.version) : "1.0.0",
    latestVersion: raw.latestVersion ?? raw.latest_version ? String(raw.latestVersion ?? raw.latest_version) : undefined,
    permissions: Array.isArray(raw.permissions) ? raw.permissions.map((perm: unknown) => String(perm)) : [],
    source,
    packageId: raw.packageId ?? raw.package_id ? String(raw.packageId ?? raw.package_id) : undefined,
    releaseChannel:
      raw.releaseChannel ?? raw.release_channel ? String(raw.releaseChannel ?? raw.release_channel) : undefined,
  };
}

export function getPreviewAppRecord(appId: string): AppRecord | null {
  const fallback = getCatalogApp(appId);
  if (!fallback) return null;

  return {
    id: fallback.id,
    name: fallback.name,
    description: fallback.description,
    icon: fallback.icon,
    category: fallback.category,
    publisher: fallback.publisher,
    status: "available",
    version: fallback.version || "1.0.0",
    latestVersion: fallback.latestVersion,
    permissions: [],
    source: "preview",
  };
}

export function mergeAppRecords(
  coreRecord: AppRecord | null,
  platformRecord: AppRecord | null,
  previewRecord: AppRecord | null,
): AppRecord | null {
  if (coreRecord) {
    return {
      ...platformRecord,
      ...previewRecord,
      ...coreRecord,
      source: "core",
    };
  }

  if (platformRecord) {
    return {
      ...previewRecord,
      ...platformRecord,
      source: "platform",
    };
  }

  return previewRecord;
}
