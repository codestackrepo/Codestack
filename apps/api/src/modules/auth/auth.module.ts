import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { ModuleAccessModule } from '../module-access/module-access.module';
import { FeatureGuard } from '../module-access/guards/feature.guard';
import { ModuleAccessGuard } from '../module-access/guards/module-access.guard';
import { OrganizationsModule } from '../organizations/organizations.module';
import { QuotasModule } from '../quotas/quotas.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SessionContextService } from './session-context.service';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  // ModuleAccessModule (exports ModuleAccessService) must be imported here so
  // the APP_GUARD-scoped ModuleAccessGuard resolves its dependency.
  imports: [
    UsersModule,
    ModuleAccessModule,
    OrganizationsModule,
    QuotasModule,
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionContextService, // assembles the GET /auth/verify contract (#54)
    JwtStrategy,
    JwtRefreshStrategy,
    // Global guard chain (order = execution order): authenticate -> tenant gate ->
    // RBAC -> module toggles -> feature gates.
    //
    // Slot 1 is the JwtAuthGuard: one auth path (the httpOnly access-token cookie),
    // and it RE-STAMPS request.user from the freshly-read DB row rather than
    // trusting the token's claims. That is what makes slots 2-5 read the current
    // role, org and isActive — a revoke, an org assignment and a role change all
    // bind on the very next request instead of at token expiry.
    //
    // Slot 2 is the TenantContextGuard (#62). It enforces the two whole-tenant
    // rules: reject a member of a SUSPENDED org (making the SuperAdmin
    // suspend/activate control real) and reject a non-superadmin with no org.
    // SUPERADMIN and @Public routes bypass it.
    //
    // Slot 5 is the FeatureGuard (#64), wired in the SAME change that adds
    // @RequiresFeature (§9.11) — an annotation with no live guard is decoration
    // that reads like enforcement. It runs LAST because it is the narrowest gate:
    // by then the coarse failures (unauthenticated, suspended tenant, wrong role,
    // whole module off) have already produced their own clearer errors, so a 403
    // `entitlement_required` means precisely "this one capability is not yours".
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
