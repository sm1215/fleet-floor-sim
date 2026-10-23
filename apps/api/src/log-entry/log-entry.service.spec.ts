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

  it('creates a log entry', async () => {
    await expect(
      service.create({ action: 'place', params: '1,2', result: 'ok' }),
    ).resolves.toEqual(entry);
  });

  it('finds all log entries', async () => {
    await expect(service.findAll()).resolves.toEqual([entry]);
    expect(repo.find).toHaveBeenCalledWith({ order: { id: 'ASC' } });
  });
});
