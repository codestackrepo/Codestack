import { Semaphore } from './semaphore';

describe('Semaphore', () => {
  it('allows immediate acquire up to the permit count', async () => {
    const sem = new Semaphore(2);
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    expect(sem.inFlight).toBe(2);
    r1();
    r2();
    expect(sem.inFlight).toBe(0);
  });

  it('queues a caller beyond the permit count until a release happens', async () => {
    const sem = new Semaphore(1);
    const release1 = await sem.acquire();

    let acquired = false;
    const p = sem.acquire().then((release2) => {
      acquired = true;
      release2();
    });

    // Give the microtask queue a chance to run; the second acquire must
    // still be blocked because permit 1 hasn't been released yet.
    await Promise.resolve();
    expect(acquired).toBe(false);
    expect(sem.queued).toBe(1);

    release1();
    await p;
    expect(acquired).toBe(true);
    expect(sem.inFlight).toBe(0);
  });

  it('is safe to call the same release function twice (idempotent)', async () => {
    const sem = new Semaphore(1);
    const release = await sem.acquire();
    release();
    release();
    expect(sem.inFlight).toBe(0);
  });

  // Regression test for a real permit-over-issuance race: release() used to
  // hand a freed permit back through a shared `available` counter with a
  // window where a synchronously-racing acquire() could steal it before the
  // woken waiter's continuation accounted for it, letting more callers hold
  // permits simultaneously than the configured bound.
  describe('regression: no permit over-issuance under continuous concurrent load', () => {
    it('never exceeds the configured permit count across many overlapping workers', async () => {
      const PERMITS = 4;
      const sem = new Semaphore(PERMITS);
      let current = 0;
      let maxObserved = 0;
      let violations = 0;

      const worker = async () => {
        for (let i = 0; i < 200; i++) {
          const release = await sem.acquire();
          current++;
          if (current > maxObserved) maxObserved = current;
          if (current > PERMITS) violations++;
          if (i % 3 === 0) await Promise.resolve();
          current--;
          release();
        }
      };

      await Promise.all(Array.from({ length: 50 }, worker));

      expect(violations).toBe(0);
      expect(maxObserved).toBeLessThanOrEqual(PERMITS);
      expect(sem.inFlight).toBe(0);
      expect(sem.queued).toBe(0);
    });
  });
});
