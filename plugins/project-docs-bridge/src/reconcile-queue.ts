export class ExpectedHashSuppressor {
  private readonly expected = new Map<string, string>();

  expect(path: string, hash: string): void {
    this.expected.set(path, hash);
  }

  consume(path: string, actualHash: string | null): boolean {
    const expected = this.expected.get(path);
    this.expected.delete(path);
    return expected === actualHash;
  }

  cancel(path: string): void {
    this.expected.delete(path);
  }
}

export class ReconcileQueue {
  private running = false;
  private pending = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private active: Promise<void> | null = null;

  constructor(
    private readonly delayMs: () => number,
    private readonly run: () => Promise<void>,
    private readonly onError: (error: unknown) => void = (error) => console.error(error)
  ) {}

  request(): void {
    if (this.stopped) return;
    this.pending = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch((error) => this.onError(error));
    }, this.delayMs());
  }

  async flush(): Promise<void> {
    if (this.stopped || !this.pending) return this.active ?? undefined;
    if (this.running) return this.active ?? undefined;
    this.running = true;
    this.pending = false;
    const active = Promise.resolve().then(() => this.run());
    this.active = active;
    try {
      await active;
    } finally {
      this.running = false;
      if (this.active === active) this.active = null;
      if (this.pending) void this.flush().catch((error) => this.onError(error));
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.pending = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    await this.active;
  }
}
