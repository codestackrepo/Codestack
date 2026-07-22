import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { User } from '../users/entities/user.entity';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';
import { Classroom } from './entities/classroom.entity';

@Injectable()
export class ClassroomsService {
  constructor(
    @InjectRepository(Classroom) private readonly classrooms: Repository<Classroom>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async create(dto: CreateClassroomDto, actor: AuthenticatedUser): Promise<Classroom> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (start >= end) throw new BadRequestException('startDate must be before endDate');

    const { professor, students, graders } = await this.resolveMembers(dto, actor.id);

    const classroom = this.classrooms.create({
      courseId: dto.courseId,
      title: dto.title,
      description: dto.description ?? '',
      term: dto.term ?? 'Spring 2024',
      startDate: start,
      endDate: end,
      createdById: actor.id,
      professor,
      professorId: professor?.id ?? null,
      students,
      graders,
      totalUsers: students.length + graders.length + (professor ? 1 : 0),
    });
    const saved = await this.classrooms.save(classroom);
    return this.getDetail(saved.id);
  }

  async findAll(
    query: PaginationQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<Classroom>> {
    const qb = this.classrooms
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.professor', 'professor')
      .orderBy('c.createdAt', 'DESC');

    if (actor.role === Role.PROFESSOR) {
      qb.andWhere('(c.created_by_id = :uid OR c.professor_id = :uid)', { uid: actor.id });
    } else if (actor.role === Role.STUDENT) {
      qb.andWhere(
        `(EXISTS (SELECT 1 FROM classroom_students cs WHERE cs.classroom_id = c.id AND cs.user_id = :uid)
          OR EXISTS (SELECT 1 FROM classroom_graders cg WHERE cg.classroom_id = c.id AND cg.user_id = :uid))`,
        { uid: actor.id },
      );
    }

    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  /** Basic load (no members). */
  async getById(id: string): Promise<Classroom> {
    const classroom = await this.classrooms.findOne({
      where: { id },
      relations: { professor: true },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
    return classroom;
  }

  /** Full load with student + grader members. */
  async getDetail(id: string): Promise<Classroom> {
    const classroom = await this.classrooms.findOne({
      where: { id },
      relations: { professor: true, students: true, graders: true },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
    return classroom;
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<Classroom> {
    const classroom = await this.getDetail(id);
    this.assertCanView(actor, classroom);
    return classroom;
  }

  async update(id: string, dto: UpdateClassroomDto, actor: AuthenticatedUser): Promise<Classroom> {
    const classroom = await this.getDetail(id);
    this.assertCanManage(actor, classroom);

    if (dto.title !== undefined) classroom.title = dto.title;
    if (dto.description !== undefined) classroom.description = dto.description;
    if (dto.term !== undefined) classroom.term = dto.term;
    if (dto.startDate) classroom.startDate = new Date(dto.startDate);
    if (dto.endDate) classroom.endDate = new Date(dto.endDate);

    // Additive membership: add new students/graders (never removes here).
    if (dto.studentIds?.length) {
      const toAdd = await this.loadUsers(dto.studentIds);
      const existing = new Set(classroom.students.map((s) => s.id));
      const graderIds = new Set(classroom.graders.map((g) => g.id));
      for (const u of toAdd) {
        if (graderIds.has(u.id)) {
          throw new BadRequestException(`User ${u.id} is already a grader`);
        }
        if (!existing.has(u.id)) classroom.students.push(u);
      }
    }
    if (dto.graderIds?.length) {
      const toAdd = await this.loadUsers(dto.graderIds);
      const existing = new Set(classroom.graders.map((g) => g.id));
      const studentIds = new Set(classroom.students.map((s) => s.id));
      for (const u of toAdd) {
        if (u.role !== Role.STUDENT) {
          throw new BadRequestException('Graders must have the student role');
        }
        if (studentIds.has(u.id)) {
          throw new BadRequestException(`User ${u.id} is already a student`);
        }
        if (!existing.has(u.id)) classroom.graders.push(u);
      }
    }
    if (dto.professorId !== undefined) {
      classroom.professor = dto.professorId ? await this.loadProfessor(dto.professorId) : null;
      classroom.professorId = classroom.professor?.id ?? null;
    }

    classroom.totalUsers =
      classroom.students.length + classroom.graders.length + (classroom.professor ? 1 : 0);
    await this.classrooms.save(classroom);
    return this.getDetail(id);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const classroom = await this.getDetail(id);
    this.assertCanManage(actor, classroom);
    await this.classrooms.remove(classroom);
  }

  async getMembers(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<{
    professor: User | null;
    students: User[];
    graders: User[];
  }> {
    const classroom = await this.findOne(id, actor);
    return {
      professor: classroom.professor,
      students: classroom.students,
      graders: classroom.graders,
    };
  }

  async removeProfessor(id: string, actor: AuthenticatedUser): Promise<Classroom> {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException('Only admins can remove a professor');
    const classroom = await this.getDetail(id);
    classroom.professor = null;
    classroom.professorId = null;
    classroom.totalUsers = classroom.students.length + classroom.graders.length;
    await this.classrooms.save(classroom);
    return this.getDetail(id);
  }

  async removeStudent(id: string, studentId: string, actor: AuthenticatedUser): Promise<Classroom> {
    const classroom = await this.getDetail(id);
    this.assertCanManage(actor, classroom);
    classroom.students = classroom.students.filter((s) => s.id !== studentId);
    classroom.totalUsers =
      classroom.students.length + classroom.graders.length + (classroom.professor ? 1 : 0);
    await this.classrooms.save(classroom);
    return this.getDetail(id);
  }

  async removeGrader(id: string, graderId: string, actor: AuthenticatedUser): Promise<Classroom> {
    const classroom = await this.getDetail(id);
    this.assertCanManage(actor, classroom);
    classroom.graders = classroom.graders.filter((g) => g.id !== graderId);
    classroom.totalUsers =
      classroom.students.length + classroom.graders.length + (classroom.professor ? 1 : 0);
    await this.classrooms.save(classroom);
    return this.getDetail(id);
  }

  // ---- helpers ----

  private async resolveMembers(
    dto: CreateClassroomDto,
    creatorId: string,
  ): Promise<{ professor: User | null; students: User[]; graders: User[] }> {
    const studentIds = [...new Set(dto.studentIds ?? [])];
    const graderIds = [...new Set(dto.graderIds ?? [])];

    const overlap = studentIds.filter((sid) => graderIds.includes(sid));
    if (overlap.length) throw new BadRequestException('A user cannot be both student and grader');
    if (
      dto.professorId &&
      (studentIds.includes(dto.professorId) || graderIds.includes(dto.professorId))
    ) {
      throw new BadRequestException('Professor cannot also be a student/grader');
    }
    if (studentIds.includes(creatorId) || graderIds.includes(creatorId)) {
      throw new BadRequestException('Creator cannot be a student/grader');
    }

    const professor = dto.professorId ? await this.loadProfessor(dto.professorId) : null;
    const students = studentIds.length ? await this.loadUsers(studentIds) : [];
    const graders = graderIds.length ? await this.loadUsers(graderIds) : [];

    const nonStudentGrader = graders.find((g) => g.role !== Role.STUDENT);
    if (nonStudentGrader) throw new BadRequestException('Graders must have the student role');

    return { professor, students, graders };
  }

  private async loadUsers(ids: string[]): Promise<User[]> {
    const users = await this.users.find({ where: { id: In(ids) } });
    if (users.length !== new Set(ids).size) {
      throw new BadRequestException('One or more users not found');
    }
    return users;
  }

  private async loadProfessor(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new BadRequestException('Professor not found');
    if (user.role !== Role.PROFESSOR && user.role !== Role.ADMIN) {
      throw new BadRequestException('Assigned professor must have professor/admin role');
    }
    return user;
  }

  /** Roster/structure management (professor/admin only — graders excluded by design). */
  private assertCanManage(actor: AuthenticatedUser, classroom: Classroom): void {
    if (actor.role === Role.ADMIN) return;
    if (
      actor.role === Role.PROFESSOR &&
      (classroom.createdById === actor.id || classroom.professorId === actor.id)
    ) {
      return;
    }
    throw new ForbiddenException('You cannot manage this classroom');
  }

  private assertCanView(actor: AuthenticatedUser, classroom: Classroom): void {
    if (actor.role === Role.ADMIN) return;
    if (classroom.createdById === actor.id || classroom.professorId === actor.id) return;
    const isMember =
      classroom.students.some((s) => s.id === actor.id) ||
      classroom.graders.some((g) => g.id === actor.id);
    if (isMember) return;
    throw new ForbiddenException('You do not have access to this classroom');
  }

  /**
   * Shared staff-or-grader policy for assignment/grading/submission data
   * (distinct from assertCanManage: graders may access assignment content and
   * grade, but do not manage the classroom roster itself). Centralized here
   * so assignments/grading/submissions all enforce the identical rule.
   */
  assertStaffOrGrader(actor: AuthenticatedUser, classroom: Classroom): void {
    if (actor.role === Role.ADMIN) return;
    if (classroom.createdById === actor.id || classroom.professorId === actor.id) return;
    if (classroom.graders?.some((g) => g.id === actor.id)) return;
    throw new ForbiddenException('You do not have staff/grader access to this classroom');
  }
}
