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
import { Difficulty, ProblemSource, ProblemVisibility } from '../enums/problem.enums';
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

  // Populated by the AI module (Phase 2); plain nullable column to avoid a
  // hard dependency on the ai module's entity.
  @Column({ type: 'uuid', nullable: true, name: 'generation_request_id' })
  generationRequestId!: string | null;

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
}
