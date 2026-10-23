import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Cell } from '../../database/entities/index.js';
import { CellService } from './cell.service.js';

describe('CellService', () => {
  const row = {
    id: 1,
    obstacle: true,
    xPosition: 1,
    yPosition: 2,
    floor: { id: 1 },
  };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let service: CellService;

  beforeEach(async () => {
    repo = { find: vi.fn().mockResolvedValue([row]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CellService,
        { provide: getRepositoryToken(Cell), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(CellService);
  });

  it('finds all with the floor relation', async () => {
    await expect(service.findAll()).resolves.toEqual([row]);
    expect(repo.find).toHaveBeenCalledWith({ relations: { floor: true } });
  });
});
