import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Floor } from '../../database/entities/index.js';
import { FloorService } from './floor.service.js';

describe('FloorService', () => {
  const floor = { id: 1, height: 5, width: 5 };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let service: FloorService;

  beforeEach(async () => {
    repo = {
      create: vi.fn((dto: object) => dto),
      save: vi.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      find: vi.fn().mockResolvedValue([floor]),
      findOneBy: vi.fn().mockResolvedValue(floor),
      remove: vi.fn().mockResolvedValue(floor),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        FloorService,
        { provide: getRepositoryToken(Floor), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(FloorService);
  });

  it('creates a floor', async () => {
    await expect(service.create({ height: 5, width: 5 })).resolves.toEqual(
      floor,
    );
  });

  it('finds all floors', async () => {
    await expect(service.findAll()).resolves.toEqual([floor]);
  });

  it('finds one floor', async () => {
    await expect(service.findOne(1)).resolves.toEqual(floor);
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 1 });
  });

  it('throws 404 when the floor is missing', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.findOne(9)).rejects.toThrow(NotFoundException);
    await expect(service.update(9, { width: 6 })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove(9)).rejects.toThrow(NotFoundException);
  });

  it('updates a floor', async () => {
    await service.update(1, { width: 6 });
    expect(repo.save).toHaveBeenCalledWith({ id: 1, width: 6 });
  });

  it('removes a floor', async () => {
    await service.remove(1);
    expect(repo.remove).toHaveBeenCalledWith(floor);
  });
});
