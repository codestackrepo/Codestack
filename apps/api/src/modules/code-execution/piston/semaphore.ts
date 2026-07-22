/** Minimal FIFO async semaphore used to bound concurrent Piston executions. */
export class Semaphore {
  private available: number;
  private readonly totalPermits: number;
  private readonly waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.totalPermits = Math.max(1, permits);
    this.available = this.totalPermits;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return this.makeRelease();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    // We were woken by release() handing its permit directly to us (see
    // makeRelease below) — `available` was never incremented on our behalf,
    // so we must NOT decrement it again here. Doing so previously let a
    // synchronous acquire() racing the handoff observe `available > 0` and
    // steal the permit mid-transfer, over-issuing beyond `permits`.
    return this.makeRelease();
  }

  /** Permits currently checked out (real concurrent executions in progress). */
  get inFlight(): number {
    return this.totalPermits - this.available;
  }

  /** Callers blocked waiting for a free permit. */
  get queued(): number {
    return this.waiters.length;
  }

  private makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        // Hand the permit directly to the next waiter without touching
        // `available` — its acquire() already accounted for it above.
        next();
      } else {
        this.available += 1;
      }
    };
  }
}
