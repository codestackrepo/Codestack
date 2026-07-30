import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { QuotasModule } from '../quotas/quotas.module';
import { UsersModule } from '../users/users.module';
import { OrgInvite } from './entities/org-invite.entity';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { PlatformInvitesController } from './platform-invites.controller';

/**
 * The first-party invite engine (#104), replacing the retired `professor_invites`
 * surface.
 *
 * AuthModule is imported for `AuthService.login` — accepting an invite creates the
 * account AND signs the invitee in, so the accept handler issues the same cookie
 * pair the login route does rather than making them re-enter the password they
 * just chose.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OrgInvite]),
    UsersModule,
    OrganizationsModule,
    QuotasModule,
    MailModule,
    AuthModule,
  ],
  controllers: [InvitesController, PlatformInvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
