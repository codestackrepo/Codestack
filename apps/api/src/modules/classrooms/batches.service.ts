import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { User } from '../users/entities/user.entity';
import { ClassroomsService } from './classrooms.service';
import { BatchStudentsDto, CreateBatchDto, UpdateBatchDto } from './dto/batch.dto';
import { Batch } from './entities/batch.entity';
import { Classroom } from './entities/classroom.entity';

/**
 * Batch CRUD + membership under a classroom. All permission checks delegate to
 * ClassroomsService.assertCanManage (professor/admin only — graders excluded).
 * The core invariant: batch membership is always a subset of the classroom's
 * students (§9.10).
 */
@Injectable()
export class BatchesService {
  constructor(
    @InjectRepository(Batch) private readonly batches: Repository<Batch>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly classroomsService: ClassroomsService,
    private readonly dataSource: DataSource,
  ) {}

  async list(classroomId: string, actor: AuthenticatedUser): Promise<Batch[]> {
    const classroom = await this.classroomsService.getDetail(classroomId);
    this.classroomsService.assertCanManage(actor, classroom);
    return this.batches.find({
      where: { classroomId },
      relations: { students: true },
      order: { name: 'ASC' },
    });
  }

  async create(classroomId: string, dto: CreateBatchDto, actor: AuthenticatedUser): Promise<Batch> {
    const classroom = await this.classroomsService.getDetail(classroomId);
    this.classroomsService.assertCanManage(actor, classroom);

    const students = await this.resolveMembers(classroom, dto.studentIds ?? []);
    await this.assertUniqueName(classroomId, dto.name);

    const batch = this.batches.create({ classroomId, name: dto.name, students });
    try {
      const saved = await this.batches.save(batch);
      return this.getOne(classroomId, saved.id, actor);
    } catch (err) {
      // Defensive: a concurrent insert can still trip the DB unique constraint
      // after the pre-check above.
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('A batch with this name already exists in the classroom');
      }
      throw err;
    }
  }

  async getOne(classroomId: string, batchId: string, actor: AuthenticatedUser): Promise<Batch> {
    const classroom = await this.classroomsService.getDetail(classroomId);
    this.classroomsService.assertCanManage(actor, classroom);
    const batch = await this.batches.findOne({
      where: { id: batchId, classroomId },
      relations: { students: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  async update(
    classroomId: string,
    batchId: string,
    dto: UpdateBatchDto,
    actor: AuthenticatedUser,
  ): Promise<Batch> {
    const batch = await this.getOne(classroomId, batchId, actor);
    const classroom = await this.classroomsService.getDetail(classroomId);

    if (dto.name !== undefined && dto.name !== batch.name) {
      await this.assertUniqueName(classroomId, dto.name, batchId);
      batch.name = dto.name;
    }
    if (dto.studentIds !== undefined) {
      batch.students = await this.resolveMembers(classroom, dto.studentIds);
    }
    await this.batches.save(batch);
    return this.getOne(classroomId, batchId, actor);
  }

  async addStudents(
    classroomId: string,
    batchId: string,
    dto: BatchStudentsDto,
    actor: AuthenticatedUser,
  ): Promise<Batch> {
    const batch = await this.getOne(classroomId, batchId, actor);
    const classroom = await this.classroomsService.getDetail(classroomId);
    const toAdd = await this.resolveMembers(classroom, dto.studentIds);
    const existing = new Set(batch.students.map((s) => s.id));
    for (const u of toAdd) if (!existing.has(u.id)) batch.students.push(u);
    await this.batches.save(batch);
    return this.getOne(classroomId, batchId, actor);
  }

  async removeStudent(
    classroomId: string,
    batchId: string,
    studentId: string,
    actor: AuthenticatedUser,
  ): Promise<Batch> {
    const batch = await this.getOne(classroomId, batchId, actor);
    batch.students = batch.students.filter((s) => s.id !== studentId);
    await this.batches.save(batch);
    return this.getOne(classroomId, batchId, actor);
  }

  async remove(classroomId: string, batchId: string, actor: AuthenticatedUser): Promise<void> {
    const batch = await this.getOne(classroomId, batchId, actor);
    // 409 guard: a batch referenced by an assignment target cannot be deleted
    // (would silently drop the assignment's audience).
    const refs = await this.dataSource.query(
      'SELECT 1 FROM assignment_target_batches WHERE batch_id = $1 LIMIT 1',
      [batchId],
    );
    if (refs.length) {
      throw new ConflictException(
        'Batch is targeted by one or more assignments and cannot be deleted',
      );
    }
    await this.batches.remove(batch);
  }

  // ---- helpers ----

  /**
   * Resolves the given student ids to User rows, enforcing the subset
   * invariant: every id must be an enrolled student of the classroom (graders
   * are stored separately and are never batch members).
   */
  private async resolveMembers(classroom: Classroom, studentIds: string[]): Promise<User[]> {
    const ids = [...new Set(studentIds)];
    if (!ids.length) return [];
    const enrolled = new Set((classroom.students ?? []).map((s) => s.id));
    const notMembers = ids.filter((id) => !enrolled.has(id));
    if (notMembers.length) {
      throw new BadRequestException(
        `These users are not students of this classroom: ${notMembers.join(', ')}`,
      );
    }
    return this.users.find({ where: { id: In(ids) } });
  }

  private async assertUniqueName(
    classroomId: string,
    name: string,
    exceptBatchId?: string,
  ): Promise<void> {
    const clash = await this.batches.findOne({ where: { classroomId, name } });
    if (clash && clash.id !== exceptBatchId) {
      throw new ConflictException('A batch with this name already exists in the classroom');
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
  }
}
