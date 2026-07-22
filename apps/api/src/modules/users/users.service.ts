import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Brackets, Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateUserDto } from './dto/create-user.dto';
import { SearchUsersDto } from './dto/search-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * `actor` is the authenticated caller creating this user (omitted for the
   * public self-registration flow, which always forces role=student itself
   * before calling in). Only an ADMIN actor may assign a non-default role —
   * without this gate a PROFESSOR could mint an ADMIN account.
   */
  async create(dto: CreateUserDto, actor?: AuthenticatedUser): Promise<User> {
    const existing = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('Email already registered');

    const role = !actor || actor.role === Role.ADMIN ? (dto.role ?? Role.STUDENT) : Role.STUDENT;
    const user = this.users.create({
      email: dto.email.toLowerCase(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      role,
      passwordHash: await this.hashPassword(dto.password),
    });
    return this.users.save(user);
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async getById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Loads the user WITH the password hash (only for auth). */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  async findAll(
    query: PaginationQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<User>> {
    const qb = this.users.createQueryBuilder('u').orderBy('u.createdAt', 'DESC');

    // Role scoping mirrors the original: admin sees all; professor sees
    // non-admins; student sees only students.
    if (actor.role === Role.PROFESSOR) {
      qb.andWhere('u.role != :admin', { admin: Role.ADMIN });
    } else if (actor.role === Role.STUDENT) {
      qb.andWhere('u.role = :student', { student: Role.STUDENT });
    }

    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  async search(dto: SearchUsersDto, actor: AuthenticatedUser): Promise<User[]> {
    // Mirror findAll's visibility rule: students may only discover students,
    // regardless of the requested `type` (search is used for member pickers,
    // not a general people-lookup — students should not enumerate staff).
    const requestedType = actor.role === Role.STUDENT ? 'student' : dto.type;
    const roles =
      requestedType === 'both' ? [Role.STUDENT, Role.PROFESSOR] : [requestedType as Role];
    return this.users
      .createQueryBuilder('u')
      .where('u.role IN (:...roles)', { roles })
      .andWhere(
        new Brackets((w) => {
          w.where('u.email ILIKE :q', { q: `%${dto.q}%` })
            .orWhere('u.firstName ILIKE :q', { q: `%${dto.q}%` })
            .orWhere('u.lastName ILIKE :q', { q: `%${dto.q}%` });
        }),
      )
      .limit(dto.limit)
      .getMany();
  }

  /** Role-scoped single-user lookup for the public GET /users/:id route. */
  async findOneVisible(id: string, actor: AuthenticatedUser): Promise<User> {
    const user = await this.getById(id);
    if (!this.canView(actor, user)) throw new ForbiddenException('You cannot view this user');
    return user;
  }

  private canView(actor: AuthenticatedUser, target: User): boolean {
    if (actor.role === Role.ADMIN) return true;
    if (actor.id === target.id) return true;
    if (actor.role === Role.PROFESSOR) return target.role !== Role.ADMIN;
    return target.role === Role.STUDENT;
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser): Promise<User> {
    const user = await this.getById(id);
    this.assertCanModify(actor, user);

    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const clash = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });
      if (clash) throw new ConflictException('Email already registered');
      user.email = dto.email.toLowerCase();
    }
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    // Only admins may change roles.
    if (dto.role !== undefined && actor.role === Role.ADMIN) user.role = dto.role;
    if (dto.password) user.passwordHash = await this.hashPassword(dto.password);

    return this.users.save(user);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const user = await this.getById(id);
    this.assertCanModify(actor, user);
    await this.users.remove(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }

  verifyPassword(user: User, plain: string): Promise<boolean> {
    return argon2.verify(user.passwordHash, plain);
  }

  private hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  /** Non-admins may only modify students or themselves. */
  private assertCanModify(actor: AuthenticatedUser, target: User): void {
    if (actor.role === Role.ADMIN) return;
    if (actor.id === target.id) return;
    if (actor.role === Role.PROFESSOR && target.role === Role.STUDENT) return;
    throw new ForbiddenException('You cannot modify this user');
  }
}
