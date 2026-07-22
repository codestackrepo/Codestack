import { Response } from 'express';
import { AuthConfig } from '../../config/configuration';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/** Parse a duration like "1d", "7d", "30m", "3600s", or a raw ms number. */
export function durationToMs(ttl: string): number {
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(ttl.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  switch (match[2]) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60_000;
    case 'h':
      return value * 3_600_000;
    case 'd':
      return value * 86_400_000;
    case 'ms':
    default:
      return value;
  }
}

export function setAuthCookies(
  res: Response,
  tokens: { access: string; refresh: string },
  cfg: AuthConfig,
): void {
  const base = {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: cfg.cookieSameSite,
    domain: cfg.cookieDomain,
    path: '/',
  } as const;

  res.cookie(ACCESS_COOKIE, tokens.access, {
    ...base,
    maxAge: durationToMs(cfg.accessTtl),
  });
  res.cookie(REFRESH_COOKIE, tokens.refresh, {
    ...base,
    maxAge: durationToMs(cfg.refreshTtl),
  });
}

export function clearAuthCookies(res: Response, cfg: AuthConfig): void {
  const base = {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: cfg.cookieSameSite,
    domain: cfg.cookieDomain,
    path: '/',
  } as const;
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}
