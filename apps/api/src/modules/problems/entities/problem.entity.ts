import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import type { IoSpec } from '../../code-execution/driver-synth/io-spec.types';
import { Difficulty, ProblemScope, ProblemSource, ProblemVisibility } from '../enums/problem.enums';
import { Company } from './company.entity';
import { LibraryProblemTemplate } from './library-problem-template.entity';
import { Tag } from './tag.entity';
import { TestCase } from './test-case.entity';
import { UserProblemList } from './user-problem-list.entity';

@Entity('problems')
export class Problem extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Index('idx_problem_difficulty')
  @Column({ type: 'enum', enum: Difficulty, default: Difficulty.MEDIUM })
  difficulty!: Difficulty;

  @Index('idx_problem_source')
  @Column({ type: 'enum', enum: ProblemSource, default: ProblemSource.HUMAN })
  source!: ProblemSource;

  @Index('idx_problem_visibility')
  @Column({ type: 'enum', enum: ProblemVisibility, default: ProblemVisibility.PRIVATE })
  visibility!: ProblemVisibility;

  // ---- Tenancy / reach (#56) ----
  // scope='global' => organization_id IS NULL (platform catalog);
  // scope='org' => organization_id IS NOT NULL. Enforced by the DB CHECK
  // chk_problem_scope_org (migration 1785450000000), not a decorator.
  @Index('idx_problem_scope')
  @Column({ type: 'varchar', length: 16, default: ProblemScope.ORG })
  scope!: ProblemScope;

  @Index('idx_problem_organization')
  @Column({ type: 'uuid', nullable: true, name: 'organization_id' })
  organizationId!: string | null;

  // Populated by the AI module (Phase 2); plain nullable column to avoid a
  // hard dependency on the ai module's entity.
  @Column({ type: 'uuid', nullable: true, name: 'generation_request_id' })
  generationRequestId!: string | null;

  // ---- Structured (judge-by-synthesis) fields ----
  // When present, drivers + testcase I/O can be deterministically synthesized
  // from `ioSpec`/`functionName` (see code-execution/driver-synth). Nullable so
  // legacy prose-only problems (hand-authored driver code) remain valid.
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'function_name' })
  functionName!: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'io_spec' })
  ioSpec!: IoSpec | null;

  @Index('idx_problem_created_by')
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;

  @Column({ type: 'uuid', nullable: true, name: 'created_by_id' })
  createdById!: string | null;

  @ManyToMany(() => Tag, (tag) => tag.problems, { cascade: false })
  @JoinTable({
    name: 'problem_tags',
    joinColumn: { name: 'problem_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags!: Tag[];

  @ManyToMany(() => Company, (company) => company.problems, { cascade: false })
  @JoinTable({
    name: 'problem_companies',
    joinColumn: { name: 'problem_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'company_id', referencedColumnName: 'id' },
  })
  companies!: Company[];

  @OneToMany(() => TestCase, (tc) => tc.problem)
  testCases!: TestCase[];

  @OneToMany(() => LibraryProblemTemplate, (t) => t.problem)
  libraryTemplates!: LibraryProblemTemplate[];

  @ManyToMany(() => UserProblemList, (list) => list.problems)
  @JoinTable({
    name: 'problem_list',
    joinColumn: { name: 'problem_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'list_id', referencedColumnName: 'id' },
  })
  lists!: UserProblemList[];

  /**
   * Derived (not a column): a problem is judge-ready when it carries the
   * structured fields needed to synthesize drivers + testcase I/O. Practice
   * judging is hard-gated on this (§9.11); the catalog UI surfaces it too.
   */
  get isJudgeReady(): boolean {
    return !!this.ioSpec && !!this.functionName;
  }
}
