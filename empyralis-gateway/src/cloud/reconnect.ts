export interface ReconnectBackoffOptions {
  minDelayMs: number;
  maxDelayMs: number;
  factor?: number;
  jitterRatio?: number;
}

export interface ReconnectDecision {
  retryable: boolean;
  reason: string;
}

export class ReconnectBackoff {
  private attempts = 0;
  private readonly factor: number;
  private readonly jitterRatio: number;

  constructor(private readonly options: ReconnectBackoffOptions) {
    this.factor = options.factor ?? 2;
    this.jitterRatio = options.jitterRatio ?? 0.2;
  }

  reset(): void {
    this.attempts = 0;
  }

  nextDelayMs(): number {
    const base = Math.min(
      this.options.maxDelayMs,
      this.options.minDelayMs * Math.pow(this.factor, this.attempts),
    );
    this.attempts += 1;
    const jitter = base * this.jitterRatio * Math.random();
    return Math.max(Math.round(base + jitter), Math.max(250, this.options.minDelayMs));
  }
}

export function classifyReconnectError(error: unknown): ReconnectDecision {
  const message = String(error instanceof Error ? error.message : error || "")
    .trim()
    .toLowerCase();
  if (!message) {
    return { retryable: true, reason: "unknown" };
  }
  if (
    message.includes("credentials are invalid") ||
    message.includes("device trust was revoked") ||
    message.includes("registration has been revoked") ||
    message.includes("registration revoked") ||
    message.includes("session has expired") ||
    message.includes("status 401") ||
    message.includes("status 403") ||
    message.includes("token is missing") ||
    message.includes("scope mismatch") ||
    message.includes("binding validation failed") ||
    message.includes("4401") ||
    message.includes("4403")
  ) {
    return { retryable: false, reason: message };
  }
  return { retryable: true, reason: message };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}
