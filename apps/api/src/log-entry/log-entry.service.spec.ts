import { NotFoundException } from '@nestjs/common';
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
      findOneBy: vi.fn().mockResolvedValue(entry),
      remove: vi.fn().mockResolvedValue(entry),
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
  });

  it('finds one log entry', async () => {
    await expect(service.findOne(1)).resolves.toEqual(entry);
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 1 });
  });

  it('throws 404 when the log entry is missing', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.findOne(9)).rejects.toThrow(NotFoundException);
    await expect(service.update(9, { result: 'blocked' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove(9)).rejects.toThrow(NotFoundException);
  });

  it('updates a log entry', async () => {
    await service.update(1, { result: 'blocked' });
    expect(repo.save).toHaveBeenCalledWith({ id: 1, result: 'blocked' });
  });

  it('removes a log entry', async () => {
    await service.remove(1);
    expect(repo.remove).toHaveBeenCalledWith(entry);
  });
});
