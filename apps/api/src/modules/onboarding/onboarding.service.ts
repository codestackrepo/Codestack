import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { assertSameOrg, scopeToOrg } from '../../common/tenancy/tenant-scope.util';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { CreateProfessorRequestDto } from './dto/onboarding.dto';
import { ProfessorRequest } from './entities/professor-request.entity';
import { RequestStatus } from './enums/onboarding.enums';

/**
 * Professor ACCESS REQUESTS only. The invite half of this service was retired
 * with `professor_invites` (#104) — invitations live in `modules/invites` now,
 * with an organization_id, a hashed token and a role policy. A request is the
 * different thing that survives: someone already inside an org asking to be
 * promoted, which no invite expresses.
 */
@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(ProfessorRequest)
    private readonly requests: Repository<ProfessorRequest>,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  // --------------------------------------------------------------- requests

  async createRequest(
    actor: AuthenticatedUser,
    dto: CreateProfessorRequestDto,
  ): Promise<ProfessorRequest> {
    if (actor.role === Role.PROFESSOR || actor.role === Role.ADMIN) {
      throw new ConflictException('You already have professor access');
    }
    const pending = await this.requests.findOne({
      where: { userId: actor.id, status: RequestStatus.PENDING },
    });
    if (pending) throw new ConflictException('You already have a pending request');

    const req = this.requests.create({
      userId: actor.id,
      status: RequestStatus.PENDING,
      message: dto.message ?? '',
    });
    return this.requests.save(req);
  }

  myLatestRequest(userId: string): Promise<ProfessorRequest | null> {
    return this.requests.findOne({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async listRequests(
    query: PaginationQueryDto,
    actor: AuthenticatedUser,
    status?: RequestStatus,
  ): Promise<PaginatedResult<ProfessorRequest>> {
    const qb = this.requests
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .orderBy('r.createdAt', 'DESC');
    if (status) qb.andWhere('r.status = :status', { status });
    scopeToOrg(qb, 'user', actor); // org-scope via the requester (SuperAdmin sees all)
    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  async approveRequest(id: string, actor: AuthenticatedUser): Promise<ProfessorRequest> {
    const req = await this.getPendingRequest(id);
    // Block cross-org privilege escalation: an org-admin may only approve a
    // requester in their own org (SuperAdmin may approve cross-org).
    assertSameOrg(actor, req.user.organizationId);
    // Elevate the user's role. Their existing session keeps its old role until
    // the next token refresh / re-verify, so we notify them to reload.
    await this.users.setRole(req.userId, Role.PROFESSOR);
    req.status = RequestStatus.APPROVED;
    req.reviewedById = actor.id;
    req.reviewedAt = new Date();
    await this.requests.save(req);
    await this.notifyDecision(req, actor.id);
    return this.reloadWithUser(id);
  }

  async rejectRequest(
    id: string,
    actor: AuthenticatedUser,
    reason: string,
  ): Promise<ProfessorRequest> {
    const req = await this.getPendingRequest(id);
    assertSameOrg(actor, req.user.organizationId);
    req.status = RequestStatus.REJECTED;
    req.reviewedById = actor.id;
    req.reviewedAt = new Date();
    req.decisionReason = reason;
    await this.requests.save(req);
    await this.notifyDecision(req, actor.id);
    return this.reloadWithUser(id);
  }

  private async getPendingRequest(id: string): Promise<ProfessorRequest> {
    const req = await this.requests.findOne({ where: { id }, relations: { user: true } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== RequestStatus.PENDING) {
      throw new ConflictException('This request has already been reviewed');
    }
    return req;
  }

  private reloadWithUser(id: string): Promise<ProfessorRequest> {
    return this.requests.findOneOrFail({ where: { id }, relations: { user: true } });
  }

  private async notifyDecision(req: ProfessorRequest, adminId: string): Promise<void> {
    const approved = req.status === RequestStatus.APPROVED;
    await this.notifications.createForRecipients({
      recipientIds: [req.userId],
      type: approved
        ? NotificationType.PROFESSOR_REQUEST_APPROVED
        : NotificationType.PROFESSOR_REQUEST_REJECTED,
      title: approved ? 'Professor access approved' : 'Professor access declined',
      message: approved
        ? 'You now have professor access — reload the app to unlock teaching tools.'
        : req.decisionReason
          ? `Your request was declined: ${req.decisionReason}`
          : 'Your professor-access request was declined.',
      entityType: 'professor_request',
      entityId: req.id,
      link: '/home/dashboard',
      actorId: adminId,
    });
  }
}
