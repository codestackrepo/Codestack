import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuleAccessModule } from '../module-access/module-access.module';
import { ModuleAccessGuard } from '../module-access/guards/module-access.guard';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ClerkService } from './clerk/clerk.service';
import { ClerkOrJwtAuthGuard } from './guards/clerk-or-jwt-auth.guard';
import { SessionContextService } from './session-context.service';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  // ModuleAccessModule (exports ModuleAccessService) must be imported here so
  // the APP_GUARD-scoped ModuleAccessGuard resolves its dependency.
  imports: [
    UsersModule,
    OnboardingModule,
    ModuleAccessModule,
    OrganizationsModule,
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionContextService, // assembles the GET /auth/verify contract (#54)
    JwtStrategy,
    JwtRefreshStrategy,
    ClerkService, // injected by ClerkOrJwtAuthGuard
    // Global authn + RBAC + module access. Order matters: authenticate, then
    // check roles, then check per-role module toggles. Slot 1 is the unified
    // Clerk-or-JWT guard (#51, dual-auth); slots 2/3 unchanged.
    { provide: APP_GUARD, useClass: ClerkOrJwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
