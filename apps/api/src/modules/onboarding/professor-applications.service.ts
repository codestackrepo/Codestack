import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { OrgApplicationStatus } from '../organizations/enums/organization-application.enums';
import { User } from '../users/entities/user.entity';
import { CreateProfessorApplicationDto } from './dto/professor-application.dto';
import { ProfessorApplication } from './entities/professor-application.entity';

/**
 * Open-platform professor applications (#118).
 *
 * A stranger asks to teach; a CodeStack superadmin reviews it; approval mints an
 * ordinary PROFESSOR invite into the community tenant, which they accept and set a
 * password on. Reusing the invite machinery rather than inventing a second
 * account-creation path is what keeps the token mint, the TTL, the seat handling, the
 * accept page and the redaction rules identical to every other invite.
 *
 * This service does NOT mint the invite itself — the platform controller does, for the
 * same module-dependency reason organization approval works that way: `InvitesModule`
 * already imports this side of the graph, so orchestration lives where both are
 * reachable.
 */
@Injectable()
export class ProfessorApplicationsService {
  private readonly logger = new Logger(ProfessorApplicationsService.name);

  constructor(
    @InjectRepository(ProfessorApplication)
    private readonly applications: Repository<ProfessorApplication>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mail: MailService,
  ) {}

  /**
   * Submit an application. NEVER throws for a duplicate, returns nothing.
   *
   * The caller answers one fixed 202 on every branch, because this is unauthenticated
   * and `users.email` is globally unique. Two cases produce no row and neither may be
   * distinguishable:
   *
   *  - a pending application already exists for the address
   *  - the address already has a CodeStack account
   *
   * That second one matters more than it looks. Answering "you already have an account"
   * would turn this form into an account-existence oracle for any address an attacker
   * cares to type — the same oracle `register` and `forgot-password` are built to avoid.
   * An existing account is not silently upgraded either: the person is already a member
   * somewhere, and the right route is their organization promoting them or a superadmin
   * changing their role, not a public form.
   */
  async submit(dto: CreateProfessorApplicationDto): Promise<void> {
    const email = dto.email.toLowerCase();

    const pending = await this.applications
      .createQueryBuilder('a')
      .where('lower(a.email) = :email', { email })
      .andWhere('a.status = :pending', { pending: OrgApplicationStatus.PENDING })
      .getOne();
    if (pending) return;

    const existingUser = await this.dataSource.getRepository(User).findOne({ where: { email } });
    if (existingUser) return;

    let saved: ProfessorApplication;
    try {
      saved = await this.applications.save(
        this.applications.create({
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          institution: dto.institution ?? null,
          message: dto.message ?? '',
          status: OrgApplicationStatus.PENDING,
        }),
      );
    } catch (err) {
      // Loser of a concurrent double-submit. Their application exists, just not this copy.
      if (isUniqueViolation(err)) return;
      throw err;
    }

    await this.mail.enqueue({
      to: saved.email,
      template: MailTemplate.PROFESSOR_APPLICATION_RECEIVED,
      params: { firstName: saved.firstName, lastName: saved.lastName },
    });
    await this.alertSuperAdmins(saved);
  }

  async list(
    query: PaginationQueryDto,
    status?: OrgApplicationStatus,
  ): Promise<PaginatedResult<ProfessorApplication>> {
    const qb = this.applications.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');
    if (status) qb.andWhere('a.status = :status', { status });
    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  /**
   * Claims the application for approval, conditionally.
   *
   * Split from the invite minting so two simultaneous approvals cannot both proceed to
   * mint: whoever wins this UPDATE owns the approval, and the loser gets a 409 rather
   * than a second invite for one person. The caller mints, then calls
   * `recordInvite` — see the controller for why those are separate steps.
   */
  async claimForApproval(id: string, actor: AuthenticatedUser): Promise<ProfessorApplication> {
    const application = await this.requirePending(id);

    const flip = await this.applications
      .createQueryBuilder()
      .update(ProfessorApplication)
      .set({
        status: OrgApplicationStatus.APPROVED,
        reviewedById: actor.id,
        reviewedAt: () => 'now()',
      })
      .where('id = :id AND status = :pending', { id, pending: OrgApplicationStatus.PENDING })
      .execute();
    if (flip.affected !== 1) {
      throw new ConflictException({
        reason: 'application_already_reviewed',
        message: 'This application has already been reviewed',
      });
    }
    return application;
  }

  /** Links the approved application to the invite it produced, for audit. */
  async recordInvite(id: string, inviteId: string): Promise<ProfessorApplication> {
    await this.applications.update({ id }, { inviteId });
    return this.applications.findOneOrFail({ where: { id } });
  }

  async reject(
    id: string,
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<ProfessorApplication> {
    const application = await this.requirePending(id);

    const flip = await this.applications
      .createQueryBuilder()
      .update(ProfessorApplication)
      .set({
        status: OrgApplicationStatus.REJECTED,
        reviewedById: actor.id,
        reviewedAt: () => 'now()',
        decisionReason: reason ?? '',
      })
      .where('id = :id AND status = :pending', { id, pending: OrgApplicationStatus.PENDING })
      .execute();
    if (flip.affected !== 1) {
      throw new ConflictException({
        reason: 'application_already_reviewed',
        message: 'This application has already been reviewed',
      });
    }

    await this.mail.enqueue({
      to: application.email,
      template: MailTemplate.PROFESSOR_APPLICATION_REJECTED,
      params: {
        firstName: application.firstName,
        lastName: application.lastName,
        reason: reason ?? null,
      },
    });

    return this.applications.findOneOrFail({ where: { id } });
  }

  // ---------------------------------------------------------------- helpers

  private async requirePending(id: string): Promise<ProfessorApplication> {
    const application = await this.applications.findOne({ where: { id } });
    if (!application) throw new NotFoundException({ reason: 'application_not_found' });
    if (application.status !== OrgApplicationStatus.PENDING) {
      throw new ConflictException({
        reason: 'application_already_reviewed',
        message: 'This application has already been reviewed',
      });
    }
    return application;
  }

  private async alertSuperAdmins(application: ProfessorApplication): Promise<void> {
    const superAdmins = await this.dataSource
      .getRepository(User)
      .find({ where: { role: Role.SUPERADMIN, isActive: true } });

    if (!superAdmins.length) {
      this.logger.error(
        `Professor application ${application.id} received but NO active superadmin exists to review it`,
      );
      return;
    }

    const reviewUrl = this.mail.webUrl('home/platform/professor-applications');
    for (const admin of superAdmins) {
      await this.mail.enqueue({
        to: admin.email,
        template: MailTemplate.PROFESSOR_APPLICATION_ALERT,
        params: {
          applicantName: `${application.firstName} ${application.lastName}`.trim(),
          applicantEmail: application.email,
          institution: application.institution,
          message: application.message || null,
          reviewUrl,
        },
      });
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; driverError?: { code?: unknown } };
  return (e.code ?? e.driverError?.code) === '23505';
}
