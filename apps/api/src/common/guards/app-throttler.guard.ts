import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SubmissionContext } from '../../modules/submissions/enums/submission-context.enum';

interface RequestWithUser extends Record<string, unknown> {
  user?: { id?: string };
  ip?: string;
  ips?: string[];
  body?: { context?: unknown };
}

/**
 * Tracks authenticated requests per-user (stable across shared/NAT'd IPs)
 * and falls back to IP for public routes (playground, demo, auth).
 *
 * Submit/run bodies carry a `context` (§9.4): when present it is appended as a
 * bucket suffix (`user:{id}:practice` vs `user:{id}`) so practice and assignment
 * submits occupy INDEPENDENT rate-limit counters — exhausting one never blocks
 * the other. Only the code-execution DTOs carry `context`, so this is naturally
 * scoped; every other route (login IP-tracking etc.) is unaffected.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: RequestWithUser): Promise<string> {
    const userId = req.user?.id;
    const base = userId
      ? `user:${userId}`
      : `ip:${req.ips?.length ? req.ips[0] : (req.ip ?? 'unknown')}`;

    const ctx = req.body?.context;
    const suffix =
      ctx === SubmissionContext.PRACTICE || ctx === SubmissionContext.ASSIGNMENT ? `:${ctx}` : '';
    return `${base}${suffix}`;
  }
}
