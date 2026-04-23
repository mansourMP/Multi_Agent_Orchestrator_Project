export interface ReconnectBackoffOptions {
  minDelayMs: number;
  maxDelayMs: number;
  factor?: number;
  jitterRatio?: number;
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
    return Math.round(base + jitter);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
