import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { assertSameOrg, scopeToOrg } from '../../common/tenancy/tenant-scope.util';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { CreateInviteDto, CreateProfessorRequestDto } from './dto/onboarding.dto';
import { ProfessorInvite } from './entities/professor-invite.entity';
import { ProfessorRequest } from './entities/professor-request.entity';
import { InviteStatus, RequestStatus } from './enums/onboarding.enums';

const DEFAULT_INVITE_TTL_DAYS = 14;
const DAY_MS = 86_400_000;

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(ProfessorInvite)
    private readonly invites: Repository<ProfessorInvite>,
    @InjectRepository(ProfessorRequest)
    private readonly requests: Repository<ProfessorRequest>,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- invites

  async mintInvite(dto: CreateInviteDto, adminId: string): Promise<ProfessorInvite> {
    const ttlDays = dto.expiresInDays ?? DEFAULT_INVITE_TTL_DAYS;
    const invite = this.invites.create({
      // URL-safe bearer token embedded in the invite link.
      token: randomBytes(24).toString('base64url'),
      email: dto.email?.toLowerCase() ?? null,
      status: InviteStatus.PENDING,
      invitedById: adminId,
      expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
    });
    return this.invites.save(invite);
  }

  async listInvites(
    query: PaginationQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<ProfessorInvite>> {
    // Org-scoped via the inviter (SuperAdmin sees all). Invites whose inviter was
    // deleted (invited_by_id NULL) are invisible to org-admins — acceptable until
    // #51 reworks invites via Clerk with a denormalized org column.
    const qb = this.invites
      .createQueryBuilder('i')
      .leftJoin('i.invitedBy', 'iu')
      .orderBy('i.createdAt', 'DESC');
    scopeToOrg(qb, 'iu', actor);
    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  /** Public token preview — returns the invite only if it is currently usable. */
  async previewInvite(token: string): Promise<ProfessorInvite | null> {
    const invite = await this.invites.findOne({ where: { token } });
    return invite && this.isUsable(invite) ? invite : null;
  }

  async revokeInvite(id: string): Promise<ProfessorInvite> {
    const invite = await this.getInvite(id);
    if (invite.status === InviteStatus.CONSUMED) {
      throw new ConflictException('Invite already consumed');
    }
    invite.status = InviteStatus.REVOKED;
    return this.invites.save(invite);
  }

  /** Validates a token at registration time; throws if it cannot be consumed. */
  async validateInviteForConsumption(token: string): Promise<ProfessorInvite> {
    const invite = await this.invites.findOne({ where: { token } });
    if (!invite || !this.isUsable(invite)) {
      throw new BadRequestException('This invite is invalid, expired, or already used');
    }
    return invite;
  }

  async markInviteConsumed(invite: ProfessorInvite, userId: string): Promise<void> {
    invite.status = InviteStatus.CONSUMED;
    invite.consumedById = userId;
    invite.consumedAt = new Date();
    await this.invites.save(invite);
  }

  private isUsable(invite: ProfessorInvite): boolean {
    if (invite.status !== InviteStatus.PENDING) return false;
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return false;
    return true;
  }

  private async getInvite(id: string): Promise<ProfessorInvite> {
    const invite = await this.invites.findOne({ where: { id } });
    if (!invite) throw new NotFoundException('Invite not found');
    return invite;
  }

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
