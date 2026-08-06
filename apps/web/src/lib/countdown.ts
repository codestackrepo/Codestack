/**
 * The timed-test clock, shared by every screen that shows it (#145).
 *
 * The take page and the solve editor are separate screens a student moves
 * between mid-test, so a countdown that formatted or turned urgent differently
 * in each would read as the clock jumping. One implementation, imported by both.
 *
 * Every caller must anchor on the SERVER's `deadlineAt`. A duration computed on
 * the client is not the same clock the submit gate enforces
 * (`assertTestAttemptOpen`), and the gap between them is exactly where a student
 * loses work.
 */

/** Below this, the countdown reads as urgent. */
export const URGENT_REMAINING_MS = 5 * 60 * 1000;

/** `h:mm:ss` past an hour, `mm:ss` under it. Never negative. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** True while `remainingMs` is inside the urgent window but not yet expired. */
export function isUrgent(remainingMs: number | null): boolean {
  return remainingMs !== null && remainingMs > 0 && remainingMs < URGENT_REMAINING_MS;
}
