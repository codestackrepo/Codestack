import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { TestCaseType } from '../enums/problem.enums';
import { Problem } from './problem.entity';

@Entity('test_cases')
@Index('idx_testcase_problem_type_active', ['problemId', 'type', 'isActive'])
export class TestCase extends BaseEntity {
  @ManyToOne(() => Problem, (p) => p.testCases, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'problem_id' })
  problem!: Problem;

  @Column({ type: 'uuid', name: 'problem_id' })
  problemId!: string;

  @Column({ type: 'text', name: 'input_data' })
  inputData!: string;

  @Column({ type: 'text', name: 'expected_output' })
  expectedOutput!: string;

  @Column({ type: 'enum', enum: TestCaseType, default: TestCaseType.HIDDEN })
  type!: TestCaseType;

  @Column({ type: 'text', default: '' })
  explanation!: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @Column({ type: 'int', default: 0, name: 'order_index' })
  orderIndex!: number;

  // Optional per-testcase overrides (improvement over the original's
  // global-only per-language limits).
  @Column({ type: 'float', nullable: true })
  weight!: number | null;

  @Column({ type: 'int', nullable: true, name: 'time_limit_ms' })
  timeLimitMs!: number | null;

  @Column({ type: 'bigint', nullable: true, name: 'memory_limit_bytes' })
  memoryLimitBytes!: string | null;
}
