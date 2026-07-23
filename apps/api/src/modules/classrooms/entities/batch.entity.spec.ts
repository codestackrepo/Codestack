import { getMetadataArgsStorage } from 'typeorm';
import { Batch } from './batch.entity';

describe('Batch entity', () => {
  it('constructs and holds its scalar fields', () => {
    const b = new Batch();
    b.name = 'Section A';
    b.classroomId = '00000000-0000-0000-0000-000000000001';
    b.students = [];
    expect(b.name).toBe('Section A');
    expect(b.classroomId).toBe('00000000-0000-0000-0000-000000000001');
    expect(b.students).toEqual([]);
  });

  it('maps to the "batches" table', () => {
    const table = getMetadataArgsStorage().tables.find((t) => t.target === Batch);
    expect(table?.name).toBe('batches');
  });

  it('declares the batch_students join table for its members', () => {
    const joinTable = getMetadataArgsStorage().joinTables.find((jt) => jt.target === Batch);
    expect(joinTable?.name).toBe('batch_students');
  });
});
