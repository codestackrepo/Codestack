import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { REDIS_CLIENT } from '../../../redis/redis.module';
import { StagedRoster, StagedRosterRow } from './roster.types';

const KEY_PREFIX = 'bulk-invite:staging:';
/** 30 minutes — long enough to review 2000 rows, short enough to bound stale PII. */
const TTL_SECONDS = 1800;

/**
 * Carries a reviewed roster from preview to commit.
 *
 * A staging key rather than a re-upload, deliberately: making the client re-send
 * the file at commit time means the bytes committed need not be the bytes
 * previewed — an admin could review one file and commit another, and the
 * all-or-nothing quota check would have been performed against something nobody
 * looked at.
 *
 * Only the ACCEPTED rows are stored, and only four fields each. Never the raw
 * file: it is the largest thing in the request, it is entirely reconstructible
 * from the staged rows for the purposes of committing, and it is the part most
 * likely to hold columns the roster contract never asked for.
 */
@Injectable()
export class RosterStagingService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Stages accepted rows and returns the opaque key the commit will present. */
  async stage(
    rows: StagedRosterRow[],
    pendingResendable: string[],
    actor: AuthenticatedUser,
    organizationId: string,
  ): Promise<string> {
    const key = randomUUID();
    const payload: StagedRoster = {
      organizationId,
      createdByUserId: actor.id,
      createdAt: new Date().toISOString(),
      rows,
      pendingResendable,
    };
    await this.redis.set(KEY_PREFIX + key, JSON.stringify(payload), 'EX', TTL_SECONDS);
    return key;
  }

  /**
   * Loads a staged roster and AUTHORIZES it against the caller.
   *
   * Both checks matter, and both happen before anything is deleted. The uuid is
   * unguessable, but "unguessable" is not an authorization model: a key that
   * leaked through a log, a shared screen or a browser history must not let
   * another admin commit someone else's reviewed roster into their own tenant.
   *
   * `staging_not_yours` rather than `cross_org` — `assertSameOrg` owns that code
   * for row-level tenancy, and reusing it here would make two different failures
   * indistinguishable in the client.
   */
  async load(key: string, actor: AuthenticatedUser, organizationId: string): Promise<StagedRoster> {
    const raw = await this.redis.get(KEY_PREFIX + key);
    if (!raw) {
      throw new NotFoundException({
        reason: 'staging_expired',
        message: 'That preview has expired. Upload the file again.',
      });
    }

    const staged = JSON.parse(raw) as StagedRoster;
    if (staged.createdByUserId !== actor.id || staged.organizationId !== organizationId) {
      throw new ForbiddenException({
        reason: 'staging_not_yours',
        message: 'That preview belongs to a different user or organization.',
      });
    }
    return staged;
  }

  /** Called ONLY after the commit transaction succeeds. */
  async discard(key: string): Promise<void> {
    await this.redis.del(KEY_PREFIX + key);
  }

  /**
   * Re-arms the TTL after a FAILED commit.
   *
   * The common failure is `quota_exceeded`, which the admin fixes by raising the
   * cap and retrying. Letting the key die on that path would force a 2000-row
   * re-upload and re-review to change one number.
   */
  async extend(key: string): Promise<void> {
    await this.redis.expire(KEY_PREFIX + key, TTL_SECONDS);
  }
}
