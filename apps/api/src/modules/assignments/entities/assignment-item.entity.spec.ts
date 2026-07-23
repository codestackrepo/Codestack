import { getMetadataArgsStorage } from 'typeorm';
import { AssignmentAttempt } from './assignment-attempt.entity';
import { AssignmentItem } from './assignment-item.entity';
import { McqOption } from './mcq-option.entity';
import { McqResponse } from './mcq-response.entity';
import { QuizResponse } from './quiz-response.entity';
import { AssignmentItemKind } from '../enums/assignment-item-kind.enum';

/** Discoverability + table-mapping guards for the issue #19 entities. */
describe('assignment-items entities', () => {
  const tableName = (target: unknown): string | undefined =>
    getMetadataArgsStorage().tables.find((t) => t.target === target)?.name;

  it('constructs an AssignmentItem with its scalar fields', () => {
    const item = new AssignmentItem();
    item.kind = AssignmentItemKind.MCQ;
    item.orderIndex = 0;
    item.maxPoints = 5;
    item.allowMultiple = true;
    expect(item.kind).toBe(AssignmentItemKind.MCQ);
    expect(item.allowMultiple).toBe(true);
  });

  it('maps each entity to its table', () => {
    expect(tableName(AssignmentItem)).toBe('assignment_items');
    expect(tableName(McqOption)).toBe('mcq_options');
    expect(tableName(McqResponse)).toBe('mcq_responses');
    expect(tableName(QuizResponse)).toBe('quiz_responses');
    expect(tableName(AssignmentAttempt)).toBe('assignment_attempts');
  });
});
