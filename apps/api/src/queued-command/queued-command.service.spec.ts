import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueuedCommand } from '../../database/entities/index.js';
import { QueuedCommandService } from './queued-command.service.js';

describe('QueuedCommandService', () => {
  const createDto = { command: 'MOVE' as const, params: '', robotId: 1 };
  const { robotId, ...fields } = createDto;
  const row = { id: 1, ...fields, robot: { id: robotId } };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let service: QueuedCommandService;

  beforeEach(async () => {
    repo = {
      create: vi.fn((dto: object) => dto),
      save: vi.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      find: vi.fn().mockResolvedValue([row]),
      findOne: vi.fn().mockResolvedValue(row),
      remove: vi.fn().mockResolvedValue(row),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        QueuedCommandService,
        { provide: getRepositoryToken(QueuedCommand), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(QueuedCommandService);
  });

  it('maps robotId to the robot relation on create', async () => {
    await expect(service.create(createDto)).resolves.toEqual(row);
    expect(repo.save).toHaveBeenCalledWith({
      ...fields,
      robot: { id: robotId },
    });
  });

  it('finds all with the robot relation', async () => {
    await expect(service.findAll()).resolves.toEqual([row]);
    expect(repo.find).toHaveBeenCalledWith({ relations: { robot: true } });
  });

  it('finds one with the robot relation', async () => {
    await expect(service.findOne(1)).resolves.toEqual(row);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: { robot: true },
    });
  });

  it('throws 404 when the row is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(9)).rejects.toThrow(NotFoundException);
    await expect(service.update(9, {})).rejects.toThrow(NotFoundException);
    await expect(service.remove(9)).rejects.toThrow(NotFoundException);
  });

  it('maps robotId on update and leaves the relation alone when absent', async () => {
    await service.update(1, { robotId: 7 });
    expect(repo.save).toHaveBeenLastCalledWith({ id: 1, robot: { id: 7 } });
    await service.update(1, {});
    expect(repo.save).toHaveBeenLastCalledWith({ id: 1 });
  });

  it('removes a row', async () => {
    await service.remove(1);
    expect(repo.remove).toHaveBeenCalledWith(row);
  });
});
