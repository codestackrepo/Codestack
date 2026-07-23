import { ASSIGNMENT_SWEEP_SCHEDULER_ID } from '../../../queue/queue.constants';
import { AssignmentSweepProcessor } from './assignment-sweep.processor';

describe('AssignmentSweepProcessor', () => {
  function make(overrides: { sweep?: jest.Mock; finalize?: jest.Mock } = {}) {
    const assignments = {
      sweepStatuses: overrides.sweep ?? jest.fn().mockResolvedValue(0),
      finalizeExpiredAttempts: overrides.finalize ?? jest.fn().mockResolvedValue(0),
    };
    const queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
    const processor = new AssignmentSweepProcessor(assignments as never, queue as never);
    return { processor, assignments, queue };
  }

  it('registers a single repeatable scheduler with a stable id on init', async () => {
    const { processor, queue } = make();
    await processor.onModuleInit();
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      ASSIGNMENT_SWEEP_SCHEDULER_ID,
      { every: 60_000 },
      expect.objectContaining({ name: expect.any(String) }),
    );
  });

  it('runs both sweeps on process()', async () => {
    const sweep = jest.fn().mockResolvedValue(2);
    const finalize = jest.fn().mockResolvedValue(1);
    const { processor, assignments } = make({ sweep, finalize });
    await processor.process();
    expect(assignments.sweepStatuses).toHaveBeenCalled();
    expect(assignments.finalizeExpiredAttempts).toHaveBeenCalled();
  });

  it('swallows a thrown sweep so the repeat schedule is not poisoned', async () => {
    const sweep = jest.fn().mockRejectedValue(new Error('db blip'));
    const { processor } = make({ sweep });
    await expect(processor.process()).resolves.toBeUndefined();
  });
});
