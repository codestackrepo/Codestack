import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken, type ClerkClient } from '@clerk/backend';
import { AppConfig, ClerkConfig } from '../../../config/configuration';

/** Claims present on a DEFAULT (un-customized) Clerk session JWT. */
export interface ClerkSessionClaims {
  sub: string; // Clerk user id (user_...)
  sid?: string;
  org_id?: string; // v1 flat org claims (only when an org is active)
  org_role?: string;
  org_slug?: string;
  o?: { id?: string; slg?: string; rol?: string }; // v2 nested org claims
  [k: string]: unknown; // NOTE: no `email`/name by default
}

export interface ClerkUserProfile {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Wraps @clerk/backend (dual-auth #51). Reads config via ConfigService.get (never
 * getOrThrow) and is a no-op when unconfigured, so the app always boots on
 * JWT-only with CLERK_* unset. isConfigured() gates the whole Bearer branch.
 */
@Injectable()
export class ClerkService {
  private readonly log = new Logger(ClerkService.name);
  private readonly cfg: ClerkConfig;
  private readonly authorizedParties: string[];
  private client?: ClerkClient;

  constructor(config: ConfigService) {
    this.cfg = config.get<ClerkConfig>('clerk') ?? {
      secretKey: '',
      publishableKey: '',
      webhookSigningSecret: '',
      jwtKey: undefined,
    };
    // azp allowlist == the CORS origins (blocks subdomain/origin token replay).
    this.authorizedParties = config.get<AppConfig>('app')?.corsOrigins ?? [];
  }

  /** Clerk is usable only when a secret key is present. */
  isConfigured(): boolean {
    return !!this.cfg.secretKey;
  }

  /**
   * Verify a Clerk session JWT. Networkless when CLERK_JWT_KEY (jwtKey) is set;
   * otherwise fetches + caches the JWKS via the Backend API using secretKey.
   * verifyToken THROWS on failure (expired / bad-sig / wrong azp) -> map to 401.
   */
  async verifyToken(token: string): Promise<ClerkSessionClaims> {
    try {
      const claims = await verifyToken(token, {
        secretKey: this.cfg.secretKey,
        jwtKey: this.cfg.jwtKey,
        authorizedParties: this.authorizedParties.length ? this.authorizedParties : undefined,
      });
      return claims as unknown as ClerkSessionClaims;
    } catch (err) {
      this.log.debug(`Clerk token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid session token');
    }
  }

  /**
   * Backend-API fetch of email + name for JIT provisioning — the DEFAULT session
   * token omits them, so first-sight provisioning needs this single call.
   */
  async getUserProfile(clerkUserId: string): Promise<ClerkUserProfile> {
    const u = await this.getClient().users.getUser(clerkUserId);
    const email =
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? null;
    return { email, firstName: u.firstName ?? null, lastName: u.lastName ?? null };
  }

  private getClient(): ClerkClient {
    if (!this.client) this.client = createClerkClient({ secretKey: this.cfg.secretKey });
    return this.client;
  }
}
