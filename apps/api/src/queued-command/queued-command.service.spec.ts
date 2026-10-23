import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueuedCommand } from '../../database/entities/index.js';
import { QueuedCommandService } from './queued-command.service.js';

describe('QueuedCommandService', () => {
  const row = { id: 1, command: 'MOVE', params: null, robot: { id: 1 } };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let service: QueuedCommandService;

  beforeEach(async () => {
    repo = { find: vi.fn().mockResolvedValue([row]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        QueuedCommandService,
        { provide: getRepositoryToken(QueuedCommand), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(QueuedCommandService);
  });

  it("finds one robot's commands in ascending Id order", async () => {
    await expect(service.findByRobot(3)).resolves.toEqual([row]);
    expect(repo.find).toHaveBeenCalledWith({
      where: { robot: { id: 3 } },
      order: { id: 'ASC' },
      relations: { robot: true },
    });
  });
});
