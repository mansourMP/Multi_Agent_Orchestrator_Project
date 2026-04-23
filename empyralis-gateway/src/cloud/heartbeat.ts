export class HeartbeatLoop {
  private timer: NodeJS.Timeout | null = null;

  start(sendHeartbeat: () => Promise<void>, intervalMs: number): void {
    this.stop();
    this.timer = setInterval(() => {
      void sendHeartbeat();
    }, Math.max(intervalMs, 1_000));
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
