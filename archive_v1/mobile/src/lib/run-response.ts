const PREFERRED_REPLY_KEYS = [
  "reply",
  "message",
  "text",
  "summary",
  "content_preview",
  "content",
];

function readString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function findPreferredString(value: unknown, depth = 0): string {
  if (!value || depth > 4) return "";

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findPreferredString(item, depth + 1);
      if (match) return match;
    }
    return "";
  }

  if (typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;

  for (const key of PREFERRED_REPLY_KEYS) {
    const match = readString(record[key]);
    if (match) return match;
  }

  for (const key of Object.keys(record)) {
    const match = findPreferredString(record[key], depth + 1);
    if (match) return match;
  }

  return "";
}

export function extractRunReply(run: any) {
  const directCandidates = [
    run?.result,
    run?.result_summary,
    run?.result_data?.reply,
    run?.result_data?.message,
    run?.result_data?.text,
    run?.result_data?.summary,
    run?.result_data?.outputs?.reply,
    run?.result_data?.outputs?.message,
    run?.result_data?.outputs?.text,
    run?.delegation_summary?.summary,
  ];

  for (const candidate of directCandidates) {
    const text = readString(candidate);
    if (text) return text;
  }

  const nested = findPreferredString(run?.result_data);
  if (nested) return nested;

  const failed =
    String(run?.status ?? "").toLowerCase() === "failed"
      ? readString(run?.error) ||
        readString(run?.detail) ||
        readString(run?.result_data?.error) ||
        "Run failed."
      : "";

  return failed || "Received.";
}
