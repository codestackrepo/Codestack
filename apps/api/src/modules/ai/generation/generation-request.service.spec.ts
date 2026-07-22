import { ForbiddenException } from '@nestjs/common';
import { GenerationRequestService } from './generation-request.service';

type MockRepo = {
  save: jest.Mock;
  create: jest.Mock;
  count: jest.Mock;
  find: jest.Mock;
  findOneBy: jest.Mock;
};

function mockRepo(): MockRepo {
  return {
    save: jest.fn((x) => Promise.resolve(x)),
    create: jest.fn((x) => x),
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn(),
    findOneBy: jest.fn(),
  };
}

function makeService(opts: {
  hasActiveEntitlement: boolean;
  usedThisMonth: number;
  freeGenerationsPerMonth?: number;
}) {
  const config = {
    getOrThrow: () => ({ freeGenerationsPerMonth: opts.freeGenerationsPerMonth ?? 2 }),
  };
  const ingestion = {
    ingestPrompt: jest.fn().mockResolvedValue({ text: 'x', sourceType: 'prompt', sourceRef: 'h' }),
  };
  const entitlements = {
    hasActiveEntitlement: jest.fn().mockResolvedValue(opts.hasActiveEntitlement),
  };
  const queue = { add: jest.fn() };
  const requests = mockRepo();
  requests.count.mockResolvedValue(opts.usedThisMonth);
  const links = mockRepo();

  const service = new GenerationRequestService(
    config as any,
    ingestion as any,
    entitlements as any,
    queue as any,
    requests as any,
    links as any,
  );
  return { service, queue, requests, entitlements };
}

describe('GenerationRequestService.create — entitlement gating', () => {
  it('allows generation when the user has an active paid subscription, without checking free-tier usage', async () => {
    const { service, queue, requests } = makeService({
      hasActiveEntitlement: true,
      usedThisMonth: 999,
    });

    await service.create({ topic: 'arrays', prompt: 'x' } as any, undefined, 'user-1');

    expect(requests.count).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('allows generation on the free tier when under the monthly quota', async () => {
    const { service, queue } = makeService({
      hasActiveEntitlement: false,
      usedThisMonth: 1,
      freeGenerationsPerMonth: 2,
    });

    await service.create({ topic: 'arrays', prompt: 'x' } as any, undefined, 'user-1');

    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('rejects with a machine-readable reason once the free-tier monthly quota is exhausted', async () => {
    const { service, queue } = makeService({
      hasActiveEntitlement: false,
      usedThisMonth: 2,
      freeGenerationsPerMonth: 2,
    });

    await expect(
      service.create({ topic: 'arrays', prompt: 'x' } as any, undefined, 'user-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('scopes the free-tier count to the current calendar month only', async () => {
    const { service, requests } = makeService({ hasActiveEntitlement: false, usedThisMonth: 0 });

    await service.create({ topic: 'arrays', prompt: 'x' } as any, undefined, 'user-1');

    const countArgs = requests.count.mock.calls[0][0];
    expect(countArgs.where.userId).toBe('user-1');
    expect(countArgs.where.createdAt.type).toBe('moreThanOrEqual');
    const monthStart: Date = countArgs.where.createdAt.value;
    expect(monthStart.getUTCDate()).toBe(1);
    expect(monthStart.getUTCHours()).toBe(0);
  });
});
