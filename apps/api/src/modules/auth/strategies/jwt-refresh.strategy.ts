import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthConfig } from '../../../config/configuration';
import { AuthenticatedUser, JwtPayload } from '../../../common/types/authenticated-user';
import { REFRESH_COOKIE } from '../cookie.util';

const refreshCookieExtractor = (req: Request): string | null => {
  const cookies = (req?.cookies ?? {}) as Record<string, string>;
  return cookies[REFRESH_COOKIE] ?? null;
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    const auth = config.getOrThrow<AuthConfig>('auth');
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([refreshCookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: auth.refreshSecret,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
