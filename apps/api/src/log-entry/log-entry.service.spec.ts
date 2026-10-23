import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LogEntry } from '../../database/entities/index.js';
import { LogEntryService } from './log-entry.service.js';

describe('LogEntryService', () => {
  const entry = { id: 1, action: 'place', params: '1,2', result: 'ok' };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let service: LogEntryService;

  beforeEach(async () => {
    repo = {
      create: vi.fn((dto: object) => dto),
      save: vi.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      find: vi.fn().mockResolvedValue([entry]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LogEntryService,
        { provide: getRepositoryToken(LogEntry), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(LogEntryService);
  });

  it('creates a log entry on its floor with its tick', async () => {
    await service.create({
      floorId: 2,
      tick: 3,
      action: 'place',
      params: '1,2',
      result: 'ok',
    });
    expect(repo.save).toHaveBeenCalledWith({
      action: 'place',
      params: '1,2',
      result: 'ok',
      tick: 3,
      floor: { id: 2 },
    });
  });

  it("finds one floor's log entries in id order", async () => {
    await expect(service.findAll(2)).resolves.toEqual([entry]);
    expect(repo.find).toHaveBeenCalledWith({
      where: { floor: { id: 2 } },
      order: { id: 'ASC' },
    });
  });
});
