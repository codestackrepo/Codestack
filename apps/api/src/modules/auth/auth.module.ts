import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantContextGuard } from '../../common/tenancy/tenant-context.guard';
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
    // Global guard chain (order = execution order): authenticate -> tenant gate
    // -> RBAC -> per-role module toggles. Slot 1 is the unified Clerk-or-JWT guard
    // (#51). Slot 2 is the TenantContextGuard (#62): now that auth reliably
    // populates request.user.organizationId, it can enforce the whole-tenant rules
    // it was built for — reject a member of a SUSPENDED org (making the SuperAdmin
    // suspend/activate control real) and a non-superadmin with no org. SUPERADMIN
    // and @Public routes bypass it.
    { provide: APP_GUARD, useClass: ClerkOrJwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
  ],
  // ClerkService is exported so the SuperAdmin platform (#62) can create Clerk
  // Organizations without re-instantiating the config wrapper.
  exports: [AuthService, ClerkService],
})
export class AuthModule {}
