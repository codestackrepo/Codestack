import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface RequestWithUser extends Record<string, unknown> {
  user?: { id?: string };
  ip?: string;
  ips?: string[];
}

/**
 * Tracks authenticated requests per-user (stable across shared/NAT'd IPs)
 * and falls back to IP for public routes (playground, demo, auth).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: RequestWithUser): Promise<string> {
    const userId = req.user?.id;
    if (userId) return `user:${userId}`;
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    return `ip:${ip ?? 'unknown'}`;
  }
}
